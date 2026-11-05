#!/usr/bin/env node
"use strict";

/**
 * Test runner for the Free Unclaimed Money Directory.
 *   node tests/run-tests.js
 * Covers: schema validation of data/finders.json, uniqueness + official-domain
 * policy for every card, build reproducibility of index.html, and render tests
 * (filtering + card HTML generation + HTML escaping) against the code embedded
 * in the built single file.
 */

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..");

let passed = 0;
let failed = 0;
const failures = [];

function check(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ok  ${name}`);
  } catch (err) {
    failed++;
    failures.push(`${name}: ${err.message}`);
    console.error(`FAIL  ${name}`);
    console.error(`      ${err.message}`);
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg || "assertion failed");
}

function eq(a, b, msg) {
  assert(JSON.stringify(a) === JSON.stringify(b), msg || `expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
}

/* ---------- tiny JSON-schema validator (subset used by our schema) ---------- */

function validateAgainstSchema(data, schema, label, errors) {
  const typeOf = (v) =>
    Array.isArray(v) ? "array" :
    v === null ? "null" :
    typeof v === "number" ? "number" :
    typeof v === "boolean" ? "boolean" :
    typeof v === "string" ? "string" : "object";

  function walk(value, sch, pathStr) {
    if (sch.type) {
      const t = typeOf(value);
      if (t !== sch.type && !(sch.type === "number" && t === "integer")) {
        errors.push(`${label}: at ${pathStr || "$"} expected type ${sch.type}, got ${t}`);
        return;
      }
    }
    if (sch.enum && !sch.enum.includes(value)) {
      errors.push(`${label}: at ${pathStr || "$"} value ${JSON.stringify(value)} not in enum`);
    }
    if (typeof value === "string") {
      if (sch.pattern && !new RegExp(sch.pattern).test(value)) {
        errors.push(`${label}: at ${pathStr || "$"} string does not match pattern ${sch.pattern}: ${JSON.stringify(value)}`);
      }
      if (sch.minLength != null && value.length < sch.minLength) {
        errors.push(`${label}: at ${pathStr || "$"} string shorter than minLength ${sch.minLength}`);
      }
    }
    if (sch.type === "object" && typeof value === "object" && value !== null && !Array.isArray(value)) {
      for (const req of sch.required || []) {
        if (!(req in value)) errors.push(`${label}: at ${pathStr || "$"} missing required property "${req}"`);
      }
      if (sch.additionalProperties === false) {
        for (const key of Object.keys(value)) {
          if (!sch.properties || !(key in sch.properties)) {
            errors.push(`${label}: at ${pathStr || "$"} unexpected property "${key}"`);
          }
        }
      }
      for (const [key, sub] of Object.entries(sch.properties || {})) {
        if (key in value) walk(value[key], sub, pathStr ? `${pathStr}.${key}` : key);
      }
    }
    if (sch.type === "array" && Array.isArray(value)) {
      if (sch.minItems != null && value.length < sch.minItems) {
        errors.push(`${label}: at ${pathStr || "$"} array shorter than minItems ${sch.minItems}`);
      }
      if (sch.items) {
        value.forEach((item, i) => walk(item, sch.items, `${pathStr || "$"}[${i}]`));
      }
    }
  }
  walk(data, schema, "");
}

/* ---------- load fixtures ---------- */

const data = JSON.parse(fs.readFileSync(path.join(root, "data", "finders.json"), "utf8"));
const schema = JSON.parse(fs.readFileSync(path.join(root, "schema", "finders.schema.json"), "utf8"));

/* domain policy: government sites, plus official state-officer / regulator bodies */
const ALLOWED_NON_GOV_HOSTS = new Set([
  "unclaimed.org",       // NAUPA — official association of state unclaimed-property officers
  "missingmoney.com",    // NAUPA-endorsed central state search
  "eapps.naic.org"       // NAIC — official association of state insurance regulators
]);

function hostOf(url) {
  try { return new URL(url).hostname.toLowerCase(); } catch { return ""; }
}

/* ---------- 1. schema validation ---------- */

console.log("\n[1] data/finders.json validates against schema/finders.schema.json");

check("schema validation passes", () => {
  const errors = [];
  validateAgainstSchema(data, schema, "finders.json", errors);
  assert(errors.length === 0, errors.join("; "));
});

check("disclaimer forbids presenting this as advice", () => {
  assert(/never financial/i.test(data.disclaimer), "disclaimer must state it is never financial advice");
});

check("scam warning exists with never-pay-a-finder rule", () => {
  assert(data.scam_warning.rules.length >= 3, "at least 3 scam rules");
  const joined = data.scam_warning.rules.join(" ").toLowerCase();
  assert(joined.includes("never pay"), "rules must include 'never pay'");
  assert(joined.includes("free"), "rules must mention free");
});

check("core documents section present", () => {
  assert(data.core_documents.items.length >= 3, "at least 3 core documents");
});

/* ---------- 2. card content policy ---------- */

console.log("\n[2] every card follows the official-only, no-affiliate policy");

check("ids, names, urls, and what_it_finds are unique", () => {
  for (const field of ["id", "name", "url", "what_it_finds"]) {
    const set = new Set(data.finders.map((f) => f[field]));
    eq(set.size, data.finders.length, `duplicate ${field} found`);
  }
});

check("category coverage across all stated categories", () => {
  const cats = new Set(data.finders.map((f) => f.category));
  for (const c of ["state-unclaimed-property", "federal-pension", "bank-credit-union",
                   "insurance", "tax-refund", "savings-bonds"]) {
    assert(cats.has(c), `missing category ${c}`);
  }
});

check("every link is https and official (.gov, official *.state.*.us, or allowlisted regulator body)", () => {
  for (const f of data.finders) {
    assert(f.url.startsWith("https://"), `${f.id}: url must be https`);
    const host = hostOf(f.url);
    const ok = host.endsWith(".gov") ||
      ALLOWED_NON_GOV_HOSTS.has(host) ||
      /\.state\.[a-z]{2}\.us$/.test(host); /* official US state government domains (e.g. osc.state.ny.us) */
    assert(ok, `${f.id}: ${host} is not an official .gov or allowlisted official body`);
  }
});

check("no affiliate/tracking parameters in any url", () => {
  for (const f of data.finders) {
    assert(!/utm_|tag=|aff|affiliate|ref=/i.test(f.url), `${f.id}: url looks affiliate-tagged: ${f.url}`);
  }
});

check("each card has documents-to-have-ready list with real content", () => {
  for (const f of data.finders) {
    assert(Array.isArray(f.docs_ready) && f.docs_ready.length >= 2, `${f.id}: docs_ready too thin`);
    assert(f.docs_ready.every((d) => d.length >= 3), `${f.id}: emptyish doc entry`);
  }
});

check("each card states its official operator", () => {
  for (const f of data.finders) {
    assert(f.operator && f.operator.length >= 5, `${f.id}: missing operator`);
  }
});

check("finders data contains no obvious personal data or secrets", () => {
  const raw = JSON.stringify(data);
  assert(!/\b\d{3}-\d{2}-\d{4}\b/.test(raw), "SSN-shaped value found in data");
  assert(!/AKIA[0-9A-Z]{16}/.test(raw), "AWS key-shaped value found in data");
  assert(!/api[_-]?key|password|secret\s*[:=]/i.test(raw), "secret-like field found in data");
  assert(!/https?:\/\/(?!eapps)[^\s"]*@(?!e)/i.test(raw), "credential in URL found in data");
});

/* ---------- 3. build reproducibility ---------- */

console.log("\n[3] index.html is up to date with the committed template + data");

check("rebuilding produces byte-identical index.html", () => {
  const template = fs.readFileSync(path.join(root, "src", "template.html"), "utf8");
  const committed = fs.readFileSync(path.join(root, "index.html"), "utf8");
  const raw = fs.readFileSync(path.join(root, "data", "finders.json"), "utf8");
  assert(template.includes("__BUILD_DATA__"), "template lost its data marker");
  const rebuilt = template.replace("__BUILD_DATA__", raw.trim());
  eq(committed, rebuilt, "committed index.html does not match a fresh build; run `node src/build.js`");
});

/* ---------- 4. render tests (the code embedded in index.html) ---------- */

console.log("\n[4] render tests against the embedded single-file app code");

const built = fs.readFileSync(path.join(root, "index.html"), "utf8");
const m = built.match(/\/\* APP-BEGIN \*\/([\s\S]*?)\/\* APP-END \*\//);
check("embedded app code is present in index.html", () => {
  assert(m, "APP markers not found in index.html");
});

/* The embedded IIFE also runs in Node via module.exports; load it that way. */
let mod = null;
if (m) {
  mod = { exports: {} };
  vm.runInNewContext(m[1] + "\n", { module: mod, window: undefined, document: undefined }, { timeout: 1000 });
}

check("embedded app exposes DATA matching data/finders.json", () => {
  eq(mod.exports.DATA.finders.length, data.finders.length, "finder count mismatch");
  eq(mod.exports.DATA.version, data.version, "version mismatch");
  eq(mod.exports.DATA.scam_warning.headline, data.scam_warning.headline, "scam warning mismatch");
});

check("category filter narrows results correctly", () => {
  const all = mod.exports.filterFinders(data.finders, "all", "");
  eq(all.length, data.finders.length, "all filter");
  const state = mod.exports.filterFinders(data.finders, "state-unclaimed-property", "");
  assert(state.length >= 5, "expected several state cards");
  assert(state.every((f) => f.category === "state-unclaimed-property"), "state filter leaked other categories");
  const bond = mod.exports.filterFinders(data.finders, "savings-bonds", "");
  eq(bond.length, 1, "savings-bonds filter");
});

check("text search matches name/operator/content", () => {
  const r1 = mod.exports.filterFinders(data.finders, "all", "pension");
  assert(r1.length >= 2, "'pension' search should match pension cards");
  assert(r1.every((f) => JSON.stringify(f).toLowerCase().includes("pension")), "search returned non-pension card");
  const r2 = mod.exports.filterFinders(data.finders, "all", "california");
  assert(r2.some((f) => f.id === "california-unclaimed"), "california search misses California card");
  const r3 = mod.exports.filterFinders(data.finders, "all", "zzz-no-such-thing");
  eq(r3.length, 0, "garbage query should return nothing");
});

check("category + query filters compose", () => {
  const r = mod.exports.filterFinders(data.finders, "bank-credit-union", "fdic");
  eq(r.length, 1, "fdic within bank-credit-union");
  eq(r[0].id, "fdic-unclaimed-deposits", "wrong card matched");
});

check("card HTML includes the free/never-pay-a-finder notice on every card", () => {
  const escFor = (s) => String(s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  for (const f of data.finders) {
    const html = mod.exports.cardHtml(f);
    assert(html.includes("never pay a finder"), `${f.id}: card missing never-pay notice`);
    assert(html.includes(f.url), `${f.id}: card missing its url`);
    assert(html.includes("Have ready"), `${f.id}: card missing documents section`);
    for (const doc of f.docs_ready) {
      /* card HTML escapes text, so compare against an escaped prefix */
      assert(html.includes(escFor(doc.slice(0, 25))), `${f.id}: doc text truncated or missing`);
    }
  }
});

check("card HTML escapes user-controlled text (XSS-safe rendering)", () => {
  const evil = {
    id: "x' ><img>",
    name: "<script>alert(1)</script>",
    category: "insurance",
    jurisdiction: '"><b>x</b>',
    operator: "& < > \" '",
    url: "https://example.gov/a?q='\">x",
    what_it_finds: "<b>bold</b>",
    docs_ready: ["<i>a</i>", "<i>b</i>"],
    tips: "<img src=x onerror=alert(2)>"
  };
  const html = mod.exports.cardHtml(evil);
  assert(!html.includes("<script>alert"), "raw <script> made it into card HTML");
  assert(html.includes("&lt;script&gt;"), "script tag not escaped");
  assert(!html.includes("<img src=x"), "raw img injection survived");
  assert(!html.includes("<i>"), "raw italic injection survived in docs");
  assert(html.includes("&quot;"), "quote escaping missing");
});

/* ---------- summary ---------- */

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.error("\nFailures:");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log("All tests pass.");
