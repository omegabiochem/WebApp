import React, { useEffect, useMemo, useRef, useState } from "react";
import { Send, MessageCircle, X, ShieldCheck, Search } from "lucide-react";

type UserRole =
  | "SYSTEMADMIN"
  | "ADMIN"
  | "FRONTDESK"
  | "MICRO"
  | "CHEMISTRY"
  | "QA"
  | "CLIENT"
  | "MC";

type InboxRow = {
  threadId: string | null;
  clientCode: string;
  clientName?: string | null;
  clientEmail?: string | null;
  lastMessage?: {
    id: string;
    body: string;
    createdAt: string;
    senderRole: UserRole;
  } | null;
  unreadCount: number;
};

type ServerMessage = {
  id: string;
  body: string;
  createdAt: string;
  senderRole: UserRole;
  senderName?: string | null;
};

function uid() {
  return Math.random().toString(16).slice(2) + Date.now().toString(16);
}

function cn(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

export default function OmegaChatbox() {
  const [open, setOpen] = useState(false);

  // inbox (clients)
  const [inbox, setInbox] = useState<InboxRow[]>([]);
  const [loadingInbox, setLoadingInbox] = useState(false);
  const [q, setQ] = useState("");

  // selection
  const [selectedClientCode, setSelectedClientCode] = useState<string | null>(
    null
  );

  // thread messages
  const [threadMessages, setThreadMessages] = useState<ServerMessage[]>([]);
  const [loadingThread, setLoadingThread] = useState(false);

  // compose
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);

  const listRef = useRef<HTMLDivElement | null>(null);

  // ------- API helpers (replace with your api wrapper if you have one) -------
  async function apiGet<T>(url: string): Promise<T> {
    const res = await fetch(url, { credentials: "include" });
    if (!res.ok) throw new Error(`GET ${url} failed: ${res.status}`);
    return res.json();
  }

  async function apiPost<T>(url: string, body: any): Promise<T> {
    const res = await fetch(url, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`POST ${url} failed: ${res.status}`);
    return res.json();
  }

  // ------- load inbox when opened -------
  async function loadInbox() {
    setLoadingInbox(true);
    try {
      const rows = await apiGet<InboxRow[]>("/api/messages/inbox");
      setInbox(rows ?? []);
      // auto-select first client if none selected
      if (!selectedClientCode && rows?.length) {
        setSelectedClientCode(rows[0].clientCode);
      }
    } finally {
      setLoadingInbox(false);
    }
  }

  useEffect(() => {
    if (!open) return;
    loadInbox();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // ------- load thread when client changes -------
  async function loadThread(clientCode: string) {
    setLoadingThread(true);
    try {
      const data = await apiGet<{ messages: ServerMessage[] }>(
        `/api/messages/thread?clientCode=${encodeURIComponent(clientCode)}`
      );
      setThreadMessages(data?.messages ?? []);

      // mark as read (optional)
      await apiPost("/api/messages/mark-read", { clientCode });

      // refresh inbox counts
      loadInbox();
    } finally {
      setLoadingThread(false);
    }
  }

  useEffect(() => {
    if (!open) return;
    if (!selectedClientCode) return;
    loadThread(selectedClientCode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedClientCode, open]);

  // auto-scroll on message load/add
  useEffect(() => {
    if (!open) return;
    setTimeout(() => {
      listRef.current?.scrollTo({
        top: listRef.current.scrollHeight,
        behavior: "smooth",
      });
    }, 30);
  }, [threadMessages, open]);

  // ------- send message to selected client -------
  async function sendMessage() {
    const trimmed = input.trim();
    if (!trimmed || sending || !selectedClientCode) return;

    setSending(true);
    setInput("");

    // optimistic add
    const optimistic: ServerMessage = {
      id: uid(),
      body: trimmed,
      createdAt: new Date().toISOString(),
      senderRole: "ADMIN", // UI only; backend will set real role
      senderName: "You",
    };
    setThreadMessages((m) => [...m, optimistic]);

    try {
      await apiPost("/api/messages/send", {
        clientCode: selectedClientCode,
        body: trimmed,
        // mentions: [], // optional
      });

      // reload thread + inbox preview/unread
      await loadThread(selectedClientCode);
    } catch (e) {
      // revert optimistic if desired
      setThreadMessages((m) => m.filter((x) => x.id !== optimistic.id));
      alert("Failed to send message. Please try again.");
    } finally {
      setSending(false);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  const filteredInbox = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return inbox;
    return inbox.filter((r) => {
      return (
        r.clientCode.toLowerCase().includes(s) ||
        (r.clientName ?? "").toLowerCase().includes(s) ||
        (r.clientEmail ?? "").toLowerCase().includes(s)
      );
    });
  }, [inbox, q]);

  const selected = useMemo(
    () => inbox.find((x) => x.clientCode === selectedClientCode) ?? null,
    [inbox, selectedClientCode]
  );

  return (
    <>
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-full bg-blue-600 px-4 py-3 text-white shadow-lg hover:bg-blue-700 active:scale-[0.99]"
        >
          <MessageCircle className="h-5 w-5" />
          <span className="text-sm font-semibold">Messages</span>
        </button>
      )}

      {open && (
        <div className="fixed bottom-6 right-6 z-50 w-[820px] max-w-[96vw] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
          {/* Header */}
          <div className="flex items-center justify-between bg-slate-50 px-4 py-3">
            <div className="flex items-center gap-2">
              <div className="grid h-9 w-9 place-items-center rounded-xl bg-blue-600 text-white">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <div className="leading-tight">
                <div className="text-sm font-bold text-slate-900">
                  Omega BioChem Lab
                </div>
                <div className="text-xs text-slate-500">
                  Client Messaging Inbox
                </div>
              </div>
            </div>

            <button
              onClick={() => setOpen(false)}
              className="rounded-lg p-2 text-slate-600 hover:bg-slate-100"
              aria-label="Close chat"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="grid grid-cols-[320px_1fr]">
            {/* LEFT: Client list */}
            <div className="border-r border-slate-200">
              <div className="p-3">
                <div className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2">
                  <Search className="h-4 w-4 text-slate-500" />
                  <input
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder="Search clients…"
                    className="w-full text-sm outline-none"
                  />
                </div>

                <div className="mt-2 flex items-center justify-between">
                  <div className="text-xs text-slate-500">
                    {loadingInbox ? "Loading…" : `${filteredInbox.length} clients`}
                  </div>
                  <button
                    onClick={loadInbox}
                    className="text-xs font-semibold text-blue-700 hover:underline"
                  >
                    Refresh
                  </button>
                </div>
              </div>

              <div className="max-h-[520px] overflow-y-auto">
                {filteredInbox.map((r) => {
                  const active = r.clientCode === selectedClientCode;
                  return (
                    <button
                      key={r.clientCode}
                      onClick={() => setSelectedClientCode(r.clientCode)}
                      className={cn(
                        "w-full border-t border-slate-100 px-3 py-3 text-left hover:bg-slate-50",
                        active && "bg-blue-50"
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-semibold text-slate-900">
                            {r.clientName || r.clientCode}
                          </div>
                          <div className="truncate text-[12px] text-slate-500">
                            {r.clientEmail || r.clientCode}
                          </div>
                        </div>

                        {r.unreadCount > 0 && (
                          <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-blue-600 px-2 text-[11px] font-bold text-white">
                            {r.unreadCount}
                          </span>
                        )}
                      </div>

                      <div className="mt-1 line-clamp-1 text-[12px] text-slate-600">
                        {r.lastMessage?.body ?? "No messages yet"}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* RIGHT: Thread */}
            <div className="flex flex-col">
              {/* thread header */}
              <div className="border-b border-slate-200 px-4 py-3">
                <div className="text-sm font-bold text-slate-900">
                  {selected?.clientName || selected?.clientCode || "Select a client"}
                </div>
                <div className="text-xs text-slate-500">
                  {selected?.clientEmail || (selected?.clientCode ? `Client code: ${selected.clientCode}` : "")}
                </div>
              </div>

              {/* messages */}
              <div
                ref={listRef}
                className="h-[420px] overflow-y-auto px-4 py-3"
              >
                {loadingThread ? (
                  <div className="text-sm text-slate-500">Loading messages…</div>
                ) : threadMessages.length === 0 ? (
                  <div className="text-sm text-slate-500">
                    No messages yet. Send a message to start the thread.
                  </div>
                ) : (
                  threadMessages.map((m) => {
                    const isMe = m.senderRole !== "CLIENT";
                    return (
                      <div
                        key={m.id}
                        className={cn("mb-2 flex", isMe ? "justify-end" : "justify-start")}
                      >
                        <div
                          className={cn(
                            "max-w-[85%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm leading-snug",
                            isMe ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-900"
                          )}
                        >
                          {m.body}
                          <div className={cn("mt-1 text-[10px] opacity-75")}>
                            {new Date(m.createdAt).toLocaleString()}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* input */}
              <div className="border-t border-slate-200 p-3">
                <div className="flex items-end gap-2">
                  <textarea
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={onKeyDown}
                    placeholder={
                      selectedClientCode
                        ? "Type your message…"
                        : "Select a client to start messaging…"
                    }
                    disabled={!selectedClientCode}
                    className="min-h-[42px] max-h-[120px] flex-1 resize-none rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400 disabled:bg-slate-50"
                  />
                  <button
                    onClick={sendMessage}
                    disabled={sending || !input.trim() || !selectedClientCode}
                    className="grid h-[42px] w-[42px] place-items-center rounded-xl bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
                    title="Send"
                  >
                    <Send className="h-5 w-5" />
                  </button>
                </div>

                <div className="mt-2 text-[11px] text-slate-500">
                  Tip: Use this inbox for client communication (attachments/PHI not allowed).
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}