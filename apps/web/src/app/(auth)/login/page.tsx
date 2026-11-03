"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { authApi } from "@/lib/api";
import { setAuthTokens, getRoleRedirect, type UserRole } from "@/lib/auth";
import { Zap, Eye, EyeOff, Loader2 } from "lucide-react";
import toast from "react-hot-toast";
import { apiMessage } from "@/lib/errors";
import { Field } from "@/components/ui/Field";

const schema = z.object({
  email: z.string().email("Email invalide"),
  password: z.string().min(1, "Mot de passe requis"),
});

type FormData = z.infer<typeof schema>;

// Only same-site relative paths: never redirect to an external URL taken from the query string.
function safeNext(): string | null {
  const next = new URLSearchParams(window.location.search).get("next");
  return next && next.startsWith("/") && !next.startsWith("//") ? next : null;
}

export default function LoginPage() {
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  const onSubmit = async (data: FormData) => {
    setLoading(true);
    try {
      const { data: auth } = await authApi.login(data.email, data.password);
      setAuthTokens(auth.accessToken, auth.refreshToken, auth.role as UserRole);
      toast.success("Connexion réussie !");
      router.push(safeNext() ?? getRoleRedirect(auth.role as UserRole));
    } catch (err) {
      // 401 carries the server's generic message; 429 (lockout / throttle) gets the "wait" message.
      toast.error(apiMessage(err, "Email ou mot de passe incorrect"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-dark-950 px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="mb-8 text-center">
          <Link href="/" className="inline-flex items-center gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gold-500">
              <Zap className="h-6 w-6 text-dark-950" />
            </div>
            <span className="text-2xl font-black text-dark-50">
              Daba<span className="text-gold-400">Cash</span>
            </span>
          </Link>
          <h1 className="mt-6 text-2xl font-bold text-dark-50">Connexion</h1>
          <p className="mt-2 text-sm text-dark-400">Accédez à votre espace personnel</p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="card space-y-4">
          <Field label="Email" error={errors.email?.message}>
            {(p) => <input type="email" className="input" autoComplete="email" placeholder="vous@exemple.com" {...p} {...register("email")} />}
          </Field>
          <Field label="Mot de passe" error={errors.password?.message}>
            {(p) => (
              <div className="relative">
                <input type={showPassword ? "text" : "password"} className="input pr-10" autoComplete="current-password" {...p} {...register("password")} />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-dark-400 hover:text-dark-200"
                  aria-label={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />}
                </button>
              </div>
            )}
          </Field>

          <button type="submit" className="btn-primary w-full justify-center" disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Se connecter"}
          </button>

          <p className="text-center text-sm text-dark-400">
            Pas encore de compte ?{" "}
            <Link href="/register" className="text-gold-400 hover:underline font-medium">
              S&apos;inscrire
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
