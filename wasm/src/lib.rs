use wasm_bindgen::prelude::*;

pub mod codec;
pub mod packet;
pub mod peer_center;
pub mod proto;
pub mod route_state;

pub use peer_center::WasmPeerCenter;
pub use route_state::WasmRouteState;

// Re-export key items for wasm-bindgen

/// Parse a 16-byte EasyTier packet header.
/// Returns a JSON object: `{ from_peer_id, to_peer_id, packet_type, flags, forward_counter, reserved, len }`
#[wasm_bindgen]
pub fn parse_packet_header(bytes: &[u8]) -> Result<JsValue, JsValue> {
    let header = packet::PacketHeader::from_bytes(bytes)
        .map_err(|e| JsValue::from_str(&e))?;
    serde_wasm_bindgen::to_value(&header)
        .map_err(|e| JsValue::from_str(&e.to_string()))
}

/// Create a 16-byte EasyTier packet header.
/// Accepts a JSON object with fields: from_peer_id, to_peer_id, packet_type, flags, forward_counter, len
#[wasm_bindgen]
pub fn create_packet_header(obj: &JsValue) -> Result<Vec<u8>, JsValue> {
    let header: packet::PacketHeader = serde_wasm_bindgen::from_value(obj.clone())
        .map_err(|e| JsValue::from_str(&e.to_string()))?;
    Ok(header.to_bytes())
}
