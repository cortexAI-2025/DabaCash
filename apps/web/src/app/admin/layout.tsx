import { AdminSidebar } from "@/components/admin/AdminSidebar";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-dark-950 lg:flex-row">
      <AdminSidebar />
      <div className="flex-1 min-w-0">
        <main className="p-4 sm:p-6 lg:p-8 max-w-6xl">{children}</main>
      </div>
    </div>
  );
}
