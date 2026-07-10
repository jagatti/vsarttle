import type { Metadata } from "next";
import "./globals.css";
import { OptionsPanel } from "@/components/Options/OptionsPanel";

export const metadata: Metadata = {
  title: "arttle",
  description: "ラクガキ王国風オンライン対戦ゲーム",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body>
        {children}
        <OptionsPanel />
      </body>
    </html>
  );
}
