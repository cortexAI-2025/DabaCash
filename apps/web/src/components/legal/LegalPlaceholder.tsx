import Link from "next/link";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";

/** Shown until the legal texts are written and reviewed. Do not publish these pages as final. */
export function LegalPlaceholder({ title }: { title: string }) {
  return (
    <main className="min-h-screen">
      <Navbar />
      <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
        <h1 className="mb-6 text-3xl font-black text-dark-50">{title}</h1>
        <div className="card border-gold-500/30">
          <p className="text-dark-300">
            Ce document est en cours de rédaction. Il sera publié après validation juridique.
          </p>
          <p className="mt-4 text-sm text-dark-400">
            Pour toute question, écrivez-nous à{" "}
            <a className="text-gold-400 hover:underline" href="mailto:contact@dabacash.ma">contact@dabacash.ma</a>.
          </p>
        </div>
        <Link href="/" className="btn-ghost mt-8 inline-flex">Retour à l&apos;accueil</Link>
      </div>
      <Footer />
    </main>
  );
}
