import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { api, apiBlob } from "../../lib/api";
import { MessageCircle, X, Paperclip, MoreVertical } from "lucide-react";
import toast from "react-hot-toast";

const LAB_ROLES = [
  "MICRO",
  "CHEMISTRY",
  "MC",
  "QA",
  "FRONTDESK",
  "ADMIN",
  "SYSTEMADMIN",
] as const;

type InboxLastMessage = {
  id: string;
  body: string;
  createdAt: string;
  senderRole: string;
  // optional if you add it later
  // readAt?: string | null;
};

type Thread = {
  id: string;
  clientCode: string;
  lastMessage: InboxLastMessage | null;
  unreadCount: number;
};

type Message = {
  id: string;
  body: string;
  senderRole: string;
  senderName?: string | null;
  createdAt: string;
  attachments?: ChatAttachment[] | null;

  replyToMessageId?: string | null;
  replyTo?: {
    id: string;
    body: string;
    senderRole: string;
    senderName?: string | null;
    createdAt: string;
  } | null;
};

type FormType =
  | "MICRO_MIX"
  | "MICRO_MIX_WATER"
  | "STERILITY"
  | "CHEMISTRY_MIX"
  | "COA";

type FormListItem = {
  formType: FormType;
  formNumber: string;
  reportNumber?: string | null;
  reportId?: string;
  chemistryId?: string;
  updatedAt?: string;
};

type ChatAttachment =
  | {
      kind: "PHOTO" | "FILE";
      filename: string;
      contentType: string;
      size: number;
      url: string;
      storageKey: string;
    }
  | {
      kind: "FORM";
      formType: FormType;
      formNumber: string;
      reportNumber?: string | null;
      reportId?: string;
      chemistryId?: string;
    };

function toDateKey(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatTimeLocal(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatDateHeader(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const yKey = toDateKey(d);
  const tKey = toDateKey(today);

  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const yestKey = toDateKey(yesterday);

  if (yKey === tKey) return "Today";
  if (yKey === yestKey) return "Yesterday";

  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

type RenderItem =
  | { type: "date"; key: string; label: string }
  | { type: "msg"; msg: Message };

export default function OmegaChatBox() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);

  const [threads, setThreads] = useState<Thread[]>([]);
  const [selectedThread, setSelectedThread] = useState<Thread | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const [mentions, setMentions] = useState<string[]>([]);

  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [menuOpenFor, setMenuOpenFor] = useState<string | null>(null);
  const [menuDir, setMenuDir] = useState<"up" | "down">("down");

  const inputRef = useRef<HTMLInputElement | null>(null);

  // // ✅ unread counts per client (lab sidebar)
  // const [unreadByClient, setUnreadByClient] = useState<Record<string, number>>(
  //   {}
  // );

  // // ✅ last seen per clientCode for LAB to compute unread locally
  // const [lastSeenByClient, setLastSeenByClient] = useState<
  //   Record<string, string>
  // >(() => {
  //   try {
  //     return JSON.parse(localStorage.getItem("msg:lastSeenByClient") || "{}");
  //   } catch {
  //     return {};
  //   }
  // });

  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const messagesBoxRef = useRef<HTMLDivElement | null>(null);

  const [attachOpen, setAttachOpen] = useState(false);
  const [pendingAttachments, setPendingAttachments] = useState<
    ChatAttachment[]
  >([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  // const menuRootRef = useRef<HTMLDivElement | null>(null);

  // forms
  const [recentForms, setRecentForms] = useState<FormListItem[]>([]);
  const [formsLoading, setFormsLoading] = useState(false);
  const [formSearch, setFormSearch] = useState("");
  const [formSearchResults, setFormSearchResults] = useState<FormListItem[]>(
    [],
  );
  const [formSearchLoading, setFormSearchLoading] = useState(false);
  const [formSearchError, setFormSearchError] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");

  if (!user) return null;
  const authUser = user; // ✅ now TypeScript knows this is NOT null

  const isLab = LAB_ROLES.includes(user.role as any);

  const [undoBar, setUndoBar] = useState<{
    messageId: string;
    expiresAt: number;
  } | null>(null);

  const undoTimerRef = useRef<number | null>(null);

  function clearUndoTimer() {
    if (undoTimerRef.current) {
      window.clearTimeout(undoTimerRef.current);
      undoTimerRef.current = null;
    }
  }

  // -----------------------------------
  // Scroll helpers
  // -----------------------------------
  const scrollToBottom = (smooth = false) => {
    // Option A: scrollIntoView sentinel
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({
        behavior: smooth ? "smooth" : "auto",
        block: "end",
      });
      return;
    }
    // Option B fallback
    if (messagesBoxRef.current) {
      messagesBoxRef.current.scrollTop = messagesBoxRef.current.scrollHeight;
    }
  };

  // -----------------------------------
  // Refresh messages
  // -----------------------------------
  const refresh = async () => {
    const url =
      isLab && selectedThread
        ? `/messages?clientCode=${encodeURIComponent(
            selectedThread.clientCode,
          )}`
        : "/messages";

    const res = await api<{ messages: Message[] }>(url, { method: "GET" });
    setMessages(res.messages ?? []);
  };

  // -----------------------------------
  // LAB: fetch inbox (client list)
  // - sort by latest message desc
  // - compute unread badge based on lastSeen local store
  // -----------------------------------
  useEffect(() => {
    if (!open || !isLab) return;

    api<Thread[]>("/messages/inbox", { method: "GET" })
      .then((data) => {
        setThreads(data);
        if (!selectedThread && data.length > 0) setSelectedThread(data[0]);
      })
      .catch(console.error);
  }, [open, isLab]);

  // -----------------------------------
  // Fetch messages for current thread
  // -----------------------------------
  useEffect(() => {
    if (!open) return;
    if (isLab && !selectedThread) return;

    setLoading(true);

    refresh()
      .catch(console.error)
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, isLab, selectedThread?.id]);

  // -----------------------------------
  // ✅ Always scroll down when:
  // - chat opens
  // - messages change
  // -----------------------------------
  useEffect(() => {
    if (!open) return;
    // wait a tick so DOM renders
    const t = setTimeout(() => scrollToBottom(false), 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    scrollToBottom(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages.length]);

  // -----------------------------------
  // ✅ When LAB opens a thread, mark it as "seen" locally
  // (this drives unread badge)
  // -----------------------------------
  useEffect(() => {
    if (!open) return;
    if (isLab && !selectedThread) return;

    (async () => {
      await api("/messages/read", {
        method: "POST",
        body: JSON.stringify(
          isLab ? { clientCode: selectedThread!.clientCode } : {},
        ),
      });

      // update counts in sidebar + total badge
      const inbox = await api<Thread[]>("/messages/inbox", { method: "GET" });
      setThreads(inbox);
      setTotalUnread(inbox.reduce((a, t) => a + (t.unreadCount || 0), 0));
    })().catch(console.error);
  }, [open, isLab, selectedThread?.id]);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;

      // ✅ if click happened inside any menu root, don't close
      if (target.closest('[data-chat-menu-root="1"]')) return;

      setMenuOpenFor(null);
    };

    document.addEventListener("pointerdown", onPointerDown, true);
    return () =>
      document.removeEventListener("pointerdown", onPointerDown, true);
  }, [open]);

  useEffect(() => {
    setMenuOpenFor(null);
    setReplyTo(null);
  }, [selectedThread?.id]);

  useEffect(() => {
    return () => clearUndoTimer();
  }, []);

  // -----------------------------------
  // Send message
  // -----------------------------------
  const sendMessage = async () => {
    const trimmed = (editingId ? editingText : message).trim();

    // editing: body required (no attachment edits)
    if (editingId) {
      if (!trimmed) return;

      await api(`/messages/${editingId}`, {
        method: "PATCH",
        body: JSON.stringify({ body: trimmed }),
      });

      setEditingId(null);
      setEditingText("");
      await refresh();
      return;
    }

    // normal send (allow attachment-only)
    if ((!trimmed && pendingAttachments.length === 0) || !user) return;

    const outgoingAttachments = pendingAttachments;

    await api("/messages", {
      method: "POST",
      body: JSON.stringify({
        body: trimmed,
        attachments: outgoingAttachments,
        replyToMessageId: replyTo?.id ?? null,
        mentions: user.role === "CLIENT" ? mentions : [],
        ...(isLab && selectedThread
          ? { clientCode: selectedThread.clientCode }
          : {}),
      }),
    });

    setMessage("");
    setPendingAttachments([]);
    setReplyTo(null);
    setMenuOpenFor(null);
    await refresh();
    scrollToBottom(true);
  };

  // -----------------------------------
  // Build date separators
  // -----------------------------------
  const renderItems: RenderItem[] = useMemo(() => {
    const items: RenderItem[] = [];
    let lastDateKey: string | null = null;

    for (const m of messages) {
      const d = new Date(m.createdAt);
      const key = toDateKey(d);

      if (key !== lastDateKey) {
        items.push({ type: "date", key, label: formatDateHeader(m.createdAt) });
        lastDateKey = key;
      }
      items.push({ type: "msg", msg: m });
    }

    return items;
  }, [messages]);

  const CLIENT_TAGS = ["MICRO", "CHEMISTRY", "FRONTDESK"] as const;

  function onSelectReply(target: Message) {
    setReplyTo(target);
    setMenuOpenFor(null);

    // ✅ auto tagging ONLY for CLIENT
    if (authUser.role === "CLIENT") {
      const r = target.senderRole;
      if (CLIENT_TAGS.includes(r as any)) {
        setMentions([r]); // auto set to sender dept
      } else {
        setMentions(["FRONTDESK"]);
      }
    }

    setTimeout(() => inputRef.current?.focus(), 0);
  }

  useEffect(() => {
    if (authUser.role !== "CLIENT") return;

    setMentions((prev) => (prev.length ? prev : ["MICRO"]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authUser.role]);

  // small helper for sidebar preview
  // const preview = (t: Thread) => {
  //   const last = t.lastMessage;
  //   if (!last) return { text: "No messages yet", time: "" };

  //   const text =
  //     last.body?.length > 22 ? last.body.slice(0, 22) + "…" : last.body;

  //   return { text, time: formatTimeLocal(last.createdAt) };
  // };

  const [totalUnread, setTotalUnread] = useState(0);

  const fetchTotalUnread = async () => {
    const inbox = await api<Thread[]>("/messages/inbox", { method: "GET" });
    const sum = inbox.reduce((acc, t) => acc + (t.unreadCount || 0), 0);

    setThreads(inbox);
    setTotalUnread(sum);

    if (!selectedThread && inbox.length > 0) setSelectedThread(inbox[0]);
  };

  useEffect(() => {
    if (!user) return;

    // initial fetch
    fetchTotalUnread().catch(console.error);

    // poll every 10s
    const id = window.setInterval(() => {
      fetchTotalUnread().catch(console.error);
    }, 10000);

    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.role, open, selectedThread?.id]);

  async function loadRecentForms() {
    setFormsLoading(true);
    try {
      const data = await api<{ items: FormListItem[] }>(
        `/forms/recent?limit=5`,
        {
          method: "GET",
        },
      );
      setRecentForms(Array.isArray(data?.items) ? data.items : []);
    } catch {
      setRecentForms([]);
    } finally {
      setFormsLoading(false);
    }
  }

  async function searchForms(q: string) {
    const trimmed = q.trim();
    if (!trimmed) {
      setFormSearchResults([]);
      setFormSearchError(null);
      return;
    }
    setFormSearchLoading(true);
    setFormSearchError(null);
    try {
      const data = await api<{ items: FormListItem[] }>(
        `/forms/search?q=${encodeURIComponent(trimmed)}`,
        { method: "GET" },
      );
      setFormSearchResults(Array.isArray(data?.items) ? data.items : []);
    } catch {
      setFormSearchResults([]);
      setFormSearchError("No results or search failed.");
    } finally {
      setFormSearchLoading(false);
    }
  }

  // async function uploadChatFile(file: File) {
  //   const fd = new FormData();
  //   fd.append("file", file);

  //   return api<{
  //     url: string;
  //     storageKey: string;
  //     filename: string;
  //     contentType: string;
  //     size: number;
  //   }>(`/messages/uploads`, {
  //     method: "POST",
  //     body: fd as any,
  //   });
  // }

  async function uploadChatFile(file: File) {
    const fd = new FormData();
    fd.append("file", file);

    // ✅ send clientCode for lab uploads
    const qs =
      isLab && selectedThread?.clientCode
        ? `?clientCode=${encodeURIComponent(selectedThread.clientCode)}`
        : "";

    return api<{
      url: string;
      storageKey: string;
      filename: string;
      contentType: string;
      size: number;
    }>(`/messages/uploads${qs}`, {
      method: "POST",
      body: fd as any,
    });
  }

  function addFormAttachment(f: FormListItem) {
    setPendingAttachments((prev) => [
      ...prev,
      {
        kind: "FORM",
        formType: f.formType,
        formNumber: f.formNumber,
        reportNumber: f.reportNumber ?? null,
        reportId: f.reportId,
        chemistryId: f.chemistryId,
      },
    ]);
    setAttachOpen(false);
  }

  function removePendingAttachment(idx: number) {
    setPendingAttachments((prev) => prev.filter((_, i) => i !== idx));
  }

  async function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    try {
      const up = await uploadChatFile(file);
      setPendingAttachments((prev) => [
        ...prev,
        {
          kind: file.type.startsWith("image/") ? "PHOTO" : "FILE",
          filename: up.filename,
          contentType: up.contentType,
          size: up.size,
          url: up.url,
          storageKey: up.storageKey,
        },
      ]);
      setAttachOpen(false);
    } catch {
      alert("Upload failed. Please try again.");
    }
  }

  useEffect(() => {
    if (!attachOpen) return;
    loadRecentForms();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attachOpen]);

  async function openAttachment(a: any) {
    try {
      // a.url could be old "/messages/uploads/<key>" OR new "/messages/uploads?key=<key>"
      let path = a.url as string;

      // If old format: "/messages/uploads/staging/chat/....png"
      // convert to new: "/messages/uploads?key=<encoded>"
      if (
        typeof path === "string" &&
        path.startsWith("/messages/uploads/") &&
        !path.includes("?key=")
      ) {
        // prefer storageKey if present (best)
        const key = a.storageKey || path.replace("/messages/uploads/", ""); // extract whatever comes after

        path = `/messages/uploads?key=${encodeURIComponent(key)}`;
      }

      // If absolute URL, keep only pathname+search
      if (path.startsWith("http://") || path.startsWith("https://")) {
        const u = new URL(path);
        path = u.pathname + u.search;
      }

      const { blob } = await apiBlob(path, { method: "GET" });

      const objUrl = URL.createObjectURL(blob);
      window.open(objUrl, "_blank", "noopener,noreferrer");
      setTimeout(() => URL.revokeObjectURL(objUrl), 60_000);
    } catch (e) {
      console.error("Download failed", e);
      alert("Unable to open attachment.");
    }
  }

  // async function deleteWithUndo(m: Message) {
  //   // 1) soft delete
  //   await api(`/messages/${m.id}`, { method: "DELETE" });

  //   // 2) refresh so message disappears
  //   await refresh();

  //   // 3) show undo banner for 6s
  //   clearUndoTimer();
  //   const expiresAt = Date.now() + 6000;
  //   setUndoBar({ messageId: m.id, expiresAt });

  //   undoTimerRef.current = window.setTimeout(() => {
  //     setUndoBar(null);
  //     undoTimerRef.current = null;
  //   }, 6000);
  // }

  async function handleUndo() {
    if (!undoBar) return;

    try {
      await api(`/messages/${undoBar.messageId}/restore`, { method: "POST" });
      setUndoBar(null);
      clearUndoTimer();
      await refresh();
    } catch {
      setUndoBar(null);
      clearUndoTimer();
      // optional: show toast error, or add error text in banner
      toast.error("Unable to undo.");
    }
  }

  return (
    <>
      {!open && (
        <button
          onClick={async () => {
            setOpen(true);
            await fetchTotalUnread();
          }}
          className="fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-full bg-green-600 px-4 py-3 text-white shadow-lg hover:bg-green-700"
        >
          <span className="relative">
            <MessageCircle className="h-5 w-5" />

            {totalUnread > 0 && (
              <span className="absolute -top-2 -right-2 min-w-[18px] h-[18px] px-1 rounded-full bg-red-600 text-white text-[10px] flex items-center justify-center leading-none">
                {totalUnread > 99 ? "99+" : totalUnread}
              </span>
            )}
          </span>
          Messages
        </button>
      )}

      {open && (
        <div className="fixed bottom-6 right-6 z-50 h-[520px] w-[380px] rounded-xl bg-white shadow-2xl flex flex-col border">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b bg-green-600 text-white">
            <div className="font-semibold">
              {isLab
                ? selectedThread
                  ? `Client ${selectedThread.clientCode}`
                  : "Messages"
                : "Omega BioChem Lab"}
            </div>
            <button onClick={() => setOpen(false)}>
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Body */}
          <div className="flex flex-1 overflow-hidden">
            {/* LAB sidebar */}
            {isLab && (
              <div className="w-36 border-r overflow-y-auto bg-gray-50">
                {threads.map((t) => {
                  const unread = t.unreadCount || 0;
                  // const { text, time } = preview(t);

                  return (
                    <button
                      key={t.id}
                      onClick={() => setSelectedThread(t)}
                      className={`w-full px-3 py-3 text-left text-sm border-b ${
                        selectedThread?.id === t.id
                          ? "bg-green-100"
                          : "hover:bg-gray-100"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="font-semibold">{t.clientCode}</div>

                        <div className="flex items-center gap-2">
                          {unread > 0 && (
                            <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-green-600 text-white text-[10px] flex items-center justify-center">
                              {unread}
                            </span>
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            {/* Chat window */}
            <div className="flex-1 flex flex-col">
              {undoBar && (
                <div className="mx-3 mt-3 rounded-lg border bg-yellow-50 px-3 py-2 text-sm flex items-center justify-between">
                  <span className="text-gray-800">Message deleted</span>

                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={handleUndo}
                      className="text-sm font-semibold text-green-700 hover:underline"
                    >
                      Undo
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setUndoBar(null);
                        clearUndoTimer();
                      }}
                      className="text-gray-500 hover:text-gray-800"
                      aria-label="Dismiss"
                    >
                      ×
                    </button>
                  </div>
                </div>
              )}
              {/* Messages */}
              <div
                ref={messagesBoxRef}
                className="flex-1 overflow-y-auto p-3 space-y-2 text-sm"
              >
                {loading && (
                  <div className="text-xs text-gray-400">Loading…</div>
                )}

                {!loading && messages.length === 0 && (
                  <div className="text-gray-500 text-xs">No messages yet</div>
                )}

                {!loading &&
                  renderItems.map((it) => {
                    if (it.type === "date") {
                      return (
                        <div
                          key={`date-${it.key}`}
                          className="flex justify-center py-1"
                        >
                          <span className="text-[11px] text-gray-600 bg-gray-100 px-3 py-1 rounded-full">
                            {it.label}
                          </span>
                        </div>
                      );
                    }

                    const m = it.msg;
                    const isMine = m.senderRole === user.role;

                    return (
                      <div
                        key={m.id}
                        className={`group rounded-lg px-3 py-2 max-w-[80%] ${
                          isMine ? "bg-green-200 ml-auto" : "bg-gray-100"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="text-[11px] font-semibold text-gray-600">
                            {isMine
                              ? "You"
                              : `${m.senderRole}${m.senderName ? ` • ${m.senderName}` : ""}`}
                          </div>

                          {/* 3-dots menu */}
                          <div className="relative" data-chat-menu-root="1">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();

                                const btn =
                                  e.currentTarget as HTMLButtonElement;

                                // Find the scroll box (your messages area)
                                const box = messagesBoxRef.current;
                                if (box) {
                                  const btnRect = btn.getBoundingClientRect();
                                  const boxRect = box.getBoundingClientRect();

                                  const spaceBelow =
                                    boxRect.bottom - btnRect.bottom;
                                  const spaceAbove = btnRect.top - boxRect.top;

                                  // If not enough space below, open upwards
                                  setMenuDir(
                                    spaceBelow < 140 && spaceAbove > spaceBelow
                                      ? "up"
                                      : "down",
                                  );
                                } else {
                                  setMenuDir("down");
                                }

                                setMenuOpenFor((cur) =>
                                  cur === m.id ? null : m.id,
                                );
                              }}
                              className="p-1 rounded-md opacity-100 md:opacity-0 md:group-hover:opacity-100 hover:bg-black/5 transition"
                              title="Message actions"
                            >
                              <MoreVertical className="h-4 w-4 text-gray-600" />
                            </button>

                            {menuOpenFor === m.id && (
                              <div
                                data-chat-menu-root="1"
                                className={`absolute right-0 w-40 rounded-lg border bg-white shadow-lg z-[80]
    ${menuDir === "up" ? "bottom-full mb-1" : "top-full mt-1"}
  `}
                                onClick={(e) => e.stopPropagation()}
                              >
                                <button
                                  type="button"
                                  onClick={() => onSelectReply(m)}
                                  className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50"
                                >
                                  Reply
                                </button>

                                <button
                                  type="button"
                                  onClick={async () => {
                                    await navigator.clipboard.writeText(
                                      m.body || "",
                                    );
                                    setMenuOpenFor(null);
                                  }}
                                  className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50"
                                >
                                  Copy
                                </button>

                                {/* {isMine && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setEditingId(m.id);
                                      setEditingText(m.body);
                                      setMenuOpenFor(null);
                                      setTimeout(
                                        () => inputRef.current?.focus(),
                                        0,
                                      );
                                    }}
                                    className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50"
                                  >
                                    Edit
                                  </button>
                                )} */}

                                {/* {isMine && (
                                  <button
                                    type="button"
                                    onClick={async () => {
                                      if (
                                        !window.confirm("Delete this message?")
                                      )
                                        return;
                                      setMenuOpenFor(null);
                                      if (replyTo?.id === m.id)
                                        setReplyTo(null);
                                      await deleteWithUndo(m);
                                    }}
                                    className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 text-red-600"
                                  >
                                    Delete
                                  </button>
                                )} */}
                              </div>
                            )}
                          </div>
                        </div>
                        {m.replyTo && (
                          <div className="mb-2 rounded-md border-l-4 border-green-500 bg-white/60 px-2 py-1 text-xs">
                            <div className="font-semibold text-gray-700">
                              {m.replyTo.senderRole}
                              {m.replyTo.senderName
                                ? ` • ${m.replyTo.senderName}`
                                : ""}
                            </div>
                            <div className="text-gray-600 line-clamp-2">
                              {m.replyTo.body}
                            </div>
                          </div>
                        )}
                        {Array.isArray((m as any).attachments) &&
                          (m as any).attachments.length > 0 && (
                            <div className="mt-2 space-y-1">
                              {(m as any).attachments.map(
                                (a: any, i: number) => (
                                  <div
                                    key={i}
                                    className="text-xs text-gray-700"
                                  >
                                    {a.kind !== "FORM" &&
                                    a.contentType?.startsWith("image/") ? (
                                      <button
                                        type="button"
                                        onClick={() => openAttachment(a)}
                                        className="underline text-left"
                                      >
                                        🖼️ {a.filename}
                                      </button>
                                    ) : a.kind !== "FORM" ? (
                                      <button
                                        type="button"
                                        onClick={() => openAttachment(a)}
                                        className="underline text-left"
                                      >
                                        📎 {a.filename}
                                      </button>
                                    ) : (
                                      <span className="underline">
                                        📄 Form: {a.formNumber}
                                      </span>
                                    )}
                                  </div>
                                ),
                              )}
                            </div>
                          )}

                        <div className="mt-1 flex items-end justify-between gap-2">
                          <div className="whitespace-pre-wrap break-words">
                            {m.body}
                          </div>

                          <span className="text-[10px] text-gray-500 whitespace-nowrap">
                            {formatTimeLocal(m.createdAt)}
                          </span>
                        </div>
                      </div>
                    );
                  })}

                {/* ✅ scroll anchor */}
                <div ref={chatEndRef} />
              </div>

              {/* Input */}
              <div className="border-t p-2">
                {editingId && (
                  <div className="mb-2 rounded-lg border bg-yellow-50 px-3 py-2 text-xs">
                    <div className="flex items-center justify-between">
                      <div className="font-semibold text-gray-700">
                        Editing message
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingId(null);
                          setEditingText("");
                        }}
                        className="text-gray-500 hover:text-gray-800"
                      >
                        ×
                      </button>
                    </div>
                  </div>
                )}
                {replyTo && (
                  <div className="mb-2 rounded-lg border bg-gray-50 px-3 py-2 text-xs">
                    <div className="flex items-center justify-between">
                      <div className="font-semibold text-gray-700">
                        Replying to {replyTo.senderRole}
                        {replyTo.senderName ? ` • ${replyTo.senderName}` : ""}
                      </div>
                      <button
                        type="button"
                        onClick={() => setReplyTo(null)}
                        className="text-gray-500 hover:text-gray-800"
                        title="Cancel reply"
                      >
                        ×
                      </button>
                    </div>
                    <div className="mt-1 text-gray-600 line-clamp-2">
                      {replyTo.body}
                    </div>
                  </div>
                )}
                {/* Client: recipient selector row */}
                {user.role === "CLIENT" && (
                  <div className="mb-2 rounded-lg bg-gray-50 border px-2 py-2">
                    <div className="flex items-center justify-between">
                      <div className="text-[11px] text-gray-600">
                        <span className="font-semibold">To:</span>{" "}
                        {mentions.length ? mentions.join(", ") : "FRONTDESK"}
                      </div>

                      <button
                        type="button"
                        onClick={() => setMentions(["FRONTDESK"])}
                        className="text-[11px] text-gray-600 hover:text-gray-900"
                        title="Reset to Frontdesk"
                      >
                        Reset
                      </button>
                    </div>

                    <div className="mt-2 flex flex-wrap gap-2">
                      {CLIENT_TAGS.map((r) => {
                        const active = mentions.includes(r);
                        return (
                          <button
                            key={r}
                            type="button"
                            onClick={() =>
                              setMentions((prev) => {
                                if (prev.includes(r)) {
                                  const next = prev.filter((x) => x !== r);
                                  return next.length ? next : ["FRONTDESK"];
                                }
                                return [...prev, r];
                              })
                            }
                            className={`text-xs rounded-full px-3 py-1 border transition ${
                              active
                                ? "bg-green-600 text-white border-green-600"
                                : "bg-white text-gray-700 hover:bg-gray-100"
                            }`}
                          >
                            @{r}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {pendingAttachments.length > 0 && (
                  <div className="mb-2 flex flex-wrap gap-2">
                    {pendingAttachments.map((a, idx) => (
                      <div
                        key={idx}
                        className="flex items-center gap-2 rounded-full border bg-gray-50 px-3 py-1 text-xs"
                      >
                        <span className="max-w-[220px] truncate">
                          {a.kind === "FORM"
                            ? `Form: ${a.formNumber}`
                            : a.filename}
                        </span>
                        <button
                          type="button"
                          onClick={() => removePendingAttachment(idx)}
                          className="text-gray-500 hover:text-gray-800"
                          title="Remove"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Actual input row */}
                <div className="flex items-center gap-2">
                  <button
                    disabled={!!editingId}
                    title={
                      editingId
                        ? "Finish editing to attach"
                        : "Attach photo/file or form"
                    }
                    onClick={() => !editingId && setAttachOpen(true)}
                    className={`h-10 w-10 flex items-center justify-center rounded-full ${
                      editingId
                        ? "opacity-40 cursor-not-allowed"
                        : "hover:bg-gray-100"
                    }`}
                  >
                    <Paperclip className="h-5 w-5 text-gray-600" />
                  </button>

                  <input
                    ref={inputRef}
                    value={editingId ? editingText : message}
                    onChange={(e) =>
                      editingId
                        ? setEditingText(e.target.value)
                        : setMessage(e.target.value)
                    }
                    placeholder="Type a message…"
                    className="flex-1 h-10 rounded-full border px-4 text-sm focus:outline-none focus:ring-2 focus:ring-green-200"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") sendMessage();
                    }}
                  />

                  <button
                    onClick={sendMessage}
                    className="h-10 px-4 rounded-full bg-green-600 text-white text-sm hover:bg-green-700"
                  >
                    Send
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {attachOpen && (
        <div className="fixed inset-0 z-[60] grid place-items-center bg-black/40 p-4">
          <div className="w-full max-w-[560px] rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b px-4 py-3">
              <div className="text-sm font-semibold">Add attachment</div>
              <button
                onClick={() => setAttachOpen(false)}
                className="rounded-lg p-2 hover:bg-gray-100"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-4 space-y-4">
              {/* Upload */}
              <div className="rounded-xl border p-3">
                <div className="text-xs font-semibold text-gray-700">
                  Upload photo / file (PDF)
                </div>

                <div className="mt-2 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="rounded-xl bg-green-600 px-3 py-2 text-sm text-white hover:bg-green-700"
                  >
                    Choose file
                  </button>

                  <div className="text-xs text-gray-500">
                    (Images / PDF allowed)
                  </div>
                </div>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,application/pdf"
                  className="hidden"
                  onChange={onPickFile}
                />
              </div>

              {/* Attach Form */}
              <div className="rounded-xl border p-3">
                <div className="text-xs font-semibold text-gray-700">
                  Attach a form
                </div>

                {/* Search */}
                <div className="mt-2 flex items-center gap-2">
                  <input
                    value={formSearch}
                    onChange={(e) => setFormSearch(e.target.value)}
                    placeholder="Search by Form # (example: CLIENT-20260001)"
                    className="flex-1 rounded-xl border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-green-200"
                  />
                  <button
                    type="button"
                    onClick={() => searchForms(formSearch)}
                    className="rounded-xl border px-3 py-2 text-sm hover:bg-gray-50"
                    disabled={formSearchLoading}
                  >
                    {formSearchLoading ? "Searching…" : "Search"}
                  </button>
                </div>

                {formSearchError && (
                  <div className="mt-2 text-xs text-red-600">
                    {formSearchError}
                  </div>
                )}

                {/* Search Results */}
                {formSearchResults.length > 0 && (
                  <div className="mt-3 space-y-2">
                    <div className="text-xs font-semibold text-gray-600">
                      Results
                    </div>
                    {formSearchResults.map((f) => (
                      <button
                        key={`${f.formType}-${f.formNumber}`}
                        onClick={() => addFormAttachment(f)}
                        className="w-full rounded-xl border px-3 py-2 text-left hover:bg-gray-50"
                      >
                        <div className="font-semibold text-sm">
                          {f.formNumber}
                        </div>
                        <div className="text-xs text-gray-500">
                          {f.formType}
                          {f.reportNumber ? ` • Report: ${f.reportNumber}` : ""}
                        </div>
                      </button>
                    ))}
                  </div>
                )}

                {/* Recent Forms */}
                <div className="mt-4">
                  <div className="text-xs font-semibold text-gray-600">
                    Most recent 5 forms
                  </div>

                  {formsLoading ? (
                    <div className="mt-2 text-xs text-gray-500">Loading…</div>
                  ) : recentForms.length === 0 ? (
                    <div className="mt-2 text-xs text-gray-500">
                      No recent forms found.
                    </div>
                  ) : (
                    <div className="mt-2 space-y-2">
                      {recentForms.map((f) => (
                        <button
                          key={`${f.formType}-${f.formNumber}`}
                          onClick={() => addFormAttachment(f)}
                          className="w-full rounded-xl border px-3 py-2 text-left hover:bg-gray-50"
                        >
                          <div className="font-semibold text-sm">
                            {f.formNumber}
                          </div>
                          <div className="text-xs text-gray-500">
                            {f.formType}
                            {f.reportNumber
                              ? ` • Report: ${f.reportNumber}`
                              : ""}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex justify-end">
                <button
                  onClick={() => setAttachOpen(false)}
                  className="rounded-xl px-3 py-2 text-sm hover:bg-gray-100"
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
