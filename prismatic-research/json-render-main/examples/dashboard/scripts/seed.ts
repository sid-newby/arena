import "dotenv/config";
import { resetDatabase } from "../lib/db/store";

async function main() {
  console.log("Seeding database...");
  const result = await resetDatabase();
  console.log(result.message);
  process.exit(0);
}

main().catch((err) => {
  console.error("Error seeding database:", err);
  process.exit(1);
});
