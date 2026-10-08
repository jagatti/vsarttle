import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./battle-effects.css";

export const metadata: Metadata = {
  title: "arttle",
  description: "ラクガキ対戦 arttle",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <head>
        <link rel="preload" as="image" href="/arttle_back/title.png" />
      </head>
      <body>{children}</body>
    </html>
  );
}
