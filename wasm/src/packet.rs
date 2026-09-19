use serde::{Deserialize, Serialize};

pub const HEADER_SIZE: usize = 16;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PacketHeader {
    pub from_peer_id: u32,
    pub to_peer_id: u32,
    pub packet_type: u8,
    pub flags: u8,
    pub forward_counter: u8,
    pub reserved: u8,
    pub len: u32,
}

impl PacketHeader {
    pub fn from_bytes(bytes: &[u8]) -> Result<Self, String> {
        if bytes.len() < HEADER_SIZE {
            return Err(format!("header too short: {} < {}", bytes.len(), HEADER_SIZE));
        }
        let b = &bytes[..HEADER_SIZE];
        Ok(PacketHeader {
            from_peer_id: u32::from_le_bytes([b[0], b[1], b[2], b[3]]),
            to_peer_id: u32::from_le_bytes([b[4], b[5], b[6], b[7]]),
            packet_type: b[8],
            flags: b[9],
            forward_counter: b[10],
            reserved: b[11],
            len: u32::from_le_bytes([b[12], b[13], b[14], b[15]]),
        })
    }

    pub fn to_bytes(&self) -> Vec<u8> {
        let mut buf = vec![0u8; HEADER_SIZE];
        buf[0..4].copy_from_slice(&self.from_peer_id.to_le_bytes());
        buf[4..8].copy_from_slice(&self.to_peer_id.to_le_bytes());
        buf[8] = self.packet_type;
        buf[9] = self.flags;
        buf[10] = self.forward_counter;
        buf[11] = self.reserved;
        buf[12..16].copy_from_slice(&self.len.to_le_bytes());
        buf
    }
}
