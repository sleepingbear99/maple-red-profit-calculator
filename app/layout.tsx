import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "레드작 손익 계산기",
  description: "상품권 할인과 경매장 수수료를 반영하고, 적립 크레딧의 추가 가치까지 계산하는 레드작 손익 도구입니다.",
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
