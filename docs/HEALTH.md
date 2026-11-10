# The watch data, the blood test and the plan

The watch data and the blood test are read on the page, like the DNA file. Every number, note and plan action below is worked out on the page from the fixed tables in [`src/health/`](../src/health). The AI only writes them up. This is a wellness reading. Nothing here diagnoses, names a disease, a medicine or a supplement, or gives a dose. A blood value outside its lab's range always goes to a doctor.

## Watch data ([`watch.mjs`](../src/health/watch.mjs))

**Input:** a JSON array, or a CSV with a header, with one row a day:

```csv
date,sleep_hours,resting_hr,hrv_ms,steps
2026-10-12,7.2,61,42,8120
```

**How rows are read:**

- Other columns are ignored.
- The last 28 days are kept. A date given twice keeps its last row.
- A value outside its plausible range is dropped and read as missing, never clamped. The ranges are:
  - sleep: 0–16 hours;
  - resting heart rate: 25–200 beats a minute;
  - HRV: 1–300 ms;
  - steps: 0–100,000.

**Weeks:** days 1–7, 8–14, 15–21 and 22–28.

- A week's average needs at least 4 days of that measure. Otherwise it shows "—".
- A measure needs 28 days in the export and at least 14 values in all, or it is "Not measured", never guessed.

**The change:** the last measured week minus the first. It counts as "held steady" when it is smaller than:

| Measure | Steady when the change is under |
|---|---|
| Sleep | 0.25 hours |
| Resting heart rate | 2 beats a minute |
| Steps | 500 a day |
| HRV | 8% of its first week (its scale differs so much between people) |

**What leaves the page, per measure:** the four weekly averages, the average, the change and the note. No daily values leave it.

| Measure | The fixed note, word for word | Why |
|---|---|---|
| Sleep | "Below the 7 or more hours a night recommended for adults (AASM and SRS, 2015)." Or "Within the 7 or more hours a night recommended for adults (AASM and SRS, 2015)." | Watson et al. 2015 |
| Resting heart rate | "A watch's estimate: compare it with your own earlier weeks, not with other people." | Our wording. No population cut-off is used, because resting heart rate differs widely between people and a watch's value is an estimate. |
| HRV | "A watch's estimate that differs a lot between people and devices: only your own trend tells you much." | Our wording, for the same reason. |
| Steps | "Steps are one rough way to see how active you are; the WHO recommends at least 150 minutes of moderate activity a week for adults (2020)." | WHO 2020 |

Each note ends with the change, for example "Over the four weeks it fell by 0.4 hours."

## DNA and watch together

There is one fixed link. It is shown only when both sides were measured:

| Link | Note |
|---|---|
| Muscle fibre protein and steps | "The ACTN3 result is about one muscle protein; it does not set how active to be or predict how you respond to training. Your steps show how active you are now: … a day on average." |

## Blood test ([`labs.mjs`](../src/health/labs.mjs))

**Input:** a JSON array, or a CSV with a header:

```csv
marker,value,unit,low,high,range_unit,date
LDL cholesterol,3.6,mmol/L,,3.0,,2026-11-02
```

- `range_unit` and `date` are optional. An empty `range_unit` means the value's own unit.
- At most 12 markers.
- A row without a marker name or a numeric value is skipped. A marker given twice keeps its last row.

**How values are placed:**

- Each value is placed against the range its own lab printed with it: within, above or below. Reference ranges are set by each laboratory for its own methods and population (CLSI EP28-A3c), so no general range is used.
- A range in another unit, or no range, means the value is "not compared". No unit is converted.

**The notes, word for word:**

| Where it falls | Note |
|---|---|
| within | "Within the range the lab printed." |
| above | "Above the range the lab printed: a question for a doctor." |
| below | "Below the range the lab printed: a question for a doctor." |
| not compared | "No range in the same unit was printed with it, so it is not compared." |

**What leaves the page:** the marker, its value and unit, the range as printed, where the value falls, and the note.

## The plan ([`plan.mjs`](../src/health/plan.mjs))

The plan has up to three actions: the first rules below that apply, in this order. The reading starts with them. The AI is told to give each action in order with its source, and never to add, drop or change one.

| # | When | Action, word for word | Source shown |
|---|---|---|---|
| 1 | Any blood value above or below its lab's range | "Ask a doctor about these results: only they can say what a value outside the lab's range means for you." | The lab's own reference range |
| 2 | Average sleep under 7 hours a night | "Aim for at least 7 hours. Going to bed and getting up at the same times every day, weekends included, helps." | AASM and SRS (2015); CDC sleep tips |
| 3 | Average steps under 5,000 a day, or down by 1,000 a day or more over the four weeks | "Build up to at least 150 minutes of moderate activity a week, such as brisk walking: about 30 minutes on 5 days." | WHO physical activity guidelines (2020) |
| 4 | Resting heart rate up by 3 beats a minute or more over the four weeks | "It can rise with short sleep or stress. If it keeps rising, ask a doctor." | Your own trend, from your watch |
| 5 | HRV down by more than 8% of its first week | "It often falls with short sleep, stress or hard training. Look again after a week of steadier sleep." | Your own trend, from your watch |

If none applies, there is one item, "Keep going": "Keep your routine, and read your data again in a few months."

Where the thresholds come from:

- **The 7 hours:** the AASM and SRS consensus.
- **The 150 minutes:** the WHO's guideline for adults.
- **The 5,000 steps a day:** the step-defined sedentary index reviewed by Tudor-Locke et al. 2013.
- **Our own choices:**
  - the 1,000-step fall;
  - the 3-beat rise in resting heart rate;
  - the 8% fall in HRV.

  These mark "a change worth a look", not clinical cut-offs. The actions for them say only what commonly moves these numbers.

## The sample people

The watch data in `web/samples/*-watch.json` are made by [`scripts/make-watch-samples.mjs`](../scripts/make-watch-samples.mjs) from a fixed seed: 28 days, 12 Oct to 8 Nov 2026. The blood tests in `web/samples/*-labs.json` were written by hand. Like the genomes, none of them is any person's data.

| Person | What the page finds | Plan |
|---|---|---|
| Ada | Vitamin D below her lab's range; 6.4 hours of sleep a night | Blood test, Sleep |
| Bo | Every blood value within its lab's range; 7.6 hours of sleep and 10,578 steps a day; no rule applies | Keep going |
| Cyd | LDL cholesterol and triglycerides above her lab's range; 6.7 hours of sleep; 4,947 steps a day, down 1,375; resting heart rate up 4 | Blood test, Sleep, Activity (rules 4 and 5 apply too, as her HRV fell by 8 ms, but only three actions are kept) |

## Sources

- Watson NF, Badr MS, Belenky G, et al. Recommended amount of sleep for a healthy adult: a joint consensus statement of the American Academy of Sleep Medicine and Sleep Research Society. *Sleep* 2015;38(6):843–844. https://doi.org/10.5665/sleep.4716
- Centers for Disease Control and Prevention. About sleep: tips for better sleep, page of 15 May 2024. https://www.cdc.gov/sleep/about/index.html
- World Health Organization. *WHO guidelines on physical activity and sedentary behaviour.* Geneva: WHO; 2020. https://www.who.int/publications/i/item/9789240015128
- Tudor-Locke C, Craig CL, Thyfault JP, Spence JC. A step-defined sedentary lifestyle index: <5000 steps/day. *Appl Physiol Nutr Metab* 2013;38(2):100–114. https://pubmed.ncbi.nlm.nih.gov/23438219/
- Clinical and Laboratory Standards Institute. *EP28-A3c: Defining, establishing, and verifying reference intervals in the clinical laboratory.* 3rd ed. 2010.
