import { MY_PEER_ID, PacketType } from './constants.js';
import { createHeader } from './packet.js';
import { getPeerManager } from './peer_manager.js';
import { wrapPacket, randomU64String, safeJSONparse, safeJSONstringify } from './crypto.js';
import { gzipMaybe, gunzipMaybe, isCompressionAvailable } from './compress.js';
import {
  WasmPeerCenter,
  decode_rpc_response,
  decode_rpc_request,
  decode_rpc_packet,
  encode_rpc_packet,
  encode_rpc_response,
  decode_sync_route_info_request,
  decode_sync_route_info_response,
  encode_route_peer_info,
} from './wasm_bridge.js';

const peerCenterStateByGroup = new Map();
const PEER_CENTER_TTL_MS = Number(process.env.EASYTIER_PEER_CENTER_TTL_MS || 180_000);
const PEER_CENTER_CLEAN_INTERVAL = Math.max(30_000, Math.min(PEER_CENTER_TTL_MS / 2, 120_000));
let lastPeerCenterClean = 0;

function getPeerCenter(groupKey) {
  const k = String(groupKey || '');
  let pc = peerCenterStateByGroup.get(k);
  if (!pc) {
    pc = new WasmPeerCenter();
    peerCenterStateByGroup.set(k, pc);
  }
  const now = Date.now();
  if (now - lastPeerCenterClean > PEER_CENTER_CLEAN_INTERVAL) {
    lastPeerCenterClean = now;
    for (const [gk, center] of peerCenterStateByGroup.entries()) {
      center.clean_outdated(Math.ceil(PEER_CENTER_TTL_MS / 1000));
    }
  }
  return pc;
}

function sendRpcResponse(ws, toPeerId, reqRpcPacket, responseBodyBytes) {
  if (!ws || ws.readyState !== 1) {
    console.error(`sendRpcResponse aborted: socket not open toPeer=${toPeerId}`);
    return;
  }

  const compressEnabled = process.env.EASYTIER_COMPRESS_RPC !== '0';
  let responseBody = responseBodyBytes;
  let compressionInfo = { algo: 1, accepted_algo: 1 };
  if (compressEnabled && responseBodyBytes && responseBodyBytes.length > 256 && isCompressionAvailable()) {
    try {
      responseBody = gzipMaybe(responseBodyBytes);
      compressionInfo = { algo: 2, accepted_algo: 1 };
    } catch (e) {
      console.warn(`Compress rpc response failed: ${e.message}`);
    }
  }

  try {
    const rpcResponseBytes = encode_rpc_response(safeJSONstringify({
      response: Array.from(responseBody),
      error: null,
      runtime_us: 0,
    }));

    const rpcRespPacket = {
      from_peer: MY_PEER_ID,
      to_peer: toPeerId,
      transaction_id: reqRpcPacket.transaction_id,
      descriptor: reqRpcPacket.descriptor,
      body: Array.from(rpcResponseBytes),
      is_request: false,
      total_pieces: 1,
      piece_idx: 0,
      trace_id: reqRpcPacket.trace_id,
      compression_info: compressionInfo,
    };
    const rpcPacketBytes = encode_rpc_packet(safeJSONstringify(rpcRespPacket));

    const buf = wrapPacket(createHeader, MY_PEER_ID, toPeerId, PacketType.RpcResp, rpcPacketBytes, ws);
    ws.send(buf);
  } catch (e) {
    console.log(e)
    console.error(`sendRpcResponse to ${toPeerId} failed: ${e.message}`);
  }
}

export function handleRpcReq(ws, header, payload) {
  try {
    const rpcPacket = safeJSONparse(decode_rpc_packet(new Uint8Array(payload)));
    if (rpcPacket.compression_info && rpcPacket.compression_info.algo > 1 && isCompressionAvailable()) {
      try {
        rpcPacket.body = gunzipMaybe(new Uint8Array(rpcPacket.body));
        rpcPacket.compression_info.algo = 1;
      } catch (e) {
        console.error(`RpcPacket decompress failed from ${header.from_peer_id}: ${e.message}`);
        return;
      }
    }

    const descriptor = rpcPacket.descriptor || {};
    let innerReqBody = rpcPacket.body;
     if (rpcPacket.is_request !== false) {
      const rpcRequest = safeJSONparse(decode_rpc_request(new Uint8Array(innerReqBody)));
      // serviceReqBytes = new Uint8Array(rpcRequest.request);
      innerReqBody = rpcRequest.request;
    }

    // PeerCenterRpc
    if ((descriptor.service_name === 'peer_rpc.PeerCenterRpc' || descriptor.service_name === 'PeerCenterRpc')
      && (descriptor.proto_name === 'peer_rpc' || !descriptor.proto_name)) {
      const groupKey = ws && ws.groupKey ? String(ws.groupKey) : '';
      const pc = getPeerCenter(groupKey);

      if (descriptor.method_index === 0) {
        const respBytes = pc.report_peers(groupKey, new Uint8Array(innerReqBody));
        sendRpcResponse(ws, header.from_peer_id, rpcPacket, respBytes);
        return;
      }

      if (descriptor.method_index === 1) {
        const respBytes = pc.get_global_peer_map(groupKey, new Uint8Array(innerReqBody));
        sendRpcResponse(ws, header.from_peer_id, rpcPacket, respBytes);
        return;
      }

      console.log(`Unhandled PeerCenterRpc methodIndex=${descriptor.method_index}`);
      return;
    }

    // OspfRouteRpc
    if ((descriptor.service_name === 'peer_rpc.OspfRouteRpc' || descriptor.service_name === 'OspfRouteRpc')
      && (descriptor.proto_name === 'peer_rpc' || descriptor.proto_name === 'peer_rpc.OspfRouteRpc' || descriptor.proto_name === 'OspfRouteRpc' || !descriptor.proto_name)) {
      const groupKey = ws && ws.groupKey ? String(ws.groupKey) : '';

      if (descriptor.method_index === 0 || descriptor.method_index === 1) {
        handleSyncRouteInfo(ws, header.from_peer_id, rpcPacket, innerReqBody, groupKey);
        return;
      }
      console.log(`Unhandled OspfRouteRpc methodIndex=${descriptor.method_index}`);
      return;
    }

    console.log(`Unhandled RPC Service: ${descriptor.service_name} (proto: ${descriptor.proto_name})`);

  } catch (e) {
    console.error('RPC Decode error:', e);
  }
}

export function handleRpcResp(ws, header, payload) {
  try {
    console.log(`RpcResp <- from=${header.from_peer_id} to=${header.to_peer_id} len=${payload.length}`);
    const rpcPacket = safeJSONparse(decode_rpc_packet(new Uint8Array(payload)));
    if (rpcPacket.compression_info && rpcPacket.compression_info.algo > 1 && isCompressionAvailable()) {
      try {
        rpcPacket.body = gunzipMaybe(new Uint8Array(rpcPacket.body));
        rpcPacket.compression_info.algo = 1;
      } catch (e) {
        console.error(`RpcResp decompress failed from ${header.from_peer_id}: ${e.message}`);
        return;
      }
    }

    const descriptor = rpcPacket.descriptor || {};

        // === 新增：解析 RpcResponse 层 ===
    let serviceRespBytes = rpcPacket.body;
    if (rpcPacket.is_request === false) {
      try {
        const rpcResponse = safeJSONparse(decode_rpc_response(new Uint8Array(rpcPacket.body)));
        // rpcResponse.response 是 number[]，转换为 Uint8Array
        serviceRespBytes = new Uint8Array(rpcResponse.response);
      } catch (e) {
        console.error(`Decode RpcResponse failed from ${header.from_peer_id}: ${e.message}`);
        return;
      }
    }

    // Handle SyncRouteInfoResponse ack (OspfRouteRpc)
    if ((descriptor.service_name === 'peer_rpc.OspfRouteRpc' || descriptor.service_name === 'OspfRouteRpc')
      && (descriptor.proto_name === 'peer_rpc' || descriptor.proto_name === 'peer_rpc.OspfRouteRpc' || descriptor.proto_name === 'OspfRouteRpc' || !descriptor.proto_name)) {
      try {
        const resp = safeJSONparse(decode_sync_route_info_response(serviceRespBytes));
        // const resp = safeJSONparse(decode_sync_route_info_response(new Uint8Array(rpcPacket.body)));

        const sessionId = resp && resp.session_id ? resp.session_id : null;
        if (sessionId && ws && ws.groupKey !== undefined) {
          getPeerManager().onRouteSessionAck(ws.groupKey, header.from_peer_id, sessionId, ws.weAreInitiator);
          console.log(`RpcResp SyncRouteInfoResponse from=${header.from_peer_id} sessionId=${sessionId} acked`);
        }
      } catch (e) {
        console.log(e)
        console.error(`Decode SyncRouteInfoResponse failed from ${header.from_peer_id}: ${e.message}`);
      }
      return;
    }

    console.log(`RpcResp from=${header.from_peer_id} ok`);
  } catch (e) {
    console.error('RPC Resp Decode error:', e);
  }
}

function handleSyncRouteInfo(ws, fromPeerId, reqRpcPacket, innerReqBody, groupKey) {
  const pm = getPeerManager();

  if (!ws.serverSessionId) {
    ws.serverSessionId = randomU64String();
  }

  const syncReq = safeJSONparse(decode_sync_route_info_request(new Uint8Array(innerReqBody)));

  if (syncReq && typeof syncReq.is_initiator === 'boolean') {
    ws.weAreInitiator = !syncReq.is_initiator;
  }
  pm.onRouteSessionAck(groupKey, fromPeerId, syncReq.my_session_id, ws.weAreInitiator);

  let hasNewPeers = false;
  if (syncReq.peer_infos && syncReq.peer_infos.items) {
    for (const info of syncReq.peer_infos.items) {
      if (info.peer_id !== MY_PEER_ID) {
        const isNew = !pm.wasm.get_peer_ids_in_group(groupKey).includes(info.peer_id);
        try {
          const infoBytes = encode_route_peer_info(safeJSONstringify(info));
          pm.wasm.update_peer_info(groupKey, info.peer_id, infoBytes);
        } catch (e) {
          console.warn('updatePeerInfo in handleSyncRouteInfo failed:', e.message);
        }
        if (isNew) hasNewPeers = true;
      }
      if (info.peer_id === MY_PEER_ID) {
        try {
          const infoBytes = encode_route_peer_info(safeJSONstringify(info));
          pm.wasm.update_peer_info(groupKey, info.peer_id, infoBytes);
        } catch (e) {
          console.warn('updatePeerInfo for MY_PEER_ID failed:', e.message);
        }
      }
    }
  }

  const respBytes = pm.handleSyncRouteInfo(ws, fromPeerId, reqRpcPacket, new Uint8Array(innerReqBody));
  if (respBytes) {
    sendRpcResponse(ws, fromPeerId, reqRpcPacket, respBytes);
  }

  // After responding, push our current route info back to the requester
  pm.pushRouteUpdateTo(fromPeerId, ws, { forceFull: true });
}
