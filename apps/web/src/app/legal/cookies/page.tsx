import { Metadata } from "next";
import { LegalPlaceholder } from "@/components/legal/LegalPlaceholder";

export const metadata: Metadata = { title: "Politique cookies" };

export default function Page() {
  return <LegalPlaceholder title="Politique cookies" />;
}
