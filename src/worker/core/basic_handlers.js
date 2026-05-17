import { MAGIC, VERSION, MY_PEER_ID, PacketType } from './constants.js';
import { createHeader } from './packet.js';
import { getPeerManager } from './peer_manager.js';
import { wrapPacket, randomU64String, safeJSONparse, safeJSONstringify } from './crypto.js';
import { decode_handshake_request, encode_handshake_request } from './wasm_bridge.js';

const WS_OPEN = (typeof WebSocket !== 'undefined' && WebSocket.OPEN) ? WebSocket.OPEN : 1;

const networkDigestRegistry = new Map();

export function handleHandshake(ws, header, payload) {
  try {
    const req = safeJSONparse(decode_handshake_request(new Uint8Array(payload)));
    try {
      const dig = req.network_secret_digrest ? Buffer.from(req.network_secret_digrest) : Buffer.alloc(0);
      console.log(`Handshake networkSecretDigest(hex)=${dig.toString('hex')}`);
    } catch (_) {
      // ignore
    }

    if (req.magic !== MAGIC) {
      console.error('Invalid magic');
      ws.close();
      return;
    }

    const clientNetworkName = req.network_name || '';
    const clientDigest = req.network_secret_digrest ? Buffer.from(req.network_secret_digrest) : Buffer.alloc(0);
    const digestHex = clientDigest.toString('hex');
    const existingDigest = networkDigestRegistry.get(clientNetworkName);
    if (existingDigest && existingDigest !== digestHex) {
      console.error(`Rejecting handshake from ${req.my_peer_id}: digest mismatch for network "${clientNetworkName}" (existing=${existingDigest}, incoming=${digestHex})`);
      ws.close();
      return;
    }
    if (!existingDigest) {
      networkDigestRegistry.set(clientNetworkName, digestHex);
    }
    const groupDigest = networkDigestRegistry.get(clientNetworkName) || '';
    const groupKey = `${clientNetworkName}:${groupDigest}`;
    const serverNetworkName = process.env.EASYTIER_PUBLIC_SERVER_NETWORK_NAME || 'public_server';
    const digest = new Uint8Array(32);

    ws.domainName = clientNetworkName;

    const respPayload = {
      magic: MAGIC,
      my_peer_id: MY_PEER_ID,
      version: VERSION,
      features: ["node-server-v1"],
      network_name: serverNetworkName,
      network_secret_digrest: Array.from(digest)
    };

    ws.groupKey = groupKey;
    ws.peerId = req.my_peer_id;
    const pm = getPeerManager();
    pm.addPeer(req.my_peer_id, ws);
    pm.updatePeerInfo(ws.groupKey, req.my_peer_id, {
      peer_id: req.my_peer_id,
      version: 1,
      last_update: { seconds: Math.floor(Date.now() / 1000), nanos: 0 },
      inst_id: { part1: 0, part2: 0, part3: 0, part4: 0 },
      network_length: Number(process.env.EASYTIER_NETWORK_LENGTH || 24),
    });
    pm.wasm.bump_my_info_version(groupKey);
    ws.crypto = { enabled: false };

    const respBuffer = encode_handshake_request(safeJSONstringify(respPayload));
    const respHeader = createHeader(MY_PEER_ID, req.my_peer_id, PacketType.HandShake, respBuffer.length);
    ws.send(Buffer.concat([respHeader, Buffer.from(respBuffer)]));
    if (!ws.serverSessionId) {
      ws.serverSessionId = randomU64String();
    }
    if (ws.weAreInitiator === undefined) {
      ws.weAreInitiator = false;
    }

    setTimeout(() => {
      try {
        if (ws.readyState === WS_OPEN) {
          const pm = getPeerManager();
          pm.pushRouteUpdateTo(req.my_peer_id, ws, { forceFull: true });
        }
      } catch (e) {
        console.error(`Failed to push initial route update to ${req.my_peer_id}:`, e.message);
      }
    }, 50);

  } catch (e) {
    console.error('Handshake error:', e);
    ws.close();
  }
}

export function handlePing(ws, header, payload) {
  const msg = wrapPacket(createHeader, MY_PEER_ID, header.from_peer_id, PacketType.Pong, payload, ws);
  ws.send(msg);
}

export function handleForwarding(sourceWs, header, fullMessage) {
  // Forwarding is handled by RelayRoom._forwardMessage
}
