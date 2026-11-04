import "dotenv/config";
import { clearDatabase } from "../lib/db/store";

async function main() {
  console.log("Clearing database...");
  const result = await clearDatabase();
  console.log(result.message);
  process.exit(0);
}

main().catch((err) => {
  console.error("Error clearing database:", err);
  process.exit(1);
});
