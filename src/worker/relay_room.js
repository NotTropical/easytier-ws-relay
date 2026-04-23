import { Buffer } from 'buffer';
import { parseHeader } from './core/packet.js';
import { PacketType, HEADER_SIZE, MY_PEER_ID } from './core/constants.js';
import { handleHandshake, handlePing } from './core/basic_handlers.js';
import { handleRpcReq, handleRpcResp } from './core/rpc_handler.js';
import { getPeerManager } from './core/peer_manager.js';
import { randomU64String } from './core/crypto.js';

const WS_OPEN = 1;

export class RelayRoom {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.peerManager = getPeerManager();
    // this._cleanupTimer = null;

    // Restore sockets after hibernation to keep metadata
    this.state.getWebSockets().forEach((ws) => this._restoreSocket(ws));
    // this._ensureCleanupTimer();
  }

  async fetch(request) {
    const url = new URL(request.url);
    const wsPath = '/' + this.env.WS_PATH || '/ws';
    if (url.pathname !== wsPath) {
      return new Response('Not found', { status: 404 });
    }
    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('Expected websocket', { status: 400 });
    }

    const pair = new WebSocketPair();
    const server = pair[1];
    const client = pair[0];
    await this.handleSession(server);

    return new Response(null, { status: 101, webSocket: client });
  }

  async handleSession(webSocket) {
    this.state.acceptWebSocket(webSocket);
    this._initSocket(webSocket);
    // this._ensureCleanupTimer();
  }

  async webSocketMessage(ws, message) {
    try {
      let buffer = null;
      if (message instanceof ArrayBuffer) {
        buffer = Buffer.from(message);
      } else if (message instanceof Uint8Array) {
        buffer = Buffer.from(message);
      } else if (ArrayBuffer.isView(message) && message.buffer) {
        buffer = Buffer.from(message.buffer);
      } else {
        console.warn('[ws] unsupported message type', typeof message);
        return;
      }
      console.log(`[ws] recv len=${buffer.length}`);
      ws.lastSeen = Date.now();
      const header = parseHeader(buffer);
      if (!header) {
        console.error('[ws] parseHeader failed, raw hex=', buffer.toString('hex'));
        return;
      }
      console.log(`[ws] header from=${header.from_peer_id} to=${header.to_peer_id} type=${header.packet_type} len=${header.len}`);
      const payload = buffer.subarray(HEADER_SIZE);
      switch (header.packet_type) {
        case PacketType.HandShake:
          console.log(`[ws] -> handleHandshake payload hex=${payload.toString('hex')}`);
          handleHandshake(ws, header, payload);
          // After a new peer finishes handshake, broadcast route update to all other peers in the same group
          if (ws.peerId && ws.groupKey) {
            try {
              this.broadcastRouteUpdate(ws.groupKey, ws.peerId);
            } catch (e) {
              console.error(`Broadcast after handshake failed for ${ws.peerId}:`, e.message);
            }
          }
          break;
        case PacketType.Ping:
          handlePing(ws, header, payload);
          break;
        case PacketType.RpcReq:
          if (header.to_peer_id === undefined || header.to_peer_id === null || header.to_peer_id === MY_PEER_ID) {
            handleRpcReq(ws, header, payload, this.types);
            break;
          }
          this._forwardMessage(ws, header, buffer);
          break;
        case PacketType.RpcResp:
          if (header.to_peer_id === undefined || header.to_peer_id === null || header.to_peer_id === MY_PEER_ID) {
            handleRpcResp(ws, header, payload);
            break;
          }
          // fallthrough for forwarding
        case PacketType.Data:
        default:
          if (header.packet_type !== PacketType.Data) {
            console.log(`[ws] -> forward type=${header.packet_type} len=${payload.length}`);
          }
          this._forwardMessage(ws, header, buffer);
      }
    } catch (e) {
      console.error('relay_room message handling error:', e);
      try { ws.close(1011, 'internal error'); } catch (_) { }
    }
  }

  async webSocketClose(ws) {
    if (ws.peerId) {
      const groupKey = ws.groupKey;
      this.peerManager.removePeer(ws);
      try {
        this.broadcastRouteUpdate(groupKey, ws.peerId);
      } catch (_) { }
    }
  }

  async webSocketError(ws) {
    await this.webSocketClose(ws);
  }

  _forwardMessage(sourceWs, header, fullMessage) {
    const targetPeerId = header.to_peer_id;
    const peers = this.state.getWebSockets();
    for (const targetWs of peers) {
      if (targetWs.peerId !== targetPeerId) continue;
      if (targetWs.readyState !== WS_OPEN) continue;
      const srcGroup = sourceWs && sourceWs.groupKey;
      const dstGroup = targetWs && targetWs.groupKey;
      if (srcGroup && dstGroup && srcGroup !== dstGroup) {
        return;
      }
      try {
        targetWs.send(fullMessage);
        return;
      } catch (e) {
        console.error(`Forward to ${targetPeerId} failed: ${e.message}`);
        this.peerManager.removePeer(targetWs);
        try {
          this.broadcastRouteUpdate(srcGroup);
        } catch (err) {
          console.error(`Broadcast after forward failure failed: ${err.message}`);
        }
      }
    }
  }

  broadcastRouteUpdate(groupKey, excludePeerId) {
    const peers = this.state.getWebSockets();
    for (const peerWs of peers) {
      if (peerWs.peerId === excludePeerId) continue;
      if (peerWs.readyState !== WS_OPEN) continue;
      if (peerWs.groupKey !== groupKey) continue;
      try {
        this.peerManager.pushRouteUpdateTo(peerWs.peerId, peerWs, { forceFull: true });
      } catch (e) {
        console.error(`broadcastRouteUpdate to ${peerWs.peerId} failed:`, e.message);
      }
    }
  }

  _initSocket(ws, meta = {}) {
    ws.peerId = meta.peerId || null;
    ws.groupKey = meta.groupKey || null;
    ws.domainName = meta.domainName || null;
    ws.lastSeen = Date.now();
    ws.serverSessionId = meta.serverSessionId || randomU64String();
    ws.weAreInitiator = false;
    ws.crypto = { enabled: false };
    ws.serializeAttachment?.({
      peerId: ws.peerId,
      groupKey: ws.groupKey,
      domainName: ws.domainName,
      serverSessionId: ws.serverSessionId,
    });
  }

  _restoreSocket(ws) {
    const meta = ws.deserializeAttachment ? (ws.deserializeAttachment() || {}) : {};
    this._initSocket(ws, meta);
  }

  _ensureCleanupTimer() {
    if (this._cleanupTimer) return;
    const CLEANUP_INTERVAL_MS = 30000;
    const SOCKET_TIMEOUT_MS = 120000;

    const tick = () => {
      this._cleanupTimer = null;
      try {
        const now = Date.now();
        for (const ws of this.state.getWebSockets()) {
          if (ws.readyState !== WS_OPEN) continue;
          if (ws.lastSeen && now - ws.lastSeen > SOCKET_TIMEOUT_MS) {
            console.warn(`[cleanup] closing dead socket peerId=${ws.peerId} lastSeenAgo=${now - ws.lastSeen}ms`);
            try { ws.close(1001, 'timeout'); } catch (_) {}
          }
        }
      } catch (e) {
        console.error('Cleanup tick error:', e);
      }
      if (this.state.getWebSockets().length > 0) {
        this._cleanupTimer = setTimeout(tick, CLEANUP_INTERVAL_MS);
      }
    };

    this._cleanupTimer = setTimeout(tick, CLEANUP_INTERVAL_MS);
  }
}
