// Opcode dispatcher.
//
// Fed by the capture loop with one TCP payload at a time. Reads the
// 2-byte little-endian opcode header, optionally writes a line to the
// dev opcode logger, then looks up a registered decoder and lets it
// emit its own typed event. With no decoders registered for an opcode,
// only the logger sees the payload — which is exactly what we want
// while we identify opcodes from a live session.
//
// Caveat: we do not reassemble TCP. Most RO server-to-client packets
// fit in one segment; segments that span a boundary will be dropped
// by the opcode parse. When this starts to bite a specific decoder,
// move reassembly into capture.rs as a per-stream byte buffer
// (see Ragmarket's `useCapture.ts` for the same pattern, frontend-side).

use crate::connections::{emit_client_detected, ConnectionsState, FourTuple};
use crate::decoders;
use crate::logger::OpcodeLogger;
use serde::Serialize;
use tauri::AppHandle;

#[derive(Clone, Copy, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum Direction {
    ToClient,
    ToServer,
}

pub fn dispatch_packet(
    app: &AppHandle,
    ft: &FourTuple,
    direction: Direction,
    payload: &[u8],
    connections: &ConnectionsState,
    logger: &mut Option<OpcodeLogger>,
) {
    if let Some(new) = connections.observe(ft) {
        emit_client_detected(app, new);
    }

    if !connections.is_followed(ft) {
        return;
    }

    if payload.len() < 2 {
        return;
    }
    let opcode = u16::from_le_bytes([payload[0], payload[1]]);

    if let Some(l) = logger.as_mut() {
        let _ = l.log(ft, direction, opcode, payload);
    }

    if let Some(decoder) = decoders::lookup(opcode) {
        decoder(app, ft, direction, payload);
    }
}
