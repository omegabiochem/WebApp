// import React, { useEffect, useMemo, useRef, useState } from "react";
// import {
//   Send,
//   MessageCircle,
//   X,
//   Paperclip,
//   ShieldCheck,
//   Search,
//   Image as ImageIcon,
//   FileText,
//   Trash2,
// } from "lucide-react";

// type ChatRole = "user" | "assistant" | "system";

// type ChatMessage = {
//   id: string;
//   role: ChatRole;
//   text: string;
//   ts: number;
// };

// type QuickAction = {
//   label: string;
//   prompt: string;
//   icon?: React.ReactNode;
// };

// // ---------- NEW: attachment types ----------
// type FormType = "MICRO_MIX" | "MICRO_MIX_WATER" | "CHEMISTRY_MIX";

// type ChatAttachment =
//   | {
//       kind: "PHOTO" | "FILE";
//       filename: string;
//       contentType: string;
//       size: number;
//       url: string;
//       storageKey: string;
//     }
//   | {
//       kind: "FORM";
//       formType: FormType;
//       formNumber: string;
//       reportNumber?: string | null;
//       reportId?: string;
//       chemistryId?: string;
//     };

// type FormListItem = {
//   formType: FormType;
//   formNumber: string;
//   reportNumber?: string | null;
//   reportId?: string;
//   chemistryId?: string;
//   updatedAt?: string;
// };

// function uid() {
//   return Math.random().toString(16).slice(2) + Date.now().toString(16);
// }

// function cn(...xs: Array<string | false | null | undefined>) {
//   return xs.filter(Boolean).join(" ");
// }

// export default function OmegaChatbox() {
//   const [open, setOpen] = useState(false);
//   const [input, setInput] = useState("");
//   const [sending, setSending] = useState(false);

//   // ✅ NEW: pending attachments (for NEXT message)
//   const [pendingAttachments, setPendingAttachments] = useState<
//     ChatAttachment[]
//   >([]);

//   // ✅ NEW: attachment modal
//   const [attachOpen, setAttachOpen] = useState(false);

//   // ✅ NEW: form picker state
//   const [recentForms, setRecentForms] = useState<FormListItem[]>([]);
//   const [formsLoading, setFormsLoading] = useState(false);
//   const [formSearch, setFormSearch] = useState("");
//   const [formSearchResults, setFormSearchResults] = useState<FormListItem[]>(
//     [],
//   );
//   const [formSearchLoading, setFormSearchLoading] = useState(false);
//   const [formSearchError, setFormSearchError] = useState<string | null>(null);

//   const [messages, setMessages] = useState<ChatMessage[]>(() => [
//     {
//       id: uid(),
//       role: "assistant",
//       text: "Hi! I’m the Omega BioChem Lab assistant. How can I help you today?\n\nYou can ask about report status, uploading attachments, corrections, or login support.",
//       ts: Date.now(),
//     },
//     {
//       id: uid(),
//       role: "system",
//       text: "Reminder: Please do not share payment card details or sensitive patient information (PHI) in chat.",
//       ts: Date.now(),
//     },
//   ]);

//   const listRef = useRef<HTMLDivElement | null>(null);
//   const fileInputRef = useRef<HTMLInputElement | null>(null);

//   useEffect(() => {
//     if (!open) return;
//     setTimeout(() => {
//       listRef.current?.scrollTo({
//         top: listRef.current.scrollHeight,
//         behavior: "smooth",
//       });
//     }, 50);
//   }, [open]);

//   useEffect(() => {
//     if (!open) return;
//     listRef.current?.scrollTo({
//       top: listRef.current.scrollHeight,
//       behavior: "smooth",
//     });
//   }, [messages, open]);

//   const quickActions: QuickAction[] = useMemo(
//     () => [
//       {
//         label: "Check report status",
//         prompt: "I want to check my report status. What info do you need?",
//       },
//       {
//         label: "Upload attachments",
//         prompt: "How do I upload attachments to my report (PDF/images)?",
//       },
//       {
//         label: "Corrections help",
//         prompt: "I received corrections requested. What should I do next?",
//       },
//       {
//         label: "Login / password reset",
//         prompt: "I can’t log in. Help me reset my password.",
//       },
//       {
//         label: "Turnaround times",
//         prompt:
//           "What are typical turnaround times for Micro and Chemistry reports?",
//       },
//       {
//         label: "Contact the lab",
//         prompt: "I need to contact the lab team. What’s the best way?",
//       },
//     ],
//     [],
//   );

//   // -----------------------------
//   // NEW: load recent 5 forms
//   // -----------------------------
//   async function loadRecentForms() {
//     setFormsLoading(true);
//     try {
//       const res = await fetch("/api/forms/recent?limit=5", { method: "GET" });
//       if (!res.ok) throw new Error(`recent forms failed: ${res.status}`);
//       const data = await res.json();
//       setRecentForms(Array.isArray(data?.items) ? data.items : []);
//     } catch {
//       setRecentForms([]);
//     } finally {
//       setFormsLoading(false);
//     }
//   }

//   // -----------------------------
//   // NEW: search forms by formNumber
//   // -----------------------------
//   async function searchForms(q: string) {
//     const trimmed = q.trim();
//     if (!trimmed) {
//       setFormSearchResults([]);
//       setFormSearchError(null);
//       return;
//     }
//     setFormSearchLoading(true);
//     setFormSearchError(null);
//     try {
//       const res = await fetch(
//         `/api/forms/search?q=${encodeURIComponent(trimmed)}`,
//         {
//           method: "GET",
//         },
//       );
//       if (!res.ok) throw new Error(`search failed: ${res.status}`);
//       const data = await res.json();
//       setFormSearchResults(Array.isArray(data?.items) ? data.items : []);
//     } catch (e) {
//       setFormSearchResults([]);
//       setFormSearchError("No results or search failed.");
//     } finally {
//       setFormSearchLoading(false);
//     }
//   }

//   // -----------------------------
//   // NEW: upload file (photo/pdf/etc)
//   // -----------------------------
//   async function uploadChatFile(file: File) {
//     const fd = new FormData();
//     fd.append("file", file);

//     const res = await fetch("/api/chat/uploads", {
//       method: "POST",
//       body: fd,
//     });

//     if (!res.ok) throw new Error(`upload failed: ${res.status}`);
//     return res.json() as Promise<{
//       url: string;
//       storageKey: string;
//       filename: string;
//       contentType: string;
//       size: number;
//     }>;
//   }

//   function addFormAttachment(f: FormListItem) {
//     setPendingAttachments((prev) => [
//       ...prev,
//       {
//         kind: "FORM",
//         formType: f.formType,
//         formNumber: f.formNumber,
//         reportNumber: f.reportNumber ?? null,
//         reportId: f.reportId,
//         chemistryId: f.chemistryId,
//       },
//     ]);
//     setAttachOpen(false);
//   }

//   function removePendingAttachment(idx: number) {
//     setPendingAttachments((prev) => prev.filter((_, i) => i !== idx));
//   }

//   // -----------------------------
//   // UPDATED: sendMessage includes attachments
//   // -----------------------------
//   async function sendMessage(text: string) {
//     const trimmed = text.trim();
//     if ((!trimmed && pendingAttachments.length === 0) || sending) return;

//     const outgoingAttachments = pendingAttachments;

//     const userMsg: ChatMessage = {
//       id: uid(),
//       role: "user",
//       text:
//         trimmed +
//         (outgoingAttachments.length
//           ? `\n\n[Attachments: ${outgoingAttachments
//               .map((a) =>
//                 a.kind === "FORM" ? `Form ${a.formNumber}` : a.filename,
//               )
//               .join(", ")}]`
//           : ""),
//       ts: Date.now(),
//     };

//     setMessages((m) => [...m, userMsg]);
//     setInput("");
//     setSending(true);
//     setPendingAttachments([]); // ✅ clear after capturing

//     const typingId = uid();
//     setMessages((m) => [
//       ...m,
//       { id: typingId, role: "assistant", text: "Typing…", ts: Date.now() },
//     ]);

//     try {
//       const res = await fetch("/api/chat", {
//         method: "POST",
//         headers: { "Content-Type": "application/json" },
//         body: JSON.stringify({
//           message: trimmed,
//           attachments: outgoingAttachments,
//         }),
//       });

//       if (!res.ok) throw new Error(`Chat API failed: ${res.status}`);

//       const data = await res.json();
//       const replyText =
//         (data?.reply ?? "").toString().trim() ||
//         "Sorry — I didn’t get a response.";

//       setMessages((m) =>
//         m
//           .filter((x) => x.id !== typingId)
//           .concat({
//             id: uid(),
//             role: "assistant",
//             text: replyText,
//             ts: Date.now(),
//           }),
//       );
//     } catch (e) {
//       setMessages((m) =>
//         m
//           .filter((x) => x.id !== typingId)
//           .concat({
//             id: uid(),
//             role: "assistant",
//             text: "I’m having trouble connecting right now. You can try again, or use “Contact the lab” to reach support.",
//             ts: Date.now(),
//           }),
//       );
//     } finally {
//       setSending(false);
//     }
//   }

//   function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
//     if (e.key === "Enter" && !e.shiftKey) {
//       e.preventDefault();
//       sendMessage(input);
//     }
//   }

//   // When opening attach modal, load recent forms
//   useEffect(() => {
//     if (!attachOpen) return;
//     loadRecentForms();
//   }, [attachOpen]);

//   async function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
//     const file = e.target.files?.[0];
//     e.target.value = ""; // allow re-pick same file
//     if (!file) return;

//     try {
//       const up = await uploadChatFile(file);
//       setPendingAttachments((prev) => [
//         ...prev,
//         {
//           kind: file.type.startsWith("image/") ? "PHOTO" : "FILE",
//           filename: up.filename,
//           contentType: up.contentType,
//           size: up.size,
//           url: up.url,
//           storageKey: up.storageKey,
//         },
//       ]);
//       setAttachOpen(false);
//     } catch {
//       alert("Upload failed. Please try again.");
//     }
//   }

//   return (
//     <>
//       {!open && (
//         <button
//           onClick={() => setOpen(true)}
//           className="fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-full bg-blue-600 px-4 py-3 text-white shadow-lg hover:bg-blue-700 active:scale-[0.99]"
//         >
//           <MessageCircle className="h-5 w-5" />
//           <span className="text-sm font-semibold">Chat</span>
//         </button>
//       )}

//       {open && (
//         <div className="fixed bottom-6 right-6 z-50 w-[360px] max-w-[92vw] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
//           {/* Header */}
//           <div className="flex items-center justify-between bg-slate-50 px-4 py-3">
//             <div className="flex items-center gap-2">
//               <div className="grid h-9 w-9 place-items-center rounded-xl bg-blue-600 text-white">
//                 <ShieldCheck className="h-5 w-5" />
//               </div>
//               <div className="leading-tight">
//                 <div className="text-sm font-bold text-slate-900">
//                   Omega BioChem Lab
//                 </div>
//                 <div className="text-xs text-slate-500">Support Assistant</div>
//               </div>
//             </div>

//             <button
//               onClick={() => setOpen(false)}
//               className="rounded-lg p-2 text-slate-600 hover:bg-slate-100"
//               aria-label="Close chat"
//             >
//               <X className="h-5 w-5" />
//             </button>
//           </div>

//           {/* Notice */}
//           <div className="border-b border-slate-200 px-4 py-2">
//             <div className="text-[11px] text-slate-600">
//               Please don’t share payment card details or sensitive patient info
//               (PHI) in chat.
//             </div>
//           </div>

//           {/* Messages */}
//           <div
//             ref={listRef}
//             className="h-[320px] min-w-0 overflow-y-auto px-4 py-3"
//           >
//             {messages
//               .filter((m) => m.role !== "system")
//               .map((m) => (
//                 <div
//                   key={m.id}
//                   className={`mb-2 flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
//                 >
//                   <div
//                     className={`max-w-[85%] whitespace-pre-wrap break-words overflow-hidden rounded-2xl px-3 py-2 text-sm leading-snug ${
//                       m.role === "user"
//                         ? "bg-blue-600 text-white"
//                         : "bg-slate-100 text-slate-900"
//                     }`}
//                   >
//                     {m.text}
//                   </div>
//                 </div>
//               ))}

//             {messages.filter((m) => m.role === "user").length === 0 && (
//               <div className="mt-2">
//                 <div className="mb-2 text-xs font-semibold text-slate-700">
//                   Quick actions
//                 </div>
//                 <div className="flex flex-wrap gap-2">
//                   {quickActions.map((a) => (
//                     <button
//                       key={a.label}
//                       onClick={() => sendMessage(a.prompt)}
//                       className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[12px] text-slate-700 hover:bg-slate-50"
//                     >
//                       {a.label}
//                     </button>
//                   ))}
//                 </div>
//               </div>
//             )}
//           </div>

//           {/* Input */}
//           <div className="border-t border-slate-200 p-3">
//             {/* ✅ Pending attachments preview */}
//             {pendingAttachments.length > 0 && (
//               <div className="mb-2 space-y-1">
//                 {pendingAttachments.map((a, idx) => (
//                   <div
//                     key={idx}
//                     className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50 px-2 py-1"
//                   >
//                     <div className="min-w-0 truncate text-[12px] text-slate-700">
//                       {a.kind === "FORM"
//                         ? `Form: ${a.formNumber} (${a.formType})`
//                         : `${a.filename}`}
//                     </div>
//                     <button
//                       type="button"
//                       onClick={() => removePendingAttachment(idx)}
//                       className="rounded-lg p-1 text-slate-500 hover:bg-white"
//                       title="Remove"
//                     >
//                       <Trash2 className="h-4 w-4" />
//                     </button>
//                   </div>
//                 ))}
//               </div>
//             )}

//             <div className="flex items-end gap-2">
//               {/* ✅ Attach button opens modal */}
//               <button
//                 type="button"
//                 className="rounded-xl border border-slate-200 p-2 text-slate-600 hover:bg-slate-50"
//                 title="Attach (photo/file or form)"
//                 onClick={() => setAttachOpen(true)}
//               >
//                 <Paperclip className="h-5 w-5" />
//               </button>

//               <textarea
//                 value={input}
//                 onChange={(e) => setInput(e.target.value)}
//                 onKeyDown={onKeyDown}
//                 placeholder="Type your message…"
//                 className="min-h-[42px] max-h-[120px] flex-1 resize-none rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400"
//               />

//               <button
//                 onClick={() => sendMessage(input)}
//                 disabled={
//                   sending || (!input.trim() && pendingAttachments.length === 0)
//                 }
//                 className="grid h-[42px] w-[42px] place-items-center rounded-xl bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
//                 title="Send"
//               >
//                 <Send className="h-5 w-5" />
//               </button>
//             </div>

//             <div className="mt-2 text-[11px] text-slate-500">
//               Tip: Include your <span className="font-semibold">Report #</span>{" "}
//               or <span className="font-semibold">Form #</span> for faster help.
//             </div>
//           </div>
//         </div>
//       )}

//       {/* -----------------------------
//           ✅ Attachment Modal
//          ----------------------------- */}
//       {attachOpen && (
//         <div className="fixed inset-0 z-[60] grid place-items-center bg-black/40 p-4">
//           <div className="w-full max-w-[520px] rounded-2xl bg-white shadow-2xl">
//             <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
//               <div className="text-sm font-bold text-slate-900">
//                 Add attachment
//               </div>
//               <button
//                 onClick={() => setAttachOpen(false)}
//                 className="rounded-lg p-2 text-slate-600 hover:bg-slate-100"
//                 aria-label="Close"
//               >
//                 <X className="h-5 w-5" />
//               </button>
//             </div>

//             <div className="p-4 space-y-4">
//               {/* Upload */}
//               <div className="rounded-2xl border border-slate-200 p-3">
//                 <div className="mb-2 text-xs font-semibold text-slate-700">
//                   Upload photo / file
//                 </div>
//                 <div className="flex flex-wrap gap-2">
//                   <button
//                     type="button"
//                     onClick={() => fileInputRef.current?.click()}
//                     className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-3 py-2 text-sm text-white hover:bg-blue-700"
//                   >
//                     <ImageIcon className="h-4 w-4" />
//                     Choose file
//                   </button>
//                   <div className="text-[12px] text-slate-500 self-center">
//                     (Images/PDF allowed)
//                   </div>
//                 </div>

//                 <input
//                   ref={fileInputRef}
//                   type="file"
//                   accept="image/*,application/pdf"
//                   className="hidden"
//                   onChange={onPickFile}
//                 />
//               </div>

//               {/* Attach Form */}
//               <div className="rounded-2xl border border-slate-200 p-3">
//                 <div className="mb-2 text-xs font-semibold text-slate-700">
//                   Attach a form
//                 </div>

//                 {/* Search */}
//                 <div className="flex items-center gap-2">
//                   <div className="relative flex-1">
//                     <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
//                     <input
//                       value={formSearch}
//                       onChange={(e) => setFormSearch(e.target.value)}
//                       placeholder="Search by Form # (example: OM-000123)"
//                       className="w-full rounded-xl border border-slate-200 pl-9 pr-3 py-2 text-sm outline-none focus:border-blue-400"
//                     />
//                   </div>
//                   <button
//                     type="button"
//                     onClick={() => searchForms(formSearch)}
//                     className="rounded-xl border border-slate-200 px-3 py-2 text-sm hover:bg-slate-50"
//                     disabled={formSearchLoading}
//                   >
//                     {formSearchLoading ? "Searching…" : "Search"}
//                   </button>
//                 </div>

//                 {formSearchError && (
//                   <div className="mt-2 text-[12px] text-red-600">
//                     {formSearchError}
//                   </div>
//                 )}

//                 {/* Results */}
//                 {formSearchResults.length > 0 && (
//                   <div className="mt-3 space-y-2">
//                     <div className="text-[12px] font-semibold text-slate-600">
//                       Results
//                     </div>
//                     {formSearchResults.map((f) => (
//                       <button
//                         key={`${f.formType}-${f.formNumber}`}
//                         onClick={() => addFormAttachment(f)}
//                         className="w-full text-left rounded-xl border border-slate-200 px-3 py-2 hover:bg-slate-50"
//                       >
//                         <div className="flex items-center justify-between gap-2">
//                           <div className="min-w-0">
//                             <div className="text-sm font-semibold text-slate-900 truncate">
//                               {f.formNumber}
//                             </div>
//                             <div className="text-[12px] text-slate-500">
//                               {f.formType}{" "}
//                               {f.reportNumber
//                                 ? `• Report: ${f.reportNumber}`
//                                 : ""}
//                             </div>
//                           </div>
//                           <FileText className="h-4 w-4 text-slate-500" />
//                         </div>
//                       </button>
//                     ))}
//                   </div>
//                 )}

//                 {/* Recent 5 */}
//                 <div className="mt-4">
//                   <div className="mb-2 text-[12px] font-semibold text-slate-600">
//                     Most recent 5 forms
//                   </div>
//                   {formsLoading ? (
//                     <div className="text-[12px] text-slate-500">Loading…</div>
//                   ) : recentForms.length === 0 ? (
//                     <div className="text-[12px] text-slate-500">
//                       No recent forms found.
//                     </div>
//                   ) : (
//                     <div className="space-y-2">
//                       {recentForms.map((f) => (
//                         <button
//                           key={`${f.formType}-${f.formNumber}`}
//                           onClick={() => addFormAttachment(f)}
//                           className="w-full text-left rounded-xl border border-slate-200 px-3 py-2 hover:bg-slate-50"
//                         >
//                           <div className="flex items-center justify-between gap-2">
//                             <div className="min-w-0">
//                               <div className="text-sm font-semibold text-slate-900 truncate">
//                                 {f.formNumber}
//                               </div>
//                               <div className="text-[12px] text-slate-500">
//                                 {f.formType}{" "}
//                                 {f.reportNumber
//                                   ? `• Report: ${f.reportNumber}`
//                                   : ""}
//                               </div>
//                             </div>
//                             <FileText className="h-4 w-4 text-slate-500" />
//                           </div>
//                         </button>
//                       ))}
//                     </div>
//                   )}
//                 </div>
//               </div>

//               <div className="flex justify-end">
//                 <button
//                   onClick={() => setAttachOpen(false)}
//                   className="rounded-xl px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
//                 >
//                   Done
//                 </button>
//               </div>
//             </div>
//           </div>
//         </div>
//       )}
//     </>
//   );
// }

// // import React, { useEffect, useMemo, useRef, useState } from "react";
// // import { Send, MessageCircle, X, Paperclip, ShieldCheck } from "lucide-react";

// // type ChatRole = "user" | "assistant" | "system";

// // type ChatMessage = {
// //   id: string;
// //   role: ChatRole;
// //   text: string;
// //   ts: number;
// // };

// // type QuickAction = {
// //   label: string;
// //   prompt: string;
// //   icon?: React.ReactNode;
// // };

// // function uid() {
// //   return Math.random().toString(16).slice(2) + Date.now().toString(16);
// // }

// // export default function OmegaChatbox() {
// //   const [open, setOpen] = useState(false);
// //   const [input, setInput] = useState("");
// //   const [sending, setSending] = useState(false);
// //   const [messages, setMessages] = useState<ChatMessage[]>(() => [
// //     {
// //       id: uid(),
// //       role: "assistant",
// //       text: "Hi! I’m the Omega BioChem Lab assistant. How can I help you today?\n\nYou can ask about report status, uploading attachments, corrections, or login support.",
// //       ts: Date.now(),
// //     },
// //     {
// //       id: uid(),
// //       role: "system",
// //       text: "Reminder: Please do not share payment card details or sensitive patient information (PHI) in chat.",
// //       ts: Date.now(),
// //     },
// //   ]);

// //   const listRef = useRef<HTMLDivElement | null>(null);

// //   useEffect(() => {
// //     if (!open) return;
// //     setTimeout(() => {
// //       listRef.current?.scrollTo({
// //         top: listRef.current.scrollHeight,
// //         behavior: "smooth",
// //       });
// //     }, 50);
// //   }, [open]);

// //   useEffect(() => {
// //     if (!open) return;
// //     listRef.current?.scrollTo({
// //       top: listRef.current.scrollHeight,
// //       behavior: "smooth",
// //     });
// //   }, [messages, open]);

// //   const quickActions: QuickAction[] = useMemo(
// //     () => [
// //       {
// //         label: "Check report status",
// //         prompt: "I want to check my report status. What info do you need?",
// //       },
// //       {
// //         label: "Upload attachments",
// //         prompt: "How do I upload attachments to my report (PDF/images)?",
// //       },
// //       {
// //         label: "Corrections help",
// //         prompt: "I received corrections requested. What should I do next?",
// //       },
// //       {
// //         label: "Login / password reset",
// //         prompt: "I can’t log in. Help me reset my password.",
// //       },
// //       {
// //         label: "Turnaround times",
// //         prompt:
// //           "What are typical turnaround times for Micro and Chemistry reports?",
// //       },
// //       {
// //         label: "Contact the lab",
// //         prompt: "I need to contact the lab team. What’s the best way?",
// //       },
// //     ],
// //     [],
// //   );

// //   async function sendMessage(text: string) {
// //     const trimmed = text.trim();
// //     if (!trimmed || sending) return;

// //     const userMsg: ChatMessage = {
// //       id: uid(),
// //       role: "user",
// //       text: trimmed,
// //       ts: Date.now(),
// //     };
// //     setMessages((m) => [...m, userMsg]);
// //     setInput("");
// //     setSending(true);

// //     const typingId = uid();
// //     setMessages((m) => [
// //       ...m,
// //       { id: typingId, role: "assistant", text: "Typing…", ts: Date.now() },
// //     ]);

// //     try {
// //       const res = await fetch("/api/chat", {
// //         method: "POST",
// //         headers: { "Content-Type": "application/json" },
// //         body: JSON.stringify({
// //           message: trimmed,
// //         }),
// //       });

// //       if (!res.ok) throw new Error(`Chat API failed: ${res.status}`);

// //       const data = await res.json();
// //       const replyText =
// //         (data?.reply ?? "").toString().trim() ||
// //         "Sorry — I didn’t get a response.";

// //       setMessages((m) =>
// //         m
// //           .filter((x) => x.id !== typingId)
// //           .concat({
// //             id: uid(),
// //             role: "assistant",
// //             text: replyText,
// //             ts: Date.now(),
// //           }),
// //       );
// //     } catch (e) {
// //       setMessages((m) =>
// //         m
// //           .filter((x) => x.id !== typingId)
// //           .concat({
// //             id: uid(),
// //             role: "assistant",
// //             text: "I’m having trouble connecting right now. You can try again, or use “Contact the lab” to reach support.",
// //             ts: Date.now(),
// //           }),
// //       );
// //     } finally {
// //       setSending(false);
// //     }
// //   }

// //   function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
// //     if (e.key === "Enter" && !e.shiftKey) {
// //       e.preventDefault();
// //       sendMessage(input);
// //     }
// //   }

// //   return (
// //     <>
// //       {!open && (
// //         <button
// //           onClick={() => setOpen(true)}
// //           className="fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-full bg-blue-600 px-4 py-3 text-white shadow-lg hover:bg-blue-700 active:scale-[0.99]"
// //         >
// //           <MessageCircle className="h-5 w-5" />
// //           <span className="text-sm font-semibold">Chat</span>
// //         </button>
// //       )}

// //       {open && (
// //         <div className="fixed bottom-6 right-6 z-50 w-[360px] max-w-[92vw] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
// //           {/* Header */}
// //           <div className="flex items-center justify-between bg-slate-50 px-4 py-3">
// //             <div className="flex items-center gap-2">
// //               <div className="grid h-9 w-9 place-items-center rounded-xl bg-blue-600 text-white">
// //                 <ShieldCheck className="h-5 w-5" />
// //               </div>
// //               <div className="leading-tight">
// //                 <div className="text-sm font-bold text-slate-900">
// //                   Omega BioChem Lab
// //                 </div>
// //                 <div className="text-xs text-slate-500">Support Assistant</div>
// //               </div>
// //             </div>

// //             <button
// //               onClick={() => setOpen(false)}
// //               className="rounded-lg p-2 text-slate-600 hover:bg-slate-100"
// //               aria-label="Close chat"
// //             >
// //               <X className="h-5 w-5" />
// //             </button>
// //           </div>

// //           {/* Notice */}
// //           <div className="border-b border-slate-200 px-4 py-2">
// //             <div className="text-[11px] text-slate-600">
// //               Please don’t share payment card details or sensitive patient info
// //               (PHI) in chat.
// //             </div>
// //           </div>

// //           {/* Messages */}
// //           <div
// //             ref={listRef}
// //             className="h-[320px] min-w-0 overflow-y-auto px-4 py-3"
// //           >
// //             {messages
// //               .filter((m) => m.role !== "system")
// //               .map((m) => (
// //                 <div
// //                   key={m.id}
// //                   className={`mb-2 flex ${
// //                     m.role === "user" ? "justify-end" : "justify-start"
// //                   }`}
// //                 >
// //                   <div
// //                     className={`max-w-[85%] max-w-full whitespace-pre-wrap break-words overflow-hidden rounded-2xl px-3 py-2 text-sm leading-snug ${
// //                       m.role === "user"
// //                         ? "bg-blue-600 text-white"
// //                         : "bg-slate-100 text-slate-900"
// //                     }`}
// //                   >
// //                     {m.text}
// //                   </div>
// //                 </div>
// //               ))}

// //             {messages.filter((m) => m.role === "user").length === 0 && (
// //               <div className="mt-2">
// //                 <div className="mb-2 text-xs font-semibold text-slate-700">
// //                   Quick actions
// //                 </div>
// //                 <div className="flex flex-wrap gap-2">
// //                   {quickActions.map((a) => (
// //                     <button
// //                       key={a.label}
// //                       onClick={() => sendMessage(a.prompt)}
// //                       className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[12px] text-slate-700 hover:bg-slate-50"
// //                     >
// //                       {a.label}
// //                     </button>
// //                   ))}
// //                 </div>
// //               </div>
// //             )}
// //           </div>

// //           {/* Input */}
// //           <div className="border-t border-slate-200 p-3">
// //             <div className="flex items-end gap-2">
// //               <button
// //                 type="button"
// //                 className="rounded-xl border border-slate-200 p-2 text-slate-600 hover:bg-slate-50"
// //                 title="Attachments (optional)"
// //                 onClick={() => {
// //                   alert(
// //                     "Attachment upload can be wired to your /api/attachments endpoint.",
// //                   );
// //                 }}
// //               >
// //                 <Paperclip className="h-5 w-5" />
// //               </button>

// //               <textarea
// //                 value={input}
// //                 onChange={(e) => setInput(e.target.value)}
// //                 onKeyDown={onKeyDown}
// //                 placeholder="Type your message…"
// //                 className="min-h-[42px] max-h-[120px] flex-1 resize-none rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400"
// //               />

// //               <button
// //                 onClick={() => sendMessage(input)}
// //                 disabled={sending || !input.trim()}
// //                 className="grid h-[42px] w-[42px] place-items-center rounded-xl bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
// //                 title="Send"
// //               >
// //                 <Send className="h-5 w-5" />
// //               </button>
// //             </div>

// //             <div className="mt-2 text-[11px] text-slate-500">
// //               Tip: Include your <span className="font-semibold">Report #</span>{" "}
// //               or <span className="font-semibold">Form #</span> for faster help.
// //             </div>
// //           </div>
// //         </div>
// //       )}
// //     </>
// //   );
// // }
