import { getSession } from "@/lib/session";
import { getT } from "@/lib/prefs";
import { Card, Field } from "@/components/ui";
import { ActionForm } from "@/components/action-form";
import { signOutEverywhere, updateEmail, updatePassword } from "./actions";
import { SignOutEverywhere } from "./sign-out-everywhere";

export default async function AccountSettings() {
  const { user, role, membership } = await getSession();
  const t = await getT();
  const roleName = { owner: t("Owner"), admin: t("Admin"), staff: t("Staff") }[role];
  return (
    <>
      <Card>
        <div className="flex items-center gap-4">
          <div className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-accent-soft text-lg font-bold text-accent">
            {(user.email ?? "?").slice(0, 2).toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="truncate text-lg font-semibold">{user.email}</p>
            <p className="text-sm text-ink-2">{t("{role} of {business}", { role: roleName, business: membership.accounts?.name ?? "" })}</p>
          </div>
        </div>
      </Card>

      <Card title={t("Email")} description={t("We send a link to the new address. Your email changes once you open it.")}>
        <ActionForm action={updateEmail} submitLabel={t("Change email")} pendingLabel={t("Sending…")} done={t("Check your new inbox for the confirmation link")}>
          <Field label={t("New email")} name="email" type="email" required autoComplete="email" placeholder={user.email ?? ""} />
        </ActionForm>
      </Card>

      <Card title={t("Password")} description={t("At least 8 characters. Tablets stay signed in.")}>
        <ActionForm action={updatePassword} submitLabel={t("Change password")} pendingLabel={t("Saving…")} done={t("Password changed")} clearOnDone>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t("New password")} name="password" type="password" required minLength={8} autoComplete="new-password" />
            <Field label={t("Repeat new password")} name="confirm" type="password" required minLength={8} autoComplete="new-password" />
          </div>
        </ActionForm>
      </Card>

      <Card title={t("Sign out everywhere")} description={t("Signs this account out on every computer, phone and POS tablet, for example after using a shared computer or losing a tablet. Tablets signed in with this account must be set up again.")}>
        <SignOutEverywhere action={signOutEverywhere} />
      </Card>
    </>
  );
}
