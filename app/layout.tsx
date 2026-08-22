import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "레드작 손익 계산기",
  description: "상품권 할인, 경매장 수수료, 마일리지를 반영해 레드작의 실제 현금 효율과 메소 직구 대비 손익을 계산합니다.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
