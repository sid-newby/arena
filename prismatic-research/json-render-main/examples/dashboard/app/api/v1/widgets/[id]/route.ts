import { getWidget, updateWidget, deleteWidget } from "@/lib/db/store";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const widget = await getWidget(id);

  if (!widget) {
    return Response.json({ error: "Widget not found" }, { status: 404 });
  }

  return Response.json(widget);
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await req.json();
  const widget = await updateWidget(id, body);

  if (!widget) {
    return Response.json({ error: "Widget not found" }, { status: 404 });
  }

  return Response.json(widget);
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const deleted = await deleteWidget(id);

  if (!deleted) {
    return Response.json({ error: "Widget not found" }, { status: 404 });
  }

  return new Response(null, { status: 204 });
}
