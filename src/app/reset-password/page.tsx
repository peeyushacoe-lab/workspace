import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { ResetPasswordForm } from "./ResetPasswordForm";

export default async function ResetPasswordPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="text-xs font-bold text-accent tracking-widest uppercase mb-4">
            CyberSage Workspace
          </div>
          <h1 className="text-2xl font-bold text-foreground mb-2">
            {user.mustResetPassword ? "Set Your Password" : "Change Password"}
          </h1>
          <p className="text-muted text-sm">
            {user.mustResetPassword
              ? "Welcome! Please create a new password for your account."
              : "Update your account password below."}
          </p>
        </div>

        <ResetPasswordForm isForcedReset={!!user.mustResetPassword} />
      </div>
    </div>
  );
}
