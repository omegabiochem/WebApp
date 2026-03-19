import React from "react";

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function highlightText(value: unknown, query?: string): React.ReactNode {
  const text = value == null ? "" : String(value);
  const q = (query || "").trim();

  if (!text) return "-";
  if (!q) return text;

  const regex = new RegExp(`(${escapeRegExp(q)})`, "ig");
  const parts = text.split(regex);

  return parts.map((part, index) => {
    const isMatch = part.toLowerCase() === q.toLowerCase();

    return isMatch ? (
      <mark
        key={index}
        className="rounded bg-red-100 px-0.5 font-semibold text-red-700"
      >
        {part}
      </mark>
    ) : (
      <React.Fragment key={index}>{part}</React.Fragment>
    );
  });
}