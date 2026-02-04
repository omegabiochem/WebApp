

import { api } from "../lib/api";

export type Role =
  | "SYSTEMADMIN"
  | "ADMIN"
  | "FRONTDESK"
  | "MICRO"
  | "CHEMISTRY"
  | "MC"
  | "QA"
  | "CLIENT";

/* ------------------------------------------------------------------
 * TYPES
 * ------------------------------------------------------------------ */

export type UserRow = {
  id: string;
  email: string;
  name: string | null;
  role: Role;
  active: boolean;
  mustChangePassword: boolean;
  userId: string | null;
  clientCode: string | null;

  lastLoginAt: string | null;
  lastActivityAt: string | null;
  createdAt: string;

  activeReportCount?: number;
};

export type UsersListResponse = {
  items: UserRow[];
  total: number;
  page: number;
  pageSize: number;
};

/* ------------------------------------------------------------------
 * CREATE USER (already used by CreateCredentials page)
 * ------------------------------------------------------------------ */

export async function createUserByAdmin(input: {
  email: string;
  name?: string;
  role: Role;
  userId: string;
  clientCode?: string;
}): Promise<{ user: UserRow; tempPassword: string }> {
  return api("/users/admin-create", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

/* ------------------------------------------------------------------
 * LIST USERS (Manage Users page)
 * ------------------------------------------------------------------ */

export async function fetchUsers(params: {
  q?: string;
  role?: Role | "ALL";
  active?: "ALL" | "TRUE" | "FALSE";
  page?: number;
  pageSize?: number;
}): Promise<UsersListResponse> {
  const sp = new URLSearchParams();

  if (params.q) sp.set("q", params.q);
  if (params.role) sp.set("role", params.role);
  if (params.active) sp.set("active", params.active);
  if (params.page) sp.set("page", String(params.page));
  if (params.pageSize) sp.set("pageSize", String(params.pageSize));

  const qs = sp.toString();
  return api(`/users${qs ? `?${qs}` : ""}`);
}

/* ------------------------------------------------------------------
 * ADMIN ACTIONS
 * ------------------------------------------------------------------ */

export async function setUserActive(id: string, active: boolean) {
  return api(`/users/${id}/active`, {
    method: "PATCH",
    body: JSON.stringify({ active }),
  });
}

export async function setUserRole(id: string, role: Role) {
  return api(`/users/${id}/role`, {
    method: "PATCH",
    body: JSON.stringify({ role }),
  });
}

export async function setUserClientCode(id: string, clientCode: string | null) {
  return api(`/users/${id}/client-code`, {
    method: "PATCH",
    body: JSON.stringify({ clientCode }),
  });
}

export async function resetUserPassword(id: string): Promise<{
  tempPassword: string;
}> {
  return api(`/users/${id}/reset-password`, {
    method: "POST",
  });
}

export async function forceUserSignout(id: string) {
  return api(`/users/${id}/force-signout`, {
    method: "POST",
  });
}

/* ------------------------------------------------------------------
 * SELF SERVICE (already exists)
 * ------------------------------------------------------------------ */

export async function changeUserPassword(input: {
  currentPassword: string;
  newPassword: string;
}): Promise<{ ok: boolean }> {
  return api("/auth/change-password", {
    method: "POST",
    body: JSON.stringify(input),
  });
}
