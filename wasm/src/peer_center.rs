use std::collections::{BTreeMap, HashMap};
use std::hash::{Hash, Hasher};

use prost::Message;
use wasm_bindgen::prelude::*;

use crate::proto::peer_rpc::{
    DirectConnectedPeerInfo, GetGlobalPeerMapRequest, GetGlobalPeerMapResponse,
    PeerInfoForGlobalMap, ReportPeersRequest, ReportPeersResponse,
};

pub type Digest = u64;
pub type PeerId = u32;

#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
struct SrcDstPeerPair {
    src: PeerId,
    dst: PeerId,
}

#[derive(Debug, Clone)]
struct PeerCenterInfoEntry {
    info: DirectConnectedPeerInfo,
    update_time_ms: u64,
}

#[derive(Default, Clone)]
struct PeerCenterGroupData {
    global_peer_map: HashMap<SrcDstPeerPair, PeerCenterInfoEntry>,
    peer_report_time: HashMap<PeerId, u64>,
    digest: Digest,
}

/// WASM-exposed PeerCenter state manager.
/// Mirrors the logic in easytier/src/peer_center/server.rs but without tokio/async.
#[wasm_bindgen]
pub struct WasmPeerCenter {
    groups: HashMap<String, PeerCenterGroupData>,
}

#[wasm_bindgen]
impl WasmPeerCenter {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        WasmPeerCenter {
            groups: HashMap::new(),
        }
    }

    fn group_mut(&mut self, group_key: &str) -> &mut PeerCenterGroupData {
        self.groups
            .entry(group_key.to_string())
            .or_default()
    }

    fn calc_digest_internal(data: &PeerCenterGroupData) -> Digest {
        let mut hasher = std::collections::hash_map::DefaultHasher::new();
        let mut keys: Vec<_> = data.global_peer_map.keys().collect();
        keys.sort();
        for k in keys {
            k.hash(&mut hasher);
        }
        hasher.finish()
    }

    /// Report peers for a given group.
    /// `report_json` is a JSON-encoded `ReportPeersRequest`.
    /// Returns encoded `ReportPeersResponse` bytes.
    pub fn report_peers(
        &mut self,
        group_key: &str,
        report_bytes: &[u8],
    ) -> Result<Vec<u8>, JsValue> {
        let req = ReportPeersRequest::decode(report_bytes)
            .map_err(|e| JsValue::from_str(&format!("decode ReportPeersRequest failed: {}", e)))?;

        let my_peer_id = req.my_peer_id;
        let peers = req.peer_infos.unwrap_or_default();
        let now_ms = js_sys::Date::now() as u64;

        let data = self.group_mut(group_key);
        data.peer_report_time.insert(my_peer_id, now_ms);

        for (peer_id, peer_info) in peers.direct_peers {
            let pair = SrcDstPeerPair {
                src: my_peer_id,
                dst: peer_id,
            };
            let entry = PeerCenterInfoEntry {
                info: peer_info,
                update_time_ms: now_ms,
            };
            data.global_peer_map.insert(pair, entry);
        }

        data.digest = Self::calc_digest_internal(data);

        let resp = ReportPeersResponse::default();
        let mut buf = Vec::new();
        prost::Message::encode(&resp, &mut buf)
            .map_err(|e| JsValue::from_str(&format!("encode ReportPeersResponse failed: {}", e)))?;
        Ok(buf)
    }

    /// Get global peer map for a given group.
    /// `request_bytes` is encoded `GetGlobalPeerMapRequest`.
    /// Returns encoded `GetGlobalPeerMapResponse` bytes.
    pub fn get_global_peer_map(
        &mut self,
        group_key: &str,
        request_bytes: &[u8],
    ) -> Result<Vec<u8>, JsValue> {
        let req = GetGlobalPeerMapRequest::decode(request_bytes)
            .map_err(|e| JsValue::from_str(&format!("decode GetGlobalPeerMapRequest failed: {}", e)))?;

        let data = self.group_mut(group_key);
        let digest = req.digest;

        if digest == data.digest && digest != 0 {
            let resp = GetGlobalPeerMapResponse::default();
            let mut buf = Vec::new();
            prost::Message::encode(&resp, &mut buf)
                .map_err(|e| JsValue::from_str(&format!("encode GetGlobalPeerMapResponse failed: {}", e)))?;
            return Ok(buf);
        }

        let mut global_peer_map: BTreeMap<u32, PeerInfoForGlobalMap> = BTreeMap::new();
        for (pair, entry) in &data.global_peer_map {
            global_peer_map
                .entry(pair.src)
                .or_insert_with(|| PeerInfoForGlobalMap {
                    direct_peers: Default::default(),
                })
                .direct_peers
                .insert(pair.dst, entry.info.clone());
        }

        let resp = GetGlobalPeerMapResponse {
            global_peer_map,
            digest: Some(data.digest),
        };
        let mut buf = Vec::new();
        prost::Message::encode(&resp, &mut buf)
            .map_err(|e| JsValue::from_str(&format!("encode GetGlobalPeerMapResponse failed: {}", e)))?;
        Ok(buf)
    }

    /// Remove outdated entries older than `ttl_sec` seconds.
    pub fn clean_outdated(&mut self, ttl_sec: u64) {
        let now_ms = js_sys::Date::now() as u64;
        let ttl_ms = ttl_sec * 1000;
        for data in self.groups.values_mut() {
            data.peer_report_time
                .retain(|_, v| now_ms - *v < ttl_ms);
            data.global_peer_map
                .retain(|_, v| now_ms - v.update_time_ms < ttl_ms);
        }
        self.groups.retain(|_, data| {
            !data.global_peer_map.is_empty() || !data.peer_report_time.is_empty()
        });
    }

    /// Return the current digest for a group.
    pub fn calc_digest(&self, group_key: &str) -> u64 {
        self.groups
            .get(group_key)
            .map(|d| d.digest)
            .unwrap_or(0)
    }
}
