import type { Metadata } from "next";
import { AdminConsole } from "@/components/admin/AdminConsole";
import { loadAdminData, requireAdmin } from "@/lib/server/admin";

export const metadata: Metadata = { title: "Admin — My Office Bot", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const me = await requireAdmin();
  const data = await loadAdminData();
  return <AdminConsole data={data} meId={me.id} meEmail={me.email ?? ""} />;
}
