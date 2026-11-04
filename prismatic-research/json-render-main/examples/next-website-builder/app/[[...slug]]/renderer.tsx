"use client";

import { PageRenderer, type PageRendererProps } from "@json-render/next";

export function WebsiteRenderer(props: PageRendererProps) {
  return <PageRenderer {...props} />;
}
