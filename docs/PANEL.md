# The trait panel: letters, results and sources

Checked on 7 Nov 2026 for this app. Traits only, not medicine. Every position and letter below was checked against the Ensembl GRCh37 and GRCh38 REST APIs, NCBI dbSNP and Ensembl VEP codons, and both homozygotes were built by hand for every marker. The table in [`src/genome/panel.mjs`](../src/genome/panel.mjs) follows this page; [`test/panel.test.mjs`](../test/panel.test.mjs) checks every genotype. Chip presence comes from SNPedia's "On chip" categories (archived 2025 pages) and was not checked against real raw files.

## 1. Quick reference: raw-file genotype to call (plus strand, GRCh37)

| Trait | SNP (GRCh37 chr:pos) | Effect letter | Genotype: call |
|---|---|---|---|
| Lactase persistence | rs4988235 (2:136608646) | **A** = -13910T | **AA** likely persistent · **AG** likely persistent (least certain) · **GG** likely non-persistent *in European ancestry only* |
| Alcohol flush | rs671 (12:112241766) | **A** = ALDH2*2 (Lys504) | **GG** no flush version · **AG** flush likely (~9 in 10 carriers) · **AA** strong flush very likely |
| Earwax | rs17822931 (16:48258198) | **T** = dry (Arg180) | **CC** wet · **CT** wet · **TT** dry |
| Eye colour | rs12913832 (15:28365618) | **G** = light/blue | **GG** 72% blue/grey, 27% green/hazel, <1% brown · **AG** 56% brown, 38% green/hazel, 7% blue · **AA** 85% brown |
| ACTN3 | rs1815739 (11:66328095) | **T** = 577X | **CC** RR, protein made · **CT** RX, protein made · **TT** XX, no alpha-actinin-3 (common, ~18% of Europeans) |
| Bitter taste | rs713598 (7:141673345) / rs1726866 (7:141672705) / rs10246939 (7:141672604) | PAV = **G / G / C**; AVI = **C / A / T** | **GG,GG,CC** PAV/PAV taster · **CG,AG,CT** PAV/AVI taster · **CC,AA,TT** AVI/AVI non-taster · other: see section 5 |

Reference letters (GRCh37): G, G, C, A, **T**, C, G, T. ACTN3 is the trap: the GRCh37 reference is T, the 577X stop; GRCh38 has C. Never fill a missing genotype with the reference.

## 2. Where sources disagreed (all resolved in the table)

1. **SNPedia orientation is not always plus.** The rs4988235, rs713598 and rs1726866 pages (and rs3827760) are **minus**-oriented; rs671, rs17822931, rs12913832, rs1815739 and rs10246939 are plus. There is no `Rs4988235(A;A)` page: SNPedia uses `Rs4988235(T;T)` for raw-file AA. The worst case is **rs713598 (C/G, palindromic)**: SNPedia's `Rs713598(C;C)` "Can taste bitter" is raw-file **GG**, and a raw-file **CC** means non-taster. SNPedia's own rs713598 text says that in 23andMe's GRCh37 orientation G is the tasting allele, but it mixes orientations in one sentence ("rs713598 (G)" plus, "rs1726866 (C)" minus).
2. **Papers name alleles on the gene strand.** LCT -13910 **T** = plus A. ABCC11 538**A** = plus T. HERC2: Sturm 2008 calls the blue allele **C** and the brown allele **T**, which are plus G and A. TAS2R38 papers use amino acids.
3. **HERC2 GG strength.** SNPedia says "blue eye color, 99% of the time". Sturm 2008 Table 3 (n = 1,932 GG) gives 72% blue/grey, 27% green/hazel and 0.7% brown. The 99% is *not brown*, not *blue*. SNPedia's AG "brown" is also too strong: Sturm has 56% brown, 38% green/hazel, 7% blue.
4. **LCT heterozygote.** SNPedia and consumer reports say AG "can digest milk". Baffour-Awuah 2015 (duodenal biopsies) found the T/C genotype "will not predict the phenotype" and T/T predicts persistence "frequently, but not perfectly". Enattah 2002 found complete association for C/C (non-persistence) in Finns.
5. **ALDH2 heterozygote enzyme size.** Brooks 2009 says the reduction is ">100-fold"; Lai 2014 measured 17% of typical in liver. Crabb 1989 found *2 dominant. Quote no fold-change.
6. **ALDH2 naming.** Glu504Lys (HGVS/VEP) = Glu487Lys (mature protein: Crabb, Lai, Brooks). Yoshida 1984 called it "glutamine→lysine". All refer to rs671.
7. **ACTN3 claims.** SNPedia says "(T;T) Likely endurance athlete / Impaired muscle performance" and "(C;T) Likely sprinter". Alfred 2011 meta-analysis: no evidence X helps endurance, and no association with physical capability in the general population. Webborn 2015 consensus: genetic tests have no role in talent identification or training.
8. **ACTN3 reference flip.** GRCh37 reference = T (577X), so Ensembl calls rs1815739 "stop_lost" and ACTN3 a "polymorphic_pseudogene" on GRCh37. GRCh38 reference = C ("stop_gained"). The letters mean the same in both builds.
9. **TAS2R38 naming and reference.** The brief's "V262A" and VEP's A262V are the same SNP; the reference carries Ala. The reference genome's TAS2R38 haplotype is **AAI**, which is uncommon.
10. **rsID typo in a primary paper.** Risso 2016 (Sci Rep) prints the A49P SNP as "rs714598"; it is rs713598.
11. **Variance explained (TAS2R38).** Kim 2003 gives 55–85%, Wooding 2004 "up to 85%", Risso 2016 ">70%". Quote "a large share" or "55–85%".
12. **Assembly patches.** rs12913832 has a GRCh38 alt scaffold (HSCHR15_4_CTG8) with reference **G**, and the TAS2R38 SNPs have GRCh37 HG7_PATCH rows. Use primary-chromosome rows only.

## 3. What the reading must NOT say

**Everywhere:** any disease, condition, risk, diagnosis, symptom, treatment, medicine or supplement; any advice on diet, drinking, training or hygiene; any guess at the person's ancestry or ethnicity; "Asian flush/glow"; "normal/abnormal, mutation, defect, deficiency, risk allele, carrier"; certainty wording ("you have blue eyes", "you are lactose intolerant", "you will flush"); any number not in the table; caffeine or chronotype; calling a missing marker "normal". Not measured is not normal.

- **Lactase:** no "lactose intolerant/intolerance" label, no diagnosis, hypolactasia, IBS or symptom prediction, no dairy advice or lactase pills, no milk allergy, no calcium, bone, BMI, diabetes or cancer links.
- **ALDH2:** no cancer of any kind, no alcoholism or "protects against alcoholism", no safe amounts, units or "avoid alcohol", no hangover, heart, liver or Alzheimer's claims, no disulfiram or nitroglycerin, no "toxic/carcinogenic acetaldehyde", no "deficient".
- **Earwax:** no breast cancer, colostrum or breastfeeding, no body odour, osmidrosis or deodorant, no ear infections, impaction or cleaning advice.
- **Eye colour:** no albinism or OCA2 disorders, no melanoma, skin cancer or sun sensitivity, no hair or skin colour, no ancestry, no certainty.
- **ACTN3:** no sprinter, endurance or power "type", no talent or "elite" potential, no training or sport choice, no children's selection, no injury, recovery, ageing, falls or sarcopenia, no "impaired" or "deficiency".
- **Bitter taste:** no "supertaster" (Hayes 2008: supertasting is not due to TAS2R38), no "eat more/fewer vegetables" or picky eating, no weight or BMI, no alcohol, smoking or coffee, no sinus or respiratory infections, COVID, thyroid or cancer, no "toxins", no "can't taste bitter" (other bitter receptors work).

A safe one-sentence description for each genotype is in the JSON (`safe_sentence`).

## 4. File rules (the app must apply these before any call)

- **23andMe:** tab-separated `rsid chromosome position genotype`; no-call is **`--`**. GRCh37; "always refer to the positive (+) strand on build 37" (23andMe Raw Genotype Data Technical Details, archived 2021).
- **AncestryDNA:** tab-separated `rsid chromosome position allele1 allele2`; no-call is **`0` `0`**; alleles are unordered. The header says "build 37.1 coordinates" and "forward (+) strand with respect to the human reference". Chromosome codes: 23 = X, 24 = Y, 25 = PAR, 26 = MT (h600 wiki file-format page; the `snps` parser uses `na_values=0`).
- Uppercase and sort the two letters. A row that is absent, a no-call, a single letter, I/D, or **letters outside the expected pair** (e.g. `TT` at rs4988235) is "not measured". Never auto-complement and never treat it as normal.
- Match on the rsID or its merged aliases (in JSON). If chrom/pos are present they must equal `pos_grch37`.

## 5. TAS2R38: calling the diplotype from three unphased genotypes

Count the PAV letters: p = number of G at rs713598, a = number of G at rs1726866, v = number of C at rs10246939, then look up p,a,v. The posteriors come from Hardy-Weinberg on Risso 2016's global haplotype frequencies; the class posterior is also shown under 1000 Genomes EUR / AFR / EAS phased haplotypes (Ensembl transcript_haplotypes). Unphased genotypes are almost never ambiguous at the class level (≥ 0.97 everywhere except CC,AG,CT in AFR at 0.78, which is non-standard either way).

| p,a,v | rs713598 | rs1726866 | rs10246939 | most likely diplotype | class | expected share (global) | class posterior EUR / AFR / EAS |
|---|---|---|---|---|---|---|---|
| 0,0,0 | CC | AA | TT | AVI/AVI | non_taster | 0.18233 | 1.0 / 1.0 / 1.0 |
| 0,0,1 | CC | AA | CT | AVI/AVV | uncommon_not_called | 0.00273 | 1.0 / 1.0 / 1.0 |
| 0,0,2 | CC | AA | CC | AVV/AVV | uncommon_not_called | 1e-05 | 1.0 / 1.0 / 1.0 |
| 0,1,0 | CC | AG | TT | AVI/AAI | intermediate_likely | 0.02895 | 1.0 / 1.0 / 1.0 |
| 0,1,1 | CC | AG | CT | AVI/AAV | intermediate_likely | 0.0214 | 1.0 / 0.776 / 0.997 |
| 0,1,2 | CC | AG | CC | AAV/AVV | uncommon_not_called | 0.00016 | 1.0 / 1.0 / 1.0 |
| 0,2,0 | CC | GG | TT | AAI/AAI | intermediate_likely | 0.00115 | 1.0 / 1.0 / 1.0 |
| 0,2,1 | CC | GG | CT | AAI/AAV | intermediate_likely | 0.00168 | 1.0 / 1.0 / 1.0 |
| 0,2,2 | CC | GG | CC | AAV/AAV | uncommon_not_called | 0.00062 | 1.0 / 1.0 / 1.0 |
| 1,0,0 | CG | AA | TT | AVI/PVI | intermediate_likely | 0.0006 | 1.0 / 1.0 / 1.0 |
| 1,0,1 | CG | AA | CT | AVI/PVV | uncommon_not_called | 0.00086 | 1.0 / 1.0 / 1.0 |
| 1,0,2 | CG | AA | CC | AVV/PVV | uncommon_not_called | 1e-05 | 1.0 / 1.0 / 1.0 |
| 1,1,0 | CG | AG | TT | AVI/PAI | intermediate_likely | 0.00158 | 1.0 / 1.0 / 1.0 |
| 1,1,1 | CG | AG | CT | PAV/AVI | taster_one_PAV | 0.4336 | 1.0 / 1.0 / 1.0 |
| 1,1,2 | CG | AG | CC | PAV/AVV | taster_one_PAV | 0.0033 | 0.991 / 1.0 / 1.0 |
| 1,2,0 | CG | GG | TT | AAI/PAI | intermediate_likely | 0.00012 | 1.0 / 1.0 / 1.0 |
| 1,2,1 | CG | GG | CT | PAV/AAI | taster_one_PAV | 0.0345 | 0.991 / 1.0 / 1.0 |
| 1,2,2 | CG | GG | CC | PAV/AAV | taster_one_PAV | 0.02518 | 1.0 / 1.0 / 1.0 |
| 2,0,0 | GG | AA | TT | PVI/PVI | uncommon_not_called | 0.0 | 1.0 / 1.0 / 1.0 |
| 2,0,1 | GG | AA | CT | PVV/PVI | uncommon_not_called | 0.0 | 1.0 / 1.0 / 1.0 |
| 2,0,2 | GG | AA | CC | PVV/PVV | uncommon_not_called | 0.0 | 1.0 / 1.0 / 1.0 |
| 2,1,0 | GG | AG | TT | PAI/PVI | uncommon_not_called | 0.0 | 1.0 / 1.0 / 1.0 |
| 2,1,1 | GG | AG | CT | PAV/PVI | taster_one_PAV | 0.00071 | 1.0 / 1.0 / 1.0 |
| 2,1,2 | GG | AG | CC | PAV/PVV | taster_one_PAV | 0.00102 | 1.0 / 1.0 / 1.0 |
| 2,2,0 | GG | GG | TT | PAI/PAI | uncommon_not_called | 0.0 | 1.0 / 1.0 / 1.0 |
| 2,2,1 | GG | GG | CT | PAV/PAI | taster_one_PAV | 0.00183 | 1.0 / 1.0 / 1.0 |
| 2,2,2 | GG | GG | CC | PAV/PAV | taster_two_PAV | 0.25766 | 1.0 / 1.0 / 1.0 |

- Classes: PAV in the pair means taster; AVI/AVI means non-taster. AVI or another rare version paired with AAI, AAV, PVI or PAI means "in-between likely" (Bufe 2005 receptor assays; Boxer 2015 PROP ratings). Pairs involving AVV or PVV have no taste data and are not called unless paired with PAV.
- Four keys are forced to **not called** because a strand flip of the palindromic rs713598 (homozygotes only) produces them: PAV/PAV becomes 0,2,2, AVI/AVI becomes 2,0,0, AVI/AAI becomes 2,1,0 and AAI/AAI becomes 2,2,0.
- **rs713598-only fallback (others missing):** acceptable as a labelled estimate ("1 of 3 positions read"). GG or CG gives "likely taster", which holds ≥ 99% in every population. CC gives "likely low **or in-between** sensitivity" (P(AVI/AVI) = 0.87 EUR, 0.99 EAS, but only **0.39 AFR**, where AAI is about 16–19%). Agreement of rs713598 alone with the three-SNP class: EAS 0.999, SAS 0.978, AMR 0.963, EUR 0.956, AFR 0.830. If rs713598 itself is missing, report not measured.
- Expected non-tasters (AVI/AVI): about 29% EUR, 41% SAS, 11% EAS, 11% AFR.

## 7. Not verified / unknown

- Chip presence for all eight SNPs (and EDAR) is **from SNPedia's on-chip categories only**. The Harvard PGP public files failed TLS verification (not bypassed) and openSNP is closed, so no real 23andMe v4/v5 or AncestryDNA v2 file was checked. AncestryDNA v1 is unknown.
- Whether any of these SNPs also appear in some 23andMe files under an internal `i` ID only: unknown. Match aliases, and treat absence as not measured.
- AncestryDNA "forward (+)" was taken from the file header. Non-palindromic SNPs self-check through the letter-pair rule; rs713598 relies on it, which the three-SNP design mitigates.
- Separate flushing rates for AG vs AA: not found (Yokoyama 2003 reports carriers combined, about 90%).
- The vegetable example for bitter taste (Sandell & Breslin 2006, PMID 16979544) was checked by title only; the full text was not read.
- 23andMe's current help centre (support.23andme.org) and Ancestry's help pages block automated reads; the 2021 23andMe article and the h600 wiki's copy of the Ancestry header were used instead.

## Sources

**rs4988235 (MCM6)**

- https://grch37.rest.ensembl.org/variation/human/rs4988235?content-type=application/json
- https://rest.ensembl.org/variation/human/rs4988235?content-type=application/json
- https://api.ncbi.nlm.nih.gov/variation/v0/refsnp/4988235
- https://grch37.rest.ensembl.org/vep/human/region (canonical transcripts; run 2026-11-07): MCM6 ENST00000264156 strand -1, intron
- https://web.archive.org/web/20251001155312/https://snpedia.com/index.php/Rs4988235 (Orientation MINUS: lists (C;C)/(C;T)/(T;T); (T;T) = plus AA)
- https://pubmed.ncbi.nlm.nih.gov/11788828/ Enattah 2002
- https://pubmed.ncbi.nlm.nih.gov/17159977/ Tishkoff 2007
- https://pubmed.ncbi.nlm.nih.gov/19034520/ Ingram 2009
- https://pubmed.ncbi.nlm.nih.gov/25625576/ Baffour-Awuah 2015

**rs671 (ALDH2)**

- https://grch37.rest.ensembl.org/variation/human/rs671?content-type=application/json
- https://rest.ensembl.org/variation/human/rs671?content-type=application/json
- https://api.ncbi.nlm.nih.gov/variation/v0/refsnp/671
- https://grch37.rest.ensembl.org/vep/human/region (canonical transcripts; run 2026-11-07): ALDH2 ENST00000261733 strand +1, Gaa/Aaa E504K
- https://web.archive.org/web/20251007185721/https://snpedia.com/index.php/Rs671 (Orientation PLUS; summaries contain cancer/drug claims - do not reuse)
- https://pubmed.ncbi.nlm.nih.gov/6582480/ Yoshida 1984
- https://pubmed.ncbi.nlm.nih.gov/2562960/ Crabb 1989
- https://pubmed.ncbi.nlm.nih.gov/23909789/ Lai 2014
- https://pubmed.ncbi.nlm.nih.gov/14652286/ Yokoyama 2003 (cited only for the flushing-vs-genotype figure)
- https://pubmed.ncbi.nlm.nih.gov/19320537/ Brooks 2009 (36% of East Asians flush; ~540 million ALDH2*2 carriers)

**rs17822931 (ABCC11)**

- https://grch37.rest.ensembl.org/variation/human/rs17822931?content-type=application/json
- https://rest.ensembl.org/variation/human/rs17822931?content-type=application/json
- https://api.ncbi.nlm.nih.gov/variation/v0/refsnp/17822931
- https://grch37.rest.ensembl.org/vep/human/region (canonical transcripts; run 2026-11-07): ABCC11 ENST00000394747 strand -1, Ggg/Agg G180R
- https://web.archive.org/web/20251001121743/https://snpedia.com/index.php/Rs17822931 (Orientation PLUS; (T;T) dry - agrees)
- https://pubmed.ncbi.nlm.nih.gov/16444273/ Yoshiura 2006
- https://pubmed.ncbi.nlm.nih.gov/23325016/ Rodriguez 2013

**rs12913832 (HERC2)**

- https://grch37.rest.ensembl.org/variation/human/rs12913832?content-type=application/json
- https://rest.ensembl.org/variation/human/rs12913832?content-type=application/json
- https://api.ncbi.nlm.nih.gov/variation/v0/refsnp/12913832
- https://grch37.rest.ensembl.org/vep/human/region (canonical transcripts; run 2026-11-07): HERC2 ENST00000261609 strand -1, intron
- https://web.archive.org/web/20251001114725/https://snpedia.com/index.php/Rs12913832 (Orientation PLUS; (G;G) 'blue 99%' overstated)
- https://pubmed.ncbi.nlm.nih.gov/18172690/ Eiberg 2008
- https://pubmed.ncbi.nlm.nih.gov/18252222/ Sturm 2008 (Table 3, https://pmc.ncbi.nlm.nih.gov/articles/PMC2427173/)
- https://pubmed.ncbi.nlm.nih.gov/20457092/ Walsh 2011 IrisPlex

**rs1815739 (ACTN3)**

- https://grch37.rest.ensembl.org/variation/human/rs1815739?content-type=application/json
- https://rest.ensembl.org/variation/human/rs1815739?content-type=application/json
- https://api.ncbi.nlm.nih.gov/variation/v0/refsnp/1815739
- https://grch37.rest.ensembl.org/vep/human/region (canonical transcripts; run 2026-11-07): ACTN3 ENST00000513398 (polymorphic_pseudogene on GRCh37) Tga/Cga */R577; GRCh38 VEP Cga/Tga R577*
- https://web.archive.org/web/20251007191454/https://snpedia.com/index.php/Rs1815739 (Orientation PLUS; summaries overclaim)
- https://pubmed.ncbi.nlm.nih.gov/10192379/ North 1999
- https://pubmed.ncbi.nlm.nih.gov/12879365/ Yang 2003
- https://pubmed.ncbi.nlm.nih.gov/17828264/ MacArthur 2007
- https://pubmed.ncbi.nlm.nih.gov/21542061/ Alfred 2011
- https://pubmed.ncbi.nlm.nih.gov/26582191/ Webborn 2015 consensus

**rs713598 (TAS2R38)**

- https://grch37.rest.ensembl.org/variation/human/rs713598?content-type=application/json
- https://rest.ensembl.org/variation/human/rs713598?content-type=application/json
- https://api.ncbi.nlm.nih.gov/variation/v0/refsnp/713598
- https://web.archive.org/web/20250913020955/https://snpedia.com/index.php/Rs713598 (Orientation MINUS)
- https://grch37.rest.ensembl.org/vep/human/region (canonical transcripts; run 2026-11-07): TAS2R38 ENST00000547270 strand -1
- https://pubmed.ncbi.nlm.nih.gov/12595690/ Kim 2003
- https://pubmed.ncbi.nlm.nih.gov/15723792/ Bufe 2005
- https://pubmed.ncbi.nlm.nih.gov/14997422/ Wooding 2004
- https://pubmed.ncbi.nlm.nih.gov/18209019/ Hayes 2008
- https://pubmed.ncbi.nlm.nih.gov/26405625/ Boxer & Garneau 2015
- https://pubmed.ncbi.nlm.nih.gov/27138342/ Risso 2016 (text misprints rs713598 as 'rs714598')
- https://rest.ensembl.org/transcript_haplotypes/homo_sapiens/ENST00000547270 (1000 Genomes phased protein haplotypes)

**rs1726866 (TAS2R38)**

- https://grch37.rest.ensembl.org/variation/human/rs1726866?content-type=application/json
- https://rest.ensembl.org/variation/human/rs1726866?content-type=application/json
- https://api.ncbi.nlm.nih.gov/variation/v0/refsnp/1726866
- https://web.archive.org/web/20250915101838/https://snpedia.com/index.php/Rs1726866 (Orientation MINUS)
- https://grch37.rest.ensembl.org/vep/human/region (canonical transcripts; run 2026-11-07): TAS2R38 ENST00000547270 strand -1
- https://pubmed.ncbi.nlm.nih.gov/12595690/ Kim 2003
- https://pubmed.ncbi.nlm.nih.gov/15723792/ Bufe 2005
- https://pubmed.ncbi.nlm.nih.gov/14997422/ Wooding 2004
- https://pubmed.ncbi.nlm.nih.gov/18209019/ Hayes 2008
- https://pubmed.ncbi.nlm.nih.gov/26405625/ Boxer & Garneau 2015
- https://pubmed.ncbi.nlm.nih.gov/27138342/ Risso 2016 (text misprints rs713598 as 'rs714598')
- https://rest.ensembl.org/transcript_haplotypes/homo_sapiens/ENST00000547270 (1000 Genomes phased protein haplotypes)

**rs10246939 (TAS2R38)**

- https://grch37.rest.ensembl.org/variation/human/rs10246939?content-type=application/json
- https://rest.ensembl.org/variation/human/rs10246939?content-type=application/json
- https://api.ncbi.nlm.nih.gov/variation/v0/refsnp/10246939
- https://web.archive.org/web/20250911081830/https://snpedia.com/index.php/Rs10246939 (Orientation PLUS)
- https://grch37.rest.ensembl.org/vep/human/region (canonical transcripts; run 2026-11-07): TAS2R38 ENST00000547270 strand -1
- https://pubmed.ncbi.nlm.nih.gov/12595690/ Kim 2003
- https://pubmed.ncbi.nlm.nih.gov/15723792/ Bufe 2005
- https://pubmed.ncbi.nlm.nih.gov/14997422/ Wooding 2004
- https://pubmed.ncbi.nlm.nih.gov/18209019/ Hayes 2008
- https://pubmed.ncbi.nlm.nih.gov/26405625/ Boxer & Garneau 2015
- https://pubmed.ncbi.nlm.nih.gov/27138342/ Risso 2016 (text misprints rs713598 as 'rs714598')
- https://rest.ensembl.org/transcript_haplotypes/homo_sapiens/ENST00000547270 (1000 Genomes phased protein haplotypes)
