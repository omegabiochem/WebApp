// src/pages/Home/index.tsx

import { Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";

export default function Home() {
  const { user } = useAuth();

  const dashboardPath =
    user?.role === "SYSTEMADMIN"
      ? "/systemAdminDashboard"
      : user?.role === "ADMIN"
        ? "/adminDashboard"
        : user?.role === "FRONTDESK"
          ? "/frontdeskDashboard"
          : user?.role === "MICRO"
            ? "/microDashboard"
            : user?.role === "CHEMISTRY"
              ? "/chemistryDashboard"
              : user?.role === "MC"
                ? "/mcDashboard"
                : user?.role === "QA"
                  ? "/qaDashboard"
                  : user?.role === "CLIENT"
                    ? "/clientDashboard"
                    : "/login";

  return (
    <div className="overflow-hidden">
      {/* ======================================================
          HERO / SECURE PORTAL
      ====================================================== */}
      <section className="relative overflow-hidden rounded-[32px] border border-slate-200 bg-white shadow-sm">
        {/* Background */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -right-32 -top-40 h-[520px] w-[520px] rounded-full bg-blue-100/70 blur-3xl" />

          <div className="absolute -bottom-40 -left-32 h-[420px] w-[420px] rounded-full bg-cyan-100/50 blur-3xl" />

          <div
            className="absolute inset-0 opacity-[0.03]"
            style={{
              backgroundImage:
                "linear-gradient(#0f172a 1px, transparent 1px), linear-gradient(90deg, #0f172a 1px, transparent 1px)",
              backgroundSize: "32px 32px",
            }}
          />
        </div>

        <div className="relative grid min-h-[590px] items-center gap-12 px-6 py-14 md:px-10 lg:grid-cols-[1.1fr_.9fr] lg:px-14">
          {/* LEFT */}
          <div>
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-4 py-2 text-xs font-bold uppercase tracking-[0.16em] text-[var(--brand)]">
              <span className="relative flex h-2.5 w-2.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-50" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
              </span>
              Secure Laboratory Portal
            </div>

            <h1 className="max-w-3xl text-4xl font-bold leading-[1.08] tracking-tight text-slate-950 sm:text-5xl lg:text-[58px]">
              Omega BioChem
              <span className="mt-2 block text-[var(--brand)]">
                Laboratory Information Management System
              </span>
            </h1>

            <p className="mt-7 max-w-2xl text-base leading-7 text-slate-600 sm:text-lg">
              Secure digital access for authorized Omega BioChem clients and
              laboratory personnel to manage submissions, laboratory workflows,
              reports, results, and communication.
            </p>

            <div className="mt-9 flex flex-wrap gap-3">
              {user ? (
                <Link
                  to={dashboardPath}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-[var(--brand)] px-7 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-900/10 transition duration-200 hover:-translate-y-0.5 hover:opacity-95"
                >
                  Go to Dashboard
                  <span aria-hidden="true">→</span>
                </Link>
              ) : (
                <Link
                  to="/login"
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-[var(--brand)] px-7 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-900/10 transition duration-200 hover:-translate-y-0.5 hover:opacity-95"
                >
                  Sign In to LIMS
                  <span aria-hidden="true">→</span>
                </Link>
              )}

              <Link
                to="/publicsupport"
                className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-7 py-3 text-sm font-semibold text-slate-700 transition duration-200 hover:-translate-y-0.5 hover:border-slate-400 hover:bg-slate-50"
              >
                LIMS Support
              </Link>
            </div>

            <div className="mt-10 flex flex-wrap gap-x-8 gap-y-3 border-t border-slate-200 pt-6">
              <PortalTrustPoint text="Secure Access" />
              <PortalTrustPoint text="Controlled Workflows" />
              <PortalTrustPoint text="Digital Reporting" />
            </div>
          </div>

          {/* RIGHT PORTAL CARD */}
          <div className="relative">
            <div className="absolute -inset-5 rounded-[36px] bg-gradient-to-br from-blue-100/70 to-cyan-100/20 blur-2xl" />

            <div className="relative overflow-hidden rounded-[28px] border border-slate-200 bg-white/95 shadow-2xl shadow-slate-900/10 backdrop-blur">
              {/* Card header */}
              <div className="flex items-center justify-between border-b border-slate-100 p-6">
                <div>
                  <div className="text-xs font-bold uppercase tracking-[0.15em] text-slate-400">
                    Omega BioChem
                  </div>

                  <div className="mt-1 text-xl font-bold text-slate-900">
                    Secure LIMS Portal
                  </div>
                </div>

                <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-blue-100 bg-blue-50">
                  <img
                    src="/logo.svg"
                    alt="Omega BioChem"
                    className="h-9 w-9"
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).src =
                        "/favicon-32x32.png";
                    }}
                  />
                </div>
              </div>

              {/* Portal capabilities */}
              <div className="space-y-3 p-6">
                <PortalRow
                  number="01"
                  title="Laboratory Submissions"
                  description="Create and manage authorized laboratory submissions."
                />

                <PortalRow
                  number="02"
                  title="Reports & Results"
                  description="Securely access laboratory reports and available results."
                />

                <PortalRow
                  number="03"
                  title="Workflow Tracking"
                  description="Follow laboratory submissions through controlled workflows."
                />

                <PortalRow
                  number="04"
                  title="Communication"
                  description="Receive laboratory notifications and communicate securely."
                />
              </div>

              {/* Dark sign-in area */}
              {/* Authorized access area */}
              <div className="m-6 mt-0 overflow-hidden rounded-2xl border border-blue-200 bg-blue-50 p-5">
                <div className="flex items-start gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--brand)] text-white shadow-sm">
                    🔒
                  </div>

                  <div>
                    <div className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--brand)]">
                      Authorized Access
                    </div>

                    <div className="mt-1 text-sm leading-5 text-slate-600">
                      Existing Omega BioChem clients and authorized laboratory
                      personnel.
                    </div>
                  </div>
                </div>

                {user ? (
                  <Link
                    to={dashboardPath}
                    className="mt-5 inline-flex items-center gap-2 rounded-lg bg-[var(--brand)] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-0.5 hover:opacity-90"
                  >
                    Open Dashboard
                    <span>→</span>
                  </Link>
                ) : (
                  <Link
                    to="/login"
                    className="mt-5 inline-flex items-center gap-2 rounded-lg bg-[var(--brand)] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-0.5 hover:opacity-90"
                  >
                    Continue to Sign In
                    <span>→</span>
                  </Link>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ======================================================
          PORTAL CAPABILITIES
      ====================================================== */}
      <section className="py-20">
        <div className="text-center">
          <div className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--brand)]">
            Omega LIMS
          </div>

          <h2 className="mx-auto mt-4 max-w-2xl text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
            One secure platform for laboratory information.
          </h2>

          <p className="mx-auto mt-4 max-w-2xl text-sm leading-7 text-slate-600">
            Omega LIMS connects authorized clients and laboratory personnel
            throughout submission, testing, review, reporting, and
            communication.
          </p>
        </div>

        <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <FeatureCard
            title="Secure Access"
            text="Role-based access protects laboratory and client information."
          />

          <FeatureCard
            title="Submission Tracking"
            text="Manage and follow laboratory submissions through controlled workflows."
          />

          <FeatureCard
            title="Reports & Results"
            text="Access available reports, attachments, and laboratory results securely."
          />

          <FeatureCard
            title="Notifications"
            text="Stay informed about important laboratory workflow updates."
          />
        </div>
      </section>

      {/* ======================================================
    PUBLIC WEBSITE / NEW CLIENT
====================================================== */}
      <section className="pb-20">
        <div className="relative overflow-hidden rounded-[32px] border border-blue-200 bg-blue-50 px-6 py-14 sm:px-10 lg:px-14">
          {/* Background decoration */}
          <div className="pointer-events-none absolute inset-0 overflow-hidden">
            <div className="absolute -right-28 -top-32 h-80 w-80 rounded-full bg-blue-200/50 blur-3xl" />
            <div className="absolute -bottom-32 left-1/3 h-72 w-72 rounded-full bg-cyan-100/60 blur-3xl" />

            <div
              className="absolute inset-0 opacity-[0.025]"
              style={{
                backgroundImage:
                  "linear-gradient(#1d4ed8 1px, transparent 1px), linear-gradient(90deg, #1d4ed8 1px, transparent 1px)",
                backgroundSize: "30px 30px",
              }}
            />
          </div>

          <div className="relative grid gap-10 lg:grid-cols-[1fr_auto] lg:items-center">
            <div>
              <div className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--brand)]">
                Looking for Laboratory Services?
              </div>

              <h2 className="mt-4 max-w-2xl text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
                New to{" "}
                <span className="text-[var(--brand)]">Omega BioChem?</span>
              </h2>

              <p className="mt-4 max-w-2xl leading-7 text-slate-600">
                Laboratory services, company information, testing inquiries, and
                new-client requests are available through the official Omega
                BioChem website.
              </p>
            </div>

            <div className="flex flex-wrap gap-3 lg:flex-col">
              <a
                href="https://www.omegabiochem.com"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-w-[220px] items-center justify-center gap-2 rounded-xl bg-[var(--brand)] px-6 py-3 text-sm font-semibold text-white shadow-md transition duration-200 hover:-translate-y-0.5 hover:opacity-90"
              >
                Visit Company Website
                <span>↗</span>
              </a>

              <a
                href="https://www.omegabiochem.com/request-testing"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-w-[220px] items-center justify-center gap-2 rounded-xl border border-blue-300 bg-white px-6 py-3 text-sm font-semibold text-[var(--brand)] shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-[var(--brand)] hover:bg-blue-50"
              >
                Request Testing
                <span>↗</span>
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* ======================================================
          HELP
      ====================================================== */}
      <section className="pb-14">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 bg-white p-6">
            <div className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Existing Clients
            </div>

            <h3 className="mt-3 text-lg font-bold text-slate-900">
              Need help with your LIMS account?
            </h3>

            <p className="mt-2 text-sm leading-6 text-slate-600">
              Contact LIMS support for login, account access, reports,
              attachments, or other portal-related assistance.
            </p>

            <Link
              to="/publicsupport"
              className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-[var(--brand)] hover:underline"
            >
              Contact LIMS Support
              <span>→</span>
            </Link>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-6">
            <div className="text-xs font-bold uppercase tracking-wider text-slate-400">
              New Clients
            </div>

            <h3 className="mt-3 text-lg font-bold text-slate-900">
              Interested in Omega BioChem services?
            </h3>

            <p className="mt-2 text-sm leading-6 text-slate-600">
              Visit our company website for laboratory services, testing
              inquiries, and new-client information.
            </p>

            <a
              href="https://www.omegabiochem.com"
              target="_blank"
              rel="noopener noreferrer"
              className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-[var(--brand)] hover:underline"
            >
              Visit OmegaBioChem.com
              <span>↗</span>
            </a>
          </div>
        </div>
      </section>

      {/* ======================================================
          FOOTER
      ====================================================== */}
      <footer className="border-t border-slate-200 py-7">
        <div className="flex flex-col items-center justify-between gap-4 text-xs text-slate-500 sm:flex-row">
          <div>
            © {new Date().getFullYear()} Omega BioChem Laboratories, Inc. All
            rights reserved.
          </div>

          <div className="flex flex-wrap items-center justify-center gap-5">
            <Link
              to="/privacy-policy"
              className="transition hover:text-slate-900"
            >
              Privacy Policy
            </Link>

            <Link
              to="/terms-and-conditions"
              className="transition hover:text-slate-900"
            >
              Terms & Conditions
            </Link>

            <Link
              to="/publicsupport"
              className="transition hover:text-slate-900"
            >
              LIMS Support
            </Link>

            <a
              href="https://www.omegabiochem.com"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-[var(--brand)] hover:underline"
            >
              OmegaBioChem.com ↗
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}

/* ======================================================
   SMALL COMPONENTS
====================================================== */

function PortalTrustPoint({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-2 text-sm text-slate-600">
      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-50 text-xs font-bold text-emerald-700">
        ✓
      </span>

      {text}
    </div>
  );
}

function PortalRow({
  number,
  title,
  description,
}: {
  number: string;
  title: string;
  description: string;
}) {
  return (
    <div className="group flex items-start gap-4 rounded-2xl border border-slate-200 p-4 transition hover:border-blue-200 hover:bg-blue-50/40">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-xs font-bold text-slate-600 transition group-hover:bg-blue-100 group-hover:text-blue-700">
        {number}
      </div>

      <div>
        <div className="font-semibold text-slate-900">{title}</div>

        <div className="mt-1 text-sm leading-5 text-slate-500">
          {description}
        </div>
      </div>
    </div>
  );
}

function FeatureCard({ title, text }: { title: string; text: string }) {
  return (
    <div className="group rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition duration-200 hover:-translate-y-1 hover:border-blue-200 hover:shadow-md">
      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-sm font-bold text-[var(--brand)]">
        ✓
      </div>

      <h3 className="mt-5 font-bold text-slate-900">{title}</h3>

      <p className="mt-2 text-sm leading-6 text-slate-500">{text}</p>
    </div>
  );
}
