import { CONFIG } from "../core/config.js";
import { presetError } from "./preset-limits.js";

// Read incrementally and cancel at the first over-budget chunk. Never collect
// an unbounded Response/ArrayBuffer before applying the decompression limit.
async function collectBoundedStream(stream, limit) {
  const reader = stream.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) throw presetError("preset-too-large");
      chunks.push(value);
    }
  } catch (error) {
    try { await reader.cancel(error); } catch { /* preserve the original failure */ }
    throw error;
  } finally { reader.releaseLock(); }
  const out = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { out.set(chunk, offset); offset += chunk.byteLength; }
  return out;
}

async function transform(bytes, Constructor, limit) {
  return collectBoundedStream(new Blob([bytes]).stream().pipeThrough(new Constructor("deflate")), limit);
}

// A valid zlib-wrapped empty DEFLATE stream, including the Adler-32 checksum.
// Probe the exact format and an actual read, independently of CompressionStream.
async function supportsDeflateDecompression() {
  try {
    if (typeof globalThis.DecompressionStream !== "function") return false;
    const empty = await transform(new Uint8Array([120, 156, 3, 0, 0, 0, 0, 1]), globalThis.DecompressionStream, 1);
    return empty.length === 0;
  } catch { return false; }
}

async function compressDeflate(bytes) {
  if (typeof globalThis.CompressionStream !== "function" || !await supportsDeflateDecompression()) throw presetError("unsupported-compression");
  const compressed = await transform(bytes, globalThis.CompressionStream, CONFIG.presets.maxCompressedBytes);
  const verified = await transform(compressed, globalThis.DecompressionStream, CONFIG.presets.maxJsonBytes);
  if (verified.length !== bytes.length || verified.some((value, index) => value !== bytes[index])) throw presetError("invalid-compressed-preset");
  return compressed;
}

async function decompressDeflate(bytes) {
  if (!await supportsDeflateDecompression()) throw presetError("unsupported-compression");
  try { return await transform(bytes, globalThis.DecompressionStream, CONFIG.presets.maxJsonBytes); }
  catch (error) {
    if (error.code === "preset-too-large") throw error;
    throw presetError("invalid-compressed-preset");
  }
}

export { collectBoundedStream, compressDeflate, decompressDeflate };
