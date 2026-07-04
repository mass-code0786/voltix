import AdminShell from "@/components/admin-shell";
import { getCurrentAdmin } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function AdminPage(){
  const admin = await getCurrentAdmin();
  if (admin.response) redirect("/");
  return <AdminShell/>;
}
