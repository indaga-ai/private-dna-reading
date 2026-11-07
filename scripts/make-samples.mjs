// Writes the three synthetic sample genomes in web/samples/. They are made up: every genotype comes from the
// choices below or from a seeded random generator, not from any person. Filler rows use made-up IDs in the style
// of 23andMe's internal "i" IDs, so they cannot be mistaken for real variants.
//   npm run samples
import { writeFileSync, mkdirSync } from 'node:fs';
import { TRAITS, TAS2R38 } from '../src/genome/panel.mjs';

const OUT = new URL('../web/samples/', import.meta.url);
mkdirSync(OUT, { recursive: true });

// A small seeded generator, so the files are identical on every run.
function rng(seed) {
  let x = seed >>> 0;
  return () => {
    x ^= x << 13; x >>>= 0;
    x ^= x >>> 17;
    x ^= x << 5; x >>>= 0;
    return x / 2 ** 32;
  };
}

const snp = (rsid) => TRAITS.flatMap((t) => t.snps).find((s) => s.rsid === rsid);
const hap = (name, i) => TAS2R38[name][i];
const bitter = (a, b) => Object.fromEntries(['rs713598', 'rs1726866', 'rs10246939'].map((r, i) => [r, `${hap(a, i)}${hap(b, i)}`]));

// Each person's panel genotypes (plus strand, as the raw files show them). null = "no call"; absent = not on chip.
const PEOPLE = [
  {
    name: 'ada', format: '23andme', seed: 11,
    gt: { rs4988235: 'AG', rs671: 'GG', rs17822931: 'CT', rs12913832: 'GG', rs1815739: 'CT', ...bitter('PAV', 'AVI') },
  },
  {
    name: 'bo', format: 'ancestrydna', seed: 22,
    gt: { rs4988235: 'GG', rs671: 'AG', rs17822931: 'TT', rs12913832: 'AA', rs1815739: 'TT', ...bitter('AVI', 'AVI') },
  },
  {
    name: 'cyd', format: '23andme', seed: 33,
    gt: { rs4988235: 'AA', rs671: null, rs12913832: 'AG', rs1815739: 'CC', ...bitter('PAV', 'PAV') },
  },
];

const CHROMS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '13', '14', '15', '16', '17', '18', '19', '20', '21', '22'];
const BASES = ['A', 'C', 'G', 'T'];

function rows(person) {
  const r = rng(person.seed);
  const out = [];
  for (let i = 0; i < 25_000; i++) {
    const chrom = CHROMS[Math.floor(r() * CHROMS.length)];
    const pos = 10_000 + Math.floor(r() * 240_000_000);
    const a = BASES[Math.floor(r() * 4)];
    let b = BASES[Math.floor(r() * 4)];
    if (r() < 0.6) b = a;
    out.push({ id: `i${9_000_000 + i}`, chrom, pos, gt: r() < 0.01 ? null : `${a}${b}` });
  }
  for (const [rsid, gt] of Object.entries(person.gt)) {
    const s = snp(rsid);
    out.push({ id: rsid, chrom: s.chrom, pos: s.pos37, gt });
  }
  const order = (c) => Number(c);
  return out.sort((x, y) => order(x.chrom) - order(y.chrom) || x.pos - y.pos);
}

const NOTE = 'SYNTHETIC SAMPLE for the Private DNA Reading demo. Every genotype here is made up; it is not any person\'s DNA.';

function write23andMe(person) {
  const lines = [
    `# ${NOTE}`,
    '# Laid out like a 23andMe raw data file: build 37 (GRCh37), genotypes on the plus strand.',
    '#',
    '# rsid\tchromosome\tposition\tgenotype',
    ...rows(person).map((x) => `${x.id}\t${x.chrom}\t${x.pos}\t${x.gt ?? '--'}`),
  ];
  return `${lines.join('\n')}\n`;
}

function writeAncestry(person) {
  const lines = [
    `#${NOTE}`,
    '#Laid out like an AncestryDNA raw data file: GRCh37, genotypes on the plus strand, one allele per column.',
    '#',
    'rsid\tchromosome\tposition\tallele1\tallele2',
    ...rows(person).map((x) => `${x.id}\t${x.chrom}\t${x.pos}\t${x.gt ? x.gt[0] : '0'}\t${x.gt ? x.gt[1] : '0'}`),
  ];
  return `${lines.join('\r\n')}\r\n`;
}

for (const p of PEOPLE) {
  const file = `${p.name}-${p.format}.txt`;
  writeFileSync(new URL(file, OUT), p.format === 'ancestrydna' ? writeAncestry(p) : write23andMe(p));
  console.log(`wrote web/samples/${file}`);
}
