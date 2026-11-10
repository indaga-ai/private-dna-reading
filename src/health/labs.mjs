// A blood test as the lab printed it: each marker's value, unit and the lab's own reference range. Each result is
// placed within, above or below that range here on the page, and that is all: nothing is converted between units (a
// result with no range, or a range in another unit, is not compared), and nothing says what a result means for
// health. Ranges differ between labs, so only the lab's own printed range is used.

export const MAX_MARKERS = 12;

export const NOTES = {
  within: 'Within the range the lab printed.',
  above: 'Above the range the lab printed: a question for a doctor.',
  below: 'Below the range the lab printed: a question for a doctor.',
  none: 'No range in the same unit was printed with it, so it is not compared.',
};

const num = (v) => (v === '' || v === null || v === undefined ? null : Number.isFinite(Number(v)) ? Number(v) : null);

// Rows of { marker, value, unit, low, high, range_unit?, date? }: a JSON array, or CSV with that header. A row without
// a marker name or a numeric value is skipped; a marker given twice keeps its last row.
export function parseLabs(text) {
  const t = String(text ?? '').trim();
  let raw;
  if (t.startsWith('[')) {
    raw = JSON.parse(t);
    if (!Array.isArray(raw)) throw new Error('blood test data must be a list of markers');
  } else {
    const [head, ...lines] = t.split(/\r?\n/).filter((l) => l.trim());
    const cols = (head || '').split(',').map((c) => c.trim().toLowerCase());
    if (!cols.includes('marker') || !cols.includes('value')) throw new Error('blood test data needs marker and value columns');
    raw = lines.map((l) => Object.fromEntries(l.split(',').map((v, i) => [cols[i], v.trim()])));
  }
  const markers = new Map();
  for (const r of raw) {
    const marker = String(r?.marker ?? '').trim().slice(0, 60);
    const value = num(r?.value);
    if (!marker || value === null) continue;
    markers.set(marker.toLowerCase(), {
      marker, value, unit: String(r.unit ?? '').trim().slice(0, 20),
      low: num(r.low), high: num(r.high),
      // The range's unit when the lab printed one apart; an empty column means the value's own unit.
      rangeUnit: String(String(r.range_unit ?? '').trim() || r.unit || '').trim().slice(0, 20),
      date: /^\d{4}-\d{2}-\d{2}$/.test(String(r.date ?? '')) ? r.date : null,
    });
  }
  const rows = [...markers.values()];
  if (rows.length > MAX_MARKERS) throw new Error(`a blood test here can have at most ${MAX_MARKERS} markers (this one has ${rows.length})`);
  return rows;
}

// Per marker: the value, the lab's range as printed, and where the value falls in it.
export function summarizeLabs(rows) {
  return rows.map((r) => {
    const comparable = r.unit && r.rangeUnit === r.unit && (r.low !== null || r.high !== null);
    const range = !comparable ? 'no range in this unit'
      : r.low !== null && r.high !== null ? `${r.low}–${r.high} ${r.unit}` : r.high !== null ? `up to ${r.high} ${r.unit}` : `from ${r.low} ${r.unit}`;
    const position = !comparable ? 'not compared'
      : r.high !== null && r.value > r.high ? 'above' : r.low !== null && r.value < r.low ? 'below' : 'within';
    const note = NOTES[position === 'not compared' ? 'none' : position];
    return { marker: r.marker, value: r.value, unit: r.unit, range, position, note, date: r.date };
  });
}

// The made-up blood tests that go with the sample people (web/samples/*-labs.json).
export const LAB_SAMPLES = { Ada: 'ada-labs.json', Bo: 'bo-labs.json', Cyd: 'cyd-labs.json' };
