import { Metadata } from "next";
import { Navbar } from "@/components/layout/Navbar";
import { MarketplaceView } from "@/components/marketplace/MarketplaceView";
import { Footer } from "@/components/layout/Footer";

export const metadata: Metadata = { title: "Marketplace" };

export default function MarketplacePage() {
  return (
    <main className="min-h-screen">
      <Navbar />
      <MarketplaceView />
      <Footer />
    </main>
  );
}
