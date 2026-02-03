import React, { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { api } from "../../lib/api";

type Mode = "USERS_ONLY" | "CUSTOM_ONLY" | "USERS_PLUS_CUSTOM";

type EmailRow = {
  id: string;
  email: string;
  label?: string | null;
  active: boolean;
};

type Config = {
  clientCode: string;
  mode: Mode;
  emails: EmailRow[];
};

export default function ClientNotificationSettings() {
  const [clientCode, setClientCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [cfg, setCfg] = useState<Config | null>(null);

  const [newEmail, setNewEmail] = useState("");
  const [newLabel, setNewLabel] = useState("");

  const canLoad = useMemo(() => clientCode.trim().length > 0, [clientCode]);

  async function load() {
    const code = clientCode.trim();
    if (!code) return;
    setLoading(true);
    try {
      const res = await api<Config>(`/client-notifications/${encodeURIComponent(code)}`);
      setCfg(res);
    } catch (e: any) {
      toast.error(e.message || "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  async function setMode(mode: Mode) {
    if (!cfg) return;
    try {
      await api(`/client-notifications/${encodeURIComponent(cfg.clientCode)}/mode`, {
        method: "PATCH",
        body: JSON.stringify({ mode }),
      });
      toast.success("Mode updated");
      setCfg({ ...cfg, mode });
    } catch (e: any) {
      toast.error(e.message || "Failed to update mode");
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
        { method: "POST", body: JSON.stringify({ email, label: newLabel.trim() || undefined }) }
      );
      toast.success("Email added");
      setCfg({ ...cfg, emails: upsertEmail(cfg.emails, row) });
      setNewEmail("");
      setNewLabel("");
    } catch (e: any) {
      toast.error(e.message || "Failed to add email");
    }
  }

  async function toggle(row: EmailRow, active: boolean) {
    if (!cfg) return;
    try {
      const updated = await api<EmailRow>(
        `/client-notifications/${encodeURIComponent(cfg.clientCode)}/emails/${row.id}`,
        { method: "PATCH", body: JSON.stringify({ active }) }
      );
      setCfg({
        ...cfg,
        emails: cfg.emails.map((e) => (e.id === updated.id ? updated : e)),
      });
    } catch (e: any) {
      toast.error(e.message || "Failed to update email");
    }
  }

  async function remove(row: EmailRow) {
    if (!cfg) return;
    if (!confirm(`Remove ${row.email}?`)) return;
    try {
      await api(
        `/client-notifications/${encodeURIComponent(cfg.clientCode)}/emails/${row.id}`,
        { method: "DELETE" }
      );
      toast.success("Removed");
      setCfg({ ...cfg, emails: cfg.emails.filter((e) => e.id !== row.id) });
    } catch (e: any) {
      toast.error(e.message || "Failed to remove");
    }
  }

  return (
    <div className="p-4 max-w-3xl">
      <h2 className="text-xl font-bold mb-3">Client Notification Settings</h2>

      <div className="flex gap-2 items-center">
        <input
          className="border rounded px-3 py-2 w-64"
          placeholder="Client code (e.g. JJL)"
          value={clientCode}
          onChange={(e) => setClientCode(e.target.value)}
        />
        <button
          className="bg-blue-700 text-white rounded px-3 py-2 disabled:opacity-50"
          disabled={!canLoad || loading}
          onClick={load}
        >
          Load
        </button>
      </div>

      {cfg && (
        <div className="mt-5 space-y-4">
          <div className="border rounded p-3">
            <div className="font-semibold mb-2">Mode for {cfg.clientCode}</div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <ModeButton current={cfg.mode} value="USERS_PLUS_CUSTOM" onClick={setMode}>
                Users + Custom
              </ModeButton>
              <ModeButton current={cfg.mode} value="CUSTOM_ONLY" onClick={setMode}>
                Custom only
              </ModeButton>
              <ModeButton current={cfg.mode} value="USERS_ONLY" onClick={setMode}>
                Users only
              </ModeButton>
            </div>

            <p className="text-sm text-gray-600 mt-2">
              <span className="font-semibold">Users</span> = CLIENT accounts in your system.{" "}
              <span className="font-semibold">Custom</span> = extra emails (B1/B2) not tied to users.
            </p>
          </div>

          <div className="border rounded p-3">
            <div className="font-semibold mb-2">Custom notification emails</div>

            <div className="flex flex-col sm:flex-row gap-2 mb-3">
              <input
                className="border rounded px-3 py-2 flex-1"
                placeholder="email (e.g. ops@client.com)"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
              />
              <input
                className="border rounded px-3 py-2 flex-1"
                placeholder="label (optional)"
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
              />
              <button className="bg-green-700 text-white rounded px-3 py-2" onClick={addEmail}>
                Add
              </button>
            </div>

            <div className="overflow-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left border-b">
                    <th className="py-2">Email</th>
                    <th className="py-2">Label</th>
                    <th className="py-2">Active</th>
                    <th className="py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {cfg.emails.length === 0 ? (
                    <tr>
                      <td className="py-3 text-gray-500" colSpan={4}>
                        No custom emails added.
                      </td>
                    </tr>
                  ) : (
                    cfg.emails.map((row) => (
                      <tr key={row.id} className="border-b">
                        <td className="py-2">{row.email}</td>
                        <td className="py-2">{row.label ?? "-"}</td>
                        <td className="py-2">
                          <input
                            type="checkbox"
                            checked={row.active}
                            onChange={(e) => toggle(row, e.target.checked)}
                          />
                        </td>
                        <td className="py-2 text-right">
                          <button
                            className="text-red-700 font-semibold"
                            onClick={() => remove(row)}
                          >
                            Remove
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="text-xs text-gray-600 mt-2">
              Tip: If a client wants notifications only to B1/B2, set mode to <b>CUSTOM_ONLY</b>.
            </div>
          </div>
        </div>
      )}
    </div>
  );
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
      className={
        "rounded px-3 py-2 border font-semibold " +
        (active ? "bg-blue-700 text-white border-blue-700" : "bg-white text-blue-700 border-blue-200")
      }
      onClick={() => onClick(value)}
    >
      {children}
    </button>
  );
}

function upsertEmail(list: EmailRow[], row: EmailRow) {
  const idx = list.findIndex((x) => x.id === row.id);
  if (idx >= 0) {
    const copy = [...list];
    copy[idx] = row;
    return copy;
  }
  return [...list, row].sort((a, b) => a.email.localeCompare(b.email));
}
