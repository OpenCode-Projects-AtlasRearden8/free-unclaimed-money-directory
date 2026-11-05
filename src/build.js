#!/usr/bin/env node
/**
 * build.js — injects data/finders.json into src/template.html and writes index.html.
 * Run: node build.js
 * The committed index.html is already built; rebuild after editing the JSON or template.
 */
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");

const dataPath = path.join(root, "data", "finders.json");
const templatePath = path.join(root, "src", "template.html");
const outPath = path.join(root, "index.html");

const data = fs.readFileSync(dataPath, "utf8");
const template = fs.readFileSync(templatePath, "utf8");

if (!template.includes("__BUILD_DATA__")) {
  console.error("build failed: template is missing the __BUILD_DATA__ marker");
  process.exit(1);
}

const json = JSON.parse(data);
if (!json.finders || json.finders.length < 1) {
  console.error("build failed: no finders in data");
  process.exit(1);
}

// Ensure the JSON contains no </script> sequence that could break the inline script block.
if (data.toLowerCase().includes("</script")) {
  console.error("build failed: data contains </script sequence");
  process.exit(1);
}

const out = template.replace("__BUILD_DATA__", data.trim());
if (out === template) {
  console.error("build failed: replacement did not occur");
  process.exit(1);
}

fs.writeFileSync(outPath, out, "utf8");
console.log(`built index.html (${out.length} bytes, ${json.finders.length} finders, data version ${json.version})`);
