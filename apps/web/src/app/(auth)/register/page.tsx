"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { authApi } from "@/lib/api";
import { setAuthTokens, getRoleRedirect } from "@/lib/auth";
import { Zap, Loader2 } from "lucide-react";
import toast from "react-hot-toast";

const schema = z.object({
  firstName: z.string().min(2, "Prénom requis"),
  lastName: z.string().min(2, "Nom requis"),
  email: z.string().email("Email invalide"),
  phone: z.string().optional(),
  password: z.string().min(8, "Minimum 8 caractères"),
  confirmPassword: z.string(),
}).refine((d) => d.password === d.confirmPassword, {
  message: "Les mots de passe ne correspondent pas",
  path: ["confirmPassword"],
});

type FormData = z.infer<typeof schema>;

export default function RegisterPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  const onSubmit = async (data: FormData) => {
    setLoading(true);
    try {
      const { data: auth } = await authApi.register({
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email,
        phone: data.phone,
        password: data.password,
      });
      setAuthTokens(auth.accessToken, auth.refreshToken);
      toast.success("Compte créé avec succès !");
      router.push(getRoleRedirect(auth.role as any));
    } catch (err: any) {
      toast.error(err.response?.data?.message ?? "Erreur lors de l'inscription");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-dark-950 px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <Link href="/" className="inline-flex items-center gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gold-500">
              <Zap className="h-6 w-6 text-dark-950" />
            </div>
            <span className="text-2xl font-black text-dark-50">
              Daba<span className="text-gold-400">Cash</span>
            </span>
          </Link>
          <h1 className="mt-6 text-2xl font-bold text-dark-50">Créer un compte</h1>
          <p className="mt-2 text-sm text-dark-400">Rejoignez la marketplace</p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="card space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Prénom</label>
              <input className="input" placeholder="Youssef" {...register("firstName")} />
              {errors.firstName && <p className="mt-1 text-xs text-red-400">{errors.firstName.message}</p>}
            </div>
            <div>
              <label className="label">Nom</label>
              <input className="input" placeholder="Benali" {...register("lastName")} />
              {errors.lastName && <p className="mt-1 text-xs text-red-400">{errors.lastName.message}</p>}
            </div>
          </div>

          <div>
            <label className="label">Email</label>
            <input type="email" className="input" placeholder="vous@exemple.com" {...register("email")} />
            {errors.email && <p className="mt-1 text-xs text-red-400">{errors.email.message}</p>}
          </div>

          <div>
            <label className="label">Téléphone (optionnel)</label>
            <input className="input" placeholder="+212 6xx xxx xxx" {...register("phone")} />
          </div>

          <div>
            <label className="label">Mot de passe</label>
            <input type="password" className="input" placeholder="••••••••" {...register("password")} />
            {errors.password && <p className="mt-1 text-xs text-red-400">{errors.password.message}</p>}
          </div>

          <div>
            <label className="label">Confirmer le mot de passe</label>
            <input type="password" className="input" placeholder="••••••••" {...register("confirmPassword")} />
            {errors.confirmPassword && <p className="mt-1 text-xs text-red-400">{errors.confirmPassword.message}</p>}
          </div>

          <button type="submit" className="btn-primary w-full justify-center" disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Créer mon compte"}
          </button>

          <p className="text-center text-sm text-dark-400">
            Déjà un compte ?{" "}
            <Link href="/login" className="text-gold-400 hover:underline font-medium">
              Se connecter
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
