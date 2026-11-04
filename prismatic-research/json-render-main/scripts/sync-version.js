#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const CORE_PKG = path.join(ROOT, "packages/core/package.json");

const core = JSON.parse(fs.readFileSync(CORE_PKG, "utf8"));
const version = core.version;

console.log(`Canonical version (from @json-render/core): ${version}`);

const packagesDir = path.join(ROOT, "packages");
let updated = 0;

for (const dir of fs.readdirSync(packagesDir)) {
  const pkgPath = path.join(packagesDir, dir, "package.json");
  if (!fs.existsSync(pkgPath)) continue;

  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
  if (!pkg.name || !pkg.name.startsWith("@json-render/")) continue;
  if (pkg.version === version) continue;

  console.log(`  ${pkg.name}: ${pkg.version} -> ${version}`);
  pkg.version = version;
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");
  updated++;
}

if (updated === 0) {
  console.log("All @json-render/* packages are already in sync.");
} else {
  console.log(`Updated ${updated} package(s).`);
}
