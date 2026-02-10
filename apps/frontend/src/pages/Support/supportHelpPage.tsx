// SupportHelpPage.tsx
import React, { useMemo, useState } from "react";
import { api } from "../../lib/api";

type Article = {
  id: string;
  title: string;
  category:
    | "Getting Started"
    | "Login & Security"
    | "Reports & Workflows"
    | "Attachments & Printing"
    | "Troubleshooting"
    | "Compliance";
  body: React.ReactNode;
  keywords: string[];
};

type StatusItem = {
  name: string;
  status: "operational" | "degraded" | "down";
  detail?: string;
};

function cn(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

function Badge({ status }: { status: StatusItem["status"] }) {
  const label =
    status === "operational"
      ? "Operational"
      : status === "degraded"
        ? "Degraded"
        : "Down";
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        status === "operational" &&
          "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200",
        status === "degraded" &&
          "bg-amber-50 text-amber-700 ring-1 ring-amber-200",
        status === "down" && "bg-rose-50 text-rose-700 ring-1 ring-rose-200",
      )}
    >
      {label}
    </span>
  );
}

function Section({
  id,
  title,
  subtitle,
  children,
}: {
  id: string;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-24">
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
        {subtitle ? (
          <p className="mt-1 text-sm text-slate-600">{subtitle}</p>
        ) : null}
      </div>
      {children}
    </section>
  );
}

function Accordion({
  items,
}: {
  items: Array<{ title: string; content: React.ReactNode }>;
}) {
  return (
    <div className="divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white">
      {items.map((it, idx) => (
        <details key={idx} className="group p-4">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
            <span className="text-sm font-medium text-slate-900">
              {it.title}
            </span>
            <span className="text-slate-400 group-open:rotate-180 transition-transform">
              ⌄
            </span>
          </summary>
          <div className="mt-3 text-sm text-slate-600 leading-relaxed">
            {it.content}
          </div>
        </details>
      ))}
    </div>
  );
}

function Card({
  title,
  subtitle,
  children,
  right,
}: {
  title: string;
  subtitle?: string;
  children?: React.ReactNode;
  right?: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
          {subtitle ? (
            <p className="mt-1 text-xs text-slate-600">{subtitle}</p>
          ) : null}
        </div>
        {right}
      </div>
      {children ? <div className="mt-4">{children}</div> : null}
    </div>
  );
}

export default function SupportHelpPage() {
  const techSupportEmail = "tech@omegabiochemlab.com";
  const labSupportEmail = "lab@omegabiochem.com";
  const [q, setQ] = useState("");
  const [activeCategory, setActiveCategory] = useState<
    Article["category"] | "All"
  >("All");

  const [techcopied, settechCopied] = useState(false);

  const [labcopied, setlabCopied] = useState(false);

  const techCopyEmail = async () => {
    try {
      await navigator.clipboard.writeText(techSupportEmail);
      settechCopied(true);
      window.setTimeout(() => settechCopied(false), 1200);
    } catch {
      // clipboard may be blocked; ignore
    }
  };
  const labCopyEmail = async () => {
    try {
      await navigator.clipboard.writeText(labSupportEmail);
      setlabCopied(true);
      window.setTimeout(() => setlabCopied(false), 1200);
    } catch {
      // clipboard may be blocked; ignore
    }
  };
  const [ticketBusy, setTicketBusy] = useState(false);
  const [ticketMsg, setTicketMsg] = useState<{
    type: "ok" | "err";
    text: string;
  } | null>(null);

  const [ticket, setTicket] = useState({
    category: "BUG_ERROR",
    reportId: "",
    reportType: "",
    description: "",
  });

  const kb: Article[] = useMemo(
    () => [
      {
        id: "first-login",
        title: "First-time login: set your password",
        category: "Getting Started",
        keywords: ["first time", "set password", "credentials", "welcome"],
        body: (
          <ol className="list-decimal pl-5 space-y-1">
            <li>Use the User ID and temporary password sent to your email.</li>
            <li>
              On first login, you’ll be prompted to create your own password.
            </li>
            <li>
              After setting a password, you’ll be redirected to your role
              dashboard.
            </li>
          </ol>
        ),
      },
      {
        id: "password-reset",
        title: "Password reset (via Lab Tech Department)",
        category: "Login & Security",
        keywords: ["forgot", "reset", "password", "temp password", "lab tech"],
        body: (
          <div className="space-y-2">
            <p>
              For security and compliance, password resets are handled by the{" "}
              <span className="font-medium">Lab Tech Department</span>.
            </p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Email Lab Tech to request a new temporary password.</li>
              <li>
                Include your name, company/lab, role, and the email used for
                access.
              </li>
              <li>Do not share OTP codes or passwords with anyone.</li>
            </ul>
            <div className="pt-2">
              <a
                className="text-xs font-semibold text-slate-800 hover:underline"
                href={`mailto:${labSupportEmail}?subject=${encodeURIComponent(
                  "[Omega LIMS] Password Reset Request",
                )}&body=${encodeURIComponent(
                  "Name:\nCompany/Lab:\nRole:\nEmail used for login:\nIssue:\n",
                )}`}
              >
                Email Lab Tech →
              </a>
            </div>
          </div>
        ),
      },
      {
        id: "otp-issues",
        title: "Didn’t receive verification code (OTP)",
        category: "Login & Security",
        keywords: ["otp", "code", "verify", "2fa", "email delay"],
        body: (
          <div className="space-y-2">
            <ul className="list-disc pl-5 space-y-1">
              <li>Wait 30–60 seconds (email delay is common).</li>
              <li>
                Click <span className="font-medium">Resend Code</span> and retry
                once.
              </li>
              <li>
                Avoid requesting multiple codes quickly (only the latest works).
              </li>
              <li>Check spam/quarantine.</li>
            </ul>
          </div>
        ),
      },
      {
        id: "workflow-status",
        title: "Report status workflow (Draft → Review → Approved → Released)",
        category: "Reports & Workflows",
        keywords: [
          "status",
          "workflow",
          "draft",
          "review",
          "approved",
          "released",
        ],
        body: (
          <div className="space-y-2">
            <p>
              Reports move through controlled statuses. Editing permissions
              change by status and role.
            </p>
            <ul className="list-disc pl-5 space-y-1">
              <li>
                <span className="font-medium">Draft</span>: report creation and
                edits.
              </li>
              <li>
                <span className="font-medium">Review</span>: QA/Reviewer checks,
                may request corrections.
              </li>
              <li>
                <span className="font-medium">Approved</span>: e-signature
                applied; limited edits.
              </li>
              <li>
                <span className="font-medium">Released</span>: finalized;
                read-only for most roles.
              </li>
            </ul>
          </div>
        ),
      },
      {
        id: "corrections",
        title: "Corrections & version history",
        category: "Reports & Workflows",
        keywords: ["correction", "version", "audit trail", "changes"],
        body: (
          <div className="space-y-2">
            <p>
              Corrections preserve history. Each correction records who changed
              what, when, and why.
            </p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Use the Corrections panel to request/resolve corrections.</li>
              <li>Provide a change reason when required.</li>
              <li>All changes are tracked in the audit trail.</li>
            </ul>
          </div>
        ),
      },
      {
        id: "attachments",
        title: "Attachments: upload rules & printing",
        category: "Attachments & Printing",
        keywords: ["attachments", "upload", "pdf", "print", "bulk print"],
        body: (
          <div className="space-y-2">
            <ul className="list-disc pl-5 space-y-1">
              <li>
                Supported: PDF, JPG/PNG, DOCX (as allowed by your lab policy).
              </li>
              <li>Some statuses require attachments before approval.</li>
              <li>
                Bulk print can include attachments depending on selection.
              </li>
            </ul>
          </div>
        ),
      },
      {
        id: "troubleshoot",
        title: "Common troubleshooting checklist",
        category: "Troubleshooting",
        keywords: ["slow", "error", "not working", "cache", "browser"],
        body: (
          <div className="space-y-2">
            <ul className="list-disc pl-5 space-y-1">
              <li>Refresh the page and try again.</li>
              <li>
                Confirm you are using the recommended browser (Chrome/Edge).
              </li>
              <li>Disable ad blockers for the portal domain.</li>
              <li>Try an incognito/private window.</li>
              <li>If printing fails, download PDF and print locally.</li>
            </ul>
          </div>
        ),
      },
      {
        id: "compliance",
        title: "Compliance: audit trail & e-signatures",
        category: "Compliance",
        keywords: ["21 cfr part 11", "audit", "esign", "compliance"],
        body: (
          <div className="space-y-2">
            <p>
              The system maintains audit trails for key actions and supports
              electronic signatures per configured lab policy.
            </p>
            <ul className="list-disc pl-5 space-y-1">
              <li>
                Audit trails capture actor, timestamp, action, and metadata.
              </li>
              <li>
                E-sign requires authenticated user and reason (when applicable).
              </li>
              <li>Released reports are protected from untracked edits.</li>
            </ul>
          </div>
        ),
      },
    ],
    [],
  );

  const categories: Array<Article["category"]> = useMemo(
    () => [
      "Getting Started",
      "Login & Security",
      "Reports & Workflows",
      "Attachments & Printing",
      "Troubleshooting",
      "Compliance",
    ],
    [],
  );

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    return kb.filter((a) => {
      const catOk = activeCategory === "All" || a.category === activeCategory;
      if (!catOk) return false;
      if (!query) return true;
      const hay =
        `${a.title} ${a.category} ${a.keywords.join(" ")}`.toLowerCase();
      return hay.includes(query);
    });
  }, [kb, q, activeCategory]);

  const status: StatusItem[] = [
    {
      name: "API",
      status: "operational",
      detail: "All endpoints responding normally.",
    },
    {
      name: "Database",
      status: "operational",
      detail: "Healthy connections and latency.",
    },
    {
      name: "Email Notifications",
      status: "operational",
      detail: "Delivery within normal range.",
    },
    {
      name: "File Storage",
      status: "operational",
      detail: "Uploads/downloads available.",
    },
  ];

  const quickLinks = [
    { label: "I can’t log in", href: "#quick-login" },
    { label: "OTP / verification", href: "#quick-otp" },
    { label: "Report workflow", href: "#kb" },
    { label: "Upload/print help", href: "#kb" },
    { label: "Contact support", href: "#contact" },
    { label: "Report an issue", href: "#ticket" },
  ];

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-6xl px-4 py-6">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="text-2xl font-semibold text-slate-900">
                Support & Help
              </h1>
              <p className="mt-1 text-sm text-slate-600">
                Find answers, report issues, and contact support for your LIMS
                portal.
              </p>
            </div>

            {/* Search */}
            <div className="w-full sm:w-[420px]">
              <label className="sr-only" htmlFor="support-search">
                Search help
              </label>
              <div className="relative">
                <input
                  id="support-search"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Search: login, OTP, workflow, printing..."
                  className="w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm text-slate-900 shadow-sm outline-none ring-0 placeholder:text-slate-400 focus:border-slate-400"
                />
                {q ? (
                  <button
                    type="button"
                    onClick={() => setQ("")}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg px-2 py-1 text-xs text-slate-600 hover:bg-slate-100"
                  >
                    Clear
                  </button>
                ) : null}
              </div>
            </div>
          </div>

          {/* Quick Links */}
          <div className="mt-4 flex flex-wrap gap-2">
            {quickLinks.map((l) => (
              <a
                key={l.href}
                href={l.href}
                className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-white"
              >
                {l.label}
              </a>
            ))}
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="mx-auto grid max-w-6xl grid-cols-1 gap-6 px-4 py-6 lg:grid-cols-12">
        {/* Left: main */}
        <div className="lg:col-span-8 space-y-6">
          {/* Quick Help */}
          <Section
            id="quick"
            title="Quick Help"
            subtitle="Jump to the most common issues."
          >
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Card
                title="I can’t log in"
                subtitle="Password, account lockout, access errors"
                right={
                  <a
                    className="text-xs font-medium text-slate-700 hover:underline"
                    href="#quick-login"
                  >
                    Open
                  </a>
                }
              >
                <p className="text-sm text-slate-600">
                  If you forgot your password or your temporary password
                  expired, contact Lab Tech for re-issue.
                </p>
              </Card>

              <Card
                title="OTP / Verification issues"
                subtitle="Didn’t receive code, code expired"
                right={
                  <a
                    className="text-xs font-medium text-slate-700 hover:underline"
                    href="#quick-otp"
                  >
                    Open
                  </a>
                }
              >
                <p className="text-sm text-slate-600">
                  Email delivery may take 30–60 seconds. Only the latest code is
                  valid.
                </p>
              </Card>

              <Card
                title="Report workflow help"
                subtitle="Draft → Review → Approved → Released"
                right={
                  <a
                    className="text-xs font-medium text-slate-700 hover:underline"
                    href="#kb"
                  >
                    Browse
                  </a>
                }
              >
                <p className="text-sm text-slate-600">
                  Learn what each status means and who can edit in each stage.
                </p>
              </Card>

              <Card
                title="Attachments & printing"
                subtitle="Upload issues, bulk print, previews"
                right={
                  <a
                    className="text-xs font-medium text-slate-700 hover:underline"
                    href="#kb"
                  >
                    Browse
                  </a>
                }
              >
                <p className="text-sm text-slate-600">
                  Check supported file types, required attachments, and printing
                  options.
                </p>
              </Card>
            </div>
          </Section>

          {/* Quick Details */}
          <Section id="quick-login" title="Login Troubleshooting">
            <Accordion
              items={[
                {
                  title: "Password reset (handled by Lab Tech)",
                  content: (
                    <div className="space-y-2">
                      <p>
                        Omega LIMS does not provide self-service password reset.
                        Please contact{" "}
                        <span className="font-medium">Lab Tech</span> to
                        re-issue a temporary password.
                      </p>
                      <ul className="list-disc pl-5 space-y-1">
                        <li>
                          Include your name, company/lab, role, and email used
                          for login.
                        </li>
                        <li>
                          Temporary passwords may expire — request a new one if
                          needed.
                        </li>
                        <li>Do not share OTP codes with anyone.</li>
                      </ul>
                      <div className="pt-2">
                        <a
                          className="text-xs font-semibold text-slate-800 hover:underline"
                          href={`mailto:${labSupportEmail}?subject=${encodeURIComponent(
                            "[Omega LIMS] Password Reset Request",
                          )}&body=${encodeURIComponent(
                            "Name:\nCompany/Lab:\nRole:\nEmail used for login:\nIssue:\n",
                          )}`}
                        >
                          Email Lab Tech →
                        </a>
                      </div>
                    </div>
                  ),
                },
                {
                  title: "Account locked or access denied",
                  content: (
                    <div className="space-y-2">
                      <p>Common causes:</p>
                      <ul className="list-disc pl-5 space-y-1">
                        <li>Too many failed login attempts</li>
                        <li>Role permissions changed</li>
                        <li>IP allowlist restrictions (if enabled)</li>
                      </ul>
                    </div>
                  ),
                },
              ]}
            />
          </Section>

          <Section id="quick-otp" title="OTP / Verification Troubleshooting">
            <Accordion
              items={[
                {
                  title: "Didn’t receive the OTP",
                  content: (
                    <div className="space-y-2">
                      <ul className="list-disc pl-5 space-y-1">
                        <li>Wait 30–60 seconds for delivery.</li>
                        <li>
                          Click <span className="font-medium">Resend Code</span>
                          .
                        </li>
                        <li>
                          Only the latest code works—avoid multiple rapid
                          requests.
                        </li>
                        <li>
                          Check spam/quarantine and allow the sender domain.
                        </li>
                      </ul>
                    </div>
                  ),
                },
                {
                  title: "Code expired / invalid",
                  content: (
                    <div className="space-y-2">
                      <p>
                        If you requested multiple codes, earlier codes become
                        invalid. Use the newest message.
                      </p>
                    </div>
                  ),
                },
              ]}
            />
          </Section>

          {/* Knowledge Base */}
          <Section
            id="kb"
            title="Knowledge Base"
            subtitle="Search and filter help articles."
          >
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setActiveCategory("All")}
                className={cn(
                  "rounded-full px-3 py-1.5 text-xs font-medium ring-1 ring-inset",
                  activeCategory === "All"
                    ? "bg-slate-900 text-white ring-slate-900"
                    : "bg-white text-slate-700 ring-slate-200 hover:bg-slate-50",
                )}
              >
                All
              </button>
              {categories.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setActiveCategory(c)}
                  className={cn(
                    "rounded-full px-3 py-1.5 text-xs font-medium ring-1 ring-inset",
                    activeCategory === c
                      ? "bg-slate-900 text-white ring-slate-900"
                      : "bg-white text-slate-700 ring-slate-200 hover:bg-slate-50",
                  )}
                >
                  {c}
                </button>
              ))}
            </div>

            <div className="mt-4">
              {filtered.length ? (
                <Accordion
                  items={filtered.map((a) => ({
                    title: `${a.title} · ${a.category}`,
                    content: a.body,
                  }))}
                />
              ) : (
                <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
                  No results. Try searching “OTP”, “workflow”, “attachments”, or
                  clear filters.
                </div>
              )}
            </div>
          </Section>

          {/* Ticket form */}
          <Section
            id="ticket"
            title="Report an Issue"
            subtitle="Submit a ticket for technical problems or unexpected behavior."
          >
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              {ticketMsg ? (
                <div
                  className={cn(
                    "mb-3 rounded-xl border px-3 py-2 text-sm",
                    ticketMsg.type === "ok"
                      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                      : "border-rose-200 bg-rose-50 text-rose-800",
                  )}
                >
                  {ticketMsg.text}
                </div>
              ) : null}
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  setTicketMsg(null);

                  if (!ticket.description.trim()) {
                    setTicketMsg({
                      type: "err",
                      text: "Please enter a description.",
                    });
                    return;
                  }

                  setTicketBusy(true);
                  try {
                    const payload = {
                      category: ticket.category,
                      reportId: ticket.reportId.trim() || undefined,
                      reportType: ticket.reportType.trim() || undefined,
                      description: ticket.description.trim(),
                      clientTime: new Date().toISOString(),
                      meta: { page: window.location.pathname },
                    };

                    await api("/support/tickets", {
                      method: "POST",
                      body: JSON.stringify(payload),
                    });

                    setTicketMsg({
                      type: "ok",
                      text: "Ticket submitted successfully. Support will contact you shortly.",
                    });
                    setTicket({
                      category: "BUG_ERROR",
                      reportId: "",
                      reportType: "",
                      description: "",
                    });
                  } catch (err: any) {
                    setTicketMsg({
                      type: "err",
                      text:
                        err?.message ||
                        "Failed to submit ticket. Please try again or email support.",
                    });
                  } finally {
                    setTicketBusy(false);
                  }
                }}
                className="grid grid-cols-1 gap-4 sm:grid-cols-2"
              >
                <div className="sm:col-span-1">
                  <label className="text-xs font-medium text-slate-700">
                    Category
                  </label>
                  <select
                    className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
                    value={ticket.category}
                    onChange={(e) =>
                      setTicket((p) => ({ ...p, category: e.target.value }))
                    }
                  >
                    <option value="LOGIN_ACCESS">Login / Access</option>
                    <option value="OTP_VERIFICATION">OTP / Verification</option>
                    <option value="REPORTS_WORKFLOW">Reports / Workflow</option>
                    <option value="ATTACHMENTS_PRINTING">
                      Attachments / Printing
                    </option>
                    <option value="PERFORMANCE">Performance</option>
                    <option value="BUG_ERROR">Bug / Error</option>
                    <option value="OTHER">Other</option>
                  </select>
                </div>

                <div className="sm:col-span-1">
                  <label className="text-xs font-medium text-slate-700">
                    Report ID (optional)
                  </label>
                  <input
                    className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
                    placeholder="e.g., CHEM-2026-00123"
                    value={ticket.reportId}
                    onChange={(e) =>
                      setTicket((p) => ({ ...p, reportId: e.target.value }))
                    }
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="text-xs font-medium text-slate-700">
                    Description
                  </label>
                  <textarea
                    className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
                    rows={4}
                    placeholder="What happened? What did you expect? Include steps to reproduce."
                    value={ticket.description}
                    onChange={(e) =>
                      setTicket((p) => ({ ...p, description: e.target.value }))
                    }
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="text-xs font-medium text-slate-700">
                    Screenshot (optional)
                  </label>
                  <input
                    type="file"
                    className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
                    accept="image/*,application/pdf"
                  />
                  <p className="mt-1 text-xs text-slate-500">
                    Attach screenshots or PDFs (avoid including sensitive PHI
                    unless required).
                  </p>
                </div>

                <div className="sm:col-span-2 flex items-center justify-end gap-2">
                  <button
                    type="reset"
                    className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                  >
                    Clear
                  </button>
                  <button
                    type="submit"
                    disabled={ticketBusy || !ticket.description.trim()}
                    className={cn(
                      "rounded-xl px-4 py-2 text-sm font-medium text-white",
                      ticketBusy || !ticket.description.trim()
                        ? "bg-slate-400 cursor-not-allowed"
                        : "bg-slate-900 hover:bg-slate-800",
                    )}
                  >
                    {ticketBusy ? "Submitting..." : "Submit Ticket"}
                  </button>
                </div>
              </form>
            </div>
          </Section>
        </div>

        {/* Right: sidebar */}
        <aside className="lg:col-span-4 space-y-6">
          {/* Contact */}
          <Section
            id="contact"
            title="Contact Support"
            subtitle="Escalate issues with clear channels."
          >
            <div className="space-y-4">
              <Card
                title="Technical Support"
                subtitle="System errors, access issues, unexpected behavior"
                right={<span className="text-xs text-slate-500">Email</span>}
              >
                <div className="text-sm text-slate-700">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{techSupportEmail}</span>
                    <button
                      type="button"
                      className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-800 hover:bg-slate-100"
                      onClick={techCopyEmail}
                    >
                      {techcopied ? "Copied" : "Copy"}
                    </button>
                  </div>
                  <p className="mt-2 text-xs text-slate-500">
                    Critical: 4 hrs · Normal: 1 business day
                  </p>
                </div>
              </Card>

              <Card
                title="Lab / Workflow Support"
                subtitle="Questions about approvals, corrections, report rules"
                right={<span className="text-xs text-slate-500">Email</span>}
              >
                <div className="text-sm text-slate-700">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{labSupportEmail}</span>
                    <button
                      type="button"
                      className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-800 hover:bg-slate-100"
                      onClick={labCopyEmail}
                    >
                      {labcopied ? "Copied" : "Copy"}
                    </button>
                  </div>
                  <p className="mt-2 text-xs text-slate-500">
                    Mon–Fri · 9:00 AM–6:00 PM (local)
                  </p>
                </div>
              </Card>
            </div>
          </Section>

          {/* System Status */}
          <Section
            id="status"
            title="System Status"
            subtitle="Live status helps reduce support requests."
          >
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="space-y-3">
                {status.map((s) => (
                  <div
                    key={s.name}
                    className="flex items-start justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50 p-3"
                  >
                    <div>
                      <div className="text-sm font-medium text-slate-900">
                        {s.name}
                      </div>
                      {s.detail ? (
                        <div className="mt-0.5 text-xs text-slate-600">
                          {s.detail}
                        </div>
                      ) : null}
                    </div>
                    <Badge status={s.status} />
                  </div>
                ))}
              </div>

              <p className="mt-4 text-xs text-slate-500">
                To make this truly live, fetch health from your API (e.g.,{" "}
                <span className="font-medium">GET /health</span>).
              </p>
            </div>
          </Section>

          {/* Downloads */}
          <Section
            id="docs"
            title="Documentation"
            subtitle="Version-controlled PDFs and quick guides."
          >
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <ul className="space-y-3 text-sm">
                <li className="flex items-center justify-between">
                  <span className="text-slate-700">User Manual (PDF)</span>
                  <button
                    className="text-xs font-medium text-slate-700 hover:underline"
                    type="button"
                  >
                    Download
                  </button>
                </li>
                <li className="flex items-center justify-between">
                  <span className="text-slate-700">Role Quick Guide (PDF)</span>
                  <button
                    className="text-xs font-medium text-slate-700 hover:underline"
                    type="button"
                  >
                    Download
                  </button>
                </li>
                <li className="flex items-center justify-between">
                  <span className="text-slate-700">
                    Security & Backup Overview (PDF)
                  </span>
                  <button
                    className="text-xs font-medium text-slate-700 hover:underline"
                    type="button"
                  >
                    Download
                  </button>
                </li>
                <li className="flex items-center justify-between">
                  <span className="text-slate-700">
                    Compliance Overview (PDF)
                  </span>
                  <button
                    className="text-xs font-medium text-slate-700 hover:underline"
                    type="button"
                  >
                    Download
                  </button>
                </li>
              </ul>
              <p className="mt-4 text-xs text-slate-500">
                Wire these buttons to your file URLs or an attachments endpoint.
              </p>
            </div>
          </Section>

          {/* Footer trust */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 text-xs text-slate-500 shadow-sm">
            <div className="flex items-center justify-between">
              <span>Omega LIMS</span>
              <span>v1.0</span>
            </div>
            <div className="mt-2 flex items-center justify-between">
              <a className="hover:underline" href="/privacy">
                Privacy Policy
              </a>
              <a className="hover:underline" href="/terms">
                Terms
              </a>
            </div>
            <div className="mt-3">
              All support actions may be logged for audit purposes based on your
              compliance configuration.
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
