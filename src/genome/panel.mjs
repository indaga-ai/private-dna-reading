// The trait panel. Each trait names the variants it reads, with the letters a 23andMe or AncestryDNA raw file
// shows for them (plus strand, GRCh37), and the result for every genotype, worked out in advance from published
// research. Every position and letter was checked against Ensembl (GRCh37 and GRCh38), dbSNP and Ensembl VEP
// codons, with both homozygotes built by hand (docs/PANEL.md has the sources). The AI never decides a result; it
// only writes these up.
//
// Rules the table follows:
// - traits only: no disease, risk, diagnosis, medicine, or advice on diet, drinking, training or hygiene;
// - a variant that is missing, a no-call, a single letter, or letters outside the expected pair is "not
//   measured", never "typical", and never complemented to the other strand;
// - a missing genotype is never filled with the reference letter (for ACTN3 that would invent XX).

export const NOT_MEASURED = 'Not measured: this marker is missing from the file or has no reading, so nothing can be said about this trait from it.';

export const TRAITS = [
  {
    id: 'lactase',
    trait: 'Lactase persistence',
    gene: 'LCT / MCM6',
    snps: [{ rsid: 'rs4988235', aliases: [], chrom: '2', pos37: 136608646, pos38: 135851076, alleles: ['A', 'G'] }],
    calls: {
      AA: 'You carry two copies of the lactase-persistence version, a pattern that usually goes with making the lactase enzyme into adulthood.',
      AG: 'You carry one copy of the lactase-persistence version; most people with one copy keep making lactase as adults, though a single copy predicts this less reliably than two copies or none.',
      GG: 'You carry no copy of the lactase-persistence version this test reads; in European-ancestry studies this usually means lactase production tapers after childhood, the most common pattern worldwide.',
    },
    caveat: 'Other lactase-persistence versions, common in parts of Africa, the Middle East and South Asia, are not read here, so GG does not mean non-persistence for everyone. This is about the enzyme, not a test for any condition.',
  },
  {
    id: 'flush',
    trait: 'Alcohol flush',
    gene: 'ALDH2',
    snps: [{ rsid: 'rs671', aliases: ['rs4986830', 'rs60823674', 'rs2230021', 'rs4134524'], chrom: '12', pos37: 112241766, pos38: 111803962, alleles: ['A', 'G'] }],
    calls: {
      GG: 'You carry two copies of the common ALDH2 version, so this marker gives no genetic reason for an alcohol flush.',
      AG: 'You carry one copy of the ALDH2*2 version, which is commonly linked to facial redness (flushing) after alcohol.',
      AA: 'You carry two copies of the ALDH2*2 version, which is strongly linked to a marked facial flush after even small amounts of alcohol.',
    },
    caveat: 'Flushing has other genetic and non-genetic causes, so GG does not rule it out, and some people with ALDH2*2 do not flush.',
  },
  {
    id: 'earwax',
    trait: 'Earwax type',
    gene: 'ABCC11',
    snps: [{ rsid: 'rs17822931', aliases: ['rs58140753', 'rs52813591'], chrom: '16', pos37: 48258198, pos38: 48224287, alleles: ['C', 'T'] }],
    calls: {
      CC: 'You carry two copies of the wet-earwax version, so your earwax type is expected to be wet.',
      CT: 'You carry one wet and one dry copy; wet is dominant, so your earwax type is expected to be wet.',
      TT: 'You carry two copies of the dry-earwax version, so your earwax type is expected to be dry.',
    },
    caveat: 'A rare change elsewhere in the same gene, not read by DNA chips, can occasionally make a CT result dry.',
  },
  {
    id: 'eyes',
    trait: 'Eye colour',
    gene: 'HERC2 (controls OCA2)',
    snps: [{ rsid: 'rs12913832', aliases: ['rs60078917'], chrom: '15', pos37: 28365618, pos38: 28120472, alleles: ['A', 'G'] }],
    calls: {
      GG: 'You carry two copies of the version most linked to light eyes; in European studies people with this pattern most often have blue or grey eyes, and brown is rare.',
      AG: 'You carry one copy of the light-eye version; in European studies people with this pattern most often have brown or green/hazel eyes.',
      AA: 'You carry no copy of the light-eye version; brown eyes are the most common result for this pattern.',
    },
    caveat: 'Several other genes also shape eye colour, and green versus hazel is hard to predict. The figures come from European-ancestry studies.',
  },
  {
    id: 'muscle',
    trait: 'Muscle fibre protein',
    gene: 'ACTN3',
    snps: [{ rsid: 'rs1815739', aliases: ['rs58342030', 'rs2305536', 'rs113388097', 'rs2228325'], chrom: '11', pos37: 66328095, pos38: 66560624, alleles: ['C', 'T'] }],
    calls: {
      CC: 'You carry two working copies of ACTN3 (RR), so your fast-twitch muscle fibres are expected to make the protein alpha-actinin-3.',
      CT: 'You carry one working copy and one 577X copy (RX); your fast-twitch muscle fibres are expected to make alpha-actinin-3.',
      TT: 'You carry two 577X copies (XX), so your fast-twitch muscle fibres are expected to make no alpha-actinin-3, a common variation found in about 1 in 5 people of European ancestry.',
    },
    caveat: 'It does not pick a sport, predict performance or predict your response to training.',
  },
  {
    id: 'bitter',
    trait: 'Bitter taste (PTC and PROP)',
    gene: 'TAS2R38',
    snps: [
      { rsid: 'rs713598', aliases: ['rs17634738', 'rs52812444'], chrom: '7', pos37: 141673345, pos38: 141973545, alleles: ['C', 'G'] },
      { rsid: 'rs1726866', aliases: ['rs17712758', 'rs61111288'], chrom: '7', pos37: 141672705, pos38: 141972905, alleles: ['A', 'G'] },
      { rsid: 'rs10246939', aliases: ['rs386511381', 'rs57237947', 'rs52837199', 'rs17712734'], chrom: '7', pos37: 141672604, pos38: 141972804, alleles: ['C', 'T'] },
    ],
    haplotype: true,
    caveat: 'This gene covers one family of bitter compounds; other bitter receptors and experience matter too.',
  },
];

export const PANEL_RSIDS = TRAITS.flatMap((t) => t.snps.flatMap((s) => [s.rsid, ...s.aliases]));

// TAS2R38 haplotype letters on the plus strand, in the order [rs713598, rs1726866, rs10246939].
// PAV (taster) = G, G, C; AVI (non-taster) = C, A, T.
export const TAS2R38 = { PAV: ['G', 'G', 'C'], AVI: ['C', 'A', 'T'], AAI: ['C', 'G', 'T'], AAV: ['C', 'G', 'C'] };

const BITTER = {
  taster_two_PAV: 'You carry two copies of the taster version of TAS2R38 (PAV/PAV), so test compounds like PTC and PROP are very likely to taste clearly bitter to you.',
  taster_one_PAV: 'You carry one taster copy of TAS2R38, so PTC and PROP are likely to taste bitter to you, often a little less intensely than for people with two copies.',
  non_taster: 'You carry two copies of the non-taster version (AVI/AVI), so PTC and PROP are likely to taste weak or tasteless to you; this gene covers only one family of bitter compounds.',
  intermediate_likely: 'You carry a less common combination of TAS2R38 versions; studies find these usually give in-between sensitivity to PTC and PROP.',
  uncommon_not_called: 'Your three TAS2R38 positions form an unusual combination that cannot be read confidently, so no bitter-taste result is given.',
};
const BITTER_FALLBACK = {
  GG: 'Only one of the three TAS2R38 positions was read; it carries two taster-type letters, so PTC and PROP are likely to taste bitter to you.',
  CG: 'Only one of the three TAS2R38 positions was read; it carries one taster-type letter, so PTC and PROP are likely to taste bitter to you.',
  CC: 'Only one of the three TAS2R38 positions was read; it has no taster-type letter, which most often means low sensitivity to PTC and PROP, though an in-between result is also possible.',
};

// The class for each count of taster-type letters "p,a,v" (G at rs713598, G at rs1726866, C at rs10246939), from
// Hardy-Weinberg on published haplotype frequencies (Risso 2016) checked against 1000 Genomes phased haplotypes.
// Four keys are "not called" on purpose: a strand-flipped homozygous rs713598 (the one palindromic site) turns
// common diplotypes into exactly 0,2,2 / 2,0,0 / 2,1,0 / 2,2,0, so a flipped file gives no call, not a wrong one.
export const BITTER_LOOKUP = {
  '0,0,0': 'non_taster', '0,0,1': 'uncommon_not_called', '0,0,2': 'uncommon_not_called',
  '0,1,0': 'intermediate_likely', '0,1,1': 'intermediate_likely', '0,1,2': 'uncommon_not_called',
  '0,2,0': 'intermediate_likely', '0,2,1': 'intermediate_likely', '0,2,2': 'uncommon_not_called',
  '1,0,0': 'intermediate_likely', '1,0,1': 'uncommon_not_called', '1,0,2': 'uncommon_not_called',
  '1,1,0': 'intermediate_likely', '1,1,1': 'taster_one_PAV', '1,1,2': 'taster_one_PAV',
  '1,2,0': 'intermediate_likely', '1,2,1': 'taster_one_PAV', '1,2,2': 'taster_one_PAV',
  '2,0,0': 'uncommon_not_called', '2,0,1': 'uncommon_not_called', '2,0,2': 'uncommon_not_called',
  '2,1,0': 'uncommon_not_called', '2,1,1': 'taster_one_PAV', '2,1,2': 'taster_one_PAV',
  '2,2,0': 'uncommon_not_called', '2,2,1': 'taster_one_PAV', '2,2,2': 'taster_two_PAV',
};

const sortGt = (g) => g.split('').sort().join('');

/** A usable genotype for one SNP: two letters, both from the expected pair; otherwise null. */
function readSnp(found, snp) {
  for (const id of [snp.rsid, ...snp.aliases]) {
    const row = found.get(id);
    if (!row) continue;
    // If the file gives a position on this chromosome, it must be this SNP's position (GRCh37 or GRCh38).
    if (Number.isFinite(row.pos) && row.pos > 0 && String(row.chrom) === snp.chrom && row.pos !== snp.pos37 && row.pos !== snp.pos38) return { status: 'unexpected' };
    if (!row.genotype) return { status: 'no-call' };
    const g = sortGt(row.genotype);
    if (g.length !== 2 || [...g].some((x) => !snp.alleles.includes(x))) return { status: 'unexpected', genotype: g };
    return { status: 'called', genotype: g };
  }
  return { status: 'absent' };
}

function callBitter(t, reads) {
  const [a49, v262, i296] = reads;
  if (a49.status !== 'called') return { status: 'not-measured', genotype: null, result: NOT_MEASURED };
  if (v262.status !== 'called' || i296.status !== 'called') {
    return { status: 'estimate', genotype: `${a49.genotype} -- --`, result: BITTER_FALLBACK[a49.genotype] };
  }
  const gts = reads.map((r) => r.genotype);
  const key = gts.map((g, i) => [...g].filter((x) => x === TAS2R38.PAV[i]).length).join(',');
  const cls = BITTER_LOOKUP[key];
  return { status: cls === 'uncommon_not_called' ? 'not-called' : 'called', genotype: gts.join(' '), result: BITTER[cls], class: cls };
}

/**
 * The results for the variants found in a file (a Map from extractPanel). One item per trait:
 * { id, trait, gene, variant, genotype, result, caveat, status }
 * status: called | estimate (bitter taste from 1 of 3 positions) | not-called | not-measured
 */
export function callPanel(found) {
  return TRAITS.map((t) => {
    const base = { id: t.id, trait: t.trait, gene: t.gene, variant: t.snps.map((s) => s.rsid).join(' + '), caveat: t.caveat };
    const reads = t.snps.map((s) => readSnp(found, s));
    if (t.haplotype) return { ...base, ...callBitter(t, reads) };
    const r = reads[0];
    if (r.status !== 'called') return { ...base, genotype: null, status: 'not-measured', result: NOT_MEASURED };
    return { ...base, genotype: r.genotype, status: 'called', result: t.calls[r.genotype] };
  });
}

export const SAMPLES = [
  { name: 'Ada', file: 'ada-23andme.txt', blurb: 'Synthetic · 23andMe format' },
  { name: 'Bo', file: 'bo-ancestrydna.txt', blurb: 'Synthetic · AncestryDNA format' },
  { name: 'Cyd', file: 'cyd-23andme.txt', blurb: 'Synthetic · some markers missing' },
];
