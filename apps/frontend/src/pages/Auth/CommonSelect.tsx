import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../lib/api";

type Role =
  | "SYSTEMADMIN"
  | "ADMIN"
  | "FRONTDESK"
  | "MICRO"
  | "MC"
  | "CHEMISTRY"
  | "QA"
  | "CLIENT";

type CommonPerson = {
  id: string;
  name: string;
  emailMasked?: string;
  roles: Role[];
};

export default function CommonSelect() {
  const nav = useNavigate();

  const challengeToken = sessionStorage.getItem("commonChallengeToken");
  const accountLabel =
    sessionStorage.getItem("commonAccountLabel") || "Lab Common Account";

  const [people, setPeople] = useState<CommonPerson[]>([]);
  const [personId, setPersonId] = useState("");
  const [role, setRole] = useState<Role | "">("");
  const [busy, setBusy] = useState(false);
  const [banner, setBanner] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  useEffect(() => {
    const raw = sessionStorage.getItem("commonPeople");
    if (!challengeToken || !raw) {
      nav("/home", { replace: true });
      return;
    }

    try {
      const parsed = JSON.parse(raw) as CommonPerson[];
      setPeople(parsed);
    } catch {
      nav("/home", { replace: true });
    }
  }, [challengeToken, nav]);

  const selectedPerson = useMemo(
    () => people.find((p) => p.id === personId),
    [people, personId],
  );

  const availableRoles = selectedPerson?.roles ?? [];

  useEffect(() => {
    if (role && !availableRoles.includes(role)) {
      setRole("");
    }
  }, [availableRoles, role]);

  const onContinue = async () => {
    setBanner(null);

    if (!challengeToken || !personId || !role) {
      setBanner({
        type: "error",
        text: "Please select your name and role.",
      });
      return;
    }

    try {
      setBusy(true);

      const res = await api<{
        requiresTwoFactor?: boolean;
        pendingToken?: string;
        expiresAt?: string;
      }>("/auth/common/select", {
        method: "POST",
        body: JSON.stringify({
          challengeToken,
          personId,
          role,
        }),
      });

      if (!res.requiresTwoFactor || !res.pendingToken) {
        setBanner({
          type: "error",
          text: "Unable to start verification. Please sign in again.",
        });
        return;
      }

      sessionStorage.setItem("pendingCommonToken", res.pendingToken);
      sessionStorage.removeItem("pendingUserId");

      if (res.expiresAt) {
        const t = Date.parse(res.expiresAt);
        if (!Number.isNaN(t)) {
          sessionStorage.setItem("otpExpiresAt", String(t));
        }
      }

      sessionStorage.removeItem("otpCooldownUntil");

      nav("/auth/verify-2fa", { replace: true });
    } catch (err: any) {
      const msg =
        err?.body?.message || "Unable to continue. Please sign in again.";
      setBanner({ type: "error", text: String(msg) });
    } finally {
      setBusy(false);
    }
  };

  const onBack = () => {
    sessionStorage.removeItem("commonChallengeToken");
    sessionStorage.removeItem("commonPeople");
    sessionStorage.removeItem("commonAccountLabel");
    sessionStorage.removeItem("pendingCommonToken");
    nav("/home", { replace: true });
  };

  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-sm ring-1 ring-black/5 p-6">
        <h1 className="text-2xl font-semibold text-gray-900">
          Select your identity
        </h1>
        <p className="mt-1 text-sm text-gray-600">{accountLabel}</p>

        {banner && (
          <div
            className={`mt-4 rounded-xl px-4 py-3 text-sm border ${
              banner.type === "success"
                ? "bg-green-50 text-green-800 border-green-200"
                : "bg-red-50 text-red-800 border-red-200"
            }`}
          >
            {banner.text}
          </div>
        )}

        <div className="mt-5">
          <label className="block text-sm font-medium text-gray-800 mb-2">
            Lab person
          </label>
          <select
            value={personId}
            onChange={(e) => setPersonId(e.target.value)}
            disabled={busy}
            className="w-full border rounded-xl px-3 py-3"
          >
            <option value="">Choose your name</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}{p.emailMasked ? ` (${p.emailMasked})` : ""}
              </option>
            ))}
          </select>
        </div>

        <div className="mt-4">
          <label className="block text-sm font-medium text-gray-800 mb-2">
            Role for this session
          </label>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as Role)}
            disabled={busy || !selectedPerson}
            className="w-full border rounded-xl px-3 py-3"
          >
            <option value="">Choose a role</option>
            {availableRoles.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </div>

        <p className="mt-3 text-xs text-gray-500">
          A verification code will be sent to your registered email address.
        </p>

        <button
          type="button"
          onClick={onContinue}
          disabled={busy || !personId || !role}
          className="mt-5 w-full rounded-xl px-4 py-3 font-semibold text-white bg-[var(--brand)] disabled:opacity-60"
        >
          {busy ? "Sending code…" : "Continue"}
        </button>

        <button
          type="button"
          onClick={onBack}
          disabled={busy}
          className="mt-3 w-full text-sm text-gray-600 underline underline-offset-4"
        >
          Back to sign in
        </button>
      </div>
    </div>
  );
}