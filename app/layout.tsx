import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "MemeTrace · Point-in-time memecoin research",
    template: "%s · MemeTrace",
  },
  description:
    "A research-grade console for replaying Pump.fun launches across flow, liquidity, ownership, coordination, narrative, regime, execution, and evidence fidelity.",
  applicationName: "MemeTrace",
  keywords: [
    "memecoin research",
    "Pump.fun",
    "Solana",
    "historical replay",
    "on-chain analysis",
  ],
  openGraph: {
    title: "MemeTrace · Could this have been known?",
    description:
      "Point-in-time evidence, executable outcomes, and honest source fidelity for memecoin research.",
    type: "website",
    siteName: "MemeTrace",
    images: [
      {
        url: "/og.png",
        width: 1731,
        height: 909,
        alt: "MemeTrace: Could this have been known? Point-in-time memecoin research.",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "MemeTrace · Could this have been known?",
    description:
      "Point-in-time evidence, executable outcomes, and honest source fidelity for memecoin research.",
    images: ["/og.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable}`}>
        {children}
      </body>
    </html>
  );
}
