#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const CORE_PKG = path.join(ROOT, "packages/core/package.json");

const core = JSON.parse(fs.readFileSync(CORE_PKG, "utf8"));
const version = core.version;

console.log(`Canonical version (from @json-render/core): ${version}`);

const packagesDir = path.join(ROOT, "packages");
const mismatches = [];

for (const dir of fs.readdirSync(packagesDir)) {
  const pkgPath = path.join(packagesDir, dir, "package.json");
  if (!fs.existsSync(pkgPath)) continue;

  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
  if (!pkg.name || !pkg.name.startsWith("@json-render/")) continue;

  if (pkg.version !== version) {
    mismatches.push({ name: pkg.name, version: pkg.version });
  }
}

if (mismatches.length > 0) {
  console.error("\nVersion mismatch detected:");
  for (const m of mismatches) {
    console.error(`  ${m.name}: ${m.version} (expected ${version})`);
  }
  console.error("\nRun `pnpm run version:sync` to fix.");
  process.exit(1);
} else {
  console.log("All @json-render/* packages are in sync.");
}
