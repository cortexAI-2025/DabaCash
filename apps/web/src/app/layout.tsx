import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: { default: "DabaCash – Marketplace Électronique", template: "%s | DabaCash" },
  description: "Achetez et vendez vos appareils électroniques reconditionnés au Maroc. Estimations instantanées, franchises locales, livraison nationale.",
  keywords: ["électronique", "reconditionné", "Maroc", "iPhone", "Samsung", "buyback"],
  openGraph: {
    title: "DabaCash",
    description: "La marketplace de l'électronique reconditionné au Maroc",
    type: "website",
    locale: "fr_MA",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" suppressHydrationWarning>
      <body className={`${inter.variable} font-sans`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
