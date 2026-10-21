import { Suspense } from "react";
import { Metadata } from "next";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { ListingView } from "@/components/marketplace/ListingView";

export const metadata: Metadata = { title: "Détail du produit" };

// Query-param route (/listing?id=…) instead of /marketplace/[id]: works with the
// static export used for the Capacitor APK, which can't pre-render unknown ids.
export default function ListingPage() {
  return (
    <main className="min-h-screen">
      <Navbar />
      <Suspense fallback={null}>
        <ListingView />
      </Suspense>
      <Footer />
    </main>
  );
}
