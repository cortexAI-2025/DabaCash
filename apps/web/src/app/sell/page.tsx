import { Metadata } from "next";
import { Navbar } from "@/components/layout/Navbar";
import { SellFlow } from "@/components/marketplace/SellFlow";
import { Footer } from "@/components/layout/Footer";

export const metadata: Metadata = { title: "Vendre mon appareil" };

export default function SellPage() {
  return (
    <main className="min-h-screen">
      <Navbar />
      <SellFlow />
      <Footer />
    </main>
  );
}
