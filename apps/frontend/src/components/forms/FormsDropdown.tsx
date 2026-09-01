import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import { useAuth } from "../../context/AuthContext";
import { api } from "../../lib/api";

type Category = "MICRO" | "CHEMISTRY";

type FormId =
  | "MICRO_MIX"
  | "MICRO_MIX_WATER"
  | "STERILITY"
  | "APE"
  | "CHEMISTRY_MIX"
  | "COA";

const PATH_BY_ID: Record<FormId, string> = {
  MICRO_MIX: "/reports/micro-mix/new",
  MICRO_MIX_WATER: "/reports/micro-mix-water/new",
  STERILITY: "/reports/sterility/new",
  APE: "/reports/ape/new",
  CHEMISTRY_MIX: "/reports/chemistry-mix/new",
  COA: "/reports/coa/new",
};

type FormDef = {
  id: FormId;
  name: string;
  category: Category;
  emoji: string;
};

type ClientRow = {
  clientCode: string;
  name?: string | null;
  legalName?: string | null;
  active?: boolean;
};

const FORMS: FormDef[] = [
  {
    id: "MICRO_MIX",
    name: "Micro",
    category: "MICRO",
    emoji: "🧫",
  },
  {
    id: "MICRO_MIX_WATER",
    name: "Micro Water",
    category: "MICRO",
    emoji: "💧",
  },
  {
    id: "STERILITY",
    name: "Sterility",
    category: "MICRO",
    emoji: "🧪",
  },
  {
    id: "APE",
    name: "APE",
    category: "MICRO",
    emoji: "🦠",
  },
  {
    id: "CHEMISTRY_MIX",
    name: "Chemistry Mix",
    category: "CHEMISTRY",
    emoji: "🧴",
  },
  {
    id: "COA",
    name: "COA",
    category: "CHEMISTRY",
    emoji: "📜",
  },
];

export default function FormsDropdown({
  align = "right",
}: {
  align?: "left" | "right";
}) {
  const { user } = useAuth();

  const [open, setOpen] = useState(false);

  const [clients, setClients] = useState<ClientRow[]>([]);
  const [clientsLoading, setClientsLoading] = useState(false);
  const [clientsError, setClientsError] = useState("");

  const [selectedClientCode, setSelectedClientCode] = useState("");

  const btnRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const navigate = useNavigate();

  const role = user?.role;

  const isInternalCreator = role === "ADMIN" || role === "SYSTEMADMIN";

  useEffect(() => {
    function onDocMouseDown(e: MouseEvent) {
      const t = e.target as Node;

      if (!menuRef.current || !btnRef.current) return;

      if (menuRef.current.contains(t) || btnRef.current.contains(t)) {
        return;
      }

      setOpen(false);
    }

    if (open) {
      document.addEventListener("mousedown", onDocMouseDown);
    }

    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, [open]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
      }
    }

    if (open) {
      document.addEventListener("keydown", onKey);
    }

    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  /*
   * Internal users need the registered client list.
   */
  useEffect(() => {
    if (!open || !isInternalCreator) return;

    let cancelled = false;

    async function loadClients() {
      try {
        setClientsLoading(true);
        setClientsError("");

        const rows = await api<ClientRow[]>("/client-details", {
          method: "GET",
        });

        if (cancelled) return;

        setClients(
          (Array.isArray(rows) ? rows : []).filter(
            (row) => row.active !== false,
          ),
        );
      } catch (error: any) {
        if (cancelled) return;

        console.error("Failed to load client list:", error);

        setClients([]);
        setClientsError(error?.message || "Failed to load clients");
      } finally {
        if (!cancelled) {
          setClientsLoading(false);
        }
      }
    }

    loadClients();

    return () => {
      cancelled = true;
    };
  }, [open, isInternalCreator]);

  const micro = useMemo(() => FORMS.filter((f) => f.category === "MICRO"), []);

  const chem = useMemo(
    () => FORMS.filter((f) => f.category === "CHEMISTRY"),
    [],
  );

  function go(f: FormDef) {
    // Normal CLIENT creation
    if (!isInternalCreator) {
      setOpen(false);
      navigate(PATH_BY_ID[f.id]);
      return;
    }

    // ADMIN / SYSTEMADMIN creating for client
    const clientCode = selectedClientCode.trim().toUpperCase();

    if (!clientCode) {
      return;
    }

    const selectedClient = clients.find(
      (c) => String(c.clientCode).trim().toUpperCase() === clientCode,
    );

    const clientName = String(
      selectedClient?.name || selectedClient?.legalName || clientCode,
    ).trim();

    setOpen(false);

    const params = new URLSearchParams({
      createForClient: clientCode,
      clientName,
    });

    navigate(`${PATH_BY_ID[f.id]}?${params.toString()}`);
  }

  const formDisabled = isInternalCreator && !selectedClientCode;

  return (
    <div className="relative">
      <button
        ref={btnRef}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 px-0 py-1 text-sm font-semibold text-slate-700 hover:text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-300"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <span>Forms</span>

        <svg
          className={`h-4 w-4 transition-transform ${
            open ? "rotate-180" : "rotate-0"
          }`}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div
          ref={menuRef}
          role="menu"
          className={[
            "absolute top-full z-50 p-2",
            "w-80 rounded-2xl shadow-xl backdrop-blur bg-white/95",
            align === "right" ? "right-0" : "left-0",
          ].join(" ")}
        >
          {isInternalCreator && (
            <>
              <div className="mb-3 rounded-xl border border-blue-100 bg-blue-50 p-3">
                <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-blue-700">
                  Create Form for Client
                </div>

                <select
                  value={selectedClientCode}
                  onChange={(e) => setSelectedClientCode(e.target.value)}
                  disabled={clientsLoading}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                >
                  <option value="">
                    {clientsLoading ? "Loading clients..." : "Select client"}
                  </option>

                  {clients.map((client) => (
                    <option key={client.clientCode} value={client.clientCode}>
                      {client.clientCode}
                      {client.name
                        ? ` — ${client.name}`
                        : client.legalName
                          ? ` — ${client.legalName}`
                          : ""}
                    </option>
                  ))}
                </select>

                {clientsError && (
                  <div className="mt-2 text-xs text-red-600">
                    {clientsError}
                  </div>
                )}
              </div>

              <div className="mb-2 h-px bg-slate-100" />
            </>
          )}

          <div className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Microbiology
          </div>

          {micro.map((f) => (
            <button
              key={f.id}
              role="menuitem"
              onClick={() => go(f)}
              disabled={formDisabled}
              className="flex w-full items-center gap-2 rounded-xl px-2 py-2 text-left text-slate-800 hover:bg-slate-50/80 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <span className="text-lg">{f.emoji}</span>

              <span className="truncate">{f.name}</span>
            </button>
          ))}

          <div className="my-2 h-px bg-slate-100/60" />

          <div className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Chemistry
          </div>

          {chem.map((f) => (
            <button
              key={f.id}
              role="menuitem"
              onClick={() => go(f)}
              disabled={formDisabled}
              className="flex w-full items-center gap-2 rounded-xl px-2 py-2 text-left text-slate-800 hover:bg-slate-50/80 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <span className="text-lg">{f.emoji}</span>

              <span className="truncate">{f.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
