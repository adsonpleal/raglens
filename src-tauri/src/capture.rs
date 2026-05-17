// WinDivert capture loop (sniff mode).
//
// Same approach Ragmarket uses: WinDivert observes packets at the WFP
// layer below the TCP stack, before the kernel hands them to the
// application. Sniff mode (WINDIVERT_FLAG_SNIFF + RECV_ONLY) means we
// never inject, never modify, never even acknowledge — packets continue
// to the kernel TCP stack unchanged. From the server's and the anti-
// cheat's perspective, our process is indistinguishable from a normal
// client.
//
// The recv loop hands each matched TCP payload to dispatch::dispatch_packet
// along with a canonical FourTuple. The dispatcher owns opcode routing,
// connection filtering and the dev opcode logger.

use crate::connections::{ConnectionsState, FourTuple};
use crate::dispatch::{dispatch_packet, Direction};
use crate::logger::OpcodeLogger;
use crate::packet;
use serde::Serialize;
use std::ffi::{c_void, CString};
use std::io;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter, State};

#[derive(Default)]
pub struct CaptureState {
    pub running: Arc<AtomicBool>,
    pub handle: Arc<Mutex<Option<usize>>>,
}

#[derive(Serialize, Clone)]
pub struct CaptureStats {
    pub packets_seen: u64,
    pub matched: u64,
}

fn is_target_port(port: u16) -> bool {
    matches!(port, 6900 | 6951 | 4500) || (22000..=22100).contains(&port)
}

// ---------- WinDivert FFI ----------

const WINDIVERT_LAYER_NETWORK: i32 = 0;
const WINDIVERT_FLAG_SNIFF: u64 = 0x0001;
const WINDIVERT_FLAG_RECV_ONLY: u64 = 0x0004; // never inject (read-only)
const WINDIVERT_SHUTDOWN_BOTH: i32 = 0x3;

type HANDLE = *mut c_void;
const INVALID_HANDLE_VALUE: HANDLE = -1isize as HANDLE;

#[link(name = "WinDivert")]
extern "system" {
    fn WinDivertOpen(filter: *const i8, layer: i32, priority: i16, flags: u64) -> HANDLE;
    fn WinDivertRecv(
        handle: HANDLE,
        packet: *mut u8,
        packet_len: u32,
        recv_len: *mut u32,
        addr: *mut WinDivertAddress,
    ) -> i32;
    fn WinDivertClose(handle: HANDLE) -> i32;
    fn WinDivertShutdown(handle: HANDLE, how: i32) -> i32;
}

#[repr(C)]
#[derive(Clone, Copy)]
struct WinDivertAddress {
    timestamp: i64,
    _layer_event_bits: u32,
    _padding: u32,
    _payload: [u8; 64], // union — unused
}

impl Default for WinDivertAddress {
    fn default() -> Self {
        Self {
            timestamp: 0,
            _layer_event_bits: 0,
            _padding: 0,
            _payload: [0u8; 64],
        }
    }
}

// ---------- start / stop commands ----------

#[cfg(windows)]
pub fn start_capture(
    app: AppHandle,
    state: State<CaptureState>,
    connections: State<ConnectionsState>,
    _ipv4: String,
) -> Result<(), String> {
    let running = state.running.clone();
    if running.swap(true, Ordering::SeqCst) {
        return Err("capture already running".into());
    }

    connections.reset();

    let handle_store = state.handle.clone();
    let observed = connections.observed.clone();
    let selected = connections.selected.clone();
    let app_thread = app.clone();
    std::thread::spawn(move || {
        let connections = ConnectionsState {
            observed,
            selected,
        };
        if let Err(e) = capture_loop(app_thread.clone(), running.clone(), handle_store, &connections) {
            let _ = app_thread.emit("capture-error", e.to_string());
        }
        running.store(false, Ordering::SeqCst);
        let _ = app_thread.emit("capture-stopped", ());
    });

    Ok(())
}

#[cfg(not(windows))]
pub fn start_capture(
    _app: AppHandle,
    _state: State<CaptureState>,
    _connections: State<ConnectionsState>,
    _ipv4: String,
) -> Result<(), String> {
    Err("Windows only".into())
}

pub fn stop_capture(state: State<CaptureState>) -> Result<(), String> {
    state.running.store(false, Ordering::SeqCst);
    let handle_opt = { *state.handle.lock().unwrap() };
    if let Some(h) = handle_opt {
        unsafe {
            WinDivertShutdown(h as HANDLE, WINDIVERT_SHUTDOWN_BOTH);
        }
    }
    Ok(())
}

// ---------- capture loop ----------

#[cfg(windows)]
fn capture_loop(
    app: AppHandle,
    running: Arc<AtomicBool>,
    handle_store: Arc<Mutex<Option<usize>>>,
    connections: &ConnectionsState,
) -> io::Result<()> {
    // WinDivert filter language uses C-style && / ||.
    let filter = "tcp && (tcp.SrcPort == 6900 || tcp.DstPort == 6900 \
                       || tcp.SrcPort == 6951 || tcp.DstPort == 6951 \
                       || tcp.SrcPort == 4500 || tcp.DstPort == 4500 \
                       || (tcp.SrcPort >= 22000 && tcp.SrcPort <= 22100) \
                       || (tcp.DstPort >= 22000 && tcp.DstPort <= 22100))";

    let filter_c = CString::new(filter).expect("filter contains NUL byte");
    eprintln!("[capture] opening WinDivert handle (filter: {filter})");

    let handle = unsafe {
        WinDivertOpen(
            filter_c.as_ptr(),
            WINDIVERT_LAYER_NETWORK,
            0,
            WINDIVERT_FLAG_SNIFF | WINDIVERT_FLAG_RECV_ONLY,
        )
    };

    if handle == INVALID_HANDLE_VALUE {
        let err = io::Error::last_os_error();
        eprintln!("[capture] WinDivertOpen failed: {err}");
        return Err(err);
    }
    eprintln!("[capture] WinDivert handle opened. Entering recv loop…");

    *handle_store.lock().unwrap() = Some(handle as usize);

    let _ = app.emit("capture-started", ());

    let mut logger = OpcodeLogger::from_env();
    let mut stats = CaptureStats {
        packets_seen: 0,
        matched: 0,
    };
    let mut last_stats_emit = std::time::Instant::now();
    let mut last_progress_log = std::time::Instant::now();
    let mut packet_buf = vec![0u8; 65535];
    let mut addr = WinDivertAddress::default();

    let mut recv_err: Option<io::Error> = None;

    while running.load(Ordering::SeqCst) {
        let mut recv_len: u32 = 0;
        let rc = unsafe {
            WinDivertRecv(
                handle,
                packet_buf.as_mut_ptr(),
                packet_buf.len() as u32,
                &mut recv_len,
                &mut addr,
            )
        };
        if rc == 0 {
            if !running.load(Ordering::SeqCst) {
                break;
            }
            recv_err = Some(io::Error::last_os_error());
            eprintln!("[capture] WinDivertRecv failed: {:?}", recv_err);
            break;
        }

        let datagram = &packet_buf[..recv_len as usize];
        stats.packets_seen += 1;

        if let Some((ft, direction, payload)) = parse_and_canonicalize(datagram) {
            stats.matched += 1;
            dispatch_packet(&app, &ft, direction, &payload, connections, &mut logger);
        }

        if last_stats_emit.elapsed() >= std::time::Duration::from_millis(500) {
            let _ = app.emit("capture-stats", stats.clone());
            last_stats_emit = std::time::Instant::now();
        }

        if last_progress_log.elapsed() >= std::time::Duration::from_secs(5) {
            eprintln!(
                "[capture] progress: packets_seen={}, matched={}",
                stats.packets_seen, stats.matched,
            );
            last_progress_log = std::time::Instant::now();
        }
    }

    eprintln!(
        "[capture] stopping. final: packets_seen={}, matched={}",
        stats.packets_seen, stats.matched,
    );
    let _ = app.emit("capture-stats", stats.clone());

    let to_close = handle_store.lock().unwrap().take();
    if let Some(h) = to_close {
        unsafe {
            WinDivertClose(h as HANDLE);
        }
    }

    if let Some(e) = recv_err {
        return Err(e);
    }
    Ok(())
}

#[cfg(windows)]
fn parse_and_canonicalize(datagram: &[u8]) -> Option<(FourTuple, Direction, Vec<u8>)> {
    let ip = packet::parse_ipv4(datagram)?;
    if ip.proto != 6 {
        return None;
    }
    if ip.header_len > ip.total_len {
        return None;
    }
    let tcp_buf = &datagram[ip.header_len..ip.total_len];
    let tcp = packet::parse_tcp(tcp_buf)?;
    if tcp.payload.is_empty() {
        return None;
    }

    let src_is_server = is_target_port(tcp.src_port);
    let dst_is_server = is_target_port(tcp.dst_port);
    if src_is_server == dst_is_server {
        // Both or neither match the server-port set. Given our WinDivert
        // filter only matches one side, this should be rare — but if it
        // happens (e.g. client picks an ephemeral port that overlaps),
        // we can't reliably canonicalize. Drop.
        return None;
    }

    let (ft, direction) = if src_is_server {
        (
            FourTuple {
                client_ip: format_ip(ip.dst),
                client_port: tcp.dst_port,
                server_ip: format_ip(ip.src),
                server_port: tcp.src_port,
            },
            Direction::ToClient,
        )
    } else {
        (
            FourTuple {
                client_ip: format_ip(ip.src),
                client_port: tcp.src_port,
                server_ip: format_ip(ip.dst),
                server_port: tcp.dst_port,
            },
            Direction::ToServer,
        )
    };

    Some((ft, direction, tcp.payload))
}

#[cfg(windows)]
fn format_ip(b: [u8; 4]) -> String {
    format!("{}.{}.{}.{}", b[0], b[1], b[2], b[3])
}
