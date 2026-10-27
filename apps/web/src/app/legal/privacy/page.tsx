import { Metadata } from "next";
import { LegalPlaceholder } from "@/components/legal/LegalPlaceholder";

export const metadata: Metadata = { title: "Politique de confidentialité" };

export default function Page() {
  return <LegalPlaceholder title="Politique de confidentialité" />;
}
