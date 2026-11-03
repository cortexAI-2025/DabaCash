"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import toast from "react-hot-toast";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { Field } from "@/components/ui/Field";
import { QueryState } from "@/components/ui/QueryState";
import { Pager } from "@/components/ui/Pager";
import { buybackApi, usersApi } from "@/lib/api";
import { apiMessage } from "@/lib/errors";
import { clearAuthTokens } from "@/lib/auth";
import { formatDate, formatPrice } from "@/lib/utils";

const BUYBACK_STATUS: Record<string, string> = { PENDING: "En attente d'examen", ACCEPTED: "Acceptée", REJECTED: "Refusée", COMPLETED: "Finalisée", CANCELLED: "Annulée" };

// ─── profile ────────────────────────────────────────────────────────────────
const profileSchema = z.object({
  firstName: z.string().trim().min(1, "Prénom requis").max(60),
  lastName: z.string().trim().min(1, "Nom requis").max(60),
  phone: z.string().trim().regex(/^(\+?[0-9 ]{8,16})?$/, "Numéro de téléphone invalide").optional(),
});
type Profile = z.infer<typeof profileSchema>;

function ProfileCard() {
  const qc = useQueryClient();
  const me = useQuery({ queryKey: ["me"], queryFn: () => usersApi.getMe().then((r) => r.data) });
  const { register, handleSubmit, formState: { errors, isDirty } } = useForm<Profile>({
    resolver: zodResolver(profileSchema),
    values: me.data ? { firstName: me.data.firstName, lastName: me.data.lastName, phone: me.data.phone ?? "" } : undefined,
  });
  const save = useMutation({
    mutationFn: (d: Profile) => usersApi.updateMe({ firstName: d.firstName, lastName: d.lastName, ...(d.phone && { phone: d.phone }) }),
    onSuccess: () => { toast.success("Profil mis à jour"); qc.invalidateQueries({ queryKey: ["me"] }); },
    onError: (e) => toast.error(apiMessage(e)),
  });
  return (
    <section className="card" aria-labelledby="profile-h">
      <h2 id="profile-h" className="mb-4 text-lg font-bold text-dark-50">Profil</h2>
      <QueryState isLoading={me.isLoading} isError={me.isError} error={me.error} onRetry={() => me.refetch()}>
        <form onSubmit={handleSubmit((d) => save.mutate(d))} className="space-y-4">
          <p className="text-sm text-dark-400">{me.data?.email}</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Prénom" error={errors.firstName?.message}>{(p) => <input className="input" autoComplete="given-name" {...p} {...register("firstName")} />}</Field>
            <Field label="Nom" error={errors.lastName?.message}>{(p) => <input className="input" autoComplete="family-name" {...p} {...register("lastName")} />}</Field>
          </div>
          <Field label="Téléphone" error={errors.phone?.message}>{(p) => <input type="tel" className="input" autoComplete="tel" {...p} {...register("phone")} />}</Field>
          <button className="btn-primary" disabled={!isDirty || save.isPending}>Enregistrer</button>
        </form>
      </QueryState>
    </section>
  );
}

// ─── password ───────────────────────────────────────────────────────────────
const pwSchema = z.object({
  currentPassword: z.string().min(1, "Mot de passe actuel requis"),
  newPassword: z.string().min(10, "Minimum 10 caractères").max(72, "72 caractères maximum").regex(/[A-Za-z]/, "Au moins une lettre").regex(/\d/, "Au moins un chiffre"),
});
type Pw = z.infer<typeof pwSchema>;

function PasswordCard() {
  const router = useRouter();
  const { register, handleSubmit, reset, formState: { errors } } = useForm<Pw>({ resolver: zodResolver(pwSchema) });
  const change = useMutation({
    mutationFn: (d: Pw) => usersApi.changePassword(d.currentPassword, d.newPassword),
    onSuccess: () => {
      // The server signs every device out on a password change.
      toast.success("Mot de passe modifié. Reconnectez-vous.");
      reset();
      clearAuthTokens();
      router.push("/login");
    },
    onError: (e) => toast.error(apiMessage(e)),
  });
  return (
    <section className="card" aria-labelledby="pw-h">
      <h2 id="pw-h" className="mb-4 text-lg font-bold text-dark-50">Mot de passe</h2>
      <form onSubmit={handleSubmit((d) => change.mutate(d))} className="space-y-4">
        <Field label="Mot de passe actuel" error={errors.currentPassword?.message}>{(p) => <input type="password" className="input" autoComplete="current-password" {...p} {...register("currentPassword")} />}</Field>
        <Field label="Nouveau mot de passe" error={errors.newPassword?.message} hint="10 caractères minimum, avec une lettre et un chiffre. Tous vos appareils seront déconnectés.">
          {(p) => <input type="password" className="input" autoComplete="new-password" {...p} {...register("newPassword")} />}
        </Field>
        <button className="btn-primary" disabled={change.isPending}>Changer le mot de passe</button>
      </form>
    </section>
  );
}

// ─── my buyback requests ────────────────────────────────────────────────────
function BuybacksCard() {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const q = useQuery({ queryKey: ["my-buybacks", page], queryFn: () => buybackApi.getMy({ page, limit: 5 }).then((r) => r.data) });
  const cancel = useMutation({
    mutationFn: (id: string) => buybackApi.cancel(id),
    onSuccess: () => { toast.success("Demande annulée"); qc.invalidateQueries({ queryKey: ["my-buybacks"] }); },
    onError: (e) => toast.error(apiMessage(e)),
  });
  return (
    <section className="card" aria-labelledby="bb-h">
      <h2 id="bb-h" className="mb-4 text-lg font-bold text-dark-50">Mes demandes de rachat</h2>
      <QueryState isLoading={q.isLoading} isError={q.isError} error={q.error} isEmpty={q.data?.items.length === 0} emptyTitle="Aucune demande de rachat" onRetry={() => q.refetch()}>
        <ul className="divide-y divide-dark-800">
          {q.data?.items.map((b: any) => (
            <li key={b.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div>
                <p className="font-medium text-dark-100">{b.model?.brand?.name} {b.model?.name} · état {b.condition}</p>
                <p className="text-xs text-dark-400">{formatDate(b.createdAt)} · {BUYBACK_STATUS[b.status] ?? b.status}
                  {b.finalBuybackPrice != null ? ` · prix final ${formatPrice(b.finalBuybackPrice)}` : ""}</p>
                {b.franchiseNotes && <p className="mt-1 text-xs italic text-dark-400">« {b.franchiseNotes} »</p>}
              </div>
              {b.status === "PENDING" && (
                <button className="btn-secondary px-3 py-1.5 text-xs" disabled={cancel.isPending}
                  onClick={() => { if (window.confirm("Annuler cette demande ?")) cancel.mutate(b.id); }}>Annuler</button>
              )}
            </li>
          ))}
        </ul>
        {q.data && <Pager page={page} totalPages={q.data.pagination.totalPages} onChange={setPage} />}
      </QueryState>
    </section>
  );
}

// ─── notifications ──────────────────────────────────────────────────────────
function NotificationsCard() {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const q = useQuery({ queryKey: ["notifications", page], queryFn: () => usersApi.getNotifications({ page, limit: 10 }).then((r) => r.data) });
  const refresh = () => { qc.invalidateQueries({ queryKey: ["notifications"] }); qc.invalidateQueries({ queryKey: ["notifications-badge"] }); };
  const readAll = useMutation({ mutationFn: () => usersApi.markAllRead(), onSuccess: refresh, onError: (e) => toast.error(apiMessage(e)) });
  const readOne = useMutation({ mutationFn: (id: string) => usersApi.markRead(id), onSuccess: refresh });
  return (
    <section className="card" id="notifications" aria-labelledby="nt-h">
      <div className="mb-4 flex items-center justify-between">
        <h2 id="nt-h" className="text-lg font-bold text-dark-50">Notifications{q.data?.unread ? ` (${q.data.unread} non lues)` : ""}</h2>
        {!!q.data?.unread && <button className="btn-ghost text-xs" onClick={() => readAll.mutate()}>Tout marquer comme lu</button>}
      </div>
      <QueryState isLoading={q.isLoading} isError={q.isError} error={q.error} isEmpty={q.data?.items.length === 0} emptyTitle="Aucune notification" onRetry={() => q.refetch()}>
        <ul className="divide-y divide-dark-800">
          {q.data?.items.map((n: any) => (
            <li key={n.id} className="py-3">
              <button className="w-full text-left" onClick={() => !n.isRead && readOne.mutate(n.id)}>
                <p className={n.isRead ? "text-dark-300" : "font-semibold text-dark-50"}>{!n.isRead && <span className="mr-2 inline-block h-2 w-2 rounded-full bg-gold-400" aria-label="non lue" />}{n.title}</p>
                <p className="text-sm text-dark-400">{n.body}</p>
                <p className="mt-0.5 text-xs text-dark-500">{formatDate(n.createdAt)}</p>
              </button>
            </li>
          ))}
        </ul>
        {q.data && <Pager page={page} totalPages={q.data.pagination.totalPages} onChange={setPage} />}
      </QueryState>
    </section>
  );
}

// ─── privacy: export & erasure ──────────────────────────────────────────────
function PrivacyCard() {
  const router = useRouter();
  const qc = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const [password, setPassword] = useState("");

  const exportData = useMutation({
    mutationFn: () => usersApi.exportData(),
    onSuccess: ({ data }) => {
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
      const a = Object.assign(document.createElement("a"), { href: url, download: "dabacash-mes-donnees.json" });
      a.click();
      URL.revokeObjectURL(url);
    },
    onError: (e) => toast.error(apiMessage(e)),
  });
  const erase = useMutation({
    mutationFn: () => usersApi.deleteMe(password),
    onSuccess: () => { toast.success("Compte supprimé."); clearAuthTokens(); qc.clear(); router.push("/"); },
    onError: (e) => toast.error(apiMessage(e)),
  });

  return (
    <section className="card" aria-labelledby="pv-h">
      <h2 id="pv-h" className="mb-2 text-lg font-bold text-dark-50">Mes données</h2>
      <p className="mb-4 text-sm text-dark-400">Vous pouvez télécharger les données que nous détenons sur vous, ou supprimer votre compte. La suppression anonymise votre profil ; les commandes et traces comptables sont conservées sous forme dépersonnalisée.</p>
      <div className="flex flex-wrap gap-3">
        <button className="btn-secondary" onClick={() => exportData.mutate()} disabled={exportData.isPending}>Télécharger mes données</button>
        {!confirming && <button className="btn-secondary text-red-400" onClick={() => setConfirming(true)}>Supprimer mon compte</button>}
      </div>
      {confirming && (
        <div className="mt-4 space-y-3 rounded-xl border border-red-500/30 bg-red-500/5 p-4">
          <Field label="Confirmez avec votre mot de passe" hint="Cette action est irréversible.">
            {(p) => <input type="password" className="input" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} {...p} />}
          </Field>
          <div className="flex justify-end gap-2">
            <button className="btn-ghost" onClick={() => { setConfirming(false); setPassword(""); }}>Annuler</button>
            <button className="btn-primary bg-red-500 text-white hover:bg-red-400" disabled={!password || erase.isPending} onClick={() => erase.mutate()}>Supprimer définitivement</button>
          </div>
        </div>
      )}
    </section>
  );
}

export default function AccountPage() {
  return (
    <main className="min-h-screen">
      <Navbar />
      <div className="mx-auto max-w-3xl space-y-6 px-4 py-10 sm:px-6">
        <h1 className="text-3xl font-black text-dark-50">Mon compte</h1>
        <ProfileCard />
        <NotificationsCard />
        <BuybacksCard />
        <PasswordCard />
        <PrivacyCard />
      </div>
      <Footer />
    </main>
  );
}
