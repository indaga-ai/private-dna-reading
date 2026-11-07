// The trait panel. Each trait names the variants it reads, with the letters a 23andMe or AncestryDNA raw file
// shows for them (plus strand, GRCh37), and the result for every genotype, worked out in advance from published
// research (sources in docs/PANEL.md). The AI never decides a result; it only writes up these.
//
// Rules the table follows: traits only (no disease, medicine or diet advice); a variant missing from the file is
// "not measured", never "typical"; letters the table does not expect are not guessed (no strand flipping).

export const TRAITS = [
  {
    id: 'lactase',
    trait: 'Lactase persistence',
    gene: 'LCT / MCM6',
    snps: [{ rsid: 'rs4988235', chrom: '2', pos37: 136608646, alleles: ['A', 'G'] }],
    calls: {
      AA: 'Two copies of the lactase-persistence variant: the lactase enzyme usually stays active into adulthood.',
      AG: 'One copy of the lactase-persistence variant: one copy is usually enough for lactase to stay active into adulthood.',
      GG: 'No copy of this lactase-persistence variant: lactase activity usually declines after childhood.',
    },
    caveat: 'This variant explains lactase persistence mainly in people with European ancestry; other ancestries have other persistence variants this panel does not read.',
  },
  {
    id: 'flush',
    trait: 'Alcohol flush',
    gene: 'ALDH2',
    snps: [{ rsid: 'rs671', chrom: '12', pos37: 112241766, alleles: ['A', 'G'] }],
    calls: {
      GG: 'No copy of the ALDH2*2 variant: the usual form of the enzyme, so no flush from this variant.',
      AG: 'One copy of the ALDH2*2 variant: a red face after alcohol (the "flush") is common with one copy.',
      AA: 'Two copies of the ALDH2*2 variant: a strong flush after even a little alcohol is typical.',
    },
    caveat: 'The ALDH2*2 variant is common in East Asian ancestry and rare elsewhere.',
  },
  {
    id: 'earwax',
    trait: 'Earwax type',
    gene: 'ABCC11',
    snps: [{ rsid: 'rs17822931', chrom: '16', pos37: 48258198, alleles: ['C', 'T'] }],
    calls: {
      CC: 'Wet (sticky, yellow-brown) earwax is expected.',
      CT: 'Wet earwax is expected: one copy of the wet type is enough.',
      TT: 'Dry (flaky, grey-white) earwax is expected.',
    },
    caveat: 'Dry earwax is the usual type in East Asia and uncommon in Europe and Africa.',
  },
  {
    id: 'eyes',
    trait: 'Eye colour',
    gene: 'HERC2 (OCA2 switch)',
    snps: [{ rsid: 'rs12913832', chrom: '15', pos37: 28365618, alleles: ['A', 'G'] }],
    calls: {
      GG: 'Blue or other light eyes are most likely.',
      AG: 'Brown or hazel eyes are more likely than blue.',
      AA: 'Brown eyes are most likely.',
    },
    caveat: 'Eye colour depends on several genes; this one variant predicts it best in people with European ancestry.',
  },
  {
    id: 'muscle',
    trait: 'Muscle fibre protein',
    gene: 'ACTN3',
    snps: [{ rsid: 'rs1815739', chrom: '11', pos37: 66328095, alleles: ['C', 'T'] }],
    calls: {
      CC: 'Two working copies of ACTN3 (RR): fast-twitch muscle fibres make the protein alpha-actinin-3.',
      CT: 'One working copy of ACTN3 (RX): fast-twitch muscle fibres make alpha-actinin-3.',
      TT: 'No working copy of ACTN3 (XX): the muscles make no alpha-actinin-3, which is true of more than a billion healthy people.',
    },
    caveat: 'The variant is more common among sprinters (RR) and endurance athletes (XX), but it does not predict how well anyone performs.',
  },
  {
    id: 'bitter',
    trait: 'Bitter taste (PTC/PROP)',
    gene: 'TAS2R38',
    snps: [
      { rsid: 'rs713598', chrom: '7', pos37: 141673345, alleles: ['C', 'G'] },
      { rsid: 'rs1726866', chrom: '7', pos37: 141672705, alleles: ['C', 'T'] },
      { rsid: 'rs10246939', chrom: '7', pos37: 141672604, alleles: ['C', 'T'] },
    ],
    haplotype: true,
    caveat: 'Taste also depends on other genes and on experience; this reads one well-studied bitter receptor.',
  },
];

export const PANEL_RSIDS = TRAITS.flatMap((t) => t.snps.map((s) => s.rsid));

// TAS2R38 haplotypes on the plus strand, in rsID order [rs713598, rs1726866, rs10246939].
// PAV (taster) and AVI (non-taster) are the two common ones. UNVERIFIED letters: see docs/PANEL.md.
export const TAS2R38 = { PAV: ['G', 'C', 'C'], AVI: ['C', 'T', 'T'] };

const sortGt = (g) => g.split('').sort().join('');

function callBitter(gts) {
  // Each genotype must be one of the expected letters; then count PAV letters per site.
  const counts = gts.map((g, i) => [...g].filter((x) => x === TAS2R38.PAV[i]).length);
  if (counts.every((c) => c === 2)) return { label: 'PAV/PAV', result: 'Two copies of the taster form (PAV/PAV): bitter compounds such as PTC usually taste very bitter.' };
  if (counts.every((c) => c === 0)) return { label: 'AVI/AVI', result: 'Two copies of the non-taster form (AVI/AVI): PTC and similar bitter compounds usually taste weak or of nothing.' };
  if (counts.every((c) => c === 1)) return { label: 'PAV/AVI', result: 'One taster and one non-taster form (PAV/AVI): bitter compounds such as PTC usually taste bitter.' };
  return { label: 'uncommon', result: 'An uncommon combination of the three sites, so the taster form cannot be read reliably.' };
}

/**
 * The results for the variants found in a file (a Map from extractPanel). One item per trait:
 * { id, trait, gene, variant, genotype, result, caveat, status: called | not-measured | no-call | unexpected }
 */
export function callPanel(found) {
  return TRAITS.map((t) => {
    const base = { id: t.id, trait: t.trait, gene: t.gene, variant: t.snps.map((s) => s.rsid).join(' + '), caveat: t.caveat };
    const rows = t.snps.map((s) => found.get(s.rsid));
    if (rows.every((r) => !r)) return { ...base, genotype: null, status: 'not-measured', result: 'Not measured: this file does not include the variant.' };
    if (rows.some((r) => !r || !r.genotype)) return { ...base, genotype: null, status: 'no-call', result: 'Not measured: the file has no reading for this variant.' };
    const gts = rows.map((r) => sortGt(r.genotype));
    const unexpected = gts.some((g, i) => g.length !== 2 || [...g].some((x) => !t.snps[i].alleles.includes(x)));
    if (unexpected) return { ...base, genotype: gts.join(' '), status: 'unexpected', result: 'Not read: the file shows letters this table does not expect for this variant.' };
    if (t.haplotype) {
      const b = callBitter(gts);
      return { ...base, genotype: gts.join(' '), status: b.label === 'uncommon' ? 'unexpected' : 'called', result: b.result };
    }
    return { ...base, genotype: gts[0], status: 'called', result: t.calls[gts[0]] };
  });
}

export const SAMPLES = [
  { name: 'Ada', file: 'ada-23andme.txt', blurb: 'Synthetic · 23andMe format' },
  { name: 'Bo', file: 'bo-ancestrydna.txt', blurb: 'Synthetic · AncestryDNA format' },
  { name: 'Cyd', file: 'cyd-23andme.txt', blurb: 'Synthetic · some variants missing' },
];
