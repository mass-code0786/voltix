import { AuthScreen } from "./auth-screen";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";

export default async function AuthPage() {
  const currentUser = await getCurrentUser();
  if (currentUser) redirect("/dashboard");

  return <AuthScreen />;
}
