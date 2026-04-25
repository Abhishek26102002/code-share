import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Code Share",
  description: "Share code securely through a live room link."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-background text-foreground">{children}</body>
    </html>
  );
}
