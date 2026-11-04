import { getExpense, updateExpense, deleteExpense } from "@/lib/db/store";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const expense = await getExpense(id);

  if (!expense) {
    return Response.json({ error: "Expense not found" }, { status: 404 });
  }

  return Response.json(expense);
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await req.json();
  const expense = await updateExpense(id, body);

  if (!expense) {
    return Response.json({ error: "Expense not found" }, { status: 404 });
  }

  return Response.json(expense);
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const deleted = await deleteExpense(id);

  if (!deleted) {
    return Response.json({ error: "Expense not found" }, { status: 404 });
  }

  return new Response(null, { status: 204 });
}
