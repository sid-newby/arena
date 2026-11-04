import { notFound } from "next/navigation";
import { getPageData, generateMetadata, generateStaticParams } from "@/lib/app";
import { WebsiteRenderer } from "./renderer";

export { generateMetadata, generateStaticParams };

export default async function Page({
  params,
}: {
  params: Promise<{ slug?: string[] }>;
}) {
  const data = await getPageData({ params });
  if (!data) notFound();
  return <WebsiteRenderer {...data} />;
}
