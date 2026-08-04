import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "arttle",
  description: "ラクガキ対戦 arttle",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
