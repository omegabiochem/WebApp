import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import { api } from "../../lib/api";

type UserSummary = {
  id: string;
  name?: string | null;
  email: string;
  role: string;
};

type TicketActivity = {
  id: string;
  createdAt: string;

  type:
    | "CREATED"
    | "STATUS_CHANGED"
    | "ASSIGNED"
    | "UNASSIGNED"
    | "NOTE";

  message?: string | null;

  fromStatus?: string | null;
  toStatus?: string | null;

  assignedToId?: string | null;
  assignedToName?: string | null;

  actor?: UserSummary | null;
};

type Ticket = {
  id: string;

  createdAt: string;
  updatedAt: string;

  category: string;
  status: string;

  reportId?: string | null;
  reportType?: string | null;

  description: string;

  clientTime?: string | null;
  userAgent?: string | null;
  meta?: unknown;

  createdBy?: UserSummary | null;
  assignedTo?: UserSummary | null;

  activities?: TicketActivity[];
};

type TicketsResponse = {
  items: Ticket[];

  total: number;

  page: number;
  pageSize: number;
  totalPages: number;

  counts: {
    OPEN: number;
    IN_PROGRESS: number;
    RESOLVED: number;
    CLOSED: number;
  };
};

type Status =
  | "OPEN"
  | "IN_PROGRESS"
  | "RESOLVED"
  | "CLOSED";

const CATEGORY_OPTIONS = [
  "All",
  "LOGIN_ACCESS",
  "OTP_VERIFICATION",
  "REPORTS_WORKFLOW",
  "ATTACHMENTS_PRINTING",
  "PERFORMANCE",
  "BUG_ERROR",
  "OTHER",
] as const;

const STATUS_OPTIONS: Array<"All" | Status> = [
  "All",
  "OPEN",
  "IN_PROGRESS",
  "RESOLVED",
  "CLOSED",
];

function cn(
  ...values: Array<
    string | false | null | undefined
  >
) {
  return values.filter(Boolean).join(" ");
}

function friendly(value?: string | null) {
  if (!value) return "—";

  return value
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/\b\w/g, (m) => m.toUpperCase());
}

function dateTime(value?: string | null) {
  if (!value) return "—";

  const d = new Date(value);

  if (Number.isNaN(d.getTime())) {
    return "—";
  }

  return d.toLocaleString();
}

function StatusBadge({
  status,
}: {
  status?: string | null;
}) {
  const current = status ?? "OPEN";

  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset",

        current === "OPEN" &&
          "bg-blue-50 text-blue-700 ring-blue-200",

        current === "IN_PROGRESS" &&
          "bg-amber-50 text-amber-700 ring-amber-200",

        current === "RESOLVED" &&
          "bg-emerald-50 text-emerald-700 ring-emerald-200",

        current === "CLOSED" &&
          "bg-slate-100 text-slate-700 ring-slate-200",
      )}
    >
      {friendly(current)}
    </span>
  );
}

function FilterChip({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full px-3 py-1.5 text-xs font-semibold ring-1 ring-inset transition",

        active
          ? "bg-[var(--brand)] text-white ring-[var(--brand)]"
          : "bg-white text-slate-700 ring-slate-200 hover:bg-slate-50",
      )}
    >
      {children}
    </button>
  );
}

function SummaryCard({
  label,
  count,
  selected,
  onClick,
  className,
}: {
  label: string;
  count: number;
  selected: boolean;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-2xl border bg-white p-4 text-left shadow-sm transition",
        "hover:-translate-y-0.5 hover:shadow-md",
        selected
          ? "border-[var(--brand)] ring-2 ring-[var(--brand)]/10"
          : "border-slate-200",
        className,
      )}
    >
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </div>

      <div className="mt-2 text-2xl font-bold text-slate-900">
        {count}
      </div>
    </button>
  );
}

export default function SupportTicketsPage() {
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] =
    useState("");

  const [category, setCategory] =
    useState<string>("All");

  const [status, setStatus] =
    useState<string>("All");

  const [page, setPage] =
    useState(1);

  const [busy, setBusy] =
    useState(false);

  const [err, setErr] =
    useState<string | null>(null);

  const [data, setData] =
    useState<TicketsResponse | null>(null);

  const [selectedId, setSelectedId] =
    useState<string | null>(null);

  const [selected, setSelected] =
    useState<Ticket | null>(null);

  const [detailBusy, setDetailBusy] =
    useState(false);

  const [actionBusy, setActionBusy] =
    useState(false);

  const [actionError, setActionError] =
    useState<string | null>(null);

  const [assignees, setAssignees] =
    useState<UserSummary[]>([]);

  const [statusDraft, setStatusDraft] =
    useState<Status>("OPEN");

  const [assigneeDraft, setAssigneeDraft] =
    useState("");

  const [note, setNote] =
    useState("");

  const [copied, setCopied] =
    useState(false);

  const categories = useMemo(
    () => CATEGORY_OPTIONS,
    [],
  );

  /*
   * Search debounce.
   *
   * Unlike the old page, this does not call load()
   * immediately after setPage(), which could use the
   * previous page value and cause duplicate requests.
   */
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setPage(1);
      setDebouncedQ(q.trim());
    }, 350);

    return () => {
      window.clearTimeout(timer);
    };
  }, [q]);

  const loadTickets = useCallback(
    async () => {
      setBusy(true);
      setErr(null);

      try {
        const params =
          new URLSearchParams();

        if (debouncedQ) {
          params.set(
            "q",
            debouncedQ,
          );
        }

        if (category !== "All") {
          params.set(
            "category",
            category,
          );
        }

        if (status !== "All") {
          params.set(
            "status",
            status,
          );
        }

        params.set(
          "page",
          String(page),
        );

        params.set(
          "pageSize",
          "20",
        );

        const result =
          await api<TicketsResponse>(
            `/support/tickets?${params.toString()}`,
          );

        setData(result);
      } catch (e: any) {
        setErr(
          e?.message ||
            "Failed to load support tickets.",
        );
      } finally {
        setBusy(false);
      }
    },
    [
      debouncedQ,
      category,
      status,
      page,
    ],
  );

  useEffect(() => {
    loadTickets();
  }, [loadTickets]);

  useEffect(() => {
    const loadAssignees =
      async () => {
        try {
          const result =
            await api<UserSummary[]>(
              "/support/assignees",
            );

          setAssignees(
            Array.isArray(result)
              ? result
              : [],
          );
        } catch {
          setAssignees([]);
        }
      };

    loadAssignees();
  }, []);

  const loadTicket = useCallback(
    async (id: string) => {
      setDetailBusy(true);
      setActionError(null);

      try {
        const ticket =
          await api<Ticket>(
            `/support/tickets/${id}`,
          );

        setSelected(ticket);

        setStatusDraft(
          (ticket.status || "OPEN") as Status,
        );

        setAssigneeDraft(
          ticket.assignedTo?.id ?? "",
        );
      } catch (e: any) {
        setActionError(
          e?.message ||
            "Failed to load ticket.",
        );
      } finally {
        setDetailBusy(false);
      }
    },
    [],
  );

  const openTicket = (
    ticket: Ticket,
  ) => {
    setSelectedId(ticket.id);
    setSelected(ticket);

    setStatusDraft(
      (ticket.status || "OPEN") as Status,
    );

    setAssigneeDraft(
      ticket.assignedTo?.id ?? "",
    );

    setNote("");
    setActionError(null);

    loadTicket(ticket.id);
  };

  const refreshSelected =
    async () => {
      if (!selectedId) return;

      await loadTicket(selectedId);
    };

  const updateStatus =
    async () => {
      if (!selectedId) return;

      setActionBusy(true);
      setActionError(null);

      try {
        const result =
          await api<Ticket>(
            `/support/tickets/${selectedId}/status`,
            {
              method: "PATCH",

              body: JSON.stringify({
                status: statusDraft,
              }),
            },
          );

        setSelected(result);

        await loadTickets();
      } catch (e: any) {
        setActionError(
          e?.message ||
            "Failed to update status.",
        );
      } finally {
        setActionBusy(false);
      }
    };

  const updateAssignee =
    async () => {
      if (!selectedId) return;

      setActionBusy(true);
      setActionError(null);

      try {
        const result =
          await api<Ticket>(
            `/support/tickets/${selectedId}/assign`,
            {
              method: "PATCH",

              body: JSON.stringify({
                assignedToId:
                  assigneeDraft || null,
              }),
            },
          );

        setSelected(result);

        await loadTickets();
      } catch (e: any) {
        setActionError(
          e?.message ||
            "Failed to update assignment.",
        );
      } finally {
        setActionBusy(false);
      }
    };

  const addNote =
    async () => {
      if (!selectedId) return;

      const message =
        note.trim();

      if (!message) {
        setActionError(
          "Enter a note first.",
        );
        return;
      }

      setActionBusy(true);
      setActionError(null);

      try {
        const result =
          await api<Ticket>(
            `/support/tickets/${selectedId}/notes`,
            {
              method: "POST",

              body: JSON.stringify({
                message,
              }),
            },
          );

        setSelected(result);
        setNote("");

        await loadTickets();
      } catch (e: any) {
        setActionError(
          e?.message ||
            "Failed to add note.",
        );
      } finally {
        setActionBusy(false);
      }
    };

  const clearFilters = () => {
    setQ("");
    setDebouncedQ("");
    setCategory("All");
    setStatus("All");
    setPage(1);
  };

  const copyTicketId =
    async () => {
      if (!selected?.id) return;

      try {
        await navigator.clipboard.writeText(
          selected.id,
        );

        setCopied(true);

        window.setTimeout(
          () => setCopied(false),
          1200,
        );
      } catch {
        // clipboard unavailable
      }
    };

  const counts =
    data?.counts ?? {
      OPEN: 0,
      IN_PROGRESS: 0,
      RESOLVED: 0,
      CLOSED: 0,
    };

  return (
    <div className="min-h-screen bg-slate-50">
      {/* PAGE HEADER */}

      <div className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-7xl px-4 py-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-900">
                Support Tickets
              </h1>

              <p className="mt-1 text-sm text-slate-600">
                Review, assign, track,
                and resolve Omega LIMS
                support requests.
              </p>
            </div>

            <div className="flex w-full gap-2 lg:w-auto">
              <div className="relative w-full lg:w-[430px]">
                <input
                  value={q}
                  onChange={(e) =>
                    setQ(
                      e.target.value,
                    )
                  }
                  placeholder="Search ticket, user, report, description..."
                  className="w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 pr-16 text-sm text-slate-900 shadow-sm outline-none focus:border-[var(--brand)] focus:ring-4 focus:ring-[var(--brand)]/10"
                />

                {q && (
                  <button
                    type="button"
                    onClick={() =>
                      setQ("")
                    }
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-500 hover:text-slate-900"
                  >
                    Clear
                  </button>
                )}
              </div>

              <button
                type="button"
                onClick={() => {
                  loadTickets();

                  if (selectedId) {
                    refreshSelected();
                  }
                }}
                disabled={busy}
                className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50"
              >
                Refresh
              </button>
            </div>
          </div>

          {/* COUNTS */}

          <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
            <SummaryCard
              label="Open"
              count={counts.OPEN}
              selected={
                status === "OPEN"
              }
              onClick={() => {
                setStatus("OPEN");
                setPage(1);
              }}
            />

            <SummaryCard
              label="In Progress"
              count={
                counts.IN_PROGRESS
              }
              selected={
                status ===
                "IN_PROGRESS"
              }
              onClick={() => {
                setStatus(
                  "IN_PROGRESS",
                );
                setPage(1);
              }}
            />

            <SummaryCard
              label="Resolved"
              count={
                counts.RESOLVED
              }
              selected={
                status === "RESOLVED"
              }
              onClick={() => {
                setStatus(
                  "RESOLVED",
                );
                setPage(1);
              }}
            />

            <SummaryCard
              label="Closed"
              count={counts.CLOSED}
              selected={
                status === "CLOSED"
              }
              onClick={() => {
                setStatus("CLOSED");
                setPage(1);
              }}
            />
          </div>

          {/* FILTERS */}

          <div className="mt-5 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="mr-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Category
              </span>

              {categories.map(
                (item) => (
                  <FilterChip
                    key={item}
                    active={
                      category ===
                      item
                    }
                    onClick={() => {
                      setCategory(
                        item,
                      );

                      setPage(1);
                    }}
                  >
                    {item === "All"
                      ? "All"
                      : friendly(
                          item,
                        )}
                  </FilterChip>
                ),
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span className="mr-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Status
              </span>

              {STATUS_OPTIONS.map(
                (item) => (
                  <FilterChip
                    key={item}
                    active={
                      status === item
                    }
                    onClick={() => {
                      setStatus(
                        item,
                      );

                      setPage(1);
                    }}
                  >
                    {item === "All"
                      ? "All"
                      : friendly(
                          item,
                        )}
                  </FilterChip>
                ),
              )}

              {(q ||
                category !==
                  "All" ||
                status !==
                  "All") && (
                <button
                  type="button"
                  onClick={
                    clearFilters
                  }
                  className="ml-1 text-xs font-semibold text-[var(--brand)] hover:underline"
                >
                  Reset filters
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* MAIN */}

      <div className="mx-auto grid max-w-7xl grid-cols-1 gap-6 px-4 py-6 xl:grid-cols-12">
        {/* TABLE */}

        <div className="xl:col-span-8">
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <div>
                <div className="text-sm font-semibold text-slate-900">
                  {busy
                    ? "Loading tickets..."
                    : `${data?.total ?? 0} ticket${
                        (data?.total ??
                          0) === 1
                          ? ""
                          : "s"
                      }`}
                </div>

                <div className="mt-0.5 text-xs text-slate-500">
                  Select a row to
                  review the full
                  ticket.
                </div>
              </div>
            </div>

            {err && (
              <div className="border-b border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {err}
              </div>
            )}

            <div className="overflow-x-auto">
              <table className="min-w-[1100px] w-full text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold">
                      Ticket
                    </th>

                    <th className="px-4 py-3 text-left font-semibold">
                      Category
                    </th>

                    <th className="px-4 py-3 text-left font-semibold">
                      Status
                    </th>

                    <th className="px-4 py-3 text-left font-semibold">
                      Created By
                    </th>

                    <th className="px-4 py-3 text-left font-semibold">
                      Assigned
                    </th>

                    <th className="px-4 py-3 text-left font-semibold">
                      Report
                    </th>

                    <th className="px-4 py-3 text-left font-semibold">
                      Created
                    </th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-100">
                  {(data?.items ??
                    []).map(
                    (ticket) => {
                      const active =
                        selectedId ===
                        ticket.id;

                      return (
                        <tr
                          key={
                            ticket.id
                          }
                          onClick={() =>
                            openTicket(
                              ticket,
                            )
                          }
                          className={cn(
                            "cursor-pointer transition",

                            active
                              ? "bg-blue-50/70"
                              : "hover:bg-slate-50",
                          )}
                        >
                          <td className="px-4 py-3 align-top">
                            <div className="max-w-[220px]">
                              <div className="truncate font-semibold text-slate-900">
                                {
                                  ticket.id
                                }
                              </div>

                              <div className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">
                                {
                                  ticket.description
                                }
                              </div>
                            </div>
                          </td>

                          <td className="px-4 py-3 align-top text-slate-700">
                            {friendly(
                              ticket.category,
                            )}
                          </td>

                          <td className="px-4 py-3 align-top">
                            <StatusBadge
                              status={
                                ticket.status
                              }
                            />
                          </td>

                          <td className="px-4 py-3 align-top">
                            {ticket.createdBy ? (
                              <div>
                                <div className="font-medium text-slate-900">
                                  {ticket
                                    .createdBy
                                    .name ||
                                    "User"}
                                </div>

                                <div className="mt-0.5 text-xs text-slate-500">
                                  {
                                    ticket
                                      .createdBy
                                      .email
                                  }
                                </div>

                                <div className="mt-0.5 text-[11px] text-slate-400">
                                  {friendly(
                                    ticket
                                      .createdBy
                                      .role,
                                  )}
                                </div>
                              </div>
                            ) : (
                              "—"
                            )}
                          </td>

                          <td className="px-4 py-3 align-top">
                            {ticket.assignedTo ? (
                              <div>
                                <div className="font-medium text-slate-900">
                                  {ticket
                                    .assignedTo
                                    .name ||
                                    ticket
                                      .assignedTo
                                      .email}
                                </div>

                                <div className="mt-0.5 text-xs text-slate-500">
                                  {friendly(
                                    ticket
                                      .assignedTo
                                      .role,
                                  )}
                                </div>
                              </div>
                            ) : (
                              <span className="text-xs text-slate-400">
                                Unassigned
                              </span>
                            )}
                          </td>

                          <td className="px-4 py-3 align-top">
                            {ticket.reportId ? (
                              <div>
                                <div className="font-medium text-slate-800">
                                  {
                                    ticket.reportId
                                  }
                                </div>

                                {ticket.reportType && (
                                  <div className="mt-0.5 text-xs text-slate-500">
                                    {friendly(
                                      ticket.reportType,
                                    )}
                                  </div>
                                )}
                              </div>
                            ) : (
                              <span className="text-slate-400">
                                —
                              </span>
                            )}
                          </td>

                          <td className="whitespace-nowrap px-4 py-3 align-top text-xs text-slate-600">
                            {dateTime(
                              ticket.createdAt,
                            )}
                          </td>
                        </tr>
                      );
                    },
                  )}

                  {!busy &&
                    (data?.items
                      ?.length ??
                      0) === 0 && (
                      <tr>
                        <td
                          colSpan={
                            7
                          }
                          className="px-6 py-14 text-center"
                        >
                          <div className="font-medium text-slate-700">
                            No support
                            tickets found
                          </div>

                          <div className="mt-1 text-sm text-slate-500">
                            Try changing
                            your search or
                            filters.
                          </div>
                        </td>
                      </tr>
                    )}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3">
              <div className="text-xs text-slate-500">
                Page {page} of{" "}
                {data?.totalPages ??
                  1}
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={
                    busy || page <= 1
                  }
                  onClick={() =>
                    setPage((p) =>
                      Math.max(
                        1,
                        p - 1,
                      ),
                    )
                  }
                  className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Previous
                </button>

                <button
                  type="button"
                  disabled={
                    busy ||
                    page >=
                      (data?.totalPages ??
                        1)
                  }
                  onClick={() =>
                    setPage(
                      (p) => p + 1,
                    )
                  }
                  className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* DETAILS */}

        <aside className="xl:col-span-4">
          <div className="xl:sticky xl:top-24">
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-200 px-5 py-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-slate-900">
                      Ticket Details
                    </div>

                    <div className="mt-1 text-xs text-slate-500">
                      Manage status,
                      assignment and
                      internal notes.
                    </div>
                  </div>

                  {selected && (
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedId(
                          null,
                        );
                        setSelected(
                          null,
                        );
                        setNote("");
                        setActionError(
                          null,
                        );
                      }}
                      className="text-xs font-semibold text-slate-500 hover:text-slate-900"
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>

              {!selectedId && (
                <div className="px-5 py-14 text-center">
                  <div className="text-sm font-medium text-slate-700">
                    No ticket
                    selected
                  </div>

                  <p className="mt-1 text-xs leading-5 text-slate-500">
                    Select a ticket
                    from the table to
                    review and manage
                    it.
                  </p>
                </div>
              )}

              {selectedId &&
                detailBusy &&
                !selected && (
                  <div className="px-5 py-12 text-center text-sm text-slate-500">
                    Loading ticket...
                  </div>
                )}

              {selected && (
                <div className="max-h-[calc(100vh-9rem)] overflow-y-auto">
                  {/* SUMMARY */}

                  <div className="space-y-4 p-5">
                    <div>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                            Ticket ID
                          </div>

                          <div className="mt-1 break-all font-mono text-xs font-semibold text-slate-900">
                            {
                              selected.id
                            }
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={
                            copyTicketId
                          }
                          className="shrink-0 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                        >
                          {copied
                            ? "Copied"
                            : "Copy"}
                        </button>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <StatusBadge
                        status={
                          selected.status
                        }
                      />

                      <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                        {friendly(
                          selected.category,
                        )}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <div className="text-xs font-medium text-slate-500">
                          Created
                        </div>

                        <div className="mt-1 text-xs text-slate-800">
                          {dateTime(
                            selected.createdAt,
                          )}
                        </div>
                      </div>

                      <div>
                        <div className="text-xs font-medium text-slate-500">
                          Updated
                        </div>

                        <div className="mt-1 text-xs text-slate-800">
                          {dateTime(
                            selected.updatedAt,
                          )}
                        </div>
                      </div>
                    </div>

                    <div>
                      <div className="text-xs font-medium text-slate-500">
                        Created By
                      </div>

                      <div className="mt-1 rounded-xl bg-slate-50 p-3">
                        <div className="text-sm font-semibold text-slate-900">
                          {selected
                            .createdBy
                            ?.name ||
                            "User"}
                        </div>

                        <div className="mt-0.5 text-xs text-slate-600">
                          {selected
                            .createdBy
                            ?.email ||
                            "—"}
                        </div>

                        <div className="mt-1 text-[11px] font-medium text-slate-400">
                          {friendly(
                            selected
                              .createdBy
                              ?.role,
                          )}
                        </div>
                      </div>
                    </div>

                    {(selected.reportId ||
                      selected.reportType) && (
                      <div>
                        <div className="text-xs font-medium text-slate-500">
                          Related Report
                        </div>

                        <div className="mt-1 rounded-xl bg-slate-50 p-3 text-sm text-slate-800">
                          <div className="font-medium">
                            {selected.reportId ||
                              "—"}
                          </div>

                          {selected.reportType && (
                            <div className="mt-1 text-xs text-slate-500">
                              {friendly(
                                selected.reportType,
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    <div>
                      <div className="text-xs font-medium text-slate-500">
                        Description
                      </div>

                      <div className="mt-1 whitespace-pre-wrap rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm leading-6 text-slate-800">
                        {
                          selected.description
                        }
                      </div>
                    </div>

                    {actionError && (
                      <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                        {
                          actionError
                        }
                      </div>
                    )}
                  </div>

                  {/* MANAGEMENT */}

                  <div className="border-t border-slate-200 bg-slate-50/60 p-5">
                    <div className="text-sm font-semibold text-slate-900">
                      Manage Ticket
                    </div>

                    <div className="mt-4 space-y-4">
                      <div>
                        <label className="text-xs font-semibold text-slate-600">
                          Status
                        </label>

                        <div className="mt-1 flex gap-2">
                          <select
                            value={
                              statusDraft
                            }
                            disabled={
                              actionBusy
                            }
                            onChange={(
                              e,
                            ) =>
                              setStatusDraft(
                                e.target
                                  .value as Status,
                              )
                            }
                            className="min-w-0 flex-1 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-[var(--brand)]"
                          >
                            <option value="OPEN">
                              Open
                            </option>

                            <option value="IN_PROGRESS">
                              In
                              Progress
                            </option>

                            <option value="RESOLVED">
                              Resolved
                            </option>

                            <option value="CLOSED">
                              Closed
                            </option>
                          </select>

                          <button
                            type="button"
                            disabled={
                              actionBusy ||
                              statusDraft ===
                                selected.status
                            }
                            onClick={
                              updateStatus
                            }
                            className="rounded-xl bg-[var(--brand)] px-3 py-2 text-xs font-semibold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            Save
                          </button>
                        </div>
                      </div>

                      <div>
                        <label className="text-xs font-semibold text-slate-600">
                          Assigned
                          To
                        </label>

                        <div className="mt-1 flex gap-2">
                          <select
                            value={
                              assigneeDraft
                            }
                            disabled={
                              actionBusy
                            }
                            onChange={(
                              e,
                            ) =>
                              setAssigneeDraft(
                                e.target
                                  .value,
                              )
                            }
                            className="min-w-0 flex-1 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-[var(--brand)]"
                          >
                            <option value="">
                              Unassigned
                            </option>

                            {assignees.map(
                              (
                                user,
                              ) => (
                                <option
                                  key={
                                    user.id
                                  }
                                  value={
                                    user.id
                                  }
                                >
                                  {user.name ||
                                    user.email}{" "}
                                  —{" "}
                                  {friendly(
                                    user.role,
                                  )}
                                </option>
                              ),
                            )}
                          </select>

                          <button
                            type="button"
                            disabled={
                              actionBusy ||
                              assigneeDraft ===
                                (selected
                                  .assignedTo
                                  ?.id ??
                                  "")
                            }
                            onClick={
                              updateAssignee
                            }
                            className="rounded-xl bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            Save
                          </button>
                        </div>
                      </div>

                      <div>
                        <label className="text-xs font-semibold text-slate-600">
                          Internal
                          Note
                        </label>

                        <textarea
                          value={note}
                          disabled={
                            actionBusy
                          }
                          onChange={(
                            e,
                          ) =>
                            setNote(
                              e.target
                                .value,
                            )
                          }
                          rows={3}
                          maxLength={
                            2000
                          }
                          placeholder="Add investigation notes, follow-up information, or resolution details..."
                          className="mt-1 w-full resize-y rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-[var(--brand)] focus:ring-4 focus:ring-[var(--brand)]/10"
                        />

                        <div className="mt-2 flex items-center justify-between">
                          <span className="text-[11px] text-slate-400">
                            {
                              note.length
                            }
                            /2000
                          </span>

                          <button
                            type="button"
                            disabled={
                              actionBusy ||
                              !note.trim()
                            }
                            onClick={
                              addNote
                            }
                            className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            Add Note
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* TECHNICAL INFO */}

                  <div className="border-t border-slate-200 p-5">
                    <details>
                      <summary className="cursor-pointer text-sm font-semibold text-slate-800">
                        Technical
                        Information
                      </summary>

                      <div className="mt-4 space-y-3">
                        <div>
                          <div className="text-xs font-medium text-slate-500">
                            Client
                            Time
                          </div>

                          <div className="mt-1 break-words text-xs text-slate-700">
                            {selected.clientTime ||
                              "—"}
                          </div>
                        </div>

                        <div>
                          <div className="text-xs font-medium text-slate-500">
                            User
                            Agent
                          </div>

                          <div className="mt-1 break-words rounded-lg bg-slate-50 p-2 font-mono text-[11px] leading-5 text-slate-600">
                            {selected.userAgent ||
                              "—"}
                          </div>
                        </div>

                        <div>
                          <div className="text-xs font-medium text-slate-500">
                            Metadata
                          </div>

                          <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-slate-900 p-3 text-[11px] leading-5 text-slate-100">
                            {selected.meta
                              ? JSON.stringify(
                                  selected.meta,
                                  null,
                                  2,
                                )
                              : "No metadata"}
                          </pre>
                        </div>
                      </div>
                    </details>
                  </div>

                  {/* HISTORY */}

                  <div className="border-t border-slate-200 p-5">
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-semibold text-slate-900">
                        Activity
                        History
                      </div>

                      <button
                        type="button"
                        onClick={
                          refreshSelected
                        }
                        className="text-xs font-semibold text-[var(--brand)] hover:underline"
                      >
                        Refresh
                      </button>
                    </div>

                    <div className="mt-4 space-y-4">
                      {(selected.activities ??
                        []).length ===
                      0 ? (
                        <div className="text-xs text-slate-500">
                          No activity
                          history.
                        </div>
                      ) : (
                        selected.activities?.map(
                          (
                            activity,
                          ) => (
                            <div
                              key={
                                activity.id
                              }
                              className="relative border-l-2 border-slate-200 pl-4"
                            >
                              <span className="absolute -left-[5px] top-1 h-2 w-2 rounded-full bg-[var(--brand)]" />

                              <div className="text-xs font-semibold text-slate-800">
                                {activity
                                  .actor
                                  ?.name ||
                                  activity
                                    .actor
                                    ?.email ||
                                  "System"}
                              </div>

                              <div className="mt-1 whitespace-pre-wrap text-xs leading-5 text-slate-600">
                                {activity.message ||
                                  friendly(
                                    activity.type,
                                  )}
                              </div>

                              <div className="mt-1 text-[11px] text-slate-400">
                                {dateTime(
                                  activity.createdAt,
                                )}
                              </div>
                            </div>
                          ),
                        )
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}