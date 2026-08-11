import type { Metadata } from "next";
import { Caveat, Nunito } from "next/font/google";
import "./globals.css";

// 見出し用: Caveat — 手書き風の個性的な書体
const caveat = Caveat({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-heading",
  display: "swap",
});

// 本文用: Nunito — 丸みがあり可読性の高いサンセリフ
const nunito = Nunito({
  subsets: ["latin"],
  weight: ["400", "600", "700"],
  variable: "--font-body",
  display: "swap",
});

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
    <html lang="ja" className={`${caveat.variable} ${nunito.variable}`}>
      <body>{children}</body>
    </html>
  );
}
