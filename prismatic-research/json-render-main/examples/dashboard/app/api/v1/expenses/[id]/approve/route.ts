import { approveExpense } from "@/lib/db/store";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const result = await approveExpense(id);

  if (result && "error" in result) {
    return Response.json({ error: result.error }, { status: 400 });
  }

  return Response.json({
    message: "Expense approved",
    expense: result,
  });
}
