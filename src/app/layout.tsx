import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SI Stilist",
  description: "Kiyim do'konlari uchun SI stilist va talab analitikasi",
};

// Shriftlar tizimdan olinadi: demo internetsiz ham bir xil ko'rinadi
export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="uz" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
