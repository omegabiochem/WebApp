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
  id: string | null;
  clientCode: string;
  clientName?: string | null;
  lastMessage: InboxLastMessage | null;
  unreadCount: number;
};

type MentionUser = {
  id: string;
  name: string | null;
  email: string;
  role: string;
};

type Message = {
  forwardedSenderName?: string | null;
  forwardNote?: string | null;
  forwardedText?: string | null;
  taggedRecipients?: {
    id: string;
    name: string;
    email: string | null;
    role: string | null;
  }[];
  labAudienceRoles?: string[];
  forwardedFromMessageId?: string | null;
  isOwn?: boolean;
  senderId?: string;
  mentionedUserIds?: string[];
  isDirect?: boolean;
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

// Soft hyphens appear only where the browser wraps a long token.
// The stored/searchable/copied message stays unchanged.
function wrapLongWords(text: string) {
  return text.replace(/[A-Za-z0-9]{24,}/g, (word) =>
    word.split("").join("\u00ad"),
  );
}

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
  return <AuthenticatedChat />;
}

function AuthenticatedChat() {
  const { user } = useAuth();
  return user ? <ChatContent user={user} /> : null;
}

function ChatContent({
  user,
}: {
  user: NonNullable<ReturnType<typeof useAuth>["user"]>;
}) {
  const [open, setOpen] = useState(false);

  const [threads, setThreads] = useState<Thread[]>([]);
  const [selectedThread, setSelectedThread] = useState<Thread | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const mentions = [...LAB_ROLES];

  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [forwardSource, setForwardSource] = useState<Message | null>(null);
  const [menuOpenFor, setMenuOpenFor] = useState<string | null>(null);
  const [menuDir, setMenuDir] = useState<"up" | "down">("down");

  const [messageSearch, setMessageSearch] = useState("");

  const inputRef = useRef<HTMLTextAreaElement | null>(null);

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

  const [clientUsers, setClientUsers] = useState<MentionUser[]>([]);
  const [selectedRecipients, setSelectedRecipients] = useState<MentionUser[]>(
    [],
  );
  const [forwardGroup, setForwardGroup] = useState<
    "ALL" | "CLIENT" | "LAB" | "ROLES"
  >("ALL");
  const [usersError, setUsersError] = useState(false);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersRetry, setUsersRetry] = useState(0);
  const [caret, setCaret] = useState(0);
  const [mentionClosed, setMentionClosed] = useState(false);
  const [activeSuggestion, setActiveSuggestion] = useState(0);
  const [sending, setSending] = useState(false);
  const activeText = editingId ? editingText : message;
  const mentionMatch = /(?:^|\s)@([^\s@]*)$/.exec(activeText.slice(0, caret));
  const mentionQuery = mentionMatch?.[1].toLowerCase();
  const isForwarding = Boolean(forwardSource);
  const mentionCandidates: MentionUser[] =
    isForwarding && forwardGroup === "ROLES"
      ? LAB_ROLES.map((role) => ({
          id: `role:${role}`,
          name: `${role} team`,
          email: "All users in this role",
          role,
        }))
      : isForwarding && forwardGroup !== "ALL"
        ? clientUsers.filter((person) =>
            forwardGroup === "CLIENT"
              ? person.role === "CLIENT"
              : person.role !== "CLIENT",
          )
        : clientUsers;
  const suggestions = mentionCandidates.filter(
    (u) =>
      !selectedRecipients.some((selected) => selected.id === u.id) &&
      `${u.name || ""} ${u.email} ${u.role}`
        .toLowerCase()
        .includes(mentionQuery || ""),
  );
  const showMentions =
    !editingId && mentionQuery !== undefined && !mentionClosed;
  const clientScope = isLab ? selectedThread?.clientCode : undefined;
  const suggestionIndex = Math.min(
    activeSuggestion,
    Math.max(0, suggestions.length - 1),
  );

  useEffect(() => {
    let live = true;
    setClientUsers([]);
    setUsersError(false);
    setMentionClosed(!isForwarding);
    setUsersLoading(false);
    if (!open || (isLab && !clientScope)) return;
    setUsersLoading(true);
    const query = new URLSearchParams();
    if (clientScope) query.set("clientCode", clientScope);
    if (isForwarding) query.set("forward", "true");
    api<{ users: MentionUser[] }>(
      `/messages/mention-users${query.toString() ? `?${query.toString()}` : ""}`,
      { method: "GET" },
    )
      .then((data) => {
        if (live) setClientUsers(data.users);
      })
      .catch(() => {
        if (live) setUsersError(true);
      })
      .finally(() => {
        if (live) setUsersLoading(false);
      });
    return () => {
      live = false;
    };
  }, [open, isLab, clientScope, usersRetry, isForwarding]);

  useEffect(() => {
    setSelectedRecipients([]);
    setMessage("");
    setSelectedRecipients([]);
    setPendingAttachments([]);
    setReplyTo(null);
    setEditingId(null);
    setEditingText("");
    setForwardSource(null);
    setAttachOpen(false);
    setFormSearch("");
  }, [clientScope]);

  function chooseMention(u: MentionUser) {
    if (!mentionMatch || editingId) return;
    const start = caret - mentionMatch[1].length - 1;
    setSelectedRecipients((prev) =>
      prev.some((person) => person.id === u.id) ? prev : [...prev, u],
    );
    setMessage(activeText.slice(0, start) + activeText.slice(caret));
    setCaret(start);
    setMentionClosed(true);
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.setSelectionRange(start, start);
    });
  }

  useEffect(() => {
    let live = true;
    setFormSearchResults([]);
    setFormSearchError(null);
    const q = formSearch.trim();
    setFormSearchLoading(Boolean(attachOpen && q));
    if (!attachOpen || !q) return;
    const timer = window.setTimeout(() => {
      api<{ items: FormListItem[] }>(
        `/forms/search?q=${encodeURIComponent(q)}${clientScope ? `&clientCode=${encodeURIComponent(clientScope)}` : ""}`,
        { method: "GET" },
      )
        .then((data) => {
          if (live) setFormSearchResults(data.items || []);
        })
        .catch(() => {
          if (live) setFormSearchError("Search failed. Please try again.");
        })
        .finally(() => {
          if (live) setFormSearchLoading(false);
        });
    }, 300);
    return () => {
      live = false;
      window.clearTimeout(timer);
    };
  }, [attachOpen, formSearch, clientScope]);

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

    const sortedMessages = [...(res.messages ?? [])].sort(
      (a, b) =>
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );

    setMessages(sortedMessages);

    setTimeout(() => {
      scrollToBottom(false);
    }, 0);
  };

  const filteredMessages = useMemo(() => {
    const q = messageSearch.trim().toLowerCase();
    if (!q) return messages;

    return messages.filter((m) => {
      const body = (m.body || "").toLowerCase();
      const senderRole = (m.senderRole || "").toLowerCase();
      const senderName = (m.senderName || "").toLowerCase();
      const replyBody = (m.replyTo?.body || "").toLowerCase();

      const d = new Date(m.createdAt);
      const dateText1 = d.toLocaleDateString().toLowerCase(); // example: 3/25/2026
      const dateText2 = d
        .toLocaleDateString(undefined, {
          month: "short",
          day: "numeric",
          year: "numeric",
        })
        .toLowerCase(); // example: mar 25, 2026
      const dateText3 = d
        .toLocaleDateString(undefined, {
          month: "long",
          day: "numeric",
          year: "numeric",
        })
        .toLowerCase(); // example: march 25, 2026

      const timeText = d
        .toLocaleTimeString(undefined, {
          hour: "numeric",
          minute: "2-digit",
        })
        .toLowerCase(); // example: 9:45 am

      const attachmentText = Array.isArray(m.attachments)
        ? m.attachments
            .map((a) => {
              if (a.kind === "FORM") {
                return `${a.formNumber} ${a.reportNumber || ""} ${a.formType}`;
              }
              return `${a.filename} ${a.contentType || ""}`;
            })
            .join(" ")
            .toLowerCase()
        : "";

      return (
        body.includes(q) ||
        (m.taggedRecipients || []).some((person) =>
          `${person.name} ${person.email || ""} ${person.role || ""}`
            .toLowerCase()
            .includes(q),
        ) ||
        (m.labAudienceRoles || []).some((role) =>
          role.toLowerCase().includes(q),
        ) ||
        senderRole.includes(q) ||
        senderName.includes(q) ||
        replyBody.includes(q) ||
        attachmentText.includes(q) ||
        dateText1.includes(q) ||
        dateText2.includes(q) ||
        dateText3.includes(q) ||
        timeText.includes(q)
      );
    });
  }, [messages, messageSearch]);

  // -----------------------------------
  // LAB: fetch inbox (client list)
  // - sort by latest message desc
  // - compute unread badge based on lastSeen local store
  // -----------------------------------
  useEffect(() => {
    if (!open || !isLab) return;

    api<Thread[]>("/messages/inbox", { method: "GET" })
      .then((data) => {
        const sorted = [...data].sort((a, b) => {
          const aTime = a.lastMessage?.createdAt
            ? new Date(a.lastMessage.createdAt).getTime()
            : 0;
          const bTime = b.lastMessage?.createdAt
            ? new Date(b.lastMessage.createdAt).getTime()
            : 0;
          return bTime - aTime; // latest first
        });

        setThreads(sorted);
        setSelectedThread((prev) => {
          if (!sorted.length) return null;
          if (!prev) return sorted[0];

          const stillExists = sorted.find(
            (t) => t.clientCode === prev.clientCode,
          );
          return stillExists ?? sorted[0];
        });
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
  }, [open, isLab, selectedThread?.clientCode]);

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
    if (loading) return;

    const t = setTimeout(() => {
      scrollToBottom(false);
    }, 0);

    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, loading, selectedThread?.clientCode, messages]);

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

      const sorted = [...inbox].sort((a, b) => {
        const aTime = a.lastMessage?.createdAt
          ? new Date(a.lastMessage.createdAt).getTime()
          : 0;
        const bTime = b.lastMessage?.createdAt
          ? new Date(b.lastMessage.createdAt).getTime()
          : 0;
        return bTime - aTime;
      });

      setThreads(sorted);
      setTotalUnread(sorted.reduce((a, t) => a + (t.unreadCount || 0), 0));
    })().catch(console.error);
  }, [open, isLab, selectedThread?.clientCode]);

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
  }, [selectedThread?.clientCode]);

  useEffect(() => {
    return () => clearUndoTimer();
  }, []);

  // -----------------------------------
  // Send message
  // -----------------------------------
  const sendMessage = async () => {
    if (sending || (isLab && !selectedThread)) return;
    if (!editingId && /(?:^|\s)@[^\s]*$/.test(message)) {
      toast.error(
        "Choose a person from the suggestions or remove the unfinished @ tag.",
      );
      return;
    }
    if (forwardSource && selectedRecipients.length === 0) {
      toast.error("Select at least one person or lab role to forward to.");
      return;
    }
    setSending(true);
    try {
      await submitMessage();
    } catch {
      toast.error("Message could not be sent. Please try again.");
    } finally {
      setSending(false);
    }
  };

  const submitMessage = async () => {
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
    if (
      (!trimmed && pendingAttachments.length === 0 && !forwardSource) ||
      !user
    )
      return;

    const outgoingAttachments = pendingAttachments;

    await api("/messages", {
      method: "POST",
      body: JSON.stringify({
        body: trimmed,
        ...(forwardSource
          ? {
              forwardedFromMessageId: forwardSource.id,
              mentionedUserIds: selectedRecipients
                .filter((person) => !person.id.startsWith("role:"))
                .map((person) => person.id),
              forwardToRoles: selectedRecipients
                .filter((person) => person.id.startsWith("role:"))
                .map((person) => person.role),
            }
          : {
              attachments: outgoingAttachments,
              mentionedUserIds: selectedRecipients.map((person) => person.id),
              replyToMessageId: replyTo?.id ?? null,
            }),
        mentions: user.role === "CLIENT" ? mentions : [],
        ...(isLab && selectedThread
          ? { clientCode: selectedThread.clientCode }
          : {}),
      }),
    });

    setMessage("");
    setSelectedRecipients([]);
    setPendingAttachments([]);
    setReplyTo(null);
    setMenuOpenFor(null);
    setForwardSource(null);
    await refresh();
    scrollToBottom(true);

    setTimeout(() => {
      if (inputRef.current) {
        inputRef.current.style.height = "auto";
      }
    }, 0);
  };

  // -----------------------------------
  // Build date separators
  // -----------------------------------
  const renderItems: RenderItem[] = useMemo(() => {
    const items: RenderItem[] = [];
    let lastDateKey: string | null = null;

    for (const m of filteredMessages) {
      const d = new Date(m.createdAt);
      const key = toDateKey(d);

      if (key !== lastDateKey) {
        items.push({ type: "date", key, label: formatDateHeader(m.createdAt) });
        lastDateKey = key;
      }
      items.push({ type: "msg", msg: m });
    }

    return items;
  }, [filteredMessages]);

  function messageRecipients(target: Message) {
    if (
      target.senderRole === "CLIENT" &&
      !target.isDirect &&
      !target.forwardedFromMessageId &&
      LAB_ROLES.every((role) => target.labAudienceRoles?.includes(role))
    )
      return "All lab users";

    if (target.taggedRecipients?.length) {
      const names = target.taggedRecipients.map(
        (person) =>
          `${person.name}${person.role && person.role !== "CLIENT" ? ` (${person.role})` : ""}`,
      );
      if (target.forwardedFromMessageId)
        names.push(...(target.labAudienceRoles || []));
      return names.join(", ");
    }
    if (target.forwardedFromMessageId)
      return (target.labAudienceRoles || []).join(", ") || "Lab roles";
    if (target.isDirect) return "Tagged users";
    if (target.senderRole === "CLIENT")
      return (target.labAudienceRoles || []).join(", ") || "Lab team";
    return "All client users";
  }

  function replyFromOurSide(target: { senderRole: string }) {
    return (target.senderRole !== "CLIENT") === isLab;
  }

  function replySender(target: {
    id: string;
    senderRole: string;
    senderName?: string | null;
    isOwn?: boolean;
  }) {
    const own =
      target.isOwn ?? messages.find((item) => item.id === target.id)?.isOwn;
    if (own) return "You";
    const side = target.senderRole === "CLIENT" ? "Client" : "Lab";
    const name =
      target.senderName?.trim() ||
      (side === "Client" ? "Client" : "OMEGA BIO CHEM");
    return `${name} · ${replyFromOurSide(target) ? "Your side" : side}`;
  }

  function onSelectReply(target: Message) {
    setForwardSource(null);
    setReplyTo(target);
    setMenuOpenFor(null);
    if (target.isDirect) {
      const ids = new Set([
        target.senderId,
        ...(target.mentionedUserIds || []),
      ]);
      setSelectedRecipients(clientUsers.filter((person) => ids.has(person.id)));
    }
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  function onSelectForward(target: Message) {
    setForwardGroup("ALL");
    setForwardSource(target);
    setReplyTo(null);
    setEditingId(null);
    setEditingText("");
    setPendingAttachments([]);
    setSelectedRecipients([]);
    setMenuOpenFor(null);
    setMessage("@");
    setCaret(1);
    setActiveSuggestion(0);
    setMentionClosed(false);
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.setSelectionRange(1, 1);
    });
  }

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

    const sorted = [...inbox].sort((a, b) => {
      const aTime = a.lastMessage?.createdAt
        ? new Date(a.lastMessage.createdAt).getTime()
        : 0;
      const bTime = b.lastMessage?.createdAt
        ? new Date(b.lastMessage.createdAt).getTime()
        : 0;
      return bTime - aTime;
    });

    setThreads(sorted);
    setTotalUnread(sum);

    setSelectedThread((prev) => {
      if (!sorted.length) return null;
      if (!prev) return sorted[0];

      const stillExists = sorted.find((t) => t.clientCode === prev.clientCode);
      return stillExists ?? sorted[0];
    });
  };

  // The launcher is visible when the chat is closed, so unread polling
  // must stay active in both states. Reading messages still requires open.
  useEffect(() => {
    if (!user) return;

    fetchTotalUnread().catch(console.error);

    const id = window.setInterval(() => {
      fetchTotalUnread().catch(console.error);
    }, 10000);

    return () => window.clearInterval(id);
  }, [user?.role, open]);

  async function loadRecentForms() {
    setFormsLoading(true);
    try {
      const data = await api<{ items: FormListItem[] }>(
        `/forms/recent?limit=5${clientScope ? `&clientCode=${encodeURIComponent(clientScope)}` : ""}`,
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

  useEffect(() => {
    setMessageSearch("");
  }, [selectedThread?.clientCode]);

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
            <div
              className="min-w-0 flex-1 truncate pr-3 font-semibold"
              title={
                isLab
                  ? selectedThread?.clientName?.trim() ||
                    selectedThread?.clientCode ||
                    "Messages"
                  : "OMEGA BIO CHEM"
              }
            >
              {isLab
                ? selectedThread?.clientName?.trim() ||
                  selectedThread?.clientCode ||
                  "Messages"
                : "OMEGA BIO CHEM"}
            </div>
            <button onClick={() => setOpen(false)}>
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Body */}
          <div className="flex min-h-0 flex-1 overflow-hidden">
            {/* LAB sidebar */}
            {isLab && (
              <div className="w-[69px] shrink-0 border-r border-gray-200 overflow-y-auto bg-gray-50">
                {/* <div className="sticky top-0 border-b bg-gray-50 px-2 py-2 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                  Clients
                </div> */}
                {threads.map((t) => {
                  const unread = t.unreadCount || 0;
                  // const { text, time } = preview(t);

                  return (
                    <button
                      key={t.clientCode}
                      disabled={sending}
                      title={t.clientCode}
                      aria-current={
                        selectedThread?.clientCode === t.clientCode
                          ? "true"
                          : undefined
                      }
                      onClick={() => setSelectedThread(t)}
                      className={`w-full border-l-2 px-2 py-2.5 text-left text-xs transition-colors ${
                        selectedThread?.clientCode === t.clientCode
                          ? "border-green-600 bg-green-50 text-green-800"
                          : "border-transparent text-gray-600 hover:bg-gray-100"
                      }`}
                    >
                      <div className="flex min-w-0 items-center justify-between gap-1">
                        <div className="min-w-0 truncate font-semibold">
                          {t.clientCode}
                        </div>

                        <div className="flex shrink-0 items-center">
                          {unread > 0 && (
                            <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-green-600 text-white text-[10px] flex items-center justify-center">
                              {unread > 99 ? "99+" : unread}
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
            <div className="min-h-0 min-w-0 flex-1 flex flex-col">
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
                className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto px-3 pb-3 pt-2 space-y-2 text-sm"
              >
                <div className="sticky top-0 z-10 flex justify-center bg-transparent pb-2 pt-1">
                  <div className="relative w-full max-w-[240px]">
                    <input
                      type="text"
                      value={messageSearch}
                      onChange={(e) => setMessageSearch(e.target.value)}
                      placeholder="Search messages..."
                      className="w-full rounded-full border border-green-400 bg-white/70 px-4 py-2 text-sm shadow-sm backdrop-blur-md outline-none focus:ring-2 focus:ring-green-800"
                    />
                    {messageSearch && (
                      <button
                        type="button"
                        onClick={() => setMessageSearch("")}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                        title="Clear search"
                      >
                        ×
                      </button>
                    )}
                  </div>
                </div>
                {loading && (
                  <div className="text-xs text-gray-400">Loading…</div>
                )}

                {!loading && filteredMessages.length === 0 && (
                  <div className="text-gray-500 text-xs">
                    {messageSearch.trim()
                      ? "No matching messages found"
                      : "No messages yet"}
                  </div>
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
                    const isMine = m.isOwn === true;

                    return (
                      <div
                        key={m.id}
                        className={`group min-w-0 rounded-lg px-3 py-2 max-w-[80%] [overflow-wrap:anywhere] ${
                          isMine ? "bg-green-200 ml-auto" : "bg-gray-100"
                        } ${replyTo?.id === m.id ? "ring-2 ring-green-500 ring-offset-1" : ""}`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 break-words text-[11px] leading-relaxed text-gray-600">
                            <span
                              className="font-semibold"
                              title={m.senderRole}
                            >
                              {isMine
                                ? "You"
                                : m.senderName?.trim() || m.senderRole}
                            </span>
                            <span className="mx-1 text-gray-400">·</span>
                            <span
                              title={(m.taggedRecipients || [])
                                .map((person) => person.email || person.name)
                                .join(", ")}
                            >
                              <span className="font-semibold">To: </span>
                              {messageRecipients(m)}
                            </span>
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
                                {!m.forwardedFromMessageId && (
                                  <button
                                    type="button"
                                    onClick={() => onSelectReply(m)}
                                    className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50"
                                  >
                                    Reply
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() => onSelectForward(m)}
                                  className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50"
                                >
                                  Forward
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
                          <div
                            className={`mb-2 rounded-md border-l-4 px-2 py-1 text-xs ${replyFromOurSide(m.replyTo) ? "border-green-500 bg-green-50" : "border-blue-500 bg-blue-50"}`}
                          >
                            <div
                              className={`truncate font-semibold ${replyFromOurSide(m.replyTo) ? "text-green-800" : "text-blue-800"}`}
                            >
                              {replySender(m.replyTo)}
                            </div>
                            <div className="text-gray-600 line-clamp-2">
                              {wrapLongWords(m.replyTo.body || "Attachment")}
                            </div>
                          </div>
                        )}
                        {m.forwardedFromMessageId &&
                          (m.forwardNote ||
                            (m.forwardedText == null ? m.body : "")) && (
                            <div
                              className="mb-2 min-w-0 whitespace-pre-wrap [overflow-wrap:anywhere]"
                              style={{ hyphens: "manual" }}
                            >
                              {wrapLongWords(m.forwardNote || m.body)}
                            </div>
                          )}
                        <div
                          className={
                            m.forwardedFromMessageId
                              ? "mt-1 min-w-0 max-w-full rounded-lg border border-amber-200 bg-amber-50 px-2 py-2"
                              : "min-w-0 max-w-full"
                          }
                        >
                          {m.forwardedFromMessageId && (
                            <div className="mb-1 flex min-w-0 items-start gap-1 text-[10px] font-semibold text-amber-800">
                              <span className="shrink-0" aria-hidden="true">
                                ↪
                              </span>
                              <span className="min-w-0 [overflow-wrap:anywhere]">
                                Forwarded
                                {m.forwardedSenderName
                                  ? ` from ${m.forwardedSenderName}`
                                  : ""}
                              </span>
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
                                          className="max-w-full break-all underline text-left"
                                        >
                                          🖼️ {a.filename}
                                        </button>
                                      ) : a.kind !== "FORM" ? (
                                        <button
                                          type="button"
                                          onClick={() => openAttachment(a)}
                                          className="max-w-full break-all underline text-left"
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
                            <div
                              className="min-w-0 flex-1 whitespace-pre-wrap [overflow-wrap:anywhere]"
                              style={{ hyphens: "manual" }}
                            >
                              {wrapLongWords(
                                m.forwardedFromMessageId
                                  ? (m.forwardedText ?? "")
                                  : m.body,
                              )}
                            </div>

                            <span className="shrink-0 text-[10px] text-gray-500 whitespace-nowrap">
                              {formatTimeLocal(m.createdAt)}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}

                {/* ✅ scroll anchor */}
                <div ref={chatEndRef} />
              </div>
            </div>
          </div>
          {/* Input */}
          <div className="shrink-0 border-t p-2">
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
            {forwardSource && (
              <div className="mb-2 rounded-lg border border-l-4 border-amber-200 border-l-amber-500 bg-amber-50 px-3 py-2 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-amber-800">
                    Forward message
                  </span>
                  <button
                    type="button"
                    disabled={sending}
                    aria-label="Cancel forward"
                    onClick={() => {
                      setForwardSource(null);
                      setSelectedRecipients([]);
                      setMessage("");
                      setMentionClosed(true);
                    }}
                    className="text-gray-500 hover:text-gray-800"
                  >
                    ×
                  </button>
                </div>
                <div className="mt-1 text-[10px] font-medium text-amber-800">
                  From:{" "}
                  {forwardSource.senderName?.trim() || forwardSource.senderRole}
                </div>
                <div className="mt-1 line-clamp-2 text-gray-600">
                  {wrapLongWords(forwardSource.body || "Attachment")}
                </div>
              </div>
            )}
            {replyTo && (
              <div
                className={`mb-2 rounded-lg border border-l-4 px-3 py-2 text-xs ${replyFromOurSide(replyTo) ? "border-green-200 border-l-green-500 bg-green-50" : "border-blue-200 border-l-blue-500 bg-blue-50"}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div
                    className={`min-w-0 truncate font-semibold ${replyFromOurSide(replyTo) ? "text-green-800" : "text-blue-800"}`}
                    title={replySender(replyTo)}
                  >
                    {replyTo.isOwn
                      ? "Replying to your message"
                      : `Replying to ${replySender(replyTo)}`}
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
                  {wrapLongWords(replyTo.body || "Attachment")}
                </div>
              </div>
            )}
            <div className="mb-2 flex max-h-20 flex-wrap items-center gap-1 overflow-y-auto text-[11px] text-gray-600">
              <span className="font-semibold">To:</span>
              {selectedRecipients.length ? (
                selectedRecipients.map((person) => (
                  <span
                    key={person.id}
                    className="inline-flex items-center gap-1 rounded-full border bg-green-50 px-2 py-0.5 text-green-800"
                  >
                    {person.name || person.email}
                    <button
                      type="button"
                      disabled={sending}
                      aria-label={`Remove ${person.name || person.email}`}
                      onClick={() =>
                        setSelectedRecipients((prev) =>
                          prev.filter((u) => u.id !== person.id),
                        )
                      }
                      className="text-gray-500 hover:text-gray-800"
                    >
                      ×
                    </button>
                  </span>
                ))
              ) : (
                <span>
                  {forwardSource
                    ? "Choose people or lab roles with @"
                    : isLab
                      ? `All ${clientScope || "client"} users`
                      : "All lab users"}
                </span>
              )}
            </div>

            {pendingAttachments.length > 0 && (
              <div className="mb-2 flex flex-wrap gap-2">
                {pendingAttachments.map((a, idx) => (
                  <div
                    key={idx}
                    className="flex items-center gap-2 rounded-full border bg-gray-50 px-3 py-1 text-xs"
                  >
                    <span className="max-w-[220px] truncate">
                      {a.kind === "FORM" ? `Form: ${a.formNumber}` : a.filename}
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

            <div className="relative">
              {showMentions && (
                <div
                  className="absolute bottom-full left-0 right-0 z-30 mb-2 overflow-hidden rounded-lg border bg-white shadow-lg"
                  onMouseDown={(e) => e.preventDefault()}
                >
                  <div className="border-b bg-gray-50 px-3 py-2 text-xs font-semibold text-gray-700">
                    {forwardSource
                      ? "Forward message"
                      : isLab
                        ? `Users of ${clientScope || "selected client"}`
                        : "Lab users"}
                  </div>
                  {isForwarding && (
                    <div
                      className="flex gap-1 border-b bg-white px-2 py-1.5"
                      role="group"
                      aria-label="Forward recipients"
                    >
                      {(
                        [
                          ["ALL", "All"],
                          ["CLIENT", isLab ? "Client users" : "My colleagues"],
                          ["LAB", "Lab users"],
                          ["ROLES", "Lab roles"],
                        ] as const
                      ).map(([group, label]) => (
                        <button
                          type="button"
                          key={group}
                          aria-pressed={forwardGroup === group}
                          onClick={() => {
                            setForwardGroup(group);
                            setActiveSuggestion(0);
                          }}
                          className={`rounded px-2 py-1 text-[10px] ${forwardGroup === group ? "bg-green-100 font-semibold text-green-800" : "text-gray-500 hover:bg-gray-100"}`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  )}
                  <div
                    role="listbox"
                    id="chat-mention-list"
                    aria-label="Message recipients"
                    className="max-h-40 overflow-y-auto"
                  >
                    {(!isForwarding || forwardGroup !== "ROLES") &&
                    usersLoading ? (
                      <div
                        role="status"
                        className="px-3 py-3 text-xs text-gray-500"
                      >
                        Loading…
                      </div>
                    ) : (!isForwarding || forwardGroup !== "ROLES") &&
                      usersError ? (
                      <div className="px-3 py-3 text-xs text-gray-500">
                        Unable to load users.{" "}
                        <button
                          type="button"
                          onClick={() => setUsersRetry((v) => v + 1)}
                          className="text-green-700 underline"
                        >
                          Retry
                        </button>
                      </div>
                    ) : suggestions.length === 0 ? (
                      <div className="px-3 py-3 text-xs text-gray-500">
                        No matching users.
                      </div>
                    ) : (
                      suggestions.map((person, index) => (
                        <button
                          type="button"
                          role="option"
                          id={`chat-person-${person.id}`}
                          aria-selected={index === suggestionIndex}
                          key={person.id}
                          onClick={() => chooseMention(person)}
                          onMouseEnter={() => setActiveSuggestion(index)}
                          className={`block w-full px-3 py-2 text-left text-xs ${index === suggestionIndex ? "bg-green-100" : "hover:bg-gray-50"}`}
                        >
                          <span className="block truncate font-semibold text-gray-700">
                            {person.name || person.email}
                            {isForwarding && forwardGroup !== "ROLES"
                              ? ` · ${person.role === "CLIENT" ? "Client" : person.role}`
                              : !isForwarding && person.role !== "CLIENT"
                                ? ` · ${person.role}`
                                : ""}
                          </span>
                          <span className="block truncate text-[10px] text-gray-500">
                            {person.email}
                          </span>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={!!editingId || sending || Boolean(forwardSource)}
                  title="Attach photo/file or form"
                  aria-label="Add attachment"
                  onClick={() => setAttachOpen(true)}
                  className="h-10 w-10 shrink-0 flex items-center justify-center rounded-full hover:bg-gray-100 disabled:opacity-40"
                >
                  <Paperclip className="h-5 w-5 text-gray-600" />
                </button>
                <textarea
                  ref={inputRef}
                  disabled={sending}
                  onSelect={(e) => setCaret(e.currentTarget.selectionStart)}
                  onBlur={() => setMentionClosed(true)}
                  rows={1}
                  value={editingId ? editingText : message}
                  aria-label="Message"
                  aria-autocomplete="list"
                  aria-controls={showMentions ? "chat-mention-list" : undefined}
                  aria-activedescendant={
                    showMentions && suggestions[suggestionIndex]
                      ? `chat-person-${suggestions[suggestionIndex].id}`
                      : undefined
                  }
                  onChange={(e) => {
                    if (editingId) setEditingText(e.target.value);
                    else setMessage(e.target.value);
                    setCaret(e.currentTarget.selectionStart);
                    setMentionClosed(false);
                    setActiveSuggestion(0);
                    e.currentTarget.style.height = "auto";
                    e.currentTarget.style.height =
                      Math.min(e.currentTarget.scrollHeight, 120) + "px";
                  }}
                  placeholder={
                    forwardSource
                      ? "Optional note… @ to choose recipients"
                      : "Type a message…"
                  }
                  className="min-w-0 flex-1 min-h-[40px] max-h-[120px] resize-none overflow-y-auto rounded-2xl border border-green-400 px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-800 disabled:opacity-60"
                  onKeyDown={(e) => {
                    if (e.nativeEvent.isComposing) return;
                    if (showMentions && e.key === "Escape") {
                      e.preventDefault();
                      setMentionClosed(true);
                      return;
                    }
                    if (
                      showMentions &&
                      (e.key === "ArrowDown" || e.key === "ArrowUp")
                    ) {
                      e.preventDefault();
                      const next =
                        (suggestionIndex +
                          (e.key === "ArrowDown" ? 1 : -1) +
                          suggestions.length) %
                        Math.max(1, suggestions.length);
                      setActiveSuggestion(next);
                      document
                        .getElementById(`chat-person-${suggestions[next]?.id}`)
                        ?.scrollIntoView({ block: "nearest" });
                      return;
                    }
                    if (showMentions && e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      if (suggestions[suggestionIndex])
                        chooseMention(suggestions[suggestionIndex]);
                      return;
                    }
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void sendMessage();
                    }
                  }}
                />
                <button
                  type="button"
                  disabled={
                    sending ||
                    (!activeText.trim() &&
                      pendingAttachments.length === 0 &&
                      !forwardSource) ||
                    (Boolean(forwardSource) &&
                      selectedRecipients.length === 0) ||
                    (isLab && !selectedThread)
                  }
                  onClick={() => void sendMessage()}
                  className="h-10 shrink-0 px-4 rounded-full bg-green-600 text-white text-sm hover:bg-green-700 disabled:opacity-40"
                >
                  {sending
                    ? "…"
                    : editingId
                      ? "Save"
                      : forwardSource
                        ? "Forward"
                        : "Send"}
                </button>
              </div>
            </div>
            <div className="mt-1 text-[10px] text-gray-500">
              Type @ to select a user
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
                  <span className="text-xs text-gray-500" role="status">
                    {formSearchLoading ? "Searching…" : ""}
                  </span>
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
