# Free Unclaimed Money Directory

A static, **offline single-file** directory of *official* finders for money you may already own:

- **State unclaimed-property databases** — including the NAUPA state map, the NAUPA-endorsed multi-state search, and five big state portals (Indiana, California, Texas, New York, Florida)
- **Federal pension lookups** — PBGC Missing Participants and the US Department of Labor's abandoned-plan search
- **Federal bank & credit-union lookups** — FDIC unclaimed deposits and NCUA failed credit-union funds
- **Old-insurance-policy searchers** — the NAIC Life Insurance Policy Locator
- **Returned federal tax refunds** — IRS Where's My Refund and undeliverable refunds
- **Savings-bond hunting** — Treasury Hunt at TreasuryDirect
- **Other federal refunds** — HUD/FHA mortgage-insurance premium refunds

Every card says **what it finds**, tells you the **documents to have ready**, links **only to the official source** (.gov, plus the two official state/regulator associations: unclaimed.org/missingmoney.com and the NAIC locator), and carries a loud **"never pay a finder"** scam warning.

**Information only. Never financial, legal, or tax advice.** Rules and links change — always confirm details on the official website before you claim anything.

## Beating the finder-fee scam in plain English

Every entry in this directory is a program run by a government agency or by the official association of state officers. Claiming your own money through them is **free** (occasionally plus ordinary government fees). A private "finder" or "asset recovery" company charging 10–35% is offering to walk you to the exact same mailbox — you are allowed to walk there yourself, for free. If someone contacts *you* about found money, you do not need them; search the official source yourself. Never give your bank login, full Social Security number, or an upfront payment to an unsolicited caller. Stay alert; this site can only warn you, and it is never financial advice.

## How to run it

Nothing to install, no server, no build step required:

```
open index.html            # macOS
# or just double-click index.html — it works offline, from a thumb drive too
```

`index.html` is the finished product: one self-contained file with the data and app inlined. It has no external requests at all, so it works offline and leaks nothing about who browses it.

## Repository layout

| Path | What it is |
| --- | --- |
| `index.html` | The built, offline single-file site (committed; the thing you open) |
| `data/finders.json` | The directory data — the file you actually edit |
| `schema/finders.schema.json` | JSON Schema for the data file |
| `src/template.html` | Page template with the `__BUILD_DATA__` injection marker |
| `src/build.js` | Build script: injects the JSON into the template → `index.html` |
| `tests/run-tests.js` | All tests (schema, policy, build reproducibility, rendering) |
| `LICENSE` | MIT, Copyright (c) 2026 Asdale Dynamics, LLC |

## How to maintain (add or fix a card)

1. **Edit `data/finders.json`.** The required fields per card are: `id` (lowercase-with-dashes), `name`, `category` (one of the seven enum values), `jurisdiction`, `operator`, `url`, `what_it_finds`, `docs_ready` (at least 2 entries), `tips`. The top level takes `version`, `updated`, `disclaimer`, `scam_warning` (≥3 rules), `core_documents` (≥3 items), and `finders` (≥10 cards). Bump `updated` and `version` when you change anything.
2. **Only official sources.** `.gov` domains, official `*.state.*.us` state domains, or the allowlisted official bodies (`unclaimed.org`, `missingmoney.com`, `eapps.naic.org`). The test suite enforces this — affiliate or tracking URLs (`utm_`, `tag=`, `aff`, `ref=`) will fail the build.
3. **Validate and rebuild:**
   ```
   node tests/run-tests.js    # validates data against the schema + runs all policy/render tests
   node src/build.js          # regenerates index.html — run this and commit it together with the JSON
   ```
   One of the tests compares a fresh build to the committed `index.html`, so a stale file or an edited-but-unrepaired page is caught on the next run.
4. **Re-check links periodically.** The suite enforces URL *shape* but cannot reach the web. Every few months, click every card from a fresh browser and fix drifted links (agencies reorganize; the parent agency's homepage is always a safe fallback). Record the check in the `updated` field.

## JSON Schema

Draft 2020-12 style, at `schema/finders.schema.json`. Maintenance workflow is: edit → `node tests/run-tests.js` (the built-in mini-validator pins down required fields, enums, patterns, min lengths/counts, and forbids extra fields) → `node src/build.js` → commit both `data/finders.json` and `index.html`.

## Render tests

`tests/run-tests.js` covers four layers:

1. **Schema** — every field validated against the JSON Schema subset used by this project.
2. **Policy** — unique ids/names/URLs; https-only; official domains only; no affiliate tags; every card has ≥2 "have ready" documents and an operator line; **no secrets or personal data** (SSN-shaped values, AWS keys, credentials-in-URL) anywhere in the data.
3. **Build** — a fresh run of the build logic must be byte-identical to the committed `index.html`.
4. **Render** — the app code is extracted from the built file and executed in a minimal sandbox: filter by category, text search, combined filters, and XSS-escaping of card text; every rendered card must carry the free/never-pay warning, its link, and its document list.

Run everything with:

```
node tests/run-tests.js
```

## Accessibility & offline notes

- Plain semantic HTML, labeled controls, `aria-pressed` filter buttons, visible focus outlines, live-region result count, and a print stylesheet that flattens cards to a single column.
- There are no external fonts, scripts, images, or network calls — everything is in the one file.
- With JavaScript disabled, the page shows a notice pointing to `data/finders.json` and this README, which document every finder in plain text.

## Credits & license

Built and maintained by **Asdale Dynamics, LLC** — plain-English AI education and practical tools from The Massive AI Manual (dylanasdale.github.io). MIT licensed; see `LICENSE`. No ads, no affiliate links, and no payment from any program listed here.

This project provides information only. It is not financial, legal, or tax advice, and it does not evaluate any individual claim.
