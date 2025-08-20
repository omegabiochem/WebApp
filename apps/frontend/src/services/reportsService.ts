import { api } from "../lib/api";

export type Report = any; // you can shape this with your prisma types

export function createReport(dto: any): Promise<Report> {
  return api("/reports", { method: "POST", body: JSON.stringify(dto) });
}
export function getReport(id: string): Promise<Report> {
  return api(`/reports/${id}`);
}
export function updateHeader(id: string, dto: any): Promise<Report> {
  return api(`/reports/${id}/header`, { method: "PATCH", body: JSON.stringify(dto) });
}
export function updateMicro(id: string, dto: any): Promise<Report> {
  return api(`/reports/${id}/micro`, { method: "PATCH", body: JSON.stringify(dto) });
}
export function qaApprove(id: string): Promise<Report> {
  return api(`/reports/${id}/qa-approve`, { method: "POST" });
}
export function lockReport(id: string): Promise<Report> {
  return api(`/reports/${id}/lock`, { method: "POST" });
}
export function listReports(): Promise<Report[]> {
  return api(`/reports`);
}
