import type { Metadata } from "next";
import "./globals.css";

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
      <head>
        <link
          rel="stylesheet"
          href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
        />
      </head>
      <body className="text-gray-900 pt-10">{children}</body>
    </html>
  );
}
