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
    default: "MemeTrace · Memecoin research without false certainty",
    template: "%s · MemeTrace",
  },
  description:
    "Find a Solana coin, inspect point-in-time evidence, and audit every source, limitation, and research claim.",
  applicationName: "MemeTrace",
  keywords: [
    "memecoin research",
    "Pump.fun",
    "Solana",
    "historical replay",
    "on-chain analysis",
  ],
  openGraph: {
    title: "MemeTrace · Memecoin research without false certainty",
    description:
      "Find a coin, understand the evidence, and audit the research behind every claim.",
    type: "website",
    siteName: "MemeTrace",
    images: [
      {
        url: "/og-v2.png",
        width: 1200,
        height: 630,
        alt: "MemeTrace: Know what was known. Point-in-time memecoin research.",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "MemeTrace · Memecoin research without false certainty",
    description:
      "Find a coin, understand the evidence, and audit the research behind every claim.",
    images: ["/og-v2.png"],
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
