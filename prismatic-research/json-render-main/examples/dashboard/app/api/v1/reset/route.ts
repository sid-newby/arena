import { resetDatabase } from "@/lib/db/store";

export async function POST() {
  const result = await resetDatabase();
  return Response.json(result);
}
