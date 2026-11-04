import { reorderWidgets } from "@/lib/db/store";

export async function POST(req: Request) {
  const body = await req.json();

  if (!body.orderedIds || !Array.isArray(body.orderedIds)) {
    return Response.json(
      { error: "orderedIds array is required" },
      { status: 400 },
    );
  }

  await reorderWidgets(body.orderedIds);
  return Response.json({ success: true });
}
