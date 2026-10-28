// src/pages/Home/index.tsx

import { useEffect, useState } from "react";
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
      <WelcomeIntro dashboardPath={dashboardPath} signedIn={Boolean(user)} />

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
                href="https://www.omegabiochem.com/contact-us.html"
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

/* ======================================================
   FIRST-TIME WELCOME INTRO
====================================================== */

const WELCOME_INTRO_STORAGE_KEY = "omega-lims-welcome-intro-v1";
const WELCOME_SCENE_DURATION_MS = 8000;

const welcomeScenes = [
  {
    number: "01",
    eyebrow: "Welcome",
    title: "Welcome to Omega BioChem",
    accent: "Laboratory Information Management System",
    description:
      "A secure digital workspace connecting authorized clients and laboratory personnel throughout the laboratory process.",
    bullets: [
      "Secure portal access",
      "Centralized laboratory information",
      "Simple, guided workflows",
    ],
  },
  {
    number: "02",
    eyebrow: "Secure Access",
    title: "The right access for the right user",
    accent: "Role-based laboratory access",
    description:
      "Authorized users enter a controlled workspace designed around their responsibilities and laboratory activities.",
    bullets: [
      "Role-based access",
      "Protected client information",
      "Controlled user experience",
    ],
  },
  {
    number: "03",
    eyebrow: "Submissions",
    title: "Manage laboratory submissions",
    accent: "From request to laboratory workflow",
    description:
      "Create, review, and follow authorized laboratory submissions from one centralized portal.",
    bullets: [
      "Create submissions",
      "Review submitted information",
      "Track active laboratory work",
    ],
  },
  {
    number: "04",
    eyebrow: "Workflow Tracking",
    title: "Follow every stage with clarity",
    accent: "Controlled laboratory workflows",
    description:
      "See where submissions are in the process as they move through testing, review, approval, and reporting.",
    bullets: [
      "Clear workflow status",
      "Structured review stages",
      "Better visibility across teams",
    ],
  },
  {
    number: "05",
    eyebrow: "Reports & Results",
    title: "Access laboratory information securely",
    accent: "Reports, results, and attachments",
    description:
      "View available laboratory reports, results, and supporting attachments from your authorized workspace.",
    bullets: [
      "Digital reports",
      "Available laboratory results",
      "Secure attachments",
    ],
  },
  {
    number: "06",
    eyebrow: "Communication",
    title: "Stay informed as work progresses",
    accent: "Notifications and laboratory communication",
    description:
      "Important workflow updates help clients and laboratory personnel stay aligned throughout the process.",
    bullets: [
      "Workflow notifications",
      "Timely status awareness",
      "Centralized communication",
    ],
  },
  {
    number: "07",
    eyebrow: "Ready",
    title: "Everything in one secure platform",
    accent: "Welcome to Omega LIMS",
    description:
      "You are ready to begin. Use Omega LIMS to manage laboratory information with a clear, connected workflow.",
    bullets: ["Secure access", "Controlled workflows", "Digital reporting"],
  },
];

function WelcomeIntro({
  dashboardPath,
  signedIn,
}: {
  dashboardPath: string;
  signedIn: boolean;
}) {
  const [showIntro, setShowIntro] = useState(false);
  const [sceneIndex, setSceneIndex] = useState(0);

  const totalDuration = welcomeScenes.length * WELCOME_SCENE_DURATION_MS;

  useEffect(() => {
    try {
      const alreadySeen = localStorage.getItem(WELCOME_INTRO_STORAGE_KEY);
      if (!alreadySeen) {
        setShowIntro(true);
      }
    } catch {
      // If storage is unavailable, simply allow the regular Home page to render.
    }
  }, []);

  useEffect(() => {
    if (!showIntro) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [showIntro]);

  useEffect(() => {
    if (!showIntro) return;

    const sceneTimer = window.setInterval(() => {
      setSceneIndex((current) =>
        current < welcomeScenes.length - 1 ? current + 1 : current,
      );
    }, WELCOME_SCENE_DURATION_MS);

    const finishTimer = window.setTimeout(() => {
      finishIntro();
    }, totalDuration);

    return () => {
      window.clearInterval(sceneTimer);
      window.clearTimeout(finishTimer);
    };
    // totalDuration is derived from constants and does not change while mounted.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showIntro]);

  function finishIntro() {
    try {
      localStorage.setItem(WELCOME_INTRO_STORAGE_KEY, "seen");
    } catch {
      // The intro can still close even when localStorage is unavailable.
    }

    setShowIntro(false);
  }

  if (!showIntro) return null;

  const scene = welcomeScenes[sceneIndex];
  const isLastScene = sceneIndex === welcomeScenes.length - 1;

  return (
    <div
      className="fixed inset-0 z-[9999] overflow-hidden bg-white text-slate-900"
      role="dialog"
      aria-modal="true"
      aria-label="Welcome to Omega BioChem Laboratory Information Management System"
    >
      <style>{`
        @keyframes omegaIntroSceneIn {
          0% {
            opacity: 0;
            transform: translateY(22px) scale(.985);
            filter: blur(7px);
          }
          100% {
            opacity: 1;
            transform: translateY(0) scale(1);
            filter: blur(0);
          }
        }

        @keyframes omegaIntroFloatA {
          0%, 100% { transform: translate3d(0, 0, 0) scale(1); }
          50% { transform: translate3d(28px, -18px, 0) scale(1.08); }
        }

        @keyframes omegaIntroFloatB {
          0%, 100% { transform: translate3d(0, 0, 0) scale(1); }
          50% { transform: translate3d(-22px, 24px, 0) scale(.94); }
        }

        @keyframes omegaIntroPulseRing {
          0% { transform: scale(.78); opacity: .7; }
          70%, 100% { transform: scale(1.22); opacity: 0; }
        }

        @keyframes omegaIntroProgress {
          from { width: 0%; }
          to { width: 100%; }
        }

        @keyframes omegaIntroScan {
          0% { transform: translateY(-120%); opacity: 0; }
          15% { opacity: .55; }
          85% { opacity: .2; }
          100% { transform: translateY(620%); opacity: 0; }
        }
      `}</style>

      {/* Animated background */}
      <div className="pointer-events-none absolute inset-0">
        <div
          className="absolute -left-24 -top-28 h-[460px] w-[460px] rounded-full bg-blue-100/70 blur-3xl"
          style={{ animation: "omegaIntroFloatA 10s ease-in-out infinite" }}
        />
        <div
          className="absolute -bottom-40 -right-24 h-[560px] w-[560px] rounded-full bg-cyan-100/60 blur-3xl"
          style={{ animation: "omegaIntroFloatB 12s ease-in-out infinite" }}
        />
        <div
          className="absolute inset-0 opacity-[0.06]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(15,23,42,.25) 1px, transparent 1px), linear-gradient(90deg, rgba(15,23,42,.25) 1px, transparent 1px)",
            backgroundSize: "44px 44px",
          }}
        />
        <div className="absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-blue-100/50 to-transparent" />
      </div>

      {/* Header */}
      <div className="relative z-10 flex items-center justify-between px-6 py-5 sm:px-9 lg:px-12">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-blue-100 bg-blue-50 shadow-sm">
            <img
              src="/logo.svg"
              alt="Omega BioChem"
              className="h-7 w-7"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).src =
                  "/favicon-32x32.png";
              }}
            />
          </div>

          <div>
            <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--brand)]">
              Omega BioChem
            </div>
            <div className="text-sm font-semibold text-slate-900">
              Laboratory Information Management System
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={finishIntro}
          className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 backdrop-blur transition hover:border-blue-300 hover:bg-blue-50 hover:text-[var(--brand)]"
        >
          Skip Intro
        </button>
      </div>

      {/* Main stage */}
      <div className="relative z-10 mx-auto grid min-h-[calc(100vh-140px)] max-w-7xl items-center gap-10 px-6 pb-20 pt-5 sm:px-9 lg:grid-cols-[1.08fr_.92fr] lg:px-12">
        <div
          key={`copy-${sceneIndex}`}
          style={{ animation: "omegaIntroSceneIn 700ms ease-out both" }}
        >
          <div className="mb-5 flex items-center gap-3">
            <span className="flex h-8 min-w-8 items-center justify-center rounded-lg border border-blue-200 bg-blue-50 px-2 text-xs font-bold text-[var(--brand)]">
              {scene.number}
            </span>

            <span className="text-xs font-bold uppercase tracking-[0.22em] text-[var(--brand)]">
              {scene.eyebrow}
            </span>
          </div>

          <h2 className="max-w-3xl text-4xl font-bold leading-[1.06] tracking-tight text-slate-950 sm:text-5xl lg:text-[64px]">
            {scene.title}
          </h2>

          <div className="mt-4 max-w-2xl text-xl font-semibold text-[var(--brand)] sm:text-2xl">
            {scene.accent}
          </div>

          <p className="mt-6 max-w-2xl text-base leading-7 text-slate-600 sm:text-lg sm:leading-8">
            {scene.description}
          </p>

          <div className="mt-8 grid max-w-2xl gap-3 sm:grid-cols-3">
            {scene.bullets.map((bullet, index) => (
              <div
                key={bullet}
                className="rounded-2xl border border-slate-200 bg-white px-4 py-4 text-sm font-medium text-slate-700 backdrop-blur"
                style={{
                  animation: `omegaIntroSceneIn 600ms ${
                    180 + index * 120
                  }ms ease-out both`,
                }}
              >
                <span className="mb-3 flex h-7 w-7 items-center justify-center rounded-full bg-emerald-50 text-xs font-bold text-emerald-700">
                  ✓
                </span>
                {bullet}
              </div>
            ))}
          </div>

          {isLastScene && (
            <div
              className="mt-8 flex flex-wrap items-center gap-3"
              style={{
                animation: "omegaIntroSceneIn 650ms 350ms ease-out both",
              }}
            >
              <Link
                to={signedIn ? dashboardPath : "/login"}
                onClick={finishIntro}
                className="inline-flex items-center gap-2 rounded-xl bg-[var(--brand)] px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-900/10 transition hover:-translate-y-0.5 hover:opacity-95"
              >
                {signedIn ? "Open Dashboard" : "Continue to Sign In"}
                <span aria-hidden="true">→</span>
              </Link>

              <button
                type="button"
                onClick={finishIntro}
                className="rounded-xl border border-slate-300 bg-white px-6 py-3 text-sm font-semibold text-slate-700 transition hover:bg-blue-50"
              >
                View Home Page
              </button>
            </div>
          )}
        </div>

        {/* Video-like visual */}
        <div
          key={`visual-${sceneIndex}`}
          className="relative mx-auto w-full max-w-xl"
          style={{ animation: "omegaIntroSceneIn 800ms 120ms ease-out both" }}
        >
          <div className="absolute -inset-8 rounded-[44px] bg-blue-100/70 blur-3xl" />

          <div className="relative overflow-hidden rounded-[32px] border border-slate-200 bg-white/95 p-5 shadow-2xl shadow-slate-900/10 backdrop-blur-xl sm:p-7">
            <div
              className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-blue-100/70 to-transparent"
              style={{ animation: "omegaIntroScan 4.5s ease-in-out infinite" }}
            />

            <div className="flex items-center justify-between border-b border-slate-100 pb-5">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">
                  Omega LIMS
                </div>
                <div className="mt-1 text-lg font-bold text-slate-900">
                  Secure Laboratory Portal
                </div>
              </div>

              <div className="relative flex h-16 w-16 items-center justify-center">
                <div
                  className="absolute inset-0 rounded-full border border-blue-200"
                  style={{
                    animation: "omegaIntroPulseRing 2.2s ease-out infinite",
                  }}
                />
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-lg font-black text-[var(--brand)] ring-1 ring-inset ring-blue-100">
                  {scene.number}
                </div>
              </div>
            </div>

            <div className="py-7">
              <div className="rounded-2xl border border-blue-200 bg-blue-50 p-5">
                <div className="flex items-center gap-3">
                  <span className="relative flex h-3 w-3">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-50" />
                    <span className="relative inline-flex h-3 w-3 rounded-full bg-emerald-400" />
                  </span>

                  <span className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-700">
                    Secure System
                  </span>
                </div>

                <div className="mt-5 text-2xl font-bold tracking-tight text-[var(--brand)] sm:text-3xl">
                  {scene.accent}
                </div>

                <div className="mt-5 space-y-3">
                  {scene.bullets.map((bullet, index) => (
                    <div
                      key={`${bullet}-visual`}
                      className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3"
                      style={{
                        animation: `omegaIntroSceneIn 500ms ${
                          280 + index * 130
                        }ms ease-out both`,
                      }}
                    >
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-xs font-bold text-[var(--brand)]">
                        0{index + 1}
                      </div>
                      <div className="text-sm font-medium text-slate-700">
                        {bullet}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between border-t border-slate-200 pt-5 text-xs text-slate-500">
              <span>Authorized access only</span>
              <span>
                {sceneIndex + 1} / {welcomeScenes.length}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom progress */}
      <div className="absolute inset-x-0 bottom-0 z-20">
        <div className="flex items-center justify-between px-6 pb-4 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500 sm:px-9 lg:px-12">
          <span>Welcome tour</span>
          <span>About 1 minute</span>
        </div>

        <div className="h-1 bg-blue-100">
          <div
            className="h-full bg-[var(--brand)]"
            style={{
              animation: `omegaIntroProgress ${totalDuration}ms linear forwards`,
            }}
          />
        </div>
      </div>
    </div>
  );
}
