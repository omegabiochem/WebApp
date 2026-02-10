import { useState } from "react";
import { Link } from "react-router-dom";

// function cn(...xs: Array<string | false | null | undefined>) {
//   return xs.filter(Boolean).join(" ");
// }

type IssueType =
  | "Request Login Credentials"
  | "Temp Password Expired / Not Working"
  | "OTP / Verification Code"
  | "Not Authorized / Access Denied"
  | "Portal Not Loading"
  | "Other";

export default function PublicSupport() {
  const supportEmail = "support@yourlims.com";

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
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-5xl px-4 py-6">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
                Support & Help
              </h1>
              <p className="mt-1 text-sm text-slate-600">
                If you’re unable to log in, contact Support and we’ll assist
                with access and credentials.
              </p>
            </div>

            <Link
              to="/login"
              className="inline-flex items-center justify-center rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-slate-800"
            >
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
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-sm font-semibold text-slate-900">
                How Login Access Works
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                For security and compliance, accounts are created by Support or
                your organization Admin.
              </p>

              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="text-sm font-semibold text-slate-900">
                    Request credentials
                  </div>
                  <p className="mt-1 text-sm text-slate-600">
                    Email Support to request a User ID and temporary password.
                  </p>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="text-sm font-semibold text-slate-900">
                    First login
                  </div>
                  <p className="mt-1 text-sm text-slate-600">
                    You’ll sign in using the temporary password and may be asked
                    to verify via OTP.
                  </p>
                </div>
              </div>

              <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-700">
                <div className="font-semibold text-slate-900">
                  What Support will send you
                </div>
                <ul className="mt-2 list-disc pl-5 space-y-1 text-slate-600">
                  <li>User ID</li>
                  <li>Temporary password (time-limited)</li>
                  <li>Login URL</li>
                </ul>
              </div>
            </div>

            {/* Common blockers */}
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-sm font-semibold text-slate-900">
                Common Login Issues
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                These quick checks solve most access problems.
              </p>

              <div className="mt-4 space-y-3">
                <details className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <summary className="cursor-pointer list-none text-sm font-semibold text-slate-900">
                    Temporary password not working / expired{" "}
                    <span className="ml-2 text-slate-400">⌄</span>
                  </summary>
                  <ul className="mt-3 list-disc pl-5 text-sm text-slate-600 space-y-1">
                    <li>Temporary passwords can expire for security.</li>
                    <li>Ensure there are no extra spaces when copying.</li>
                    <li>
                      Contact Support to re-issue a new temporary password.
                    </li>
                  </ul>
                </details>

                <details className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <summary className="cursor-pointer list-none text-sm font-semibold text-slate-900">
                    Didn’t receive OTP / verification email{" "}
                    <span className="ml-2 text-slate-400">⌄</span>
                  </summary>
                  <ul className="mt-3 list-disc pl-5 text-sm text-slate-600 space-y-1">
                    <li>Wait 30–60 seconds (email delays happen).</li>
                    <li>Check spam/quarantine folders.</li>
                    <li>
                      Click “Resend code” once — only the latest code works.
                    </li>
                  </ul>
                </details>

                <details className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <summary className="cursor-pointer list-none text-sm font-semibold text-slate-900">
                    Not authorized / access denied{" "}
                    <span className="ml-2 text-slate-400">⌄</span>
                  </summary>
                  <ul className="mt-3 list-disc pl-5 text-sm text-slate-600 space-y-1">
                    <li>Your role may not have access to that page.</li>
                    <li>Your account may be pending activation by Admin.</li>
                    <li>Send Support the exact message shown on screen.</li>
                  </ul>
                </details>

                <details className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <summary className="cursor-pointer list-none text-sm font-semibold text-slate-900">
                    Portal not loading / blank screen{" "}
                    <span className="ml-2 text-slate-400">⌄</span>
                  </summary>
                  <ul className="mt-3 list-disc pl-5 text-sm text-slate-600 space-y-1">
                    <li>Try Chrome/Edge and refresh.</li>
                    <li>Disable ad blockers for the portal domain.</li>
                    <li>Try an incognito/private window.</li>
                  </ul>
                </details>
              </div>

              <div className="mt-5 rounded-xl border border-slate-200 bg-white p-4 text-xs text-slate-600">
                <div className="font-semibold text-slate-900">
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
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-sm font-semibold text-slate-900">
                Contact Support
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                Email Support and we will respond with credentials or
                troubleshooting steps.
              </p>

              <div className="mt-4">
                <label className="text-xs font-medium text-slate-700">
                  Issue type
                </label>
                <select
                  value={issueType}
                  onChange={(e) => setIssueType(e.target.value as IssueType)}
                  className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:border-slate-400"
                >
                  <option>Request Login Credentials</option>
                  <option>Temp Password Expired / Not Working</option>
                  <option>OTP / Verification Code</option>
                  <option>Not Authorized / Access Denied</option>
                  <option>Portal Not Loading</option>
                  <option>Other</option>
                </select>
              </div>

              <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-sm font-semibold text-slate-900">
                    {supportEmail}
                  </div>
                  <button
                    type="button"
                    onClick={copyEmail}
                    className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-800 hover:bg-slate-100"
                  >
                    {copied ? "Copied" : "Copy"}
                  </button>
                </div>

                <div className="mt-3 text-xs text-slate-600">
                  <div className="font-semibold text-slate-900">
                    Suggested subject
                  </div>
                  <div className="mt-1 rounded-lg border border-slate-200 bg-white px-2 py-1">
                    {subject}
                  </div>
                </div>
              </div>

              <div className="mt-4 text-xs text-slate-600">
                <div className="font-semibold text-slate-900">
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

              <div className="mt-5 rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-600">
                <div className="font-semibold text-slate-900">
                  Support Hours
                </div>
                <div className="mt-1">Mon–Fri · 9:00 AM – 6:00 PM</div>
                <div className="mt-1 text-slate-500">
                  For urgent production issues, add{" "}
                  <span className="font-medium">URGENT</span> in the subject.
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 text-xs text-slate-500 shadow-sm">
              <div className="flex items-center justify-between">
                <span>Omega LIMS</span>
                <span>Public Support</span>
              </div>
              <div className="mt-2">
                If you can log in, use the in-app Support page for
                report/workflow help.
              </div>
              <div className="mt-2">
                <Link to="/privacy-policy" className="hover:underline">
                  Privacy Policy
                </Link>
                <span className="mx-2">·</span>
                <Link to="/terms-and-conditions" className="hover:underline">
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
