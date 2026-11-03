"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { adminApi, citiesApi } from "@/lib/api";
import { apiMessage } from "@/lib/errors";
import { Field } from "@/components/ui/Field";

const phone = z.string().trim().regex(/^(\+?[0-9 ]{8,16})?$/, "Numéro invalide").optional();
const schema = z.object({
  name: z.string().trim().min(3, "3 caractères minimum").max(80),
  citySlug: z.string().min(1, "Choisissez une ville"),
  address: z.string().trim().min(5, "5 caractères minimum").max(200),
  phoneNumber: phone,
  commissionPercent: z.coerce.number().min(0, "0 % minimum").max(50, "50 % maximum"),
  ownerFirstName: z.string().trim().min(1, "Requis").max(60),
  ownerLastName: z.string().trim().min(1, "Requis").max(60),
  ownerEmail: z.string().trim().email("Email invalide"),
  ownerPhone: phone,
  ownerPassword: z.string().min(10, "10 caractères minimum").max(72).regex(/[A-Za-z]/, "Une lettre au moins").regex(/\d/, "Un chiffre au moins"),
});
type Form = z.input<typeof schema>;

export function CreateFranchiseForm({ onDone }: { onDone: () => void }) {
  const qc = useQueryClient();
  const cities = useQuery({ queryKey: ["cities"], queryFn: () => citiesApi.getAll().then((r) => r.data), staleTime: 3_600_000 });
  const { register, handleSubmit, formState: { errors } } = useForm<Form>({ resolver: zodResolver(schema), defaultValues: { commissionPercent: 15 } as Form });

  const create = useMutation({
    mutationFn: (d: z.output<typeof schema>) =>
      adminApi.createFranchise({
        name: d.name, citySlug: d.citySlug, address: d.address,
        ...(d.phoneNumber && { phoneNumber: d.phoneNumber }),
        commissionRate: Math.round(d.commissionPercent * 100) / 10000,
        owner: { email: d.ownerEmail, firstName: d.ownerFirstName, lastName: d.ownerLastName, password: d.ownerPassword, ...(d.ownerPhone && { phone: d.ownerPhone }) },
      }),
    onSuccess: () => { toast.success("Franchise créée. Transmettez le mot de passe provisoire au propriétaire par un canal sûr."); qc.invalidateQueries({ queryKey: ["admin-franchises"] }); onDone(); },
    onError: (e) => toast.error(apiMessage(e)),
  });

  return (
    <form className="card space-y-4" onSubmit={handleSubmit((d) => create.mutate(schema.parse(d)))} aria-label="Nouvelle franchise">
      <h2 className="text-lg font-bold text-dark-50">Nouvelle franchise</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Nom" error={errors.name?.message}>{(p) => <input className="input" {...p} {...register("name")} />}</Field>
        <Field label="Ville" error={errors.citySlug?.message}>{(p) => (
          <select className="input" {...p} {...register("citySlug")}><option value="">Choisir…</option>{cities.data?.map((c: any) => <option key={c.slug} value={c.slug}>{c.name}</option>)}</select>
        )}</Field>
        <Field label="Adresse" error={errors.address?.message}>{(p) => <input className="input" {...p} {...register("address")} />}</Field>
        <Field label="Téléphone" error={errors.phoneNumber?.message}>{(p) => <input type="tel" className="input" {...p} {...register("phoneNumber")} />}</Field>
        <Field label="Commission (%)" error={errors.commissionPercent?.message} hint="Entre 0 et 50 %.">{(p) => <input type="number" step="0.5" className="input" {...p} {...register("commissionPercent")} />}</Field>
      </div>
      <h3 className="pt-2 text-sm font-semibold text-dark-200">Compte du propriétaire</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Prénom" error={errors.ownerFirstName?.message}>{(p) => <input className="input" {...p} {...register("ownerFirstName")} />}</Field>
        <Field label="Nom" error={errors.ownerLastName?.message}>{(p) => <input className="input" {...p} {...register("ownerLastName")} />}</Field>
        <Field label="Email" error={errors.ownerEmail?.message}>{(p) => <input type="email" className="input" autoComplete="off" {...p} {...register("ownerEmail")} />}</Field>
        <Field label="Téléphone" error={errors.ownerPhone?.message}>{(p) => <input type="tel" className="input" {...p} {...register("ownerPhone")} />}</Field>
        <Field label="Mot de passe provisoire" error={errors.ownerPassword?.message} hint="10 caractères minimum, lettre et chiffre. Le propriétaire devra le changer.">{(p) => <input type="password" className="input" autoComplete="new-password" {...p} {...register("ownerPassword")} />}</Field>
      </div>
      <div className="flex justify-end gap-2">
        <button type="button" className="btn-ghost" onClick={onDone}>Annuler</button>
        <button className="btn-primary" disabled={create.isPending}>Créer la franchise</button>
      </div>
    </form>
  );
}
