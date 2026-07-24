import { WasmRouteState, encode_route_peer_info } from './wasm_bridge.js';
import { MY_PEER_ID, PacketType } from './constants.js';
import { createHeader } from './packet.js';
import { wrapPacket, randomU64String, safeJSONstringify } from './crypto.js';
import {
  encode_rpc_packet,
  encode_rpc_request,
  encode_sync_route_info_response,
  decode_sync_route_info_request,
} from './wasm_bridge.js';

const WS_OPEN = 1;

let routeStateInstance = null;
export function getRouteState() {
  if (!routeStateInstance) {
    routeStateInstance = new WasmRouteState();
  }
  return routeStateInstance;
}

export function resetRouteState() {
  routeStateInstance = new WasmRouteState();
}

export class PeerManager {
  constructor() {
    this.wasm = getRouteState();
  }

  addPeer(peerId, ws) {
    const groupKey = ws && ws.groupKey ? String(ws.groupKey) : '';
    this.wasm.add_peer(groupKey, peerId);
    // Ensure my info reflects current config
    this.wasm.bump_my_info_version(groupKey);
  }

  removePeer(ws) {
    const peerId = ws && ws.peerId;
    const groupKey = ws && ws.groupKey ? String(ws.groupKey) : '';
    if (!peerId) return false;
    this.wasm.remove_peer(groupKey, peerId);
    return true;
  }

  getPeerWs(peerId, groupKey) {
    // This must remain in JS because WASM cannot access WebSocket objects
    // The caller (relay_room) maintains the ws mapping separately
    return null;
  }

  listPeerIdsInGroup(groupKey) {
    return this.wasm.get_peer_ids_in_group(groupKey || '');
  }

  updatePeerInfo(groupKey, peerId, info) {
    try {
      const infoBytes = encode_route_peer_info(safeJSONstringify(info));
      this.wasm.update_peer_info(groupKey || '', peerId, infoBytes);
    } catch (e) {
      console.warn('updatePeerInfo wasm error:', e.message);
    }
  }

  onRouteSessionAck(groupKey, peerId, theirSessionId, weAreInitiator) {
    this.wasm.on_route_session_ack(groupKey || '', peerId, BigInt(theirSessionId), !!weAreInitiator);
  }

  pushRouteUpdateTo(targetPeerId, ws, opts = {}) {
    const forceFull = !!opts.forceFull;
    const groupKey = ws && ws.groupKey ? String(ws.groupKey) : '';
    if (!ws.serverSessionId) {
      ws.serverSessionId = randomU64String();
    }

    try {
      const reqBytes = this.wasm.build_sync_route_info_request(
        groupKey,
        targetPeerId,
        BigInt(ws.serverSessionId),
        !!ws.weAreInitiator,
        forceFull
      );
      if (!reqBytes) return;

      const rpcRequestPayload = { request: Array.from(reqBytes), timeout_ms: 5000 };
      const rpcRequestBytes = encode_rpc_request(safeJSONstringify(rpcRequestPayload));

      const rpcReqPacket = {
        from_peer: MY_PEER_ID,
        to_peer: targetPeerId,
        transaction_id: Number(BigInt.asUintN(32, BigInt(randomU64String()))),
        descriptor: {
          domain_name: ws.domainName || 'public_server',
          proto_name: 'OspfRouteRpc',
          service_name: 'OspfRouteRpc',
          method_index: Number(process.env.EASYTIER_OSPF_ROUTE_METHOD_INDEX || 1),
        },
        body: Array.from(rpcRequestBytes),
        is_request: true,
        total_pieces: 1,
        piece_idx: 0,
        trace_id: 0,
        compression_info: { algo: 1, accepted_algo: 1 },
      };

      const rpcPacketBytes = encode_rpc_packet(safeJSONstringify(rpcReqPacket));
      const buf = wrapPacket(createHeader, MY_PEER_ID, targetPeerId, PacketType.RpcReq, rpcPacketBytes, ws);
      ws.send(buf);
    } catch (e) {
      console.error(`pushRouteUpdateTo failed for ${targetPeerId}:`, e.message);
    }
  }

  broadcastRouteUpdate(types, groupKey, excludePeerId, opts = {}) {
    const forceFull = opts.forceFull !== undefined ? !!opts.forceFull : true;
    // relay_room maintains the actual ws map; we just request pushes from JS side
    // This method is a no-op here because relay_room iterates peers directly
  }

  handleSyncRouteInfo(ws, fromPeerId, rpcPacket, reqBytes) {
    const groupKey = ws && ws.groupKey ? String(ws.groupKey) : '';
    try {
      const respBytes = this.wasm.handle_sync_route_info_request(groupKey, fromPeerId, new Uint8Array(reqBytes));
      return respBytes;
    } catch (e) {
      console.error('handleSyncRouteInfo wasm error:', e.message);
      return null;
    }
  }
}

let peerManagerInstance = null;
export function getPeerManager() {
  if (!peerManagerInstance) {
    peerManagerInstance = new PeerManager();
  }
  return peerManagerInstance;
}
