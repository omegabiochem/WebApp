import { useEffect, useMemo, useRef, useState } from "react";
import { MessageCircle, X, Paperclip } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { api } from "../../lib/api";

const LAB_ROLES = [
  "MICRO",
  "CHEMISTRY",
  "MC",
  "QA",
  "FRONTDESK",
  "ADMIN",
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
  createdAt: string; // ISO string
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

export default function SupportWidget() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);

  const [threads, setThreads] = useState<Thread[]>([]);
  const [selectedThread, setSelectedThread] = useState<Thread | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const [mentions, setMentions] = useState<string[]>([]);

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

  if (!user) return null;
  const isLab = LAB_ROLES.includes(user.role as any);

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

  // -----------------------------------
  // Send message
  // -----------------------------------
  const sendMessage = async () => {
    if (!message.trim()) return;

    await api("/messages", {
      method: "POST",
      body: JSON.stringify({
        body: message,
        mentions: user.role === "CLIENT" ? mentions : [],
        ...(isLab && selectedThread
          ? { clientCode: selectedThread.clientCode }
          : {}),
      }),
    });

    setMessage("");
    await refresh();

    // smooth scroll after send
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

  useEffect(() => {
    if (user?.role === "CLIENT" && mentions.length === 0) {
      setMentions(["MICRO"]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.role]);

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
                        className={`rounded-lg px-3 py-2 max-w-[80%] ${
                          isMine ? "bg-green-200 ml-auto" : "bg-gray-100"
                        }`}
                      >
                        <div className="flex items-end justify-between gap-2">
                          <div className="text-[11px] font-semibold text-gray-600">
                            {isMine ? "You" : m.senderRole}
                          </div>
                          <div className="text-[10px] text-gray-500 whitespace-nowrap">
                            {formatTimeLocal(m.createdAt)}
                          </div>
                        </div>
                        <div className="mt-1">{m.body}</div>
                      </div>
                    );
                  })}

                {/* ✅ scroll anchor */}
                <div ref={chatEndRef} />
              </div>

              {/* Input */}
              <div className="border-t p-2">
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

                {/* Actual input row */}
                <div className="flex items-center gap-2">
                  <button
                    title="Attach report/file"
                    className="h-10 w-10 flex items-center justify-center rounded-full hover:bg-gray-100"
                  >
                    <Paperclip className="h-5 w-5 text-gray-600" />
                  </button>

                  <input
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
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
    </>
  );
}
