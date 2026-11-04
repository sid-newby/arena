import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

function loadEnv() {
  const envPath = resolve(root, ".env");
  if (!existsSync(envPath)) return {};
  const env = {};
  for (const line of readFileSync(envPath, "utf-8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    const val = trimmed.slice(idx + 1).trim();
    env[key] = val;
  }
  return env;
}

const env = loadEnv();
const templatePath = resolve(root, "stripe-app.template.json");
const outputPath = resolve(root, "stripe-app.json");

const template = JSON.parse(readFileSync(templatePath, "utf-8"));

if (env.STRIPE_APP_ID) {
  template.id = env.STRIPE_APP_ID;
  console.log(`Using app ID from .env: ${env.STRIPE_APP_ID}`);
} else {
  console.log(`No STRIPE_APP_ID in .env, using template default: ${template.id}`);
}

if (env.STRIPE_APP_NAME) {
  template.name = env.STRIPE_APP_NAME;
}

writeFileSync(outputPath, JSON.stringify(template, null, 4) + "\n");
console.log("Generated stripe-app.json");
