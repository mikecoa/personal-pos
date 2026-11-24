import { useState } from "react";
import { resetDevice, unsentCount } from "../lib/store";
import { Confirm } from "../ui/kit";
import { t } from "../lib/i18n";

/**
 * Reset / sign out this tablet, asked in the app's own pop-ups. When records haven't reached the
 * server yet, a second question makes sure deleting them is meant.
 */
export function ResetFlow({ kind, onClose }: { kind: "reset" | "signout"; onClose: () => void }) {
  const [unsent] = useState(unsentCount);
  const [step, setStep] = useState<1 | 2>(1);
  const reset = () => { onClose(); void resetDevice(); };
  const signout = kind === "signout";
  if (step === 1) {
    return (
      <Confirm danger title={signout ? t("Sign out this tablet?") : t("Reset this tablet?")}
        body={unsent
          ? t("{unsent} sale(s), shift(s) or refund(s) have NOT reached the server and will be lost forever. Connect to the internet and let it sync first if you can.", { unsent })
          : signout ? t("Everything is uploaded. The owner or an admin must sign in again to set this tablet up.")
            : t("Everything is uploaded. The owner or an admin must sign in again to set it up.")}
        cancelLabel={t("Cancel")}
        confirmLabel={unsent ? (signout ? t("Delete {unsent} and sign out", { unsent }) : t("Delete {unsent} and reset", { unsent })) : signout ? t("Sign out") : t("Reset")}
        onCancel={onClose} onConfirm={() => (unsent ? setStep(2) : reset())} />
    );
  }
  return (
    <Confirm danger title={t("Are you sure?")} body={t("This permanently deletes {unsent} unsent record(s).", { unsent })}
      cancelLabel={t("Keep them")} confirmLabel={signout ? t("Delete and sign out") : t("Delete and reset")}
      onCancel={onClose} onConfirm={reset} />
  );
}
