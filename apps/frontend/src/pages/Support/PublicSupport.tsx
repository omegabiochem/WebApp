import { useState } from "react";
import { Link } from "react-router-dom";

type IssueType =
  | "Request Login Credentials"
  | "Temp Password Expired / Not Working"
  | "OTP / Verification Code"
  | "Not Authorized / Access Denied"
  | "Portal Not Loading"
  | "Other";

function cn(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

const UI = {
  pageBg: "bg-slate-50",
  card: "bg-white border border-slate-200 shadow-sm",
  border: "border-slate-200",
  text: {
    heading: "text-slate-900",
    body: "text-slate-700",
    muted: "text-slate-600",
    subtle: "text-slate-500",
  },

  // Brand (blue)
  brand: {
    text: "text-sky-700",
    textHover: "hover:text-sky-800",
    bg: "bg-sky-600",
    bgHover: "hover:bg-sky-700",
    ring: "ring-sky-200",
    border: "border-sky-200",
    softBg: "bg-sky-50",
  },

  // Inputs
  input:
    "rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm text-slate-900 shadow-sm outline-none placeholder:text-slate-400 focus:border-sky-400 focus:ring-4 focus:ring-sky-100",

  // Buttons
  btnPrimary:
    "inline-flex items-center justify-center rounded-xl px-4 py-2 text-sm font-semibold text-white bg-sky-600 hover:bg-sky-700 shadow-sm",
  btnGhost:
    "rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50",

  // Small controls
  btnMini:
    "rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-800 hover:bg-slate-100",

  link: "text-sky-700 hover:underline",
};

export default function PublicSupport() {
  const supportEmail = "tech@omegabiochemlab.com";

  const [issueType, setIssueType] = useState<IssueType>(
    "Request Login Credentials",
  );
  const [copied, setCopied] = useState(false);

  const copyEmail = async () => {
    try {
      await navigator.clipboard.writeText(supportEmail);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      // clipboard may be blocked; ignore
    }
  };

  const subject = `[Omega LIMS Support] ${issueType}`;

  return (
    <div className={cn("min-h-screen", UI.pageBg)}>
      {/* Header */}
      <div className={cn("border-b bg-white", UI.border)}>
        <div className="mx-auto max-w-5xl px-4 py-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1
                className={cn(
                  "text-2xl font-semibold tracking-tight",
                  UI.text.heading,
                )}
              >
                Support & Help
              </h1>
              <p className={cn("mt-1 text-sm", UI.text.muted)}>
                If you’re unable to log in, contact Support and we’ll assist
                with access and credentials.
              </p>
            </div>

            <Link to="/login" className={UI.btnPrimary}>
              Go to Login
            </Link>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="mx-auto max-w-5xl px-4 py-8">
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Left */}
          <div className="lg:col-span-2 space-y-6">
            {/* How access works */}
            <div className={cn("rounded-2xl p-6", UI.card)}>
              <h2 className={cn("text-sm font-semibold", UI.text.heading)}>
                How Login Access Works
              </h2>
              <p className={cn("mt-1 text-sm", UI.text.muted)}>
                For security and compliance, accounts are created by Support or
                your organization Admin.
              </p>

              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div
                  className={cn(
                    "rounded-2xl border p-4",
                    UI.border,
                    UI.brand.softBg,
                  )}
                >
                  <div className={cn("text-sm font-semibold", UI.text.heading)}>
                    Request credentials
                  </div>
                  <p className={cn("mt-1 text-sm", UI.text.muted)}>
                    Email Support to request a User ID and temporary password.
                  </p>
                </div>

                <div
                  className={cn(
                    "rounded-2xl border p-4",
                    UI.border,
                    UI.brand.softBg,
                  )}
                >
                  <div className={cn("text-sm font-semibold", UI.text.heading)}>
                    First login
                  </div>
                  <p className={cn("mt-1 text-sm", UI.text.muted)}>
                    You’ll sign in using the temporary password and may be asked
                    to verify via OTP.
                  </p>
                </div>
              </div>

              <div
                className={cn(
                  "mt-4 rounded-xl border bg-white p-4 text-sm",
                  UI.border,
                  UI.text.body,
                )}
              >
                <div className={cn("font-semibold", UI.text.heading)}>
                  What Support will send you
                </div>
                <ul
                  className={cn("mt-2 list-disc pl-5 space-y-1", UI.text.muted)}
                >
                  <li>User ID</li>
                  <li>Temporary password (time-limited)</li>
                  <li>Login URL</li>
                </ul>
              </div>
            </div>

            {/* Common blockers */}
            <div className={cn("rounded-2xl p-6", UI.card)}>
              <h2 className={cn("text-sm font-semibold", UI.text.heading)}>
                Common Login Issues
              </h2>
              <p className={cn("mt-1 text-sm", UI.text.muted)}>
                These quick checks solve most access problems.
              </p>

              <div className="mt-4 space-y-3">
                {[
                  {
                    title: "Temporary password not working / expired",
                    items: [
                      "Temporary passwords can expire for security.",
                      "Ensure there are no extra spaces when copying.",
                      "Contact Support to re-issue a new temporary password.",
                    ],
                  },
                  {
                    title: "Didn’t receive OTP / verification email",
                    items: [
                      "Wait 30–60 seconds (email delays happen).",
                      "Check spam/quarantine folders.",
                      "Click “Resend code” once — only the latest code works.",
                    ],
                  },
                  {
                    title: "Not authorized / access denied",
                    items: [
                      "Your role may not have access to that page.",
                      "Your account may be pending activation by Admin.",
                      "Send Support the exact message shown on screen.",
                    ],
                  },
                  {
                    title: "Portal not loading / blank screen",
                    items: [
                      "Try Chrome/Edge and refresh.",
                      "Disable ad blockers for the portal domain.",
                      "Try an incognito/private window.",
                    ],
                  },
                ].map((d) => (
                  <details
                    key={d.title}
                    className={cn(
                      "rounded-xl border p-4",
                      UI.border,
                      UI.brand.softBg,
                    )}
                  >
                    <summary
                      className={cn(
                        "cursor-pointer list-none text-sm font-semibold",
                        UI.text.heading,
                      )}
                    >
                      {d.title}{" "}
                      <span className={cn("ml-2", UI.text.subtle)}>⌄</span>
                    </summary>
                    <ul
                      className={cn(
                        "mt-3 list-disc pl-5 text-sm space-y-1",
                        UI.text.muted,
                      )}
                    >
                      {d.items.map((x) => (
                        <li key={x}>{x}</li>
                      ))}
                    </ul>
                  </details>
                ))}
              </div>

              <div
                className={cn(
                  "mt-5 rounded-xl border bg-white p-4 text-xs",
                  UI.border,
                  UI.text.muted,
                )}
              >
                <div className={cn("font-semibold", UI.text.heading)}>
                  Security note
                </div>
                <p className="mt-1">
                  Support will never ask for your password or OTP code. Share
                  only screenshots/error messages (no OTP).
                </p>
              </div>
            </div>
          </div>

          {/* Right: Contact */}
          <aside className="space-y-6">
            <div className={cn("rounded-2xl p-6", UI.card)}>
              <h2 className={cn("text-sm font-semibold", UI.text.heading)}>
                Contact Support
              </h2>
              <p className={cn("mt-1 text-sm", UI.text.muted)}>
                Email Support and we will respond with credentials or
                troubleshooting steps.
              </p>

              <div className="mt-4">
                <label className={cn("text-xs font-medium", UI.text.body)}>
                  Issue type
                </label>
                <select
                  value={issueType}
                  onChange={(e) => setIssueType(e.target.value as IssueType)}
                  className={cn("mt-1 w-full", UI.input, "px-3 py-2")}
                >
                  <option>Request Login Credentials</option>
                  <option>Temp Password Expired / Not Working</option>
                  <option>OTP / Verification Code</option>
                  <option>Not Authorized / Access Denied</option>
                  <option>Portal Not Loading</option>
                  <option>Other</option>
                </select>
              </div>

              <div
                className={cn(
                  "mt-4 rounded-xl border p-3",
                  UI.border,
                  UI.brand.softBg,
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className={cn("text-sm font-semibold", UI.text.heading)}>
                    {supportEmail}
                  </div>
                  <button
                    type="button"
                    onClick={copyEmail}
                    className={cn(
                      "rounded-lg px-2.5 py-1 text-xs font-semibold border",
                      UI.border,
                      UI.brand.text,
                      "bg-white hover:bg-slate-50",
                    )}
                  >
                    {copied ? "Copied" : "Copy"}
                  </button>
                </div>

                <div className={cn("mt-3 text-xs", UI.text.muted)}>
                  <div className={cn("font-semibold", UI.text.heading)}>
                    Suggested subject
                  </div>
                  <div
                    className={cn(
                      "mt-1 rounded-lg border bg-white px-2 py-1",
                      UI.border,
                    )}
                  >
                    {subject}
                  </div>
                </div>
              </div>

              <div className={cn("mt-4 text-xs", UI.text.muted)}>
                <div className={cn("font-semibold", UI.text.heading)}>
                  Include in your email
                </div>
                <ul className="mt-2 list-disc pl-5 space-y-1">
                  <li>Your full name</li>
                  <li>Company / Lab name</li>
                  <li>
                    Role requested (Client / QA / Micro / Chemistry / etc.)
                  </li>
                  <li>Email address to register</li>
                  <li>Phone (optional)</li>
                  <li>Screenshot of the error (do not include OTP)</li>
                </ul>
              </div>

              <div
                className={cn(
                  "mt-5 rounded-xl border bg-white p-3 text-xs",
                  UI.border,
                  UI.text.muted,
                )}
              >
                <div className={cn("font-semibold", UI.text.heading)}>
                  Support Hours
                </div>
                <div className="mt-1">Mon–Fri · 9:00 AM – 5:00 PM</div>
                <div className={cn("mt-1", UI.text.subtle)}>
                  For urgent production issues, add{" "}
                  <span className={cn("font-medium", UI.text.heading)}>
                    URGENT
                  </span>{" "}
                  in the subject.
                </div>
              </div>
            </div>

            <div
              className={cn(
                "rounded-2xl border bg-white p-5 text-xs shadow-sm",
                UI.border,
                UI.text.subtle,
              )}
            >
              <div className="flex items-center justify-between">
                <span>Omega LIMS</span>
                <span>Public Support</span>
              </div>
              <div className="mt-2">
                If you can log in, use the in-app Support page for
                report/workflow help.
              </div>
              <div className="mt-2">
                <Link to="/privacy-policy" className={UI.link}>
                  Privacy Policy
                </Link>
                <span className="mx-2">·</span>
                <Link to="/terms-and-conditions" className={UI.link}>
                  Terms
                </Link>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
