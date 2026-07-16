import { redirect } from "next/navigation";

export default function WalletPage() {
  redirect("/dashboard?view=wallet");
}
