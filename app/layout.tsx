import type { Metadata } from "next";
import "./globals.css";
import "leaflet/dist/leaflet.css";

export const metadata: Metadata = {
  title: "石巻の生き物図鑑",
  description: "石巻の生き物を記録する図鑑アプリ",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja">
      <head />
      <body className="text-gray-900 pt-10">{children}</body>
    </html>
  );
}
