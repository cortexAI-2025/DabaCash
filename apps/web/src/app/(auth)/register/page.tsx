"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { authApi } from "@/lib/api";
import { setAuthTokens, getRoleRedirect, type UserRole } from "@/lib/auth";
import { Zap, Loader2 } from "lucide-react";
import toast from "react-hot-toast";
import { apiMessage } from "@/lib/errors";
import { Field } from "@/components/ui/Field";

const schema = z.object({
  firstName: z.string().min(2, "Prénom requis"),
  lastName: z.string().min(2, "Nom requis"),
  email: z.string().email("Email invalide"),
  phone: z.string().trim().regex(/^(\+?[0-9 ]{8,16})?$/, "Numéro de téléphone invalide").optional(),
  password: z.string().min(10, "Minimum 10 caractères").max(72, "72 caractères maximum")
    .regex(/[A-Za-z]/, "Au moins une lettre").regex(/\d/, "Au moins un chiffre"),
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
        ...(data.phone ? { phone: data.phone } : {}),
        password: data.password,
      });
      setAuthTokens(auth.accessToken, auth.refreshToken, auth.role as UserRole);
      toast.success("Compte créé avec succès !");
      router.push(getRoleRedirect(auth.role as any));
    } catch (err) {
      toast.error(apiMessage(err, "Erreur lors de l'inscription"));
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
            <Field label="Prénom" error={errors.firstName?.message}>
              {(p) => <input className="input" autoComplete="given-name" placeholder="Youssef" {...p} {...register("firstName")} />}
            </Field>
            <Field label="Nom" error={errors.lastName?.message}>
              {(p) => <input className="input" autoComplete="family-name" placeholder="Benali" {...p} {...register("lastName")} />}
            </Field>
          </div>
          <Field label="Email" error={errors.email?.message}>
            {(p) => <input type="email" className="input" autoComplete="email" placeholder="vous@exemple.com" {...p} {...register("email")} />}
          </Field>
          <Field label="Téléphone (optionnel)" error={errors.phone?.message}>
            {(p) => <input type="tel" className="input" autoComplete="tel" placeholder="+212 6xx xxx xxx" {...p} {...register("phone")} />}
          </Field>
          <Field label="Mot de passe" error={errors.password?.message} hint="10 caractères minimum, avec au moins une lettre et un chiffre.">
            {(p) => <input type="password" className="input" autoComplete="new-password" {...p} {...register("password")} />}
          </Field>
          <Field label="Confirmer le mot de passe" error={errors.confirmPassword?.message}>
            {(p) => <input type="password" className="input" autoComplete="new-password" {...p} {...register("confirmPassword")} />}
          </Field>

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
