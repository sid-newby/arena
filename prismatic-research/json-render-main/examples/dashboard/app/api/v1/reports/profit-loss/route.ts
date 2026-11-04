import { getProfitLossReport } from "@/lib/db/store";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const startDate = searchParams.get("startDate") || undefined;
  const endDate = searchParams.get("endDate") || undefined;

  const report = await getProfitLossReport(startDate, endDate);
  return Response.json(report);
}
