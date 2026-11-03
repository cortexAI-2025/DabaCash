import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 px-4 text-center">
      <p className="text-6xl font-black text-gold-400">404</p>
      <h1 className="text-2xl font-black text-dark-50">Page introuvable</h1>
      <p className="text-dark-400">Cette page n&apos;existe pas ou a été déplacée.</p>
      <Link href="/" className="btn-primary">Retour à l&apos;accueil</Link>
    </main>
  );
}
