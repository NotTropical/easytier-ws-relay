use prost::Message;
use serde_json::Value;
use wasm_bindgen::prelude::*;

use crate::proto::common::{RpcPacket, RpcRequest, RpcResponse};
use crate::proto::peer_rpc::{
    GetGlobalPeerMapRequest, GetGlobalPeerMapResponse, HandshakeRequest, ReportPeersRequest,
    ReportPeersResponse, RoutePeerInfo, SyncRouteInfoRequest, SyncRouteInfoResponse,
};

// JS Number.MAX_SAFE_INTEGER / MIN_SAFE_INTEGER
const JS_MAX_SAFE_INTEGER: i64 = 9007199254740991i64;
const JS_MIN_SAFE_INTEGER: i64 = -9007199254740991i64;

/// Recursively convert JSON numbers outside JS safe integer range to strings.
/// This prevents JSON.parse in JavaScript from losing precision for i64/u64 fields.
fn convert_out_of_safe_int_to_string(value: &mut Value) {
    match value {
        Value::Number(n) => {
            if let Some(i) = n.as_i64() {
                if i > JS_MAX_SAFE_INTEGER || i < JS_MIN_SAFE_INTEGER {
                    *value = Value::String(i.to_string());
                }
            } else if let Some(u) = n.as_u64() {
                if u > JS_MAX_SAFE_INTEGER as u64 {
                    *value = Value::String(u.to_string());
                }
            }
        }
        Value::Object(map) => {
            for v in map.values_mut() {
                convert_out_of_safe_int_to_string(v);
            }
        }
        Value::Array(arr) => {
            for v in arr.iter_mut() {
                convert_out_of_safe_int_to_string(v);
            }
        }
        _ => {}
    }
}

/// Recursively convert JSON strings that look like big integers back to numbers.
/// This allows encode functions to accept JSON where i64/u64 were serialized as strings.
/// Normal strings are NOT affected because we only convert strings longer than 15 chars
/// that consist entirely of digits (with optional leading minus sign).
fn convert_bigint_string_back_to_number(value: &mut Value) {
    match value {
        Value::String(s) => {
            if s.len() > 15 {
                let mut chars = s.chars();
                let first = chars.next().unwrap();
                let is_digits = (first == '-' || first.is_ascii_digit())
                    && chars.all(|c| c.is_ascii_digit());
                if is_digits {
                    if let Ok(i) = s.parse::<i64>() {
                        *value = serde_json::json!(i);
                    } else if let Ok(u) = s.parse::<u64>() {
                        *value = serde_json::json!(u);
                    }
                }
            }
        }
        Value::Object(map) => {
            for v in map.values_mut() {
                convert_bigint_string_back_to_number(v);
            }
        }
        Value::Array(arr) => {
            for v in arr.iter_mut() {
                convert_bigint_string_back_to_number(v);
            }
        }
        _ => {}
    }
}

macro_rules! decode_fn {
    ($name:ident, $type:ty) => {
        #[wasm_bindgen]
        pub fn $name(bytes: &[u8]) -> Result<String, JsValue> {
            let msg = <$type>::decode(bytes)
                .map_err(|e| JsValue::from_str(&format!(concat!(stringify!($type), " decode failed: {}"), e)))?;
            let mut value = serde_json::to_value(&msg)
                .map_err(|e| JsValue::from_str(&e.to_string()))?;
            convert_out_of_safe_int_to_string(&mut value);
            serde_json::to_string(&value)
                .map_err(|e| JsValue::from_str(&e.to_string()))
        }
    };
}

macro_rules! encode_fn {
    ($name:ident, $type:ty) => {
        #[wasm_bindgen]
        pub fn $name(json: &str) -> Result<Vec<u8>, JsValue> {
            let mut value: serde_json::Value = serde_json::from_str(json)
                .map_err(|e| JsValue::from_str(&e.to_string()))?;
            convert_bigint_string_back_to_number(&mut value);
            let msg: $type = serde_json::from_value(value)
                .map_err(|e| JsValue::from_str(&e.to_string()))?;
            Ok(msg.encode_to_vec())
        }
    };
}

decode_fn!(decode_handshake_request, HandshakeRequest);
encode_fn!(encode_handshake_request, HandshakeRequest);

decode_fn!(decode_rpc_packet, RpcPacket);
encode_fn!(encode_rpc_packet, RpcPacket);

decode_fn!(decode_rpc_request, RpcRequest);
encode_fn!(encode_rpc_request, RpcRequest);

decode_fn!(decode_rpc_response, RpcResponse);
encode_fn!(encode_rpc_response, RpcResponse);

decode_fn!(decode_sync_route_info_request, SyncRouteInfoRequest);
encode_fn!(encode_sync_route_info_request, SyncRouteInfoRequest);

decode_fn!(decode_sync_route_info_response, SyncRouteInfoResponse);
encode_fn!(encode_sync_route_info_response, SyncRouteInfoResponse);

decode_fn!(decode_report_peers_request, ReportPeersRequest);
encode_fn!(encode_report_peers_request, ReportPeersRequest);

decode_fn!(decode_report_peers_response, ReportPeersResponse);
encode_fn!(encode_report_peers_response, ReportPeersResponse);

decode_fn!(decode_get_global_peer_map_request, GetGlobalPeerMapRequest);
encode_fn!(encode_get_global_peer_map_request, GetGlobalPeerMapRequest);

decode_fn!(decode_get_global_peer_map_response, GetGlobalPeerMapResponse);
encode_fn!(encode_get_global_peer_map_response, GetGlobalPeerMapResponse);

decode_fn!(decode_route_peer_info, RoutePeerInfo);
encode_fn!(encode_route_peer_info, RoutePeerInfo);
