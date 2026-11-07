// Opens the text file inside a raw-data .zip (23andMe and AncestryDNA download as one zipped .txt) without a
// library: it reads the zip's central directory, then streams the one entry through the browser's own
// DecompressionStream. Works in Node 18+ too. Supports stored and deflated entries; not ZIP64 or encryption.
import { readU16LE, readU32LE } from '../util/bytes.mjs';

const EOCD_SIG = 0x06054b50;
const CEN_SIG = 0x02014b50;
const LOC_SIG = 0x04034b50;

async function bytesOf(blob, start, end) {
  return new Uint8Array(await blob.slice(start, end).arrayBuffer());
}

export async function isZip(blob) {
  const b = await bytesOf(blob, 0, 4);
  return b.length === 4 && readU32LE(b, 0) === LOC_SIG;
}

/** Lists the entries of a zip Blob/File: [{ name, method, compressedSize, size, localOffset, encrypted }]. */
export async function zipEntries(blob) {
  const tailStart = Math.max(0, blob.size - 65_557);
  const tail = await bytesOf(blob, tailStart, blob.size);
  let eocd = -1;
  for (let i = tail.length - 22; i >= 0; i--) if (readU32LE(tail, i) === EOCD_SIG) { eocd = i; break; }
  if (eocd < 0) throw new Error('not a zip file (no end-of-directory record)');
  const count = readU16LE(tail, eocd + 10);
  const cenSize = readU32LE(tail, eocd + 12);
  const cenOffset = readU32LE(tail, eocd + 16);
  if (cenOffset === 0xffffffff) throw new Error('ZIP64 archives are not supported; unzip the file first');
  const cen = await bytesOf(blob, cenOffset, cenOffset + cenSize);
  const out = [];
  let p = 0;
  for (let n = 0; n < count && p + 46 <= cen.length; n++) {
    if (readU32LE(cen, p) !== CEN_SIG) throw new Error('damaged zip directory');
    const flags = readU16LE(cen, p + 8);
    const method = readU16LE(cen, p + 10);
    const compressedSize = readU32LE(cen, p + 20);
    const size = readU32LE(cen, p + 24);
    const nameLen = readU16LE(cen, p + 28);
    const extraLen = readU16LE(cen, p + 30);
    const commentLen = readU16LE(cen, p + 32);
    const localOffset = readU32LE(cen, p + 42);
    const name = new TextDecoder().decode(cen.subarray(p + 46, p + 46 + nameLen));
    out.push({ name, method, compressedSize, size, localOffset, encrypted: (flags & 1) === 1 });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

/** A text stream of the largest .txt/.csv/.tsv entry: the raw genotype file. */
export async function openRawDataInZip(blob) {
  const entries = (await zipEntries(blob)).filter((e) => /\.(txt|csv|tsv)$/i.test(e.name) && !e.name.startsWith('__MACOSX/'));
  if (!entries.length) throw new Error('no .txt or .csv file inside this zip');
  const e = entries.sort((a, b) => b.size - a.size)[0];
  if (e.encrypted) throw new Error('this zip is password-protected; unzip it first');
  const loc = await bytesOf(blob, e.localOffset, e.localOffset + 30);
  if (readU32LE(loc, 0) !== LOC_SIG) throw new Error('damaged zip entry');
  const start = e.localOffset + 30 + readU16LE(loc, 26) + readU16LE(loc, 28);
  const data = blob.slice(start, start + e.compressedSize).stream();
  let bytes;
  if (e.method === 0) bytes = data;
  else if (e.method === 8) bytes = data.pipeThrough(new DecompressionStream('deflate-raw'));
  else throw new Error(`unsupported zip compression (method ${e.method})`);
  return { name: e.name, size: e.size, text: bytes.pipeThrough(new TextDecoderStream()) };
}

/** Async iteration over a ReadableStream (not every browser makes streams iterable yet). */
export async function* chunksOf(stream) {
  const reader = stream.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return;
      yield value;
    }
  } finally {
    reader.releaseLock();
  }
}
