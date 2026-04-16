import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "USDT Verification",
  description: "Secure USDT asset verification portal",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full">
      <body className="min-h-full flex flex-col bg-[#0d0d0d] text-white">
        {children}
      </body>
    </html>
  );
}
