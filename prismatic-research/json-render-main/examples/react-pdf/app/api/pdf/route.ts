import { renderToBuffer } from "@json-render/react-pdf/render";
import { examples } from "@/lib/examples";
import type { Spec } from "@json-render/core";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const name = searchParams.get("name") ?? "invoice";
  const download = searchParams.get("download") === "1";

  const example = examples.find((e) => e.name === name);
  if (!example) {
    return new Response("Example not found", { status: 404 });
  }

  return pdfResponse(example.spec, name, download);
}

export async function POST(req: Request) {
  const { spec, download, filename } = (await req.json()) as {
    spec: Spec;
    download?: boolean;
    filename?: string;
  };

  if (!spec || !spec.root || !spec.elements) {
    return new Response("Invalid spec", { status: 400 });
  }

  return pdfResponse(spec, filename ?? "document", download ?? false);
}

async function pdfResponse(spec: Spec, name: string, download: boolean) {
  const buffer = await renderToBuffer(spec);

  const disposition = download
    ? `attachment; filename="${name}.pdf"`
    : `inline; filename="${name}.pdf"`;

  return new Response(buffer as unknown as ArrayBuffer, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": disposition,
      "Cache-Control": "no-store",
    },
  });
}
