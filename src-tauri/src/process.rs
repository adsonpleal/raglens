// Win32 process queries used by the client picker.
//
// `pid_for_local_endpoint` walks the TCP table to attribute a captured
// 4-tuple to the owning process. WinDivert sees raw packets — it has no
// idea which process they belong to. `GetExtendedTcpTable` gives us that
// mapping in one call. Cheap enough to invoke on every newly-observed
// 4-tuple; the table only has a few hundred rows even on a busy box.
//
// `process_info` looks up the executable name + creation time for a
// PID so the UI can label rows when no AID/character name has been
// captured yet.


pub struct ProcessInfo {
    pub name: Option<String>,
    pub creation_unix_ms: Option<u64>,
}

#[cfg(windows)]
pub fn pid_for_local_endpoint(local_ip: [u8; 4], local_port: u16) -> Option<u32> {
    use windows::Win32::NetworkManagement::IpHelper::{
        GetExtendedTcpTable, MIB_TCPROW_OWNER_PID, MIB_TCPTABLE_OWNER_PID, TCP_TABLE_OWNER_PID_ALL,
    };
    use windows::Win32::Networking::WinSock::AF_INET;

    // Two-pass: first call with NULL buf to learn the required size.
    let mut size: u32 = 0;
    unsafe {
        GetExtendedTcpTable(
            None,
            &mut size,
            false,
            AF_INET.0 as u32,
            TCP_TABLE_OWNER_PID_ALL,
            0,
        );
    }
    if size == 0 {
        return None;
    }
    let mut buf: Vec<u8> = vec![0; size as usize];
    let rc = unsafe {
        GetExtendedTcpTable(
            Some(buf.as_mut_ptr() as *mut _),
            &mut size,
            false,
            AF_INET.0 as u32,
            TCP_TABLE_OWNER_PID_ALL,
            0,
        )
    };
    if rc != 0 {
        return None;
    }

    let table = unsafe { &*(buf.as_ptr() as *const MIB_TCPTABLE_OWNER_PID) };
    let n = table.dwNumEntries as usize;
    let rows: &[MIB_TCPROW_OWNER_PID] =
        unsafe { std::slice::from_raw_parts(table.table.as_ptr(), n) };

    // dwLocalAddr: u32 holding the IP in network byte order, which on
    // x86 reads as a little-endian u32 of the IP bytes. e.g. 192.168.6.194
    // (bytes C0 A8 06 C2 in NBO) lands as 0xC206A8C0 when read as LE.
    let target_addr = u32::from_le_bytes(local_ip);
    // dwLocalPort: low 16 bits hold the port in network byte order.
    let target_port_be = local_port.to_be() as u32;

    for row in rows {
        if row.dwLocalAddr == target_addr && (row.dwLocalPort & 0xFFFF) == target_port_be {
            return Some(row.dwOwningPid);
        }
    }
    None
}

#[cfg(not(windows))]
pub fn pid_for_local_endpoint(_local_ip: [u8; 4], _local_port: u16) -> Option<u32> {
    None
}

#[cfg(windows)]
pub fn process_info(pid: u32) -> ProcessInfo {
    use windows::Win32::Foundation::{CloseHandle, FILETIME};
    use windows::Win32::System::Threading::{
        GetProcessTimes, OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_FORMAT,
        PROCESS_QUERY_LIMITED_INFORMATION,
    };

    let handle = match unsafe { OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid) } {
        Ok(h) if !h.is_invalid() => h,
        _ => {
            return ProcessInfo {
                name: None,
                creation_unix_ms: None,
            }
        }
    };

    let mut name_buf = [0u16; 260];
    let mut name_len = name_buf.len() as u32;
    let name = if unsafe {
        QueryFullProcessImageNameW(
            handle,
            PROCESS_NAME_FORMAT(0),
            windows::core::PWSTR(name_buf.as_mut_ptr()),
            &mut name_len,
        )
    }
    .is_ok()
    {
        let path = String::from_utf16_lossy(&name_buf[..name_len as usize]);
        std::path::Path::new(&path)
            .file_name()
            .map(|s| s.to_string_lossy().into_owned())
    } else {
        None
    };

    let mut creation = FILETIME::default();
    let mut exit = FILETIME::default();
    let mut kernel = FILETIME::default();
    let mut user = FILETIME::default();
    let creation_unix_ms = if unsafe {
        GetProcessTimes(handle, &mut creation, &mut exit, &mut kernel, &mut user)
    }
    .is_ok()
    {
        Some(filetime_to_unix_ms(creation))
    } else {
        None
    };

    let _ = unsafe { CloseHandle(handle) };

    ProcessInfo {
        name,
        creation_unix_ms,
    }
}

#[cfg(not(windows))]
pub fn process_info(_pid: u32) -> ProcessInfo {
    ProcessInfo {
        name: None,
        creation_unix_ms: None,
    }
}

/// Convert a Win32 FILETIME (100ns ticks since 1601-01-01 UTC) to
/// Unix milliseconds. Saturates rather than panicking on overflow.
#[cfg(windows)]
fn filetime_to_unix_ms(ft: windows::Win32::Foundation::FILETIME) -> u64 {
    let ticks = ((ft.dwHighDateTime as u64) << 32) | (ft.dwLowDateTime as u64);
    // 11_644_473_600 seconds between 1601-01-01 and 1970-01-01.
    const EPOCH_DIFF_100NS: u64 = 11_644_473_600u64 * 10_000_000;
    ticks.saturating_sub(EPOCH_DIFF_100NS) / 10_000
}

