import React, { useEffect, useMemo, useRef, useState } from "react";
import { Send, MessageCircle, X, Paperclip, ShieldCheck } from "lucide-react";

type ChatRole = "user" | "assistant" | "system";

type ChatMessage = {
  id: string;
  role: ChatRole;
  text: string;
  ts: number;
};

type QuickAction = {
  label: string;
  prompt: string;
  icon?: React.ReactNode;
};

function uid() {
  return Math.random().toString(16).slice(2) + Date.now().toString(16);
}

export default function OmegaChatbox() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>(() => [
    {
      id: uid(),
      role: "assistant",
      text: "Hi! I’m the Omega BioChem Lab assistant. How can I help you today?\n\nYou can ask about report status, uploading attachments, corrections, or login support.",
      ts: Date.now(),
    },
    {
      id: uid(),
      role: "system",
      text: "Reminder: Please do not share payment card details or sensitive patient information (PHI) in chat.",
      ts: Date.now(),
    },
  ]);

  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    setTimeout(() => {
      listRef.current?.scrollTo({
        top: listRef.current.scrollHeight,
        behavior: "smooth",
      });
    }, 50);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    listRef.current?.scrollTo({
      top: listRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, open]);

  const quickActions: QuickAction[] = useMemo(
    () => [
      {
        label: "Check report status",
        prompt: "I want to check my report status. What info do you need?",
      },
      {
        label: "Upload attachments",
        prompt: "How do I upload attachments to my report (PDF/images)?",
      },
      {
        label: "Corrections help",
        prompt: "I received corrections requested. What should I do next?",
      },
      {
        label: "Login / password reset",
        prompt: "I can’t log in. Help me reset my password.",
      },
      {
        label: "Turnaround times",
        prompt:
          "What are typical turnaround times for Micro and Chemistry reports?",
      },
      {
        label: "Contact the lab",
        prompt: "I need to contact the lab team. What’s the best way?",
      },
    ],
    [],
  );

  async function sendMessage(text: string) {
    const trimmed = text.trim();
    if (!trimmed || sending) return;

    const userMsg: ChatMessage = {
      id: uid(),
      role: "user",
      text: trimmed,
      ts: Date.now(),
    };
    setMessages((m) => [...m, userMsg]);
    setInput("");
    setSending(true);

    const typingId = uid();
    setMessages((m) => [
      ...m,
      { id: typingId, role: "assistant", text: "Typing…", ts: Date.now() },
    ]);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: trimmed,
        }),
      });

      if (!res.ok) throw new Error(`Chat API failed: ${res.status}`);

      const data = await res.json();
      const replyText =
        (data?.reply ?? "").toString().trim() ||
        "Sorry — I didn’t get a response.";

      setMessages((m) =>
        m
          .filter((x) => x.id !== typingId)
          .concat({
            id: uid(),
            role: "assistant",
            text: replyText,
            ts: Date.now(),
          }),
      );
    } catch (e) {
      setMessages((m) =>
        m
          .filter((x) => x.id !== typingId)
          .concat({
            id: uid(),
            role: "assistant",
            text: "I’m having trouble connecting right now. You can try again, or use “Contact the lab” to reach support.",
            ts: Date.now(),
          }),
      );
    } finally {
      setSending(false);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  }

  return (
    <>
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-full bg-blue-600 px-4 py-3 text-white shadow-lg hover:bg-blue-700 active:scale-[0.99]"
        >
          <MessageCircle className="h-5 w-5" />
          <span className="text-sm font-semibold">Chat</span>
        </button>
      )}

      {open && (
        <div className="fixed bottom-6 right-6 z-50 w-[360px] max-w-[92vw] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
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
                <div className="text-xs text-slate-500">Support Assistant</div>
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

          {/* Notice */}
          <div className="border-b border-slate-200 px-4 py-2">
            <div className="text-[11px] text-slate-600">
              Please don’t share payment card details or sensitive patient info
              (PHI) in chat.
            </div>
          </div>

          {/* Messages */}
          <div
            ref={listRef}
            className="h-[320px] min-w-0 overflow-y-auto px-4 py-3"
          >
            {messages
              .filter((m) => m.role !== "system")
              .map((m) => (
                <div
                  key={m.id}
                  className={`mb-2 flex ${
                    m.role === "user" ? "justify-end" : "justify-start"
                  }`}
                >
                  <div
                    className={`max-w-[85%] max-w-full whitespace-pre-wrap break-words overflow-hidden rounded-2xl px-3 py-2 text-sm leading-snug ${
                      m.role === "user"
                        ? "bg-blue-600 text-white"
                        : "bg-slate-100 text-slate-900"
                    }`}
                  >
                    {m.text}
                  </div>
                </div>
              ))}

            {messages.filter((m) => m.role === "user").length === 0 && (
              <div className="mt-2">
                <div className="mb-2 text-xs font-semibold text-slate-700">
                  Quick actions
                </div>
                <div className="flex flex-wrap gap-2">
                  {quickActions.map((a) => (
                    <button
                      key={a.label}
                      onClick={() => sendMessage(a.prompt)}
                      className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[12px] text-slate-700 hover:bg-slate-50"
                    >
                      {a.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Input */}
          <div className="border-t border-slate-200 p-3">
            <div className="flex items-end gap-2">
              <button
                type="button"
                className="rounded-xl border border-slate-200 p-2 text-slate-600 hover:bg-slate-50"
                title="Attachments (optional)"
                onClick={() => {
                  alert(
                    "Attachment upload can be wired to your /api/attachments endpoint.",
                  );
                }}
              >
                <Paperclip className="h-5 w-5" />
              </button>

              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder="Type your message…"
                className="min-h-[42px] max-h-[120px] flex-1 resize-none rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400"
              />

              <button
                onClick={() => sendMessage(input)}
                disabled={sending || !input.trim()}
                className="grid h-[42px] w-[42px] place-items-center rounded-xl bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
                title="Send"
              >
                <Send className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-2 text-[11px] text-slate-500">
              Tip: Include your <span className="font-semibold">Report #</span>{" "}
              or <span className="font-semibold">Form #</span> for faster help.
            </div>
          </div>
        </div>
      )}
    </>
  );
}
