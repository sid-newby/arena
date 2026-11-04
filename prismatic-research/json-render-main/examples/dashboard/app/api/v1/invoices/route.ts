import { getInvoices, createInvoice } from "@/lib/db/store";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status") || undefined;
  const customerId = searchParams.get("customerId") || undefined;

  const invoiceList = await getInvoices({ status, customerId });

  return Response.json({
    data: invoiceList,
    total: invoiceList.length,
    summary: {
      totalAmount: invoiceList.reduce(
        (sum, i) => sum + parseFloat(i.amount as string),
        0,
      ),
      byStatus: {
        draft: invoiceList.filter((i) => i.status === "draft").length,
        sent: invoiceList.filter((i) => i.status === "sent").length,
        paid: invoiceList.filter((i) => i.status === "paid").length,
        overdue: invoiceList.filter((i) => i.status === "overdue").length,
      },
    },
  });
}

export async function POST(req: Request) {
  const body = await req.json();

  const invoice = await createInvoice({
    customerId: body.customerId,
    dueDate: body.dueDate,
    items: body.items,
  });

  if (!invoice) {
    return Response.json({ error: "Customer not found" }, { status: 400 });
  }

  return Response.json(invoice, { status: 201 });
}
