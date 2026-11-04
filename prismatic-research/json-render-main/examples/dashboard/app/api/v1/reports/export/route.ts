import {
  getDashboardSummary,
  getInvoices,
  getExpenses,
  getCustomers,
} from "@/lib/db/store";

export async function POST(req: Request) {
  const body = await req.json();
  const { format = "json", reportType = "summary" } = body;

  let data: unknown;

  switch (reportType) {
    case "summary":
      data = await getDashboardSummary();
      break;
    case "invoices":
      data = await getInvoices();
      break;
    case "expenses":
      data = await getExpenses();
      break;
    case "customers":
      data = await getCustomers();
      break;
    default:
      data = await getDashboardSummary();
  }

  if (format === "csv") {
    return Response.json({
      message: "CSV export initiated",
      downloadUrl: `/api/v1/reports/download/${reportType}.csv`,
      format: "csv",
    });
  }

  return Response.json({
    message: "Report generated",
    reportType,
    generatedAt: new Date().toISOString(),
    data,
  });
}
