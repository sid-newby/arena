import { getCustomer, updateCustomer, deleteCustomer } from "@/lib/db/store";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const customer = await getCustomer(id);

  if (!customer) {
    return Response.json({ error: "Customer not found" }, { status: 404 });
  }

  return Response.json(customer);
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await req.json();
  const customer = await updateCustomer(id, body);

  if (!customer) {
    return Response.json({ error: "Customer not found" }, { status: 404 });
  }

  return Response.json(customer);
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const result = await deleteCustomer(id);

  if (!result.success) {
    return Response.json({ error: "Customer not found" }, { status: 404 });
  }

  return new Response(null, { status: 204 });
}
