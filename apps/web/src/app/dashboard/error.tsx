"use client";

import Link from "next/link";
import { useEffect } from "react";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error(error); }, [error]);
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 px-4 text-center">
      <h1 className="text-2xl font-black text-dark-50">Quelque chose s&apos;est mal passé</h1>
      <p className="max-w-md text-dark-400">Une erreur inattendue est survenue. Vous pouvez réessayer ; si le problème persiste, revenez plus tard.</p>
      <div className="flex gap-3">
        <button className="btn-primary" onClick={reset}>Réessayer</button>
        <Link className="btn-secondary" href="/">Accueil</Link>
      </div>
    </main>
  );
}
