import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "json-render devtools",
  description:
    "Interactive devtools demo: AI-streamed json-render specs, one renderer per chat message, all inspected by the floating panel.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
