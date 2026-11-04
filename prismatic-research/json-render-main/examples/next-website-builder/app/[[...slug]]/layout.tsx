"use client";

import { NextAppProvider } from "@json-render/next";
import { registry } from "@/lib/registry";

export default function WebsiteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <NextAppProvider registry={registry}>{children}</NextAppProvider>;
}
