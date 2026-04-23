import { parse_packet_header, create_packet_header } from './wasm_bridge.js';
export const HEADER_SIZE = 16;

export function parseHeader(buffer) {
  if (!buffer || buffer.length < HEADER_SIZE) return null;
  try {
    const arr = new Uint8Array(buffer.buffer, buffer.byteOffset, HEADER_SIZE);
    const jsval = parse_packet_header(arr);
     
    return jsval
    // return JSON.parse(json);
  } catch (e) {
    console.error('[wasm] parse_packet_header failed:', e);
    return null;
  }
}

export function createHeader(fromPeerId, toPeerId, packetType, payloadLen) {
  try {
    const bytes = create_packet_header({
      from_peer_id: fromPeerId,
      to_peer_id: toPeerId,
      packet_type: packetType,
      flags: 0,
      forward_counter: 1,
      reserved: 0,
      len: payloadLen,
    });
    return Buffer.from(bytes);
  } catch (e) {
    console.error('[wasm] create_packet_header failed:', e);
    return Buffer.alloc(HEADER_SIZE);
  }
}
