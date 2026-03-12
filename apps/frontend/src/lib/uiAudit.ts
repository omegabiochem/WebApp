import { api } from "./api";

type UiAuditEvent = {
  action: string;
  entity?: string;
  entityId?: string | null;
  details?: string;
  meta?: any;
  formNumber?: string | null;
  reportNumber?: string | null;
  formType?: string | null;
  clientCode?: string | null;
};

export async function logUiEvent(event: UiAuditEvent) {
  try {
    await api("/audit/ui", {
      method: "POST",
      body: JSON.stringify(event),
    });
  } catch {
    // Best effort - never block UI
  }
}