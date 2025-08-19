// src/pages/admin/RolesPanel.tsx
import { useEffect, useState } from "react";
import { ALL_PERMISSIONS } from "../../config/permissions";
import { listRoles, updateRolePermissions } from "../../api/admin";
import type { Permission, RoleDef } from "../../types/admin";

export default function RolesPanel() {
  const [roles, setRoles] = useState<RoleDef[]>([]);
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    (async () => setRoles(await listRoles()))();
  }, []);

  function toggle(roleId: string, perm: Permission) {
    setRoles((prev) =>
      prev.map((r) =>
        r.id === roleId
          ? {
              ...r,
              permissions: r.permissions.includes(perm)
                ? r.permissions.filter((p) => p !== perm)
                : [...r.permissions, perm],
            }
          : r
      )
    );
  }

  async function save(r: RoleDef) {
    setSaving(r.id);
    try {
      await updateRolePermissions({ role: r.name, permissions: r.permissions });
      // Optionally re-fetch roles to confirm
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto border rounded">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left p-3">Role</th>
              {ALL_PERMISSIONS.map((p) => (
                <th key={p} className="text-left p-3 whitespace-nowrap">{p}</th>
              ))}
              <th className="text-right p-3">Save</th>
            </tr>
          </thead>
          <tbody>
            {roles.map((r) => (
              <tr key={r.id} className="border-t">
                <td className="p-3 font-medium">{r.name}</td>
                {ALL_PERMISSIONS.map((p) => {
                  const checked = r.permissions.includes(p);
                  return (
                    <td key={p} className="p-3">
                      <label className="inline-flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggle(r.id, p)}
                        />
                        <span className="sr-only">{p}</span>
                      </label>
                    </td>
                  );
                })}
                <td className="p-3 text-right">
                  <button
                    className="px-3 py-1 rounded bg-gray-900 text-white disabled:opacity-50"
                    onClick={() => save(r)}
                    disabled={saving === r.id}
                  >
                    {saving === r.id ? "Saving…" : "Save"}
                  </button>
                </td>
              </tr>
            ))}
            {roles.length === 0 && (
              <tr><td className="p-4" colSpan={ALL_PERMISSIONS.length + 2}>Loading…</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-gray-500">
        Changes take effect immediately. Ensure SOP alignment and keep an audit trail of role changes.
      </p>
    </div>
  );
}
