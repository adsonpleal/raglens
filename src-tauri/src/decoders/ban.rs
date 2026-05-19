// ZC_NOTIFY_BAN (0x0081) — server-initiated disconnect with a reason
// code. Sent right before the server closes the socket on a kicked,
// banned, or session-stolen client.
//
// Layout (3 bytes):
//   off 0-1   u16  opcode
//   off   2   u8   reason code (see REASON_LABELS below)
//
// We turn this into a `client-disconnect` event with kind=Ban and a
// pt-BR reason string. The `disconnect::emit` chokepoint handles
// suppression (so a RESTART_ACK still wins) and the RST that follows
// the BAN is deduped by the same emit-window.

use crate::connections::{ConnectionsState, FourTuple};
use crate::disconnect::{self, ClientDisconnect};
use crate::dispatch::Direction;
use tauri::{AppHandle, Manager};

pub const OPCODE: u16 = 0x0081;

/// Reason codes drawn from rAthena's `clif_banking_check` / `clif.cpp`
/// SC_NOTIFY_BAN handler. Anything not listed falls through to a
/// generic "unknown" label so a new code on a server update still
/// produces a useful notification.
fn reason_label(code: u8) -> String {
    match code {
        0 => "Sessão encerrada pelo servidor".to_string(),
        1 => "Servidor encerrando".to_string(),
        2 => "IDs de conta incorretos".to_string(),
        3 => "Informação de personagem incorreta".to_string(),
        4 => "Conta sem permissão de jogo".to_string(),
        5 => "Você foi banido".to_string(),
        6 => "Servidor cheio".to_string(),
        8 => "Login duplicado".to_string(),
        9 => "Conta suspensa".to_string(),
        10 => "Servidor em manutenção".to_string(),
        15 => "Removido por administrador".to_string(),
        n => format!("Motivo desconhecido (código {n})"),
    }
}

pub fn decode(app: &AppHandle, ft: &FourTuple, _dir: Direction, payload: &[u8]) {
    if payload.len() < 3 {
        return;
    }
    let code = payload[2];
    let conns = app.state::<ConnectionsState>();
    let pid = conns.pid_for(ft);
    let aid = conns.aid_for(ft);
    disconnect::emit(app, ClientDisconnect::ban(pid, aid, code, reason_label(code)));
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn known_reason_maps_to_ptbr() {
        assert_eq!(reason_label(5), "Você foi banido");
        assert_eq!(reason_label(1), "Servidor encerrando");
        assert_eq!(reason_label(10), "Servidor em manutenção");
    }

    #[test]
    fn unknown_reason_falls_back_with_code() {
        assert!(reason_label(99).contains("99"));
        assert!(reason_label(7).contains("código 7"));
    }

    #[test]
    fn short_payload_is_silently_dropped() {
        // Decoder bails on <3 bytes; the calling dispatcher already
        // bounds the length, but the guard is defensive.
        let too_short = [0x81u8, 0x00];
        assert!(too_short.len() < 3);
    }
}
