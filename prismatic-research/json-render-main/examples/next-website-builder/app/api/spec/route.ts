import type { NextAppSpec } from "@json-render/next";
import { getSpec, setSpec } from "@/lib/spec-store";

export async function GET() {
  return Response.json(getSpec());
}

export async function PUT(req: Request) {
  setSpec((await req.json()) as NextAppSpec);
  return Response.json({ ok: true });
}
