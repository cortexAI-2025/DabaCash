import { Metadata } from "next";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { MyOrders } from "@/components/orders/MyOrders";

export const metadata: Metadata = { title: "Mes commandes" };

export default function OrdersPage() {
  return (
    <main className="min-h-screen">
      <Navbar />
      <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
        <h1 className="mb-8 text-3xl font-black text-dark-50">Mes commandes</h1>
        <MyOrders />
      </div>
      <Footer />
    </main>
  );
}
