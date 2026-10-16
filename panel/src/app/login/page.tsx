import { redirect } from "next/navigation";
import { LoginForm } from "@/components/login-form";
import { isSetupComplete } from "@/lib/users";

export const dynamic = "force-dynamic";

export default function LoginPage() {
  if (!isSetupComplete()) {
    redirect("/setup");
  }
  return <LoginForm />;
}
