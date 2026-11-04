import { markInvoicePaid } from "@/lib/db/store";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const result = await markInvoicePaid(id);

  if (result && "error" in result) {
    return Response.json({ error: result.error }, { status: 400 });
  }

  return Response.json({
    message: "Invoice marked as paid",
    invoice: result,
  });
}
