import React, { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import Modal from "../../components/common/Modal";
import { useAuth } from "../../context/AuthContext";
import { api } from "../../lib/api";

import {
  fetchUsers,
  setUserActive,
  setUserRole,
  setUserClientCode,
  resetUserPassword,
  forceUserSignout,
  createUserByAdmin,
  type Role,
  type UserRow,
} from "../../services/usersService";

import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";

import {
  Check,
  Copy,
  Search,
  RefreshCw,
  Shield,
  Users,
  UserX,
  KeyRound,
  Plus,
  Bell,
  Mail,
  Trash2,
  Settings2,
} from "lucide-react";

/* -------------------- shared helpers -------------------- */

const roleOptions: (Role | "ALL")[] = [
  "ALL",
  "SYSTEMADMIN",
  "ADMIN",
  "FRONTDESK",
  "MICRO",
  "CHEMISTRY",
  "QA",
  "CLIENT",
];

const roles: Role[] = [
  "SYSTEMADMIN",
  "ADMIN",
  "FRONTDESK",
  "MICRO",
  "CHEMISTRY",
  "QA",
  "CLIENT",
];

function fmtDate(x: string | null) {
  if (!x) return "—";
  const d = new Date(x);
  return isNaN(d.getTime()) ? "—" : d.toLocaleString();
}

function rolePillClass(role: Role) {
  switch (role) {
    case "SYSTEMADMIN":
      return "bg-purple-50 text-purple-700 ring-purple-200";
    case "ADMIN":
      return "bg-indigo-50 text-indigo-700 ring-indigo-200";
    case "QA":
      return "bg-amber-50 text-amber-700 ring-amber-200";
    case "MICRO":
      return "bg-sky-50 text-sky-700 ring-sky-200";
    case "CHEMISTRY":
      return "bg-emerald-50 text-emerald-700 ring-emerald-200";
    case "FRONTDESK":
      return "bg-slate-50 text-slate-700 ring-slate-200";
    case "CLIENT":
    default:
      return "bg-blue-50 text-blue-700 ring-blue-200";
  }
}

function statusPill(active: boolean) {
  return active
    ? "bg-green-50 text-green-700 ring-green-200"
    : "bg-rose-50 text-rose-700 ring-rose-200";
}

function cx(...classes: Array<string | false | undefined | null>) {
  return classes.filter(Boolean).join(" ");
}

/* -------------------- Create user schema -------------------- */

const createSchema = z
  .object({
    email: z
      .string()
      .email("Invalid email address")
      .refine(
        (val) => {
          const v = val.toLowerCase();
          return v.endsWith(".com") || v.endsWith("@omegabiochemlab.com");
        },
        { message: "Allowed domains: gmail.com or omegabiochemlab.com" },
      ),
    name: z.string().optional(),
    role: z.enum(
      [
        "SYSTEMADMIN",
        "ADMIN",
        "FRONTDESK",
        "MICRO",
        "CHEMISTRY",
        "QA",
        "CLIENT",
      ],
      { message: "Role is required" },
    ),
    userId: z
      .string()
      .min(4, "User ID must be at least 4 chars")
      .max(20, "User ID max 20 chars")
      .regex(
        /^[a-z0-9._-]+$/,
        "Only lowercase a–z, 0–9, dot, underscore, hyphen",
      ),
    clientCode: z
      .string()
      .regex(/^[A-Z]{3}$/, "Client Code must be exactly 3 uppercase letters")
      .optional(),
  })
  .refine((data) => !(data.role === "CLIENT" && !data.clientCode), {
    message: "Client Code is required for CLIENT role",
    path: ["clientCode"],
  });

type CreateFormData = z.infer<typeof createSchema>;

/* -------------------- Client Notifications types -------------------- */

type Mode = "USERS_ONLY" | "CUSTOM_ONLY" | "USERS_PLUS_CUSTOM";

type EmailRow = {
  id: string;
  email: string;
  label?: string | null;
  active: boolean;
};

type ClientNotifConfig = {
  clientCode: string;
  mode: Mode;
  emails: EmailRow[];
};

function upsertEmail(list: EmailRow[], row: EmailRow) {
  const idx = list.findIndex((x) => x.id === row.id);
  if (idx >= 0) {
    const copy = [...list];
    copy[idx] = row;
    return copy;
  }
  return [...list, row].sort((a, b) => a.email.localeCompare(b.email));
}

function ModeButton({
  current,
  value,
  onClick,
  children,
}: {
  current: Mode;
  value: Mode;
  onClick: (m: Mode) => void;
  children: React.ReactNode;
}) {
  const active = current === value;
  return (
    <button
      className={cx(
        "rounded-lg px-3 py-2 border text-sm font-semibold transition",
        active
          ? "bg-slate-900 text-white border-slate-900"
          : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50",
      )}
      onClick={() => onClick(value)}
      type="button"
    >
      {children}
    </button>
  );
}

/* -------------------- Component -------------------- */

export default function UsersAdmin() {
  const { user } = useAuth();
  const isAdmin = user?.role === "ADMIN" || user?.role === "SYSTEMADMIN";

  const [tab, setTab] = useState<"USERS" | "NOTIFICATIONS">("USERS");

  /* -------------------- create user state -------------------- */
  const {
    register,
    handleSubmit,
    reset: resetCreateForm,
    formState: { isSubmitting: creating, errors: createErrors },
    watch,
  } = useForm<CreateFormData>({ resolver: zodResolver(createSchema) });

  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [createdEmail, setCreatedEmail] = useState("");
  const [createdUserId, setCreatedUserId] = useState<string | null>(null);
  const [createdTempPassword, setCreatedTempPassword] = useState("");
  const [copiedField, setCopiedField] = useState<"password" | "userId" | null>(
    null,
  );

  /* -------------------- manage filters -------------------- */
  const [q, setQ] = useState("");
  const [role, setRole] = useState<Role | "ALL">("ALL");
  const [active, setActive] = useState<"ALL" | "TRUE" | "FALSE">("ALL");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  /* -------------------- manage data -------------------- */
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<UserRow[]>([]);
  const [total, setTotal] = useState(0);

  /* -------------------- manage modal -------------------- */
  const [selected, setSelected] = useState<UserRow | null>(null);
  const [manageModalOpen, setManageModalOpen] = useState(false);
  const [editRole, setEditRole] = useState<Role>("CLIENT");
  const [editClientCode, setEditClientCode] = useState("");

  /* -------------------- reset password modal -------------------- */
  const [pwModalOpen, setPwModalOpen] = useState(false);
  const [pwUserLabel, setPwUserLabel] = useState("");
  const [tempPassword, setTempPassword] = useState("");
  const [copied, setCopied] = useState(false);

  /* -------------------- notifications state -------------------- */
  const [notifClientCode, setNotifClientCode] = useState("");
  const [notifLoading, setNotifLoading] = useState(false);
  const [cfg, setCfg] = useState<ClientNotifConfig | null>(null);
  const [newEmail, setNewEmail] = useState("");
  const [newLabel, setNewLabel] = useState("");

  const canLoadNotif = useMemo(
    () => notifClientCode.trim().length > 0,
    [notifClientCode],
  );

  /* -------------------- debounce search -------------------- */
  const [qDebounced, setQDebounced] = useState(q);
  useEffect(() => {
    const t = setTimeout(() => setQDebounced(q), 250);
    return () => clearTimeout(t);
  }, [q]);

  async function loadUsers() {
    setLoading(true);
    try {
      const res = await fetchUsers({
        q: qDebounced.trim(),
        role,
        active,
        page,
        pageSize,
      });
      setItems(res.items);
      setTotal(res.total);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to load users");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!isAdmin) return;
    loadUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin, qDebounced, role, active, page, pageSize]);

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(total / pageSize)),
    [total, pageSize],
  );

  const stats = useMemo(() => {
    const activeCount = items.filter((x) => x.active).length;
    const disabledCount = items.filter((x) => !x.active).length;
    const mustChange = items.filter((x) => x.mustChangePassword).length;
    return { activeCount, disabledCount, mustChange };
  }, [items]);

  /* -------------------- create user actions -------------------- */

  const copyCreate = async (text: string, field: "password" | "userId") => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 1200);
      toast.success("Copied");
    } catch {
      toast.error("Copy failed");
    }
  };

  const onCreateSubmit = async (data: CreateFormData) => {
    try {
      const res = await createUserByAdmin(data);
      setCreatedEmail(res.user.email);
      setCreatedUserId(res.user.userId ?? null);
      setCreatedTempPassword(res.tempPassword);
      setCreateModalOpen(true);
      resetCreateForm();
      toast.success("User created");
      await loadUsers();
    } catch (e: any) {
      toast.error(e?.message ?? "Create failed");
    }
  };

  /* -------------------- manage actions -------------------- */

  const openManage = (u: UserRow) => {
    setSelected(u);
    setEditRole(u.role);
    setEditClientCode(u.clientCode ?? "");
    setManageModalOpen(true);
  };

  const saveManage = async () => {
    if (!selected) return;

    try {
      if (editRole !== selected.role) {
        await setUserRole(selected.id, editRole);
      }

      const nextClientCode =
        editRole === "CLIENT"
          ? editClientCode.trim()
            ? editClientCode.trim().toUpperCase()
            : null
          : null;

      if ((selected.clientCode ?? null) !== nextClientCode) {
        await setUserClientCode(selected.id, nextClientCode);
      }

      toast.success("User updated");
      setManageModalOpen(false);
      await loadUsers();
    } catch (e: any) {
      toast.error(e?.message ?? "Update failed");
    }
  };

  const toggleActive = async (u: UserRow) => {
    try {
      await setUserActive(u.id, !u.active);
      toast.success(u.active ? "User disabled" : "User enabled");
      await loadUsers();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed");
    }
  };

  const doResetPassword = async (u: UserRow) => {
    try {
      const res = await resetUserPassword(u.id);
      setTempPassword(res.tempPassword);
      setPwUserLabel(`${u.email} • ${u.userId ?? "no-userId"}`);
      setPwModalOpen(true);
      toast.success("Temporary password generated");
    } catch (e: any) {
      toast.error(e?.message ?? "Reset failed");
    }
  };

  const doForceSignout = async (u: UserRow) => {
    try {
      await forceUserSignout(u.id);
      toast.success("Forced signout");
    } catch (e: any) {
      toast.error(e?.message ?? "Failed");
    }
  };

  const copyTemp = async () => {
    try {
      await navigator.clipboard.writeText(tempPassword);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
      toast.success("Copied");
    } catch {
      toast.error("Copy failed");
    }
  };

  const resetFilters = () => {
    setQ("");
    setRole("ALL");
    setActive("ALL");
    setPage(1);
    setPageSize(20);
  };

  /* -------------------- notifications actions -------------------- */

  async function loadNotif() {
    const code = notifClientCode.trim();
    if (!code) return;
    setNotifLoading(true);
    try {
      const res = await api<ClientNotifConfig>(
        `/client-notifications/${encodeURIComponent(code)}`,
      );
      setCfg(res);
      toast.success("Loaded");
    } catch (e: any) {
      toast.error(e?.message || "Failed to load");
    } finally {
      setNotifLoading(false);
    }
  }

  async function setMode(mode: Mode) {
    if (!cfg) return;
    try {
      await api(
        `/client-notifications/${encodeURIComponent(cfg.clientCode)}/mode`,
        {
          method: "PATCH",
          body: JSON.stringify({ mode }),
        },
      );
      toast.success("Mode updated");
      setCfg({ ...cfg, mode });
    } catch (e: any) {
      toast.error(e?.message || "Failed to update mode");
    }
  }

  async function addEmail() {
    if (!cfg) return;
    const email = newEmail.trim().toLowerCase();
    if (!email || !email.includes("@")) {
      toast.error("Enter a valid email");
      return;
    }
    try {
      const row = await api<EmailRow>(
        `/client-notifications/${encodeURIComponent(cfg.clientCode)}/emails`,
        {
          method: "POST",
          body: JSON.stringify({
            email,
            label: newLabel.trim() || undefined,
          }),
        },
      );
      toast.success("Email added");
      setCfg({ ...cfg, emails: upsertEmail(cfg.emails, row) });
      setNewEmail("");
      setNewLabel("");
    } catch (e: any) {
      toast.error(e?.message || "Failed to add email");
    }
  }

  async function toggleEmail(row: EmailRow, active: boolean) {
    if (!cfg) return;
    try {
      const updated = await api<EmailRow>(
        `/client-notifications/${encodeURIComponent(cfg.clientCode)}/emails/${row.id}`,
        { method: "PATCH", body: JSON.stringify({ active }) },
      );
      setCfg({
        ...cfg,
        emails: cfg.emails.map((e) => (e.id === updated.id ? updated : e)),
      });
      toast.success("Updated");
    } catch (e: any) {
      toast.error(e?.message || "Failed to update email");
    }
  }

  async function removeEmail(row: EmailRow) {
    if (!cfg) return;
    if (!confirm(`Remove ${row.email}?`)) return;
    try {
      await api(
        `/client-notifications/${encodeURIComponent(cfg.clientCode)}/emails/${row.id}`,
        { method: "DELETE" },
      );
      toast.success("Removed");
      setCfg({ ...cfg, emails: cfg.emails.filter((e) => e.id !== row.id) });
    } catch (e: any) {
      toast.error(e?.message || "Failed to remove");
    }
  }

  if (!user) return <p>Please log in.</p>;
  if (!isAdmin) return <p>You do not have access to this page.</p>;

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            Admin Settings
          </h1>
          <p className="text-sm text-slate-600">
            Manage users and client notification recipients.
          </p>
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => setTab("USERS")}
            className={cx(
              "inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm",
              tab === "USERS"
                ? "bg-slate-900 text-white border-slate-900"
                : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50",
            )}
          >
            <Users size={16} />
            Users
          </button>

          <button
            onClick={() => setTab("NOTIFICATIONS")}
            className={cx(
              "inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm",
              tab === "NOTIFICATIONS"
                ? "bg-slate-900 text-white border-slate-900"
                : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50",
            )}
          >
            <Bell size={16} />
            Notifications
          </button>
        </div>
      </div>

      {/* ---------------- USERS TAB ---------------- */}
      {tab === "USERS" && (
        <>
          {/* Create user card */}
          <div className="rounded-xl border bg-white overflow-hidden">
            <div className="px-4 py-3 border-b flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Plus size={18} className="text-slate-700" />
                <div className="font-semibold text-slate-900">
                  Create account
                </div>
              </div>
              <button
                onClick={loadUsers}
                className="inline-flex items-center gap-2 rounded-lg border bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
              >
                <RefreshCw size={16} />
                Refresh
              </button>
            </div>

            <form
              onSubmit={handleSubmit(onCreateSubmit)}
              className="p-4 grid grid-cols-1 md:grid-cols-2 gap-3"
            >
              <div>
                <label className="block text-xs text-slate-600 mb-1">
                  Email
                </label>
                <input
                  className="w-full rounded-lg border px-3 py-2 text-sm bg-white"
                  {...register("email")}
                  placeholder="user@omegabiochemlab.com"
                />
                {createErrors.email && (
                  <p className="text-rose-600 text-xs mt-1">
                    {createErrors.email.message}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-xs text-slate-600 mb-1">
                  Name (optional)
                </label>
                <input
                  className="w-full rounded-lg border px-3 py-2 text-sm bg-white"
                  {...register("name")}
                  placeholder="Jane Doe"
                />
              </div>

              <div>
                <label className="block text-xs text-slate-600 mb-1">
                  User ID
                </label>
                <input
                  className="w-full rounded-lg border px-3 py-2 text-sm bg-white"
                  {...register("userId")}
                  placeholder="frontdesk01"
                />
                <p className="text-xs text-slate-500 mt-1">
                  4–20 chars; lowercase a–z, 0–9, dot, underscore, hyphen.
                </p>
                {createErrors.userId && (
                  <p className="text-rose-600 text-xs mt-1">
                    {createErrors.userId.message}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-xs text-slate-600 mb-1">
                  Role
                </label>
                <select
                  className="w-full rounded-lg border px-3 py-2 text-sm bg-white"
                  {...register("role")}
                >
                  {roles.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
                {createErrors.role && (
                  <p className="text-rose-600 text-xs mt-1">
                    {createErrors.role.message}
                  </p>
                )}
              </div>

              {watch("role") === "CLIENT" && (
                <div className="md:col-span-2">
                  <label className="block text-xs text-slate-600 mb-1">
                    Client Code
                  </label>
                  <input
                    className="w-full rounded-lg border px-3 py-2 text-sm bg-white"
                    {...register("clientCode")}
                    placeholder="ABC"
                  />
                  {createErrors.clientCode && (
                    <p className="text-rose-600 text-xs mt-1">
                      {createErrors.clientCode.message}
                    </p>
                  )}
                </div>
              )}

              <div className="md:col-span-2 flex justify-end pt-1">
                <button
                  disabled={creating}
                  className="rounded-lg bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-800 disabled:opacity-50"
                >
                  {creating ? "Creating..." : "Create account"}
                </button>
              </div>
            </form>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="rounded-xl border bg-white p-4">
              <div className="flex items-center justify-between">
                <div className="text-sm text-slate-600">Total results</div>
                <Users size={18} className="text-slate-500" />
              </div>
              <div className="mt-2 text-2xl font-semibold text-slate-900">
                {total}
              </div>
              <div className="mt-1 text-xs text-slate-500">
                Filtered results
              </div>
            </div>

            <div className="rounded-xl border bg-white p-4">
              <div className="flex items-center justify-between">
                <div className="text-sm text-slate-600">Active</div>
                <Shield size={18} className="text-green-600" />
              </div>
              <div className="mt-2 text-2xl font-semibold text-slate-900">
                {stats.activeCount}
              </div>
              <div className="mt-1 text-xs text-slate-500">
                Enabled in current page
              </div>
            </div>

            <div className="rounded-xl border bg-white p-4">
              <div className="flex items-center justify-between">
                <div className="text-sm text-slate-600">Disabled</div>
                <UserX size={18} className="text-rose-600" />
              </div>
              <div className="mt-2 text-2xl font-semibold text-slate-900">
                {stats.disabledCount}
              </div>
              <div className="mt-1 text-xs text-slate-500">Cannot login</div>
            </div>

            <div className="rounded-xl border bg-white p-4">
              <div className="flex items-center justify-between">
                <div className="text-sm text-slate-600">
                  Must change password
                </div>
                <KeyRound size={18} className="text-amber-600" />
              </div>
              <div className="mt-2 text-2xl font-semibold text-slate-900">
                {stats.mustChange}
              </div>
              <div className="mt-1 text-xs text-slate-500">On next login</div>
            </div>
          </div>

          {/* Filters */}
          <div className="rounded-xl border bg-white p-4">
            <div className="flex flex-col lg:flex-row gap-3 lg:items-center lg:justify-between">
              <div className="flex-1">
                <label className="text-xs text-slate-600">Search</label>
                <div className="mt-1 flex items-center gap-2 rounded-lg border bg-white px-3 py-2">
                  <Search size={16} className="text-slate-400" />
                  <input
                    value={q}
                    onChange={(e) => {
                      setQ(e.target.value);
                      setPage(1);
                    }}
                    className="w-full outline-none text-sm"
                    placeholder="Search by email, name, userId..."
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <label className="text-xs text-slate-600">Role</label>
                  <select
                    value={role}
                    onChange={(e) => {
                      setRole(e.target.value as any);
                      setPage(1);
                    }}
                    className="mt-1 w-full rounded-lg border px-3 py-2 text-sm bg-white"
                  >
                    {roleOptions.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs text-slate-600">Active</label>
                  <select
                    value={active}
                    onChange={(e) => {
                      setActive(e.target.value as any);
                      setPage(1);
                    }}
                    className="mt-1 w-full rounded-lg border px-3 py-2 text-sm bg-white"
                  >
                    <option value="ALL">ALL</option>
                    <option value="TRUE">TRUE</option>
                    <option value="FALSE">FALSE</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs text-slate-600">Page size</label>
                  <select
                    value={pageSize}
                    onChange={(e) => {
                      setPageSize(Number(e.target.value));
                      setPage(1);
                    }}
                    className="mt-1 w-full rounded-lg border px-3 py-2 text-sm bg-white"
                  >
                    {[10, 20, 50, 100].map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex items-end">
                  <button
                    onClick={resetFilters}
                    className="w-full rounded-lg border bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 inline-flex items-center justify-center gap-2"
                    type="button"
                  >
                    <Settings2 size={16} />
                    Reset
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Table */}
          <div className="rounded-xl border bg-white overflow-hidden">
            <div className="px-4 py-3 border-b flex items-center justify-between">
              <div className="text-sm text-slate-700">
                Showing <span className="font-medium">{items.length}</span> of{" "}
                <span className="font-medium">{total}</span>
              </div>
              {loading && (
                <div className="text-xs text-slate-500">Loading…</div>
              )}
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-[1200px] w-full text-sm">
                <thead className="sticky top-0 bg-slate-50 text-slate-700 border-b">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium">User</th>
                    <th className="text-left px-4 py-3 font-medium">Role</th>
                    <th className="text-left px-4 py-3 font-medium">Client</th>
                    <th className="text-left px-4 py-3 font-medium">Status</th>
                    <th className="text-left px-4 py-3 font-medium">
                      Last login
                    </th>
                    <th className="text-left px-4 py-3 font-medium">
                      Last activity
                    </th>
                    <th className="text-left px-4 py-3 font-medium">
                      Active reports
                    </th>
                    <th className="text-right px-4 py-3 font-medium">
                      Actions
                    </th>
                  </tr>
                </thead>

                <tbody className="divide-y">
                  {!loading && items.length === 0 ? (
                    <tr>
                      <td
                        className="px-4 py-10 text-center text-slate-500"
                        colSpan={8}
                      >
                        No users found.
                      </td>
                    </tr>
                  ) : (
                    items.map((u, idx) => (
                      <tr
                        key={u.id}
                        className={cx(
                          idx % 2 === 0 && "bg-white",
                          idx % 2 === 1 && "bg-slate-50/40",
                        )}
                      >
                        <td className="px-4 py-3">
                          <div className="font-medium text-slate-900">
                            {u.name ?? "—"}
                          </div>
                          <div className="text-slate-600">{u.email}</div>
                          <div className="text-xs text-slate-500 mt-0.5">
                            <span className="font-medium">User ID:</span>{" "}
                            {u.userId ?? "—"} •{" "}
                            <span className="font-medium">Created:</span>{" "}
                            {fmtDate(u.createdAt)}
                          </div>
                          {u.mustChangePassword && (
                            <div className="mt-1 text-xs inline-flex items-center rounded-full bg-amber-50 text-amber-700 ring-1 ring-amber-200 px-2 py-0.5">
                              Must change password
                            </div>
                          )}
                        </td>

                        <td className="px-4 py-3">
                          <span
                            className={cx(
                              "inline-flex items-center rounded-full px-2 py-1 text-xs ring-1",
                              rolePillClass(u.role),
                            )}
                          >
                            {u.role}
                          </span>
                        </td>

                        <td className="px-4 py-3 text-slate-700">
                          {u.clientCode ?? "—"}
                        </td>

                        <td className="px-4 py-3">
                          <span
                            className={cx(
                              "inline-flex items-center rounded-full px-2 py-1 text-xs ring-1",
                              statusPill(u.active),
                            )}
                          >
                            {u.active ? "ACTIVE" : "DISABLED"}
                          </span>
                        </td>

                        <td className="px-4 py-3 text-slate-700">
                          {fmtDate(u.lastLoginAt)}
                        </td>
                        <td className="px-4 py-3 text-slate-700">
                          {fmtDate(u.lastActivityAt)}
                        </td>
                        <td className="px-4 py-3 text-slate-700">
                          {u.activeReportCount ?? "—"}
                        </td>

                        <td className="px-4 py-3">
                          <div className="flex justify-end gap-2">
                            <button
                              className="rounded-lg border bg-white px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50"
                              onClick={() => openManage(u)}
                              type="button"
                            >
                              Manage
                            </button>
                            <button
                              className="rounded-lg border bg-white px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50"
                              onClick={() => toggleActive(u)}
                              type="button"
                            >
                              {u.active ? "Disable" : "Enable"}
                            </button>
                            <button
                              className="rounded-lg border bg-white px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50"
                              onClick={() => doResetPassword(u)}
                              type="button"
                            >
                              Reset PW
                            </button>
                            <button
                              className="rounded-lg border bg-white px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50"
                              onClick={() => doForceSignout(u)}
                              type="button"
                              title="Force signout (increments passwordVersion)"
                            >
                              Signout
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="px-4 py-3 border-t flex flex-col sm:flex-row items-center justify-between gap-2 text-sm">
              <div className="text-slate-600">
                Page <span className="font-medium">{page}</span> of{" "}
                <span className="font-medium">{totalPages}</span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  className="rounded-lg border bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  type="button"
                >
                  Prev
                </button>
                <button
                  className="rounded-lg border bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  type="button"
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ---------------- NOTIFICATIONS TAB ---------------- */}
      {tab === "NOTIFICATIONS" && <NotificationsAllClients />}

      {/* Create result modal */}
      <Modal
        open={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        title="Account Created"
      >
        <div className="space-y-3">
          <p className="text-sm text-slate-600">
            Give these credentials securely:
          </p>

          <div className="rounded-xl border bg-slate-50 p-4 text-sm space-y-2">
            <div>
              <span className="font-semibold">Email:</span> {createdEmail}
            </div>

            <div className="flex items-center gap-2">
              <span className="font-semibold">User ID:</span>
              <code className="break-all">{createdUserId ?? "—"}</code>
              <button
                type="button"
                onClick={() => copyCreate(createdUserId ?? "", "userId")}
                className="rounded-lg border bg-white px-2 py-1 text-xs text-slate-700 hover:bg-slate-50"
              >
                {copiedField === "userId" ? (
                  <span className="inline-flex items-center gap-1">
                    <Check size={14} className="text-green-600" /> Copied
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1">
                    <Copy size={14} /> Copy
                  </span>
                )}
              </button>
            </div>

            <div className="flex items-center gap-2">
              <span className="font-semibold">Temporary password:</span>
              <code className="break-all">{createdTempPassword}</code>
              <button
                type="button"
                onClick={() => copyCreate(createdTempPassword, "password")}
                className="rounded-lg border bg-white px-2 py-1 text-xs text-slate-700 hover:bg-slate-50"
              >
                {copiedField === "password" ? (
                  <span className="inline-flex items-center gap-1">
                    <Check size={14} className="text-green-600" /> Copied
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1">
                    <Copy size={14} /> Copy
                  </span>
                )}
              </button>
            </div>
          </div>

          <div className="flex justify-end pt-1">
            <button
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-800"
              onClick={() => setCreateModalOpen(false)}
              type="button"
            >
              Close
            </button>
          </div>
        </div>
      </Modal>

      {/* Manage user modal */}
      <Modal
        open={manageModalOpen}
        onClose={() => setManageModalOpen(false)}
        title="Manage User"
      >
        {!selected ? null : (
          <div className="space-y-5">
            <div className="rounded-xl border bg-slate-50 p-4">
              <div className="text-lg font-semibold text-slate-900">
                {selected.name ?? "—"}
              </div>
              <div className="text-sm text-slate-600">{selected.email}</div>
              <div className="mt-1 text-xs text-slate-500">
                User ID:{" "}
                <span className="font-medium">{selected.userId ?? "—"}</span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-slate-600 mb-1">
                  Role
                </label>
                <select
                  className="w-full rounded-lg border px-3 py-2 text-sm bg-white"
                  value={editRole}
                  onChange={(e) => setEditRole(e.target.value as Role)}
                >
                  {roleOptions
                    .filter((r) => r !== "ALL")
                    .map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                </select>
              </div>

              <div>
                <label className="block text-xs text-slate-600 mb-1">
                  Client Code
                </label>
                <input
                  disabled={editRole !== "CLIENT"}
                  className={cx(
                    "w-full rounded-lg border px-3 py-2 text-sm bg-white",
                    editRole !== "CLIENT" &&
                      "opacity-60 cursor-not-allowed bg-slate-50",
                  )}
                  value={editClientCode}
                  onChange={(e) =>
                    setEditClientCode(e.target.value.toUpperCase())
                  }
                  placeholder={editRole === "CLIENT" ? "ABC" : "N/A"}
                />
                <p className="text-xs text-slate-500 mt-1">
                  {editRole === "CLIENT"
                    ? "Must be 3 uppercase letters."
                    : "Client code only applies to CLIENT role."}
                </p>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <button
                className="rounded-lg border bg-white px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
                onClick={() => setManageModalOpen(false)}
                type="button"
              >
                Cancel
              </button>
              <button
                className="rounded-lg bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-800"
                onClick={saveManage}
                type="button"
              >
                Save changes
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Reset password modal */}
      <Modal
        open={pwModalOpen}
        onClose={() => setPwModalOpen(false)}
        title="Temporary Password"
      >
        <div className="space-y-3">
          <p className="text-sm text-slate-600">
            Generated for{" "}
            <span className="font-medium text-slate-900">{pwUserLabel}</span>
          </p>

          <div className="rounded-xl border bg-slate-50 p-4 flex items-center justify-between gap-3">
            <code className="text-sm break-all">{tempPassword}</code>
            <button
              type="button"
              onClick={copyTemp}
              className="rounded-lg border bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
            >
              {copied ? (
                <span className="inline-flex items-center gap-2">
                  <Check size={16} className="text-green-600" /> Copied
                </span>
              ) : (
                <span className="inline-flex items-center gap-2">
                  <Copy size={16} /> Copy
                </span>
              )}
            </button>
          </div>

          <div className="flex justify-end pt-1">
            <button
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-800"
              onClick={() => setPwModalOpen(false)}
              type="button"
            >
              Close
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function NotificationsAllClients() {
  type Mode = "USERS_ONLY" | "CUSTOM_ONLY" | "USERS_PLUS_CUSTOM";
  type EmailRow = {
    id: string;
    email: string;
    label?: string | null;
    active: boolean;
  };
  type ClientNotifConfig = {
    clientCode: string;
    mode: Mode;
    emails: EmailRow[];
  };

  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);

  const [all, setAll] = useState<ClientNotifConfig[]>([]);
  const [selectedCode, setSelectedCode] = useState<string | null>(null);

  const [newEmail, setNewEmail] = useState("");
  const [newLabel, setNewLabel] = useState("");

  const selected = useMemo(
    () => all.find((x) => x.clientCode === selectedCode) ?? null,
    [all, selectedCode],
  );

  const filtered = useMemo(() => {
    const s = q.trim().toUpperCase();
    if (!s) return all;
    return all.filter((x) => x.clientCode.includes(s));
  }, [all, q]);

  async function loadAll() {
    setLoading(true);
    try {
      // ✅ NEW endpoint
      const res = await api<ClientNotifConfig[]>(
        `/client-notifications?q=${encodeURIComponent(q.trim())}`,
      );
      setAll(res);

      // auto-select first item if none selected
      if (!selectedCode && res.length) setSelectedCode(res[0].clientCode);
    } catch (e: any) {
      toast.error(e?.message || "Failed to load client notifications");
    } finally {
      setLoading(false);
    }
  }

  // initial load (and when query changes with small debounce)
  useEffect(() => {
    const t = setTimeout(() => {
      loadAll();
    }, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  async function setMode(mode: Mode) {
    if (!selected) return;
    try {
      await api(
        `/client-notifications/${encodeURIComponent(selected.clientCode)}/mode`,
        {
          method: "PATCH",
          body: JSON.stringify({ mode }),
        },
      );
      toast.success("Mode updated");

      setAll((prev) =>
        prev.map((c) =>
          c.clientCode === selected.clientCode ? { ...c, mode } : c,
        ),
      );
    } catch (e: any) {
      toast.error(e?.message || "Failed to update mode");
    }
  }

  async function addEmail() {
    if (!selected) return;

    const email = newEmail.trim().toLowerCase();
    if (!email || !email.includes("@")) {
      toast.error("Enter a valid email");
      return;
    }

    try {
      const row = await api<EmailRow>(
        `/client-notifications/${encodeURIComponent(selected.clientCode)}/emails`,
        {
          method: "POST",
          body: JSON.stringify({ email, label: newLabel.trim() || undefined }),
        },
      );

      toast.success("Email added");

      setAll((prev) =>
        prev.map((c) =>
          c.clientCode === selected.clientCode
            ? { ...c, emails: upsertEmail(c.emails, row) }
            : c,
        ),
      );

      setNewEmail("");
      setNewLabel("");
    } catch (e: any) {
      toast.error(e?.message || "Failed to add email");
    }
  }

  async function toggleEmail(row: EmailRow, active: boolean) {
    if (!selected) return;
    try {
      const updated = await api<EmailRow>(
        `/client-notifications/${encodeURIComponent(selected.clientCode)}/emails/${row.id}`,
        { method: "PATCH", body: JSON.stringify({ active }) },
      );

      setAll((prev) =>
        prev.map((c) =>
          c.clientCode === selected.clientCode
            ? {
                ...c,
                emails: c.emails.map((e) =>
                  e.id === updated.id ? updated : e,
                ),
              }
            : c,
        ),
      );

      toast.success("Updated");
    } catch (e: any) {
      toast.error(e?.message || "Failed to update email");
    }
  }

  async function removeEmail(row: EmailRow) {
    if (!selected) return;
    if (!confirm(`Remove ${row.email}?`)) return;

    try {
      await api(
        `/client-notifications/${encodeURIComponent(selected.clientCode)}/emails/${row.id}`,
        { method: "DELETE" },
      );

      toast.success("Removed");

      setAll((prev) =>
        prev.map((c) =>
          c.clientCode === selected.clientCode
            ? { ...c, emails: c.emails.filter((e) => e.id !== row.id) }
            : c,
        ),
      );
    } catch (e: any) {
      toast.error(e?.message || "Failed to remove");
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
      {/* LEFT: client list */}
      <div className="lg:col-span-4 rounded-xl border bg-white overflow-hidden">
        <div className="px-4 py-3 border-b flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bell size={18} className="text-slate-700" />
            <div className="font-semibold text-slate-900">Clients</div>
          </div>
          <button
            onClick={loadAll}
            className="inline-flex items-center gap-2 rounded-lg border bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
            type="button"
          >
            <RefreshCw size={16} />
            Refresh
          </button>
        </div>

        <div className="p-4">
          <label className="block text-xs text-slate-600 mb-1">
            Search client
          </label>
          <div className="flex items-center gap-2 rounded-lg border px-3 py-2">
            <Search size={16} className="text-slate-400" />
            <input
              className="w-full outline-none text-sm"
              placeholder="JJL, OME..."
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
        </div>

        <div className="border-t">
          {loading ? (
            <div className="p-4 text-sm text-slate-500">Loading...</div>
          ) : filtered.length === 0 ? (
            <div className="p-4 text-sm text-slate-500">No clients found.</div>
          ) : (
            <div className="max-h-[520px] overflow-auto">
              {filtered.map((c) => {
                const activeCount = c.emails.filter((e) => e.active).length;
                const totalCount = c.emails.length;
                const isSel = c.clientCode === selectedCode;

                return (
                  <button
                    key={c.clientCode}
                    onClick={() => setSelectedCode(c.clientCode)}
                    className={cx(
                      "w-full text-left px-4 py-3 border-b hover:bg-slate-50 transition",
                      isSel && "bg-slate-900 text-white hover:bg-slate-900",
                    )}
                    type="button"
                  >
                    <div className="flex items-center justify-between">
                      <div className="font-semibold tracking-wide">
                        {c.clientCode}
                      </div>
                      <span
                        className={cx(
                          "text-xs rounded-full px-2 py-0.5 ring-1",
                          isSel
                            ? "bg-white/10 text-white ring-white/20"
                            : "bg-slate-50 text-slate-700 ring-slate-200",
                        )}
                      >
                        {c.mode}
                      </span>
                    </div>

                    <div
                      className={cx(
                        "mt-1 text-xs",
                        isSel ? "text-white/80" : "text-slate-600",
                      )}
                    >
                      Custom emails:{" "}
                      <span className="font-medium">
                        {activeCount}/{totalCount} active
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* RIGHT: selected config */}
      <div className="lg:col-span-8 space-y-4">
        {!selected ? (
          <div className="rounded-xl border bg-white p-6 text-sm text-slate-500">
            Select a client to manage notifications.
          </div>
        ) : (
          <>
            {/* Mode */}
            <div className="rounded-xl border bg-white overflow-hidden">
              <div className="px-4 py-3 border-b flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Settings2 size={18} className="text-slate-700" />
                  <div className="font-semibold text-slate-900">
                    Mode — {selected.clientCode}
                  </div>
                </div>
              </div>

              <div className="p-4 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <ModeButton
                    current={selected.mode}
                    value="USERS_PLUS_CUSTOM"
                    onClick={setMode}
                  >
                    Users + Custom
                  </ModeButton>
                  <ModeButton
                    current={selected.mode}
                    value="CUSTOM_ONLY"
                    onClick={setMode}
                  >
                    Custom only
                  </ModeButton>
                  <ModeButton
                    current={selected.mode}
                    value="USERS_ONLY"
                    onClick={setMode}
                  >
                    Users only
                  </ModeButton>
                </div>

                <div className="text-xs text-slate-600">
                  Users = CLIENT accounts. Custom = B1/B2 extra recipients. If
                  client wants only B1/B2, choose{" "}
                  <span className="font-semibold">CUSTOM_ONLY</span>.
                </div>
              </div>
            </div>

            {/* Custom emails */}
            <div className="rounded-xl border bg-white overflow-hidden">
              <div className="px-4 py-3 border-b flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Mail size={18} className="text-slate-700" />
                  <div className="font-semibold text-slate-900">
                    Custom emails
                  </div>
                </div>
              </div>

              <div className="p-4 space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                  <div>
                    <label className="block text-xs text-slate-600 mb-1">
                      Email
                    </label>
                    <input
                      className="w-full rounded-lg border px-3 py-2 text-sm bg-white"
                      placeholder="ops@client.com"
                      value={newEmail}
                      onChange={(e) => setNewEmail(e.target.value)}
                    />
                  </div>

                  <div>
                    <label className="block text-xs text-slate-600 mb-1">
                      Label (optional)
                    </label>
                    <input
                      className="w-full rounded-lg border px-3 py-2 text-sm bg-white"
                      placeholder="B1 / B2"
                      value={newLabel}
                      onChange={(e) => setNewLabel(e.target.value)}
                    />
                  </div>

                  <div className="flex items-end">
                    <button
                      className="w-full rounded-lg bg-emerald-700 text-white px-4 py-2 text-sm hover:bg-emerald-600"
                      onClick={addEmail}
                      type="button"
                    >
                      Add
                    </button>
                  </div>
                </div>

                <div className="overflow-x-auto rounded-xl border">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-slate-700">
                      <tr className="text-left border-b">
                        <th className="py-2 px-3">Email</th>
                        <th className="py-2 px-3">Label</th>
                        <th className="py-2 px-3">Active</th>
                        <th className="py-2 px-3 text-right">Actions</th>
                      </tr>
                    </thead>

                    <tbody className="divide-y">
                      {selected.emails.length === 0 ? (
                        <tr>
                          <td className="py-6 px-3 text-slate-500" colSpan={4}>
                            No custom emails added.
                          </td>
                        </tr>
                      ) : (
                        selected.emails.map((row) => (
                          <tr key={row.id}>
                            <td className="py-2 px-3">{row.email}</td>
                            <td className="py-2 px-3 text-slate-600">
                              {row.label ?? "—"}
                            </td>
                            <td className="py-2 px-3">
                              <input
                                type="checkbox"
                                checked={row.active}
                                onChange={(e) =>
                                  toggleEmail(row, e.target.checked)
                                }
                              />
                            </td>
                            <td className="py-2 px-3 text-right">
                              <button
                                className="inline-flex items-center gap-2 rounded-lg border bg-white px-3 py-1.5 text-xs text-rose-700 hover:bg-rose-50"
                                onClick={() => removeEmail(row)}
                                type="button"
                              >
                                <Trash2 size={14} />
                                Remove
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                <div className="text-xs text-slate-600">
                  This affects who receives status-change emails for this client
                  code.
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
