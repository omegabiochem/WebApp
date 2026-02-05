import { api } from "./api";

export async function logUiEvent(event: {
  action: string;
  entity?: string;
  entityId?: string;
  details?: string;
  meta?: any;
}) {
  try {
    await api("/audit/ui", {
      method: "POST",
      body: JSON.stringify(event),
    });
  } catch {
    // Best effort - never block UI
  }
}