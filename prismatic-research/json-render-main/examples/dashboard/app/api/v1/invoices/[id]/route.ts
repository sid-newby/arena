import { getInvoice, updateInvoice, deleteInvoice } from "@/lib/db/store";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const invoice = await getInvoice(id);

  if (!invoice) {
    return Response.json({ error: "Invoice not found" }, { status: 404 });
  }

  return Response.json(invoice);
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await req.json();
  const invoice = await updateInvoice(id, body);

  if (!invoice) {
    return Response.json({ error: "Invoice not found" }, { status: 404 });
  }

  return Response.json(invoice);
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const deleted = await deleteInvoice(id);

  if (!deleted) {
    return Response.json({ error: "Invoice not found" }, { status: 404 });
  }

  return new Response(null, { status: 204 });
}
