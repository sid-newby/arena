import { Playground } from "@/components/playground";
import { pageMetadata } from "@/lib/page-metadata";

export const metadata = pageMetadata("playground");

export default function PlaygroundPage() {
  return <Playground />;
}
