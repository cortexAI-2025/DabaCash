import { Metadata } from "next";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { FranchiseDirectory } from "@/components/marketplace/FranchiseDirectory";

export const metadata: Metadata = { title: "Nos franchises" };

export default function FranchisesPage() {
  return (
    <main className="min-h-screen">
      <Navbar />
      <FranchiseDirectory />
      <Footer />
    </main>
  );
}
