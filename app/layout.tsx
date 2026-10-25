import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { RefCapture } from "@/components/RefCapture";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "My Office Bot",
  description: "Instant lead alerts for contractors: every website lead on your phone in seconds, and a reply in one tap.",
  appleWebApp: { capable: true, title: "My Office Bot", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#ffffff",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body>
        {children}
        <RefCapture />
      </body>
    </html>
  );
}
