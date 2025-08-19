// src/pages/admin/UsersPanel.tsx
import { useEffect, useMemo, useState } from "react";
import { createUser, listUsers, updateUser } from "../../api/admin";
import type { CreateUserDTO, Role, UpdateUserDTO, UserLite } from "../../types/admin";

const ROLES: Role[] = ["admin", "client", "frontdesk", "micro", "chemistry", "qa"];

export default function UsersPanel() {
  const [users, setUsers] = useState<UserLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const data = await listUsers();
        setUsers(data);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const filtered = useMemo(() => {
    if (!q) return users;
    const t = q.toLowerCase();
    return users.filter(
      (u) =>
        u.email.toLowerCase().includes(t) ||
        u.name.toLowerCase().includes(t) ||
        u.role.toLowerCase().includes(t)
    );
  }, [q, users]);

  async function onCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const body: CreateUserDTO = {
      email: String(fd.get("email") || "").trim(),
      name: String(fd.get("name") || "").trim(),
      role: fd.get("role") as Role,
      password: String(fd.get("password") || ""),
    };
    if (!body.email || !body.name || !body.password) return;
    setCreating(true);
    try {
      const newUser = await createUser(body);
      setUsers((prev) => [newUser, ...prev]);
      setShowCreate(false);
    } finally {
      setCreating(false);
    }
  }

  async function toggleActive(u: UserLite) {
    const patch: UpdateUserDTO = { active: !u.active };
    const updated = await updateUser(u.id, patch);
    setUsers((prev) => prev.map((x) => (x.id === u.id ? updated : x)));
  }

  async function changeRole(u: UserLite, role: Role) {
    const updated = await updateUser(u.id, { role });
    setUsers((prev) => prev.map((x) => (x.id === u.id ? updated : x)));
  }

  async function resetPassword(u: UserLite) {
    const pwd = prompt(`Set new password for ${u.email}:`, "");
    if (!pwd) return;
    const updated = await updateUser(u.id, { resetPasswordTo: pwd });
    setUsers((prev) => prev.map((x) => (x.id === u.id ? updated : x)));
    alert("Password reset.");
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <input
            className="border rounded-md px-3 py-2"
            placeholder="Search users…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <span className="text-sm text-gray-500">{filtered.length} users</span>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="px-3 py-2 rounded-md bg-[var(--brand)] text-white"
        >
          + Create User
        </button>
      </div>

      <div className="overflow-x-auto border rounded-lg">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left p-3">Name</th>
              <th className="text-left p-3">Email</th>
              <th className="text-left p-3">Role</th>
              <th className="text-left p-3">Status</th>
              <th className="text-left p-3">Created</th>
              <th className="text-right p-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td className="p-4" colSpan={6}>Loading…</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td className="p-4" colSpan={6}>No users found.</td></tr>
            ) : (
              filtered.map((u) => (
                <tr key={u.id} className="border-t">
                  <td className="p-3">{u.name}</td>
                  <td className="p-3">{u.email}</td>
                  <td className="p-3">
                    <select
                      className="border rounded px-2 py-1"
                      value={u.role}
                      onChange={(e) => changeRole(u, e.target.value as any)}
                    >
                      {ROLES.map((r) => (
                        <option key={r} value={r}>{r}</option>
                      ))}
                    </select>
                  </td>
                  <td className="p-3">
                    <span
                      className={`px-2 py-1 rounded text-xs ${
                        u.active ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"
                      }`}
                    >
                      {u.active ? "Active" : "Disabled"}
                    </span>
                  </td>
                  <td className="p-3">{new Date(u.createdAt).toLocaleDateString()}</td>
                  <td className="p-3 text-right">
                    <div className="flex justify-end gap-2">
                      <button
                        className="px-2 py-1 rounded border"
                        onClick={() => resetPassword(u)}
                        title="Reset password"
                      >
                        Reset PW
                      </button>
                      <button
                        className={`px-2 py-1 rounded ${u.active ? "bg-red-600 text-white" : "bg-gray-900 text-white"}`}
                        onClick={() => toggleActive(u)}
                      >
                        {u.active ? "Disable" : "Enable"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Create modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg">
            <div className="p-4 border-b flex items-center justify-between">
              <h2 className="text-lg font-semibold">Create User</h2>
              <button onClick={() => setShowCreate(false)}>&times;</button>
            </div>
            <form onSubmit={onCreate} className="p-4 space-y-3">
              <div>
                <label className="block text-sm mb-1">Full name</label>
                <input name="name" className="w-full border rounded px-3 py-2" required />
              </div>
              <div>
                <label className="block text-sm mb-1">Email</label>
                <input type="email" name="email" className="w-full border rounded px-3 py-2" required />
              </div>
              <div>
                <label className="block text-sm mb-1">Role</label>
                <select name="role" className="w-full border rounded px-3 py-2">
                  {ROLES.map((r) => (<option key={r} value={r}>{r}</option>))}
                </select>
              </div>
              <div>
                <label className="block text-sm mb-1">Temp password</label>
                <input name="password" type="password" className="w-full border rounded px-3 py-2" required />
                <p className="text-xs text-gray-500 mt-1">
                  User can change this on first login.
                </p>
              </div>
              <div className="pt-2 flex items-center justify-end gap-2">
                <button type="button" onClick={() => setShowCreate(false)} className="px-3 py-2 rounded border">
                  Cancel
                </button>
                <button disabled={creating} className="px-3 py-2 rounded bg-[var(--brand)] text-white">
                  {creating ? "Creating…" : "Create"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
