import { createNextApp } from "@json-render/next/server";
import { getSpec } from "./spec-store";

export const { getPageData, generateMetadata, generateStaticParams } =
  createNextApp({
    spec: () => getSpec(),
  });
