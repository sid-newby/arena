import { getCustomers, createCustomer } from "@/lib/db/store";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status") || undefined;
  const search = searchParams.get("search") || undefined;
  const limit = searchParams.get("limit")
    ? parseInt(searchParams.get("limit")!, 10)
    : undefined;
  const sort = (searchParams.get("sort") as "newest" | "oldest") || undefined;

  const customerList = await getCustomers({ status, search, limit, sort });

  return Response.json({
    data: customerList,
    total: customerList.length,
  });
}

export async function POST(req: Request) {
  const body = await req.json();

  const customer = await createCustomer({
    name: body.name,
    email: body.email,
    phone: body.phone || undefined,
  });

  return Response.json(customer, { status: 201 });
}
