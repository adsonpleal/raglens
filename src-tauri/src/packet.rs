// IPv4 and TCP header parsing.
//
// Manual byte slicing keeps the dependency surface to zero and the parse
// hot path predictable. The structs are intentionally minimal — anything
// downstream that needs more fields adds them at parse-time.

#[derive(Debug, Clone, Copy)]
pub struct IpHeader {
    pub src: [u8; 4],
    pub dst: [u8; 4],
    pub proto: u8,
    pub header_len: usize,
    pub total_len: usize,
}

#[derive(Debug, Clone)]
pub struct TcpSegment {
    pub src_port: u16,
    pub dst_port: u16,
    pub flags: u8,
    pub payload: Vec<u8>,
}

// TCP flag bits at byte offset 13 of the TCP header (only the two we
// care about; others left implicit so adding them later doesn't
// require touching this file).
pub const TCP_FIN: u8 = 0x01;
pub const TCP_RST: u8 = 0x04;

pub fn parse_ipv4(buf: &[u8]) -> Option<IpHeader> {
    if buf.len() < 20 {
        return None;
    }
    let version = buf[0] >> 4;
    if version != 4 {
        return None;
    }
    let ihl = (buf[0] & 0x0F) as usize;
    let header_len = ihl * 4;
    if header_len < 20 || buf.len() < header_len {
        return None;
    }
    let total_len = u16::from_be_bytes([buf[2], buf[3]]) as usize;
    if total_len < header_len || total_len > buf.len() {
        return None;
    }
    let proto = buf[9];
    let src = [buf[12], buf[13], buf[14], buf[15]];
    let dst = [buf[16], buf[17], buf[18], buf[19]];
    Some(IpHeader {
        src,
        dst,
        proto,
        header_len,
        total_len,
    })
}

pub fn parse_tcp(buf: &[u8]) -> Option<TcpSegment> {
    if buf.len() < 20 {
        return None;
    }
    let src_port = u16::from_be_bytes([buf[0], buf[1]]);
    let dst_port = u16::from_be_bytes([buf[2], buf[3]]);
    let data_offset = (buf[12] >> 4) as usize;
    let header_len = data_offset * 4;
    if header_len < 20 || buf.len() < header_len {
        return None;
    }
    let flags = buf[13];
    let payload = buf[header_len..].to_vec();
    Some(TcpSegment {
        src_port,
        dst_port,
        flags,
        payload,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_minimal_ipv4_header() {
        let mut buf = vec![0u8; 40];
        buf[0] = 0x45;
        buf[2] = 0x00;
        buf[3] = 40;
        buf[9] = 6;
        buf[12..16].copy_from_slice(&[192, 168, 1, 1]);
        buf[16..20].copy_from_slice(&[192, 168, 1, 2]);
        let h = parse_ipv4(&buf).expect("parse");
        assert_eq!(h.src, [192, 168, 1, 1]);
        assert_eq!(h.dst, [192, 168, 1, 2]);
        assert_eq!(h.proto, 6);
        assert_eq!(h.header_len, 20);
        assert_eq!(h.total_len, 40);
    }

    #[test]
    fn rejects_non_ipv4() {
        let mut buf = vec![0u8; 40];
        buf[0] = 0x65; // version 6
        assert!(parse_ipv4(&buf).is_none());
    }

    #[test]
    fn parses_tcp_with_payload() {
        // data_offset = 5 (20-byte header), payload = "RO!"
        let mut buf = vec![0u8; 23];
        buf[0..2].copy_from_slice(&6900u16.to_be_bytes());
        buf[2..4].copy_from_slice(&54321u16.to_be_bytes());
        buf[12] = 0x50; // data_offset=5 << 4
        buf[20..23].copy_from_slice(b"RO!");
        let t = parse_tcp(&buf).expect("parse");
        assert_eq!(t.src_port, 6900);
        assert_eq!(t.dst_port, 54321);
        assert_eq!(t.payload, b"RO!");
        assert_eq!(t.flags, 0);
    }

    #[test]
    fn parses_rst_flag() {
        let mut buf = vec![0u8; 20];
        buf[12] = 0x50;
        buf[13] = TCP_RST;
        assert_eq!(parse_tcp(&buf).expect("parse").flags & TCP_RST, TCP_RST);
    }

    #[test]
    fn parses_fin_flag() {
        let mut buf = vec![0u8; 20];
        buf[12] = 0x50;
        buf[13] = TCP_FIN;
        assert_eq!(parse_tcp(&buf).expect("parse").flags & TCP_FIN, TCP_FIN);
    }

    #[test]
    fn parses_both_rst_and_fin() {
        let mut buf = vec![0u8; 20];
        buf[12] = 0x50;
        buf[13] = TCP_FIN | TCP_RST;
        let t = parse_tcp(&buf).expect("parse");
        assert_eq!(t.flags & TCP_RST, TCP_RST);
        assert_eq!(t.flags & TCP_FIN, TCP_FIN);
    }
}
