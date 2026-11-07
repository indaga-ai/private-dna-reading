// Reads a consumer raw DNA file line by line and keeps only the rsIDs it is asked for.
// Formats: 23andMe and Living DNA (rsid, chromosome, position, genotype; tab-separated),
// AncestryDNA (rsid, chromosome, position, allele1, allele2), MyHeritage and FamilyTreeDNA
// (quoted CSV: RSID,CHROMOSOME,POSITION,RESULT). The same code runs in the browser and in Node:
// it takes any async iterable of text chunks, so a 25 MB file never has to sit in memory as one string.

const MISSING = new Set(['--', '00', '0', 'NC', '', '??']);

/** Splits text chunks into lines without holding the whole file. */
export async function* lines(chunks) {
  let rest = '';
  for await (const chunk of chunks) {
    const text = rest + chunk;
    const parts = text.split(/\r?\n/);
    rest = parts.pop();
    for (const line of parts) yield line;
  }
  if (rest) yield rest;
}

function splitRow(line) {
  if (line.includes('\t')) return line.split('\t').map((s) => s.trim());
  if (line.includes(',')) return line.split(',').map((s) => s.trim().replace(/^"(.*)"$/, '$1'));
  return line.trim().split(/\s+/);
}

/** Recognises the format from a data row (5 columns with two allele columns means AncestryDNA). */
function rowFormat(cols) {
  if (cols.length >= 5 && /^[ACGTDI0-]$/i.test(cols[3]) && /^[ACGTDI0-]$/i.test(cols[4])) return 'ancestrydna';
  if (cols.length >= 4) return 'four-column';
  return null;
}

/** Normalises a genotype to sorted upper-case letters ("GA" becomes "AG"); null when the file has no call. */
export function normaliseGenotype(raw) {
  const g = String(raw ?? '').toUpperCase().replace(/[\s/]/g, '');
  if (MISSING.has(g) || /0/.test(g)) return null;
  if (!/^[ACGTDI]{1,2}$/.test(g)) return null;
  return g.split('').sort().join('');
}

/**
 * Keeps the rows for `wanted` rsIDs.
 * Returns { format, build, found: Map(rsid -> {chrom, pos, genotype, raw}), rows, header }.
 * A wanted rsID absent from the file is simply missing from `found`; a present one without a call has genotype null.
 */
export async function extractPanel(chunks, wanted) {
  const want = new Set([...wanted].map((r) => r.toLowerCase()));
  const found = new Map();
  let format = null;
  let build = null;
  let rows = 0;
  const header = [];
  for await (const raw of lines(chunks)) {
    const line = raw.replace(/^﻿/, '');
    if (!line.trim()) continue;
    if (line.startsWith('#')) {
      if (header.length < 40) header.push(line);
      const b = /build\s*(\d{2})|GRCh(\d{2})|hg(\d{2})/i.exec(line);
      if (b && !build) build = b[1] ? `build ${b[1]}` : b[2] ? `GRCh${b[2]}` : `hg${b[3]}`;
      continue;
    }
    const cols = splitRow(line);
    const first = (cols[0] || '').toLowerCase();
    if (first === 'rsid' || first === 'snp' || first === 'name') {
      if (!format) format = cols.length >= 5 ? 'ancestrydna' : /,/.test(line) ? 'myheritage-or-ftdna' : 'twenty-three-and-me-style';
      continue;
    }
    rows += 1;
    if (!format) {
      const f = rowFormat(cols);
      format = f === 'ancestrydna' ? 'ancestrydna' : /,/.test(line) ? 'myheritage-or-ftdna' : 'twenty-three-and-me-style';
    }
    if (!want.has(first)) continue;
    const isAncestry = format === 'ancestrydna' && cols.length >= 5;
    const rawGenotype = isAncestry ? `${cols[3]}${cols[4]}` : cols[3];
    found.set(first, {
      chrom: cols[1],
      pos: Number(cols[2]),
      genotype: normaliseGenotype(rawGenotype),
      raw: rawGenotype,
    });
  }
  return { format, build, found, rows, header };
}

/** Text chunks from a string (Node tests and CLI). */
export async function* fromString(text, size = 1 << 16) {
  for (let i = 0; i < text.length; i += size) yield text.slice(i, i + size);
}
