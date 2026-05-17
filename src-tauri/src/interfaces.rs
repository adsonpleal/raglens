// Network interface enumeration via Win32 GetAdaptersAddresses.

use serde::{Deserialize, Serialize};
use std::io;

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct NetworkInterface {
    pub index: u32,
    pub name: String,
    pub ipv4: String,
    pub is_loopback: bool,
}

#[cfg(windows)]
pub fn list_interfaces() -> io::Result<Vec<NetworkInterface>> {
    use std::ffi::OsString;
    use std::os::windows::ffi::OsStringExt;
    use windows::Win32::NetworkManagement::IpHelper::{
        GetAdaptersAddresses, GAA_FLAG_SKIP_ANYCAST, GAA_FLAG_SKIP_DNS_SERVER,
        GAA_FLAG_SKIP_MULTICAST, IP_ADAPTER_ADDRESSES_LH,
    };
    use windows::Win32::Networking::WinSock::{AF_INET, SOCKADDR_IN};

    const BUF_INITIAL: u32 = 16 * 1024;
    const ERROR_BUFFER_OVERFLOW: u32 = 111;
    let mut size = BUF_INITIAL;
    let mut buf: Vec<u8> = vec![0; size as usize];

    let flags = GAA_FLAG_SKIP_ANYCAST | GAA_FLAG_SKIP_MULTICAST | GAA_FLAG_SKIP_DNS_SERVER;

    for _ in 0..3 {
        let rc = unsafe {
            GetAdaptersAddresses(
                AF_INET.0 as u32,
                flags,
                None,
                Some(buf.as_mut_ptr() as *mut IP_ADAPTER_ADDRESSES_LH),
                &mut size,
            )
        };
        if rc == 0 {
            break;
        }
        if rc == ERROR_BUFFER_OVERFLOW {
            buf.resize(size as usize, 0);
            continue;
        }
        return Err(io::Error::from_raw_os_error(rc as i32));
    }

    let mut out: Vec<NetworkInterface> = Vec::new();
    let mut ptr = buf.as_ptr() as *const IP_ADAPTER_ADDRESSES_LH;
    while !ptr.is_null() {
        let adapter = unsafe { &*ptr };
        let index = unsafe { adapter.Anonymous1.Anonymous.IfIndex };

        let mut name = String::new();
        if !adapter.FriendlyName.is_null() {
            let mut wide: Vec<u16> = Vec::new();
            let mut p = adapter.FriendlyName.as_ptr();
            unsafe {
                while *p != 0 {
                    wide.push(*p);
                    p = p.add(1);
                }
            }
            name = OsString::from_wide(&wide).to_string_lossy().to_string();
        }

        let mut ipv4 = String::new();
        let mut unicast_ptr = adapter.FirstUnicastAddress;
        while !unicast_ptr.is_null() {
            let u = unsafe { &*unicast_ptr };
            let sa = unsafe { &*u.Address.lpSockaddr };
            if sa.sa_family == AF_INET {
                let sin = unsafe { &*(u.Address.lpSockaddr as *const SOCKADDR_IN) };
                let bytes = unsafe { sin.sin_addr.S_un.S_un_b };
                ipv4 = format!(
                    "{}.{}.{}.{}",
                    bytes.s_b1, bytes.s_b2, bytes.s_b3, bytes.s_b4
                );
                break;
            }
            unicast_ptr = u.Next;
        }

        let is_loopback = ipv4.starts_with("127.");

        if !ipv4.is_empty() {
            out.push(NetworkInterface {
                index,
                name,
                ipv4,
                is_loopback,
            });
        }

        ptr = adapter.Next;
    }

    Ok(out)
}

#[cfg(not(windows))]
pub fn list_interfaces() -> io::Result<Vec<NetworkInterface>> {
    Err(io::Error::new(
        io::ErrorKind::Unsupported,
        "raglens only supports Windows",
    ))
}
