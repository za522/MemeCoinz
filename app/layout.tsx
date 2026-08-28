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
    "Explore observed Solana memecoins, inspect point-in-time evidence, and audit every source, limitation, and research claim.",
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
      "Explore real coins, inspect point-in-time evidence, and audit the research behind every claim.",
    type: "website",
    siteName: "MemeTrace",
    images: [
      {
        url: "/og-v3.png",
        width: 1200,
        height: 630,
        alt: "MemeTrace: Real coins. Point-in-time evidence.",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "MemeTrace · Memecoin research without false certainty",
    description:
      "Explore real coins, inspect point-in-time evidence, and audit the research behind every claim.",
    images: ["/og-v3.png"],
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
