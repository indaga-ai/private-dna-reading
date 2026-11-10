# Private Health Reading

An AI reads your DNA, your watch data and your blood test inside sealed hardware. The reading starts with a short plan, and you can check each step.

- **Your files never leave your browser.** The page reads them locally. What leaves it is a short summary:
  - six trait genotypes;
  - four weekly averages per watch measure;
  - where each blood value falls in the range its lab printed.
- **The page picks the plan, not the AI.** Up to three actions come from a fixed table of rules with cited sources: sleep, activity, and "ask a doctor" for any blood value outside its lab's range. The AI writes the reading around them and cannot add one.
- **The summary is encrypted to a key held inside a TEE.** Before sending anything, your browser checks that the key belongs to a model running on [NEAR AI Cloud](https://near.ai), in an Intel TDX confidential VM with its NVIDIA GPUs in confidential mode.
- **The reply is checked too.** It comes back encrypted to a key your browser made for this visit, and the model's attested key signs it. The page verifies that signature.
- **You pay for the reading with any coin**, through [NEAR Intents](https://near-intents.org). Solvers turn whatever you send into exactly the price in USDC.

Built by [Indaga](https://indaga.ai) for NEAR HACKATHON 2026. Tracks: **Privacy & Private AI** and **Real-World Money**.

**Hosted demo:** https://private-dna.indaga.ai
- It offers three made-up people, each with a DNA file, four weeks of watch data and a blood test.
- Payment there is simulated.
- Readings there are written by `z-ai/glm-5.3-flash` inside NEAR AI Cloud's TEE, and every check runs in your browser.

## The problem

Personal health advice needs a person's own data, read together. The genome says what tends to be; a watch and a blood test say what is happening now. This is also the most private data a person has. A DNA file can't be changed once it leaks, and genetic and health data are special-category data under the GDPR.

Today, getting an AI to explain this data means uploading the files, or pasting them into a chatbot, and trusting whoever runs the server. This app removes that trust step, and you can check what remains for yourself:
- the files are read in your browser;
- only the summary the reading needs leaves the page, and it is encrypted;
- your browser first checks the hardware evidence that the key it is encrypted to sits inside a confidential-computing TEE;
- we run the relay in the middle, and it sees ciphertext only.

**Nothing is kept on the server.** The relay stores no request, no reply and no log of either: [`server/handler.mjs`](server/handler.mjs) forwards bytes and returns. In memory only, it holds:
- rate-limit counters (a client address and a time, dropped after a day);
- a ten-minute cache of Intel's public collateral;
- in live payment mode, the open deposit addresses.

On the hosted demo, the hosting platform (Vercel) keeps its own standard request logs: address, path and time, not bodies.

## Try it in five minutes

You need Node 20.19 or later. The first four rows below need no account, no key and no money.

| Do | See |
|---|---|
| `npm install` | 5 runtime packages installed ([list below](#what-is-new-and-what-is-baseline)) |
| `npm test` | Every test passes (`ℹ fail 0`). The tests include NEAR's published encryption test vector, live hardware reports saved on 7 Nov 2026 with tampered copies of them, a full encrypted exchange through the relay, and the watch, blood test and plan rules for the three sample people |
| `npm run verify-tee` | Your computer asks NEAR AI Cloud for a fresh hardware report and runs every check on it: `PASS Intel signed this quote … UpToDate`, `PASS The hardware signed the model key`, `PASS The deployment log is attested`, `PASS NVIDIA confirms the GPU runs in confidential mode … 8 GPU(s)`, ending with `VERIFIED` |
| `npm run quote` | Live NEAR Intents prices for one reading (5 USDC) in 11 coins, from real dry quotes |
| `npm start`, then open http://localhost:8787 and pick **Cyd** | See the five steps below this table |

What you see after picking **Cyd**:

1. **Steps 2 and 3** load Cyd's made-up watch data and blood test. **Leave it out** drops either one.
2. **Step 4** starts with her plan, chosen on the page:
   - **Blood test:** her LDL cholesterol and triglycerides are above her lab's range, so the action is to ask a doctor.
   - **Sleep:** 6.7 hours a night.
   - **Activity:** 4,947 steps a day, down 1,375 over the four weeks.
3. Below the plan, step 4 shows her six genotypes, her four weekly averages and her blood values against her lab's ranges. It also shows the exact text that will be encrypted.
4. **Check the hardware** runs the same checks as `verify-tee`, in your browser.
5. **Encrypt and send** shows the ciphertext our server sees. Then it shows the decrypted reading, which starts with the same three actions, and the reading's signature check.

Without a NEAR AI Cloud key, `npm start` runs in **stand-in mode**. The hardware check is still real. The reading itself comes from a local stand-in that speaks the same encryption and signature protocol, and the page labels it as unattested.

With a key from [cloud.near.ai](https://cloud.near.ai), `z-ai/glm-5.3-flash` writes the reading inside the attested TEE:

```bash
NEARAI_API_KEY=your-key npm start
```

You can also get the same reading without a browser. The script prints each step: read the files, check the hardware, encrypt, decrypt, check the signature, and check that the text stayed on topic.

```bash
NEARAI_API_KEY=your-key npm run reading -- --sample Cyd
NEARAI_API_KEY=your-key npm run reading -- your-raw-dna.txt --watch your-watch.csv --labs your-blood-test.csv
```

To add the payment step with live prices and a "simulate" button, run the following. The hosted demo runs this way.

```bash
PAYMENTS=simulated npm start
```

`PAYMENTS=live RECIPIENT=<your NEAR Intents account>` creates real one-time deposit addresses. That is NEAR mainnet: Intents has no testnet, so use small amounts.

To read your own files, run the app on your own computer:
- **Use your own raw DNA file** takes a 23andMe, AncestryDNA, MyHeritage, FamilyTreeDNA or Living DNA file. A `.zip` download works as it is.
- Steps 2 and 3 then take a watch export and a blood test, as CSV or JSON, with the columns that [docs/HEALTH.md](docs/HEALTH.md) describes.

The hosted demo offers the made-up people only.

## How it works

```
your browser                          our relay                 NEAR AI Cloud
─────────────                         ─────────                 ─────────────
reads the DNA file, the watch data
and the blood test (never sent);
works out every result, average,
range position and plan action
from fixed tables
        │  1. fresh random nonce ───────────────────────────────▶ hardware report
        │◀──────────────────────────────────────────────────────  (TDX quote, GPU evidence, logs)
checks Intel's chain, the key and
the nonce in the quote, the software
list, the deployment log, NVIDIA's
signed verdict
        │  2. summary encrypted to the attested key
        │     (X25519 + XChaCha20-Poly1305, v3) ──▶ adds API key ──▶ gateway ──▶ model TEE
        │                                          checks shape     (ciphertext)  decrypts,
        │                                          and limits                     writes the
        │◀───────────────── reply encrypted to this page's key ◀──────────────── reading
decrypts it
        │  3. signature lookup ─────────────────▶ (adds key) ─────▶ signed hash of
checks the Ed25519 signature                                          request + reply
against the attested key
```

1. **Read locally.** The AI never decides a result or an action; it only writes them up. Step 4 on the page shows exactly what will be sent.
   - [`src/genome/parse.mjs`](src/genome/parse.mjs) streams the DNA file in the browser and keeps only the panel's rsIDs. [`src/genome/panel.mjs`](src/genome/panel.mjs) works out each trait result from a fixed table.
   - [`src/health/watch.mjs`](src/health/watch.mjs) reduces four weeks of daily watch numbers to weekly averages, the change over the four weeks, and a fixed note.
   - [`src/health/labs.mjs`](src/health/labs.mjs) places each blood value within, above or below the range its own lab printed, and converts no units.
   - [`src/health/plan.mjs`](src/health/plan.mjs) picks up to three actions from a fixed table.
2. **Check the hardware.** [`src/tee/attestation.mjs`](src/tee/attestation.mjs) asks for a report bound to a fresh nonce and checks:
   - the TDX quote, with [dcap-qvl](https://github.com/Phala-Network/dcap-qvl) against Intel's collateral, accepting the platform patch levels NEAR's own SDK accepts;
   - debug mode is off;
   - the quote's `report_data` holds the model's Ed25519 key and our nonce;
   - MRCONFIGID equals `0x01 ‖ SHA-256(app_compose)`;
   - replaying the boot log gives the quote's RTMR3;
   - the compose-manager's deployment log hashes to what its own quote signed, with our nonce;
   - NVIDIA's attestation service signed a JWT that holds our nonce and an overall `true`, checked with [jose](https://github.com/panva/jose) against NVIDIA's public keys.

   If any check fails, nothing is sent.
3. **Encrypt to that key.** [`src/tee/e2ee.mjs`](src/tee/e2ee.mjs) implements NEAR AI's end-to-end encryption, version 3, and reproduces NEAR's published test vector byte for byte.
   - In version 3, each encrypted field is also bound to the browser's reply key.
   - So if someone between the browser and the model swapped that key for their own, the model could not decrypt the request.
4. **Verify the reply.** [`src/tee/signature.mjs`](src/tee/signature.mjs) checks three things:
   - the signed text is `model:SHA-256(request bytes):SHA-256(reply bytes)`;
   - the signature kind is `provider_tee` (made inside the model's TEE);
   - the Ed25519 signature verifies against the attested key.

   [`src/ai/check-reply.mjs`](src/ai/check-reply.mjs) then flags a reply that strays into topics the reading must not touch: a diagnosis, a disease, a medicine or a supplement.

### What our relay can and cannot do

[`server/handler.mjs`](server/handler.mjs) holds the NEAR AI Cloud key, which never reaches the browser. Before a deploy, `scripts/check-bundle.mjs` checks that the built page does not contain the key.

The relay sees only ciphertext:
- it cannot read the summary;
- it cannot read the reply;
- it cannot swap keys without the model refusing the request.

Under encryption it cannot check the summary itself, so it checks the request's fixed shape instead:
- only the configured model;
- a system message exactly the size of the fixed instructions;
- a user message no larger than 16 KB, which holds the largest blood test the page accepts (the page also checks the size before it sends);
- a fixed token cap and temperature, with no tools and no streaming.

It also limits requests per address and per day, so the demo is no use as a free model endpoint.

The page's Content-Security-Policy lets it connect to two places only: its own server, and NVIDIA's attestation host (for NVIDIA's public signing keys).
- Intel's collateral and NVIDIA's verdict arrive through the relay, because those services don't accept browser requests.
- Intel or NVIDIA sign both, so a dishonest relay could only make a check fail, not pass.

### What this does not prove

- **The hardware makers.** The checks trust Intel's and NVIDIA's chips and signing keys.
- **No logging.** The hardware proves which software was started, by measurement and image digest. Whether that software keeps no logs is something to check in NEAR AI's published source; the attestation does not show it.
- **Which instance.** All instances of a model share one signing key. A valid signature means "an attested instance holding this key", not one specific machine.
- **The gateway's hash.** NEAR's gateway computes the request hash that the model TEE signs. The ciphertext itself is bound to the browser's key, which is why the encryption, not the hash, protects the data.
- **The model sees the summary.** The model inside the TEE reads the six genotypes, the weekly averages, the blood values and the plan. That is how it can write the reading.
- **Your watch's numbers.** Resting heart rate and HRV are the watch's own estimates. The page compares them only with your own earlier weeks.
- **Not medicine.** This is a wellness reading, not medical advice:
  - it names no disease, medicine or supplement;
  - it sends any blood value outside its lab's range to a doctor;
  - the check for straying topics is a word list. It is a check, not a guarantee.

## The trait panel

Six well-studied traits, read from eight variants, with results worked out in advance from published research. Sources and every genotype's wording are in [docs/PANEL.md](docs/PANEL.md).

| Trait | Gene | Variant(s) |
|---|---|---|
| Lactase persistence | LCT / MCM6 | rs4988235 |
| Alcohol flush | ALDH2 | rs671 |
| Earwax type | ABCC11 | rs17822931 |
| Eye colour | HERC2 | rs12913832 |
| Muscle fibre protein | ACTN3 | rs1815739 |
| Bitter taste (PTC/PROP) | TAS2R38 | rs713598, rs1726866, rs10246939 |

A variant missing from the file is reported as "not measured", never as typical. Letters the table doesn't expect are not guessed. The three sample genomes in `web/samples/` are synthetic and made by `npm run samples`; none is any person's DNA.

## The watch data and the blood test

Four weeks of daily watch numbers become, per measure, four weekly averages, the change over the four weeks, and a fixed note:
- **sleep**, against the 7 or more hours a night that the AASM and SRS recommend for adults;
- **resting heart rate** and **HRV**, compared only with your own earlier weeks;
- **steps**, with the WHO's 150 minutes of moderate activity a week.

A measure with too few days is "not measured", never guessed.

A blood value is placed only against the range its own lab printed with it, in the same unit. Nothing is converted, and nothing says what a value means for health.

The plan's five rules, their thresholds and their sources are in [docs/HEALTH.md](docs/HEALTH.md). The watch data and blood tests in `web/samples/` are made up, like the genomes.

## Paying with any coin

[`server/payments.mjs`](server/payments.mjs) asks NEAR Intents 1Click for an `EXACT_OUTPUT` quote:
- the buyer picks one of 11 coins;
- the operator's NEAR Intents account receives exactly the price in USDC;
- the buyer gets a one-time deposit address on that coin's own chain.

1Click sends no webhooks, so the server polls its status. Before it issues a reading pass, it also confirms on NEAR that the operator's USDC balance in the Intents contract went up by at least the price. That balance check suits one operator running one payment at a time. A busy shop should match each payment's own transfer on chain instead.

## What is new and what is baseline

This repository was created for NEAR HACKATHON. All of its code was written in the hackathon window, starting 7 Nov 2026, as the first commit shows. The watch, blood test and plan layers were added on 10 Nov.

The code, tests and docs were written with AI coding agents (Claude Code), directed by Indaga's founder.

Baseline knowledge: Indaga built this payment pattern for its own checkout. It passed a mainnet go-live test on 20 Oct 2026. None of that code is in this repository.

Third-party libraries used as they are:

| Package | Version | Used for |
|---|---|---|
| `@noble/curves` | 2.4.0 | Ed25519 and X25519 |
| `@noble/hashes` | 2.4.0 | SHA-256, SHA-384 and HKDF |
| `@noble/ciphers` | 2.4.0 | XChaCha20-Poly1305 |
| `@phala/dcap-qvl` | 0.7.0 | Intel TDX quote verification |
| `jose` | 6.2.13 | NVIDIA's JWT |
| `esbuild` | 0.28.2 | bundling the page (development only) |

NEAR AI's [inference-sdk](https://github.com/nearai/inference-sdk) (MIT) was the protocol reference, and its published Ed25519 test vector is in `test/fixtures/`.

## About

Built by [Indaga](https://indaga.ai), an AI-native company building personalized medicine: it makes sense of a person's own health data. This open-source demo is a small, private version of that. It is separate from Indaga's own service, which analyses data on Indaga's servers. The privacy properties described here are this demo's.

Licence: MIT for the code. The Indaga name, logo and illustrations, and the fonts (SIL OFL), are not part of it: see [NOTICE](NOTICE). Not medical advice.
