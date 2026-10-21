import { Suspense } from "react";
import { Navbar } from "@/components/layout/Navbar";
import { PaymentResult } from "@/components/payment/PaymentResult";

export default function PaymentResultPage() {
  return (
    <main className="min-h-screen">
      <Navbar />
      <Suspense fallback={null}>
        <PaymentResult />
      </Suspense>
    </main>
  );
}
