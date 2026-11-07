# Private DNA Reading

An AI reads a few of your DNA traits inside sealed hardware, and you can check that it did.

- **Your raw DNA file never leaves your browser.** The page reads it locally and keeps only six trait variants.
- **Those few genotypes are encrypted to a key held inside a TEE.** Before sending anything, your browser checks that the key belongs to a model running in an Intel TDX confidential VM with NVIDIA GPUs in confidential mode, on [NEAR AI Cloud](https://near.ai).
- **The reply is checked too.** It comes back encrypted to a key your browser made for this visit, and it is signed by the model's attested key. The page verifies that signature.
- **You pay for the reading with any coin**, through [NEAR Intents](https://near-intents.org). Solvers turn whatever you send into exactly the price in USDC.

Built for NEAR HACKATHON 2026. Tracks: **Privacy & Private AI** and **Real-World Money**.

## Try it in five minutes

You need Node 20.19 or later. Steps 1 to 4 need no account, no key and no money.

| Do | See |
|---|---|
| `npm install` | 5 runtime packages installed ([list below](#what-is-new-and-what-is-baseline)) |
| `npm test` | every test passes (`ℹ fail 0`). The tests include NEAR's published encryption test vector, live hardware reports saved on 7 Nov 2026, tampered copies of them, and a full encrypted exchange through the relay |
| `npm run verify-tee` | your computer asks NEAR AI Cloud for a fresh hardware report and runs every check on it: `PASS Intel signed this quote … UpToDate`, `PASS The hardware signed the model key`, `PASS The deployment log is attested`, `PASS NVIDIA confirms the GPU runs in confidential mode … 8 GPU(s)`, ending with `VERIFIED` |
| `npm run quote` | live NEAR Intents prices for one reading (5 USDC) in 11 coins, from real dry quotes |
| `npm start`, then open http://localhost:8787 and pick **Ada** | step 2 lists the six genotypes that would leave the page, and their results. **Check the hardware** shows the same checks as `verify-tee`, run in your browser. **Encrypt and send** shows the ciphertext our server sees, then the decrypted reading and its signature check |

Without a NEAR AI Cloud key, `npm start` runs in **stand-in mode**. The hardware check is still real. The reading itself comes from a local stand-in that speaks the same encryption and signature protocol, and the page labels it as unattested.

With a key from [cloud.near.ai](https://cloud.near.ai), the reading is written by `z-ai/glm-5.3-flash` inside the attested TEE:

```bash
NEARAI_API_KEY=your-key npm start
```

To add the payment step with live prices and a "simulate" button (this is how the hosted demo runs):

```bash
PAYMENTS=simulated npm start
```

`PAYMENTS=live RECIPIENT=<your NEAR Intents account>` creates real one-time deposit addresses. That is NEAR mainnet: Intents has no testnet, so use small amounts.

To read your own 23andMe, AncestryDNA, MyHeritage, FamilyTreeDNA or Living DNA file, run the app on your own computer and choose **Use your own raw DNA file**. A `.zip` download works as it is. The hosted demo offers the synthetic samples only.

## How it works

```
your browser                          our relay                 NEAR AI Cloud
─────────────                         ─────────                 ─────────────
reads the DNA file (never sent)
keeps 6 variants, works out each
result from a fixed table
        │  1. fresh random nonce ───────────────────────────────▶ hardware report
        │◀──────────────────────────────────────────────────────  (TDX quote, GPU evidence, logs)
checks Intel's chain, the key and
the nonce in the quote, the software
list, the deployment log, NVIDIA's
signed verdict
        │  2. panel encrypted to the attested key
        │     (X25519 + XChaCha20-Poly1305, v3) ──▶ adds API key ──▶ gateway ──▶ model TEE
        │                                          checks shape     (ciphertext)  decrypts,
        │                                          and limits                     writes the
        │◀───────────────── reply encrypted to this page's key ◀──────────────── reading
decrypts it
        │  3. signature lookup ─────────────────▶ (adds key) ─────▶ signed hash of
checks the Ed25519 signature                                          request + reply
against the attested key
```

1. **Read locally.** [`src/genome/parse.mjs`](src/genome/parse.mjs) streams the file in the browser and keeps only the panel's rsIDs. [`src/genome/panel.mjs`](src/genome/panel.mjs) works out each result from a fixed table, so the AI never decides a result; it only writes them up. Step 2 on the page shows exactly what will be sent.
2. **Check the hardware.** [`src/tee/attestation.mjs`](src/tee/attestation.mjs) asks for a report bound to a fresh nonce and checks:
   - the TDX quote, with [dcap-qvl](https://github.com/Phala-Network/dcap-qvl) against Intel's collateral, accepting the platform patch levels NEAR's own SDK accepts;
   - debug mode is off;
   - the quote's `report_data` holds the model's Ed25519 key and our nonce;
   - MRCONFIGID equals `0x01 ‖ SHA-256(app_compose)`;
   - replaying the boot log gives the quote's RTMR3;
   - the compose-manager's deployment log hashes to what its own quote signed, with our nonce;
   - NVIDIA's attestation service signed a JWT that holds our nonce and an overall `true`, checked with [jose](https://github.com/panva/jose) against NVIDIA's public keys.

   If any check fails, nothing is sent.
3. **Encrypt to that key.** [`src/tee/e2ee.mjs`](src/tee/e2ee.mjs) implements NEAR AI's end-to-end encryption, version 3, and reproduces NEAR's published test vector byte for byte. In version 3, each encrypted field is also bound to the browser's reply key. If someone between the browser and the model swapped that key for their own, the model could not decrypt the request.
4. **Verify the reply.** [`src/tee/signature.mjs`](src/tee/signature.mjs) checks that the signed text is `model:SHA-256(request bytes):SHA-256(reply bytes)`, that the signature kind is `provider_tee` (made inside the model's TEE), and that the Ed25519 signature verifies against the attested key.

### What our relay can and cannot do

[`server/handler.mjs`](server/handler.mjs) holds the NEAR AI Cloud key, which never reaches the browser; `scripts/check-bundle.mjs` checks the built page for it before a deploy. The relay sees only ciphertext. It cannot read the panel, cannot read the reply, and cannot swap keys without the model refusing the request. Under encryption it cannot check the panel itself, so it checks the request's fixed shape instead:
- only the configured model;
- a system message exactly the size of the fixed instructions;
- a user message no larger than the largest possible panel;
- a fixed token cap and temperature, with no tools and no streaming.

It also limits requests per address and per day, so the demo is no use as a free model endpoint.

The page's Content-Security-Policy lets it connect to its own server and to NVIDIA's attestation host (for NVIDIA's public signing keys), and nowhere else. Intel's collateral and NVIDIA's verdict arrive through the relay, because those services don't accept browser requests. Both are signed by Intel or NVIDIA, so a dishonest relay could only make a check fail, not pass.

### What this does not prove

- **The hardware makers.** The checks trust Intel's and NVIDIA's chips and signing keys.
- **No logging.** The hardware proves which software was started, by measurement and image digest. Whether that software keeps no logs is something to check in NEAR AI's published source; the attestation does not show it.
- **Which instance.** All instances of a model share one signing key, so a valid signature means "an attested instance holding this key", not one specific machine.
- **The gateway's hash.** NEAR's gateway computes the request hash that the model TEE signs. The ciphertext itself is bound to the browser's key, which is why the encryption, not the hash, protects the data.
- **The model sees the genotypes.** The model inside the TEE does read the six genotypes; that is how it can write the reading.
- **Not medicine.** This is a curiosity reading of six traits, not medical advice, and it says nothing about disease.

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

## Paying with any coin

[`server/payments.mjs`](server/payments.mjs) asks NEAR Intents 1Click for an `EXACT_OUTPUT` quote: exactly the price in USDC, delivered to the operator's NEAR Intents account, from whichever of 11 coins the buyer picks. The buyer gets a one-time deposit address on that coin's own chain.

1Click sends no webhooks, so the server polls its status. Before it issues a reading pass, it also confirms on NEAR that the operator's USDC balance in the Intents contract went up by at least the price. That balance check suits one operator running one payment at a time. A busy shop should match each payment's own transfer on chain instead.

## What is new and what is baseline

This repository was created for NEAR HACKATHON. All of its code was written in the hackathon window, starting 7 Nov 2026, as the first commit shows.

Baseline knowledge: Indaga built this payment pattern for its own checkout. It passed a mainnet go-live test on 20 Oct 2026 and is not open for sales yet. None of that code is in this repository.

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

Built by [Indaga](https://indaga.ai). This is a separate open-source demo. Indaga's paid DNA report works differently: it analyses DNA on Indaga's own server. The privacy properties described here are this demo's.

Licence: MIT. Not medical advice.
