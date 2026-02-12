import { useForm } from "react-hook-form";
import { z } from "zod";
import { api } from "../../lib/api";
import { useAuth } from "../../context/AuthContext";
import { useNavigate } from "react-router-dom";
import { useRef, useState } from "react";
import { Eye, EyeOff } from "lucide-react";

type Role =
  | "SYSTEMADMIN"
  | "ADMIN"
  | "FRONTDESK"
  | "MICRO"
  | "MC"
  | "CHEMISTRY"
  | "QA"
  | "CLIENT";

type LoginResponse = {
  accessToken?: string;
  requiresPasswordReset?: boolean;
  requiresTwoFactor?: boolean;
  method?: "EMAIL" | "SMS";
  expiresAt?: string;
  userId?: string;
  user?: {
    id: string;
    email: string;
    role: Role;
    name?: string;
    mustChangePassword?: boolean;
    clientCode?: string;
  };
};

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

const schema = z.object({
  userId: z.string().min(1),
  password: z.string().min(1),
});
type FormData = z.infer<typeof schema>;

function Spinner({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/60 border-t-white ${className}`}
      aria-hidden="true"
    />
  );
}

export default function Login() {
  const {
    register,
    handleSubmit,
    setError,
    formState: { isSubmitting, errors },
  } = useForm<FormData>({ defaultValues: { userId: "", password: "" } });

  const { login } = useAuth();
  const navigate = useNavigate();

  const [banner, setBanner] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const [showPassword, setShowPassword] = useState(false);
  const submitLockRef = useRef(false);

  const onSubmit = async (data: FormData) => {
    if (submitLockRef.current) return;
    submitLockRef.current = true;

    setBanner(null);

    try {
      const res = await api<LoginResponse>("/auth/login", {
        method: "POST",
        body: JSON.stringify(data),
      });

      if (res.requiresTwoFactor) {
        sessionStorage.setItem("pendingUserId", data.userId);
        navigate("/auth/verify-2fa", { replace: true });
        return;
      }

      if (res.requiresPasswordReset) {
        if (res.accessToken && res.user) {
          login(res.accessToken, res.user);
        }
        setBanner({
          type: "success",
          text: "Login successful. Please reset your password.",
        });
        navigate("/auth/change-password", { replace: true });
        return;
      }

      if (!res.accessToken || !res.user) {
        setBanner({ type: "error", text: "Invalid user ID or password." });
        setError("password", {
          type: "server",
          message: "Invalid credentials",
        });
        return;
      }

      login(res.accessToken, res.user);
      setBanner({ type: "success", text: "Login successful!" });
      navigate(roleHomePath[res.user.role] ?? "/home", { replace: true });
    } catch (err: any) {
      // ✅ IP allowlist block (403)
      if (err?.status === 403) {
        const code = err?.body?.code || err?.body?.message?.code;

        const msg =
          err?.body?.message?.message || // when backend sends { code, message } inside message
          err?.body?.message || // when backend sends message string
          err?.message || // fallback
          "Access restricted.";

        if (
          code === "IP_NOT_ALLOWED" ||
          String(msg).toLowerCase().includes("access restricted")
        ) {
          setBanner({ type: "error", text: msg });
          setError("userId", { type: "server", message: msg });
          return;
        }
      }
      const code = err?.body?.code;
      const remaining = err?.body?.remaining;

      const msg =
        code === "ACCOUNT_LOCKED"
          ? "Too many failed attempts. Your account is temporarily locked."
          : code === "INVALID_CREDENTIALS" && typeof remaining === "number"
            ? `Invalid user ID or password. Attempts left: ${remaining}`
            : "Invalid user ID or password.";

      setBanner({ type: "error", text: msg });
      setError("password", { type: "server", message: msg });
    } finally {
      submitLockRef.current = false;
    }
  };

  const field = "border rounded-md p-2";
  const busy = isSubmitting || submitLockRef.current;

  // ✅ Public policy links (Twilio A2P compliance)
  const PRIVACY_URL = "https://omegabiochemlab.com/privacy-policy";
  const TERMS_URL = "https://omegabiochemlab.com/terms-and-conditions";

  return (
    <div className="max-w-sm mx-auto bg-white rounded-xl shadow p-6">
      <h1 className="text-xl font-semibold mb-4">Sign in</h1>

      {banner && (
        <div
          className={`mb-3 rounded-md px-3 py-2 text-sm ${
            banner.type === "success"
              ? "bg-green-50 text-green-800 border border-green-200"
              : "bg-red-50 text-red-800 border border-red-200"
          }`}
          role="alert"
          aria-live="polite"
        >
          {banner.text}
        </div>
      )}

      <form
        onSubmit={handleSubmit(onSubmit)}
        className="flex flex-col gap-3"
        autoComplete="on"
      >
        <div className="flex flex-col gap-1">
          <input
            className={field}
            id="userId"
            placeholder="User ID"
            autoComplete="username"
            disabled={busy}
            {...register("userId", { required: "User ID is required" })}
          />
          {errors.userId && (
            <span className="text-xs text-red-600">
              {errors.userId.message}
            </span>
          )}
        </div>

        <div className="flex flex-col gap-1">
          <div className="relative">
            <input
              className={`${field} pr-10 w-full`}
              id="password"
              type={showPassword ? "text" : "password"}
              placeholder="Password"
              autoComplete="current-password"
              disabled={busy}
              {...register("password", { required: "Password is required" })}
            />

            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              disabled={busy}
              className="absolute inset-y-0 right-2 flex items-center text-gray-500 hover:text-gray-700 disabled:opacity-50"
              aria-label={showPassword ? "Hide password" : "Show password"}
              title={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>

          {errors.password && (
            <span className="text-xs text-red-600">
              {errors.password.message}
            </span>
          )}
        </div>

        <button
          type="submit"
          disabled={busy}
          className="bg-[var(--brand)] text-white px-4 py-2 rounded-md disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          aria-busy={busy}
        >
          {busy && <Spinner />}
          {busy ? "Signing in..." : "Sign in"}
        </button>

        {/* ✅ Compliance footer links */}
        <div className="pt-2 text-center text-xs text-gray-500">
          By signing in, you agree to our{" "}
          <a
            href={TERMS_URL}
            target="_blank"
            rel="noreferrer noopener"
            className="underline hover:text-gray-700"
          >
            Terms
          </a>{" "}
          and{" "}
          <a
            href={PRIVACY_URL}
            target="_blank"
            rel="noreferrer noopener"
            className="underline hover:text-gray-700"
          >
            Privacy Policy
          </a>
          .
        </div>
      </form>
    </div>
  );
}
