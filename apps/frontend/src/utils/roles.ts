export type Role =
  | "SYSTEMADMIN"
  | "ADMIN"
  | "FRONTDESK"
  | "MICRO"
  | "CHEMISTRY"
  | "MC"
  | "QA"
  | "CLIENT";

export const canEditHeader = (role: Role) =>
  role === "FRONTDESK" || role === "ADMIN" || role === "SYSTEMADMIN";

export const canEditMicro = (role: Role) =>
  role === "MICRO" ||
  role === "CHEMISTRY" ||
  role === "MC" ||
  role === "ADMIN" ||
  role === "SYSTEMADMIN";

export const canQA = (role: Role) =>
  role === "QA" || role === "ADMIN" || role === "SYSTEMADMIN";
