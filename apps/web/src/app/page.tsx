import { Navbar } from "@/components/layout/Navbar";
import { HeroSection } from "@/components/layout/HeroSection";
import { FeaturedListings } from "@/components/marketplace/FeaturedListings";
import { HowItWorks } from "@/components/layout/HowItWorks";
import { PriceEstimator } from "@/components/marketplace/PriceEstimator";
import { Footer } from "@/components/layout/Footer";

export default function HomePage() {
  return (
    <main className="min-h-screen">
      <Navbar />
      <HeroSection />
      <FeaturedListings />
      <HowItWorks />
      <PriceEstimator />
      <Footer />
    </main>
  );
}
