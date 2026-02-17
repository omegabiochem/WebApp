// Verify2FA.tsx
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../lib/api";
import { useAuth } from "../../context/AuthContext";

type Role =
  | "SYSTEMADMIN"
  | "ADMIN"
  | "FRONTDESK"
  | "MICRO"
  | "MC"
  | "CHEMISTRY"
  | "QA"
  | "CLIENT";

const roleHomePath: Record<Role, string> = {
  ADMIN: "/adminDashboard",
  CLIENT: "/clientDashboard",
  SYSTEMADMIN: "/systemAdminDashboard",
  MICRO: "/microDashboard",
  MC: "/mcDashboard",
  CHEMISTRY: "/chemistryDashboard",
  QA: "/qaDashboard",
  FRONTDESK: "/frontdeskDashboard",
};

function cn(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

const OTP_WINDOW_SECONDS = 10 * 60; // 10 minutes
const RESEND_COOLDOWN_SECONDS = 30;

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

// storage keys
const OTP_EXPIRES_AT_KEY = "otpExpiresAt";
const OTP_COOLDOWN_UNTIL_KEY = "otpCooldownUntil";

function secondsUntil(ts: number) {
  return Math.max(0, Math.ceil((ts - Date.now()) / 1000));
}

function readNumber(key: string): number | null {
  const raw = sessionStorage.getItem(key);
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function clearOtpStorage() {
  sessionStorage.removeItem(OTP_EXPIRES_AT_KEY);
  sessionStorage.removeItem(OTP_COOLDOWN_UNTIL_KEY);
}

function initOtpWindow(now = Date.now()) {
  const expiresAt = readNumber(OTP_EXPIRES_AT_KEY);
  // if missing or expired, start a new 10-min window
  if (!expiresAt || expiresAt <= now) {
    const next = now + OTP_WINDOW_SECONDS * 1000;
    sessionStorage.setItem(OTP_EXPIRES_AT_KEY, String(next));
    return next;
  }
  return expiresAt;
}

function getSecondsLeftFromStorage() {
  const expiresAt = readNumber(OTP_EXPIRES_AT_KEY);
  if (!expiresAt) return OTP_WINDOW_SECONDS; // fallback (should be rare)
  return secondsUntil(expiresAt);
}

function getCooldownFromStorage() {
  const until = readNumber(OTP_COOLDOWN_UNTIL_KEY);
  if (!until) return 0;
  return secondsUntil(until);
}

export default function Verify2FA() {
  const nav = useNavigate();
  const { login } = useAuth();

  const pendingUserId = sessionStorage.getItem("pendingUserId");

  const [code, setCode] = useState("");
  const [banner, setBanner] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [busy, setBusy] = useState(false);

  // Persisted cooldown + persisted OTP expiry
  const [cooldown, setCooldown] = useState(() => getCooldownFromStorage());
  const [secondsLeft, setSecondsLeft] = useState(() => getSecondsLeftFromStorage());

  const codeDigits = useMemo(() => code.trim(), [code]);
  const isComplete = codeDigits.length === 6;

  // Track whether user typed anything
  const hasTypedRef = useRef(false);

  // If missing pendingUserId, leave immediately (avoid weird state)
  useEffect(() => {
    if (pendingUserId) return;

    setBanner({
      type: "error",
      text: "No verification session found. Please sign in again.",
    });

    clearOtpStorage();

    const t = setTimeout(() => nav("/home", { replace: true }), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Start OTP window only when we have a pending session
  useEffect(() => {
    if (!pendingUserId) return;
    initOtpWindow();
    setSecondsLeft(getSecondsLeftFromStorage());
    setCooldown(getCooldownFromStorage());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingUserId]);

  // Tick timers (reads from storage so refresh keeps them correct)
  useEffect(() => {
    if (!pendingUserId) return;

    const t = setInterval(() => {
      setSecondsLeft(getSecondsLeftFromStorage());
      setCooldown(getCooldownFromStorage());
    }, 500);

    return () => clearInterval(t);
  }, [pendingUserId]);

  // When OTP window reaches 0 => expire session and go home
  useEffect(() => {
    if (!pendingUserId) return;
    if (secondsLeft !== 0) return;

    setBanner({
      type: "error",
      text: "Verification session expired. Please sign in again.",
    });

    sessionStorage.removeItem("pendingUserId");
    clearOtpStorage();

    const t = setTimeout(() => nav("/home", { replace: true }), 400);
    return () => clearTimeout(t);
  }, [secondsLeft, nav, pendingUserId]);

  const resetOtpWindow = () => {
    const nextExpiresAt = Date.now() + OTP_WINDOW_SECONDS * 1000;
    sessionStorage.setItem(OTP_EXPIRES_AT_KEY, String(nextExpiresAt));
    setSecondsLeft(secondsUntil(nextExpiresAt));

    hasTypedRef.current = false;
    setCode("");
  };

  const onVerify = async () => {
    setBanner(null);

    if (!pendingUserId) {
      setBanner({
        type: "error",
        text: "No verification session found. Please sign in again.",
      });
      clearOtpStorage();
      nav("/home", { replace: true });
      return;
    }

    if (!isComplete) {
      setBanner({
        type: "error",
        text: "Please enter the 6-digit verification code.",
      });
      return;
    }

    setBusy(true);
    try {
      const res = await api<{
        accessToken: string;
        requiresPasswordReset?: boolean;
        user: {
          id: string;
          email: string;
          role: Role;
          name?: string;
          mustChangePassword?: boolean;
          clientCode?: string;
        };
      }>("/auth/verify-2fa", {
        method: "POST",
        body: JSON.stringify({
          userId: pendingUserId,
          code: codeDigits,
        }),
      });

      // ✅ Success: clear pending + timers
      sessionStorage.removeItem("pendingUserId");
      clearOtpStorage();

      login(res.accessToken, res.user);

      if (res.requiresPasswordReset || res.user.mustChangePassword) {
        setBanner({
          type: "success",
          text: "Verified. Please create a new password…",
        });
        nav("/auth/change-password", { replace: true });
        return;
      }

      setBanner({ type: "success", text: "Verified. Signing you in…" });
      nav(roleHomePath[res.user.role] ?? "/home", { replace: true });
    } catch (err: any) {
      const codeErr = err?.body?.code;

      const msg =
        codeErr === "OTP_EXPIRED"
          ? "This code has expired. Please sign in again to get a new one."
          : codeErr === "OTP_INVALID"
            ? "That code doesn’t match. Please try again."
            : codeErr === "OTP_LOCKED"
              ? "Too many incorrect attempts. Please sign in again."
              : "We couldn’t verify that code. Please try again.";

      setBanner({ type: "error", text: msg });

      // If expired/locked, force restart sign-in and clear storage
      if (codeErr === "OTP_EXPIRED" || codeErr === "OTP_LOCKED") {
        sessionStorage.removeItem("pendingUserId");
        clearOtpStorage();
        nav("/home", { replace: true });
      }
    } finally {
      setBusy(false);
    }
  };

  const onResend = async () => {
    setBanner(null);

    if (!pendingUserId) {
      setBanner({
        type: "error",
        text: "Please sign in again to resend a code.",
      });
      clearOtpStorage();
      nav("/home", { replace: true });
      return;
    }

    if (cooldown > 0) return;

    try {
      setBusy(true);

      await api("/auth/resend-2fa", {
        method: "POST",
        body: JSON.stringify({ userId: pendingUserId }),
      });

      setBanner({
        type: "success",
        text: "We sent a new code. If you don’t see it in 1–2 minutes, check Spam/Junk/Quarantine.",
      });

      // start cooldown
      const until = Date.now() + RESEND_COOLDOWN_SECONDS * 1000;
      sessionStorage.setItem(OTP_COOLDOWN_UNTIL_KEY, String(until));
      setCooldown(RESEND_COOLDOWN_SECONDS);

      // reset 10-min window for new code
      resetOtpWindow();
    } catch (e: any) {
      const codeErr = e?.body?.code;
      const msg =
        codeErr === "OTP_RESEND_THROTTLED"
          ? "Please wait a few seconds and try again."
          : "Unable to resend. Please try again.";
      setBanner({ type: "error", text: msg });
    } finally {
      setBusy(false);
    }
  };

  const mm = Math.floor(secondsLeft / 60);
  const ss = secondsLeft % 60;

  const onBackToSignIn = () => {
    sessionStorage.removeItem("pendingUserId");
    clearOtpStorage();
    nav("/home", { replace: true });
  };

  const onCancel = () => {
    sessionStorage.removeItem("pendingUserId");
    clearOtpStorage();
    nav("/home", { replace: true });
  };

  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <div className="mx-auto h-12 w-12 rounded-2xl bg-[color:var(--brand)]/10 flex items-center justify-center">
            <svg
              viewBox="0 0 24 24"
              className="h-6 w-6"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M7 11V8a5 5 0 0 1 10 0v3" />
              <rect x="5" y="11" width="14" height="10" rx="2" />
            </svg>
          </div>

          <h1 className="mt-4 text-2xl font-semibold text-gray-900">
            Verify your sign-in
          </h1>
          <p className="mt-1 text-sm text-gray-600">
            Enter the 6-digit code sent to your registered email.
          </p>

          {/* Timer */}
          <div className="mt-3 inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs text-gray-700 bg-white">
            <span className="font-medium">Time remaining:</span>
            <span
              className={cn(
                "font-semibold",
                secondsLeft <= 30 && "text-red-600",
              )}
            >
              {pad2(mm)}:{pad2(ss)}
            </span>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm ring-1 ring-black/5 p-6">
          {banner && (
            <div
              className={cn(
                "mb-4 rounded-xl px-4 py-3 text-sm border",
                banner.type === "success"
                  ? "bg-green-50 text-green-800 border-green-200"
                  : "bg-red-50 text-red-800 border-red-200",
              )}
              role="alert"
              aria-live="polite"
            >
              {banner.text}
            </div>
          )}

          <label className="block text-sm font-medium text-gray-800 mb-2">
            Verification code
          </label>

          <input
            value={code}
            onChange={(e) => {
              const next = e.target.value.replace(/\D/g, "").slice(0, 6);
              setCode(next);
              if (next.length > 0) hasTypedRef.current = true;
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") onVerify();
            }}
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="● ● ● ● ● ●"
            className={cn(
              "w-full rounded-xl border px-4 py-3 text-center text-xl tracking-[0.35em] font-semibold",
              "focus:outline-none focus:ring-2 focus:ring-[color:var(--brand)]/30 focus:border-[color:var(--brand)]",
              "disabled:bg-gray-50 disabled:text-gray-500",
            )}
            disabled={busy || secondsLeft === 0}
            aria-invalid={!!(banner?.type === "error")}
          />

          <div className="mt-2 flex items-center justify-between">
            <p className="text-xs text-gray-500">
              Didn’t get it? Check spam/junk folder.
            </p>

            <button
              type="button"
              onClick={onResend}
              disabled={busy || cooldown > 0 || secondsLeft === 0}
              className={cn(
                "text-xs font-medium underline underline-offset-4",
                busy || cooldown > 0 || secondsLeft === 0
                  ? "text-gray-400 cursor-not-allowed"
                  : "text-[color:var(--brand)]",
              )}
            >
              {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend code"}
            </button>
          </div>

          <button
            onClick={onVerify}
            disabled={busy || !isComplete || secondsLeft === 0}
            className={cn(
              "mt-5 w-full rounded-xl px-4 py-3 font-semibold text-white",
              "bg-[var(--brand)] hover:opacity-95 active:opacity-90",
              "disabled:opacity-60 disabled:cursor-not-allowed",
            )}
          >
            {busy ? "Verifying…" : "Verify"}
          </button>

          <div className="mt-4 flex items-center justify-between">
            <button
              type="button"
              disabled={busy}
              onClick={onBackToSignIn}
              className="text-sm text-gray-700 hover:text-gray-900 underline underline-offset-4 disabled:opacity-60"
            >
              Back to sign in
            </button>

            <button
              type="button"
              disabled={busy}
              onClick={onCancel}
              className="text-sm text-gray-500 hover:text-gray-700 disabled:opacity-60"
            >
              Cancel
            </button>
          </div>

          <div className="mt-6 pt-4 border-t text-xs text-gray-500">
            For security, codes expire quickly. If you’re having trouble, sign
            in again to generate a new code.
          </div>
        </div>
      </div>
    </div>
  );
}