import { Camera, DollarSign, MapPin, Package } from "lucide-react";

const steps = [
  {
    step: "01",
    icon: Camera,
    title: "Décrivez votre appareil",
    description: "Entrez le modèle et l'état de votre appareil pour obtenir une estimation instantanée.",
  },
  {
    step: "02",
    icon: DollarSign,
    title: "Recevez une offre",
    description: "Notre moteur IA calcule le meilleur prix d'achat basé sur le marché actuel.",
  },
  {
    step: "03",
    icon: MapPin,
    title: "Choisissez votre mode",
    description: "Déposez en franchise ou faites-vous récupérer à domicile – vous choisissez.",
  },
  {
    step: "04",
    icon: Package,
    title: "Soyez payé",
    description: "Validation en franchise et paiement immédiat. Simple, rapide, sécurisé.",
  },
];

export function HowItWorks() {
  return (
    <section className="py-24 bg-dark-900/50">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="mb-16 text-center">
          <h2 className="section-title mb-4">Comment ça marche ?</h2>
          <p className="text-dark-400">4 étapes pour vendre votre appareil au meilleur prix</p>
        </div>

        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map(({ step, icon: Icon, title, description }) => (
            <div key={step} className="relative">
              <div className="card text-center h-full">
                <div className="mb-4 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-gold-500/10 ring-1 ring-gold-500/20">
                  <Icon className="h-7 w-7 text-gold-400" />
                </div>
                <div className="mb-2 text-xs font-bold text-gold-500/60 tracking-widest uppercase">
                  Étape {step}
                </div>
                <h3 className="mb-3 text-lg font-bold text-dark-50">{title}</h3>
                <p className="text-sm text-dark-400 leading-relaxed">{description}</p>
              </div>
              {/* Connector line */}
              {step !== "04" && (
                <div className="absolute -right-4 top-1/2 hidden h-0.5 w-8 -translate-y-1/2 bg-gradient-to-r from-gold-500/40 to-transparent lg:block" />
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
