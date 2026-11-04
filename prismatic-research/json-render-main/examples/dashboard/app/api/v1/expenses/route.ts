import { getExpenses, createExpense } from "@/lib/db/store";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status") || undefined;
  const category = searchParams.get("category") || undefined;

  const expenseList = await getExpenses({ status, category });

  return Response.json({
    data: expenseList,
    total: expenseList.length,
    summary: {
      totalAmount: expenseList.reduce(
        (sum, e) => sum + parseFloat(e.amount as string),
        0,
      ),
      byStatus: {
        pending: expenseList.filter((e) => e.status === "pending").length,
        approved: expenseList.filter((e) => e.status === "approved").length,
        rejected: expenseList.filter((e) => e.status === "rejected").length,
      },
    },
  });
}

export async function POST(req: Request) {
  const body = await req.json();

  const expense = await createExpense({
    vendor: body.vendor,
    category: body.category,
    amount: body.amount,
    date: body.date,
    description: body.description,
  });

  return Response.json(expense, { status: 201 });
}
