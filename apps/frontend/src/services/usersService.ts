import { api } from "../lib/api";

export type Role =
  | "SYSTEMADMIN"
  | "ADMIN"
  | "FRONTDESK"
  | "MICRO"
  | "CHEMISTRY"
  | "QA"
  | "CLIENT";

export async function createUserByAdmin(input: {
  email: string;
  name?: string;
  role: Role;
}): Promise<{ user: any; tempPassword: string }> {
  return api("/users", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function changeUserPassword(input: {
  currentPassword: string;
  newPassword: string;
}): Promise<{ ok: boolean }> {
  return api("/auth/change-password", {
    method: "POST",
    body: JSON.stringify(input),
    //  headers: {
    //   Authorization: `Bearer ${token}`,
    // },
  });
}
