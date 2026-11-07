// The trait table: every genotype of every marker, the not-measured cases, and the TAS2R38 lookup, including its
// protection against a strand-flipped file.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { TRAITS, TAS2R38, BITTER_LOOKUP, NOT_MEASURED, callPanel, PANEL_RSIDS, SAMPLES } from '../src/genome/panel.mjs';
import { extractPanel, fromString } from '../src/genome/parse.mjs';
import { strayTopics } from '../src/ai/check-reply.mjs';

const found = (rows) => new Map(Object.entries(rows).map(([rsid, gt]) => [rsid, { chrom: '', pos: NaN, genotype: gt }]));
const item = (rows, id) => callPanel(found(rows)).find((i) => i.id === id);

// Both homozygotes and the heterozygote, built from the effect letter, for every single-marker trait.
const EXPECT = {
  lactase: { AA: /two copies of the lactase-persistence/, AG: /one copy of the lactase-persistence/, GG: /no copy of the lactase-persistence/ },
  flush: { GG: /two copies of the common ALDH2/, AG: /one copy of the ALDH2\*2/, AA: /two copies of the ALDH2\*2/ },
  earwax: { CC: /expected to be wet/, CT: /wet is dominant/, TT: /expected to be dry/ },
  eyes: { GG: /blue or grey eyes/, AG: /brown or green\/hazel/, AA: /brown eyes are the most common/ },
  muscle: { CC: /two working copies/, CT: /one working copy/, TT: /two 577X copies/ },
};

for (const t of TRAITS.filter((x) => !x.haplotype)) {
  test(`${t.trait}: all three genotypes, in either letter order`, () => {
    const rs = t.snps[0].rsid;
    for (const [gt, re] of Object.entries(EXPECT[t.id])) {
      for (const order of [gt, gt.split('').reverse().join('')]) {
        const i = item({ [rs]: order }, t.id);
        assert.equal(i.status, 'called', `${rs} ${order}`);
        assert.equal(i.genotype, gt);
        assert.match(i.result, re, `${rs} ${order}`);
      }
    }
  });
}

test('missing, no-call, single letter and other-strand letters are "not measured", never typical', () => {
  for (const rows of [{}, { rs4988235: null }, { rs4988235: 'A' }, { rs4988235: 'TT' }, { rs4988235: 'CT' }, { rs1815739: 'AG' }]) {
    const all = callPanel(found(rows));
    const rs = Object.keys(rows)[0] || 'rs4988235';
    const t = TRAITS.find((x) => x.snps.some((s) => s.rsid === rs));
    const i = all.find((x) => x.id === t.id);
    assert.equal(i.status, 'not-measured', JSON.stringify(rows));
    assert.equal(i.result, NOT_MEASURED);
    assert.equal(i.genotype, null);
  }
});

test('a merged rsID alias is read like the main rsID', () => {
  assert.equal(item({ rs4986830: 'AG' }, 'flush').status, 'called');
});

test('a wrong position for the rsID is refused; GRCh37 and GRCh38 positions are both accepted', () => {
  const at = (pos) => callPanel(new Map([['rs671', { chrom: '12', pos, genotype: 'AG' }]])).find((i) => i.id === 'flush').status;
  assert.equal(at(112241766), 'called');
  assert.equal(at(111803962), 'called');
  assert.equal(at(5), 'not-measured');
});

const bitterRows = (a, b) => Object.fromEntries(['rs713598', 'rs1726866', 'rs10246939'].map((r, i) => [r, TAS2R38[a][i] + TAS2R38[b][i]]));

test('TAS2R38: the common diplotypes', () => {
  assert.match(item(bitterRows('PAV', 'PAV'), 'bitter').result, /two copies of the taster version/);
  assert.match(item(bitterRows('PAV', 'AVI'), 'bitter').result, /one taster copy/);
  assert.match(item(bitterRows('AVI', 'AVI'), 'bitter').result, /non-taster version \(AVI\/AVI\)/);
  assert.match(item(bitterRows('PAV', 'AAV'), 'bitter').result, /one taster copy/);
  assert.match(item(bitterRows('AVI', 'AAV'), 'bitter').result, /in-between sensitivity/);
  assert.match(item(bitterRows('AVI', 'AAI'), 'bitter').result, /in-between sensitivity/);
});

test('TAS2R38: a strand-flipped file gives no call rather than a wrong one', () => {
  const flip = { C: 'G', G: 'C' };
  for (const [a, b] of [['PAV', 'PAV'], ['AVI', 'AVI'], ['AVI', 'AAI'], ['AAI', 'AAI']]) {
    const rows = bitterRows(a, b);
    rows.rs713598 = rows.rs713598.split('').map((x) => flip[x]).join('');
    const i = item(rows, 'bitter');
    assert.equal(i.status, 'not-called', `${a}/${b} flipped`);
  }
});

test('TAS2R38: the lookup covers all 27 combinations with known classes', () => {
  const keys = Object.keys(BITTER_LOOKUP);
  assert.equal(keys.length, 27);
  for (const p of [0, 1, 2]) for (const a of [0, 1, 2]) for (const v of [0, 1, 2]) assert.ok(BITTER_LOOKUP[`${p},${a},${v}`]);
  assert.deepEqual(new Set(Object.values(BITTER_LOOKUP)), new Set(['non_taster', 'uncommon_not_called', 'intermediate_likely', 'taster_one_PAV', 'taster_two_PAV']));
});

test('TAS2R38: from rs713598 alone, a labelled estimate; without rs713598, not measured', () => {
  const g = item({ rs713598: 'GG' }, 'bitter');
  assert.equal(g.status, 'estimate');
  assert.match(g.result, /Only one of the three/);
  assert.match(item({ rs713598: 'CC', rs1726866: null }, 'bitter').result, /in-between result is also possible/);
  assert.equal(item({ rs1726866: 'GG', rs10246939: 'CC' }, 'bitter').status, 'not-measured');
});

test('no result sentence or caveat says anything the reading must not say', () => {
  const texts = TRAITS.flatMap((t) => [t.caveat, ...Object.values(t.calls || {})]);
  for (const s of [...texts, NOT_MEASURED]) {
    assert.deepEqual(strayTopics(s), [], s);
    assert.doesNotMatch(s, /\b(normal|mutation|deficien|carrier|supertaster|sprinter|endurance|intoleran|Asian flush)\b/i, s);
  }
});

test('the synthetic samples read as intended', async () => {
  const read = async (file) => {
    const text = readFileSync(new URL(`../web/samples/${file}`, import.meta.url), 'utf8');
    assert.match(text, /SYNTHETIC SAMPLE/);
    return callPanel((await extractPanel(fromString(text), PANEL_RSIDS)).found);
  };
  const [ada, bo, cyd] = await Promise.all(SAMPLES.map((s) => read(s.file)));
  assert.ok(ada.every((i) => i.status === 'called'));
  assert.ok(bo.every((i) => i.status === 'called'));
  assert.equal(bo.find((i) => i.id === 'bitter').class, 'non_taster');
  const c = Object.fromEntries(cyd.map((i) => [i.id, i.status]));
  assert.deepEqual(c, { lactase: 'called', flush: 'not-measured', earwax: 'not-measured', eyes: 'called', muscle: 'called', bitter: 'estimate' });
});
