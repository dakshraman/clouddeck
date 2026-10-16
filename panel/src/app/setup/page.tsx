import { redirect } from "next/navigation";
import { SetupForm } from "@/components/setup-form";
import { isSetupComplete } from "@/lib/users";

export const dynamic = "force-dynamic";

export default function SetupPage() {
  if (isSetupComplete()) {
    redirect("/");
  }
  return <SetupForm />;
}
