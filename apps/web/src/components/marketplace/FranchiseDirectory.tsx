"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, MapPin, Phone } from "lucide-react";
import { citiesApi, franchiseApi } from "@/lib/api";
import { cn } from "@/lib/utils";

export function FranchiseDirectory() {
  const [city, setCity] = useState("");

  const { data: cities } = useQuery({
    queryKey: ["cities"],
    queryFn: () => citiesApi.getAll().then((r) => r.data),
    staleTime: 60 * 60_000,
  });
  const { data: franchises, isLoading } = useQuery({
    queryKey: ["franchises"],
    queryFn: () => franchiseApi.getAll().then((r) => r.data),
  });

  const shown = (franchises ?? []).filter((f: any) => !city || f.cityRef?.slug === city);

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <h1 className="mb-2 text-3xl font-black text-dark-50">Nos franchises</h1>
      <p className="mb-6 text-dark-400">Présents dans les 10 principales villes du Maroc</p>

      <div className="mb-8 flex gap-2 overflow-x-auto pb-1">
        {[{ slug: "", name: "Toutes" }, ...(cities ?? [])].map((c: any) => (
          <button
            key={c.slug}
            onClick={() => setCity(c.slug)}
            className={cn(
              "whitespace-nowrap rounded-full border px-4 py-2 text-sm font-medium transition-all",
              city === c.slug ? "border-gold-500 bg-gold-500/10 text-gold-400" : "border-dark-700 bg-dark-800 text-dark-300"
            )}
          >
            {c.name}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-gold-500" /></div>
      ) : shown.length === 0 ? (
        <p className="py-20 text-center text-dark-400">Aucune franchise dans cette ville pour le moment.</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((f: any) => (
            <div key={f.id} className="card">
              <h2 className="font-bold text-dark-50">{f.name}</h2>
              <p className="mt-2 flex items-start gap-2 text-sm text-dark-400">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-gold-400" />
                {f.address}, {f.city}
              </p>
              {f.phoneNumber && (
                <a href={`tel:${f.phoneNumber}`} className="mt-2 flex items-center gap-2 text-sm text-dark-300 hover:text-gold-400">
                  <Phone className="h-4 w-4 text-gold-400" /> {f.phoneNumber}
                </a>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
