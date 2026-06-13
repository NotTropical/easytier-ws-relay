import initAsync, { initSync } from './pkg/easytier_relay_wasm';
import wasmModule from './pkg/easytier_relay_wasm_bg.wasm';

// Initialize WASM synchronously before any exports are used.
initSync({ module: wasmModule });

export * from './pkg/easytier_relay_wasm';
export { initAsync, wasmModule };
