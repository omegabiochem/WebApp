import { useRef, useState } from "react";

type InlineActionButtonProps = {
  onAction: () => void | Promise<void>;
  title?: string;

  // visuals
  idleIcon: React.ReactNode;
  successIcon?: React.ReactNode;
  errorIcon?: React.ReactNode;

  // inline message next to icon
  successText?: string; // e.g., "Copied"
  errorText?: string;   // e.g., "Failed"
  showText?: boolean;

  // behavior
  resetAfterMs?: number; // default 1200
  disabled?: boolean;
  className?: string;
};

type State = "idle" | "success" | "error" | "loading";

export default function InlineActionButton({
  onAction,
  title,
  idleIcon,
  successIcon,
  errorIcon,
  successText = "Done",
  errorText = "Failed",
  showText = true,
  resetAfterMs = 1200,
  disabled,
  className,
}: InlineActionButtonProps) {
  const [state, setState] = useState<State>("idle");
  const timerRef = useRef<number | null>(null);

  const clearTimer = () => {
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = null;
  };

  const run = async () => {
    if (disabled || state === "loading") return;

    clearTimer();
    setState("loading");

    try {
      await onAction();
      setState("success");
      timerRef.current = window.setTimeout(() => setState("idle"), resetAfterMs);
    } catch {
      setState("error");
      timerRef.current = window.setTimeout(() => setState("idle"), resetAfterMs);
    }
  };

  const icon =
    state === "success"
      ? successIcon ?? idleIcon
      : state === "error"
      ? errorIcon ?? idleIcon
      : idleIcon;

  const text =
    state === "success"
      ? successText
      : state === "error"
      ? errorText
      : state === "loading"
      ? "..."
      : "";

  return (
    <span className="inline-flex items-center gap-1">
      <button
        type="button"
        onClick={run}
        title={title}
        disabled={disabled || state === "loading"}
        className={
          className ??
          "text-slate-500 hover:text-slate-900 disabled:opacity-50"
        }
        aria-label={title ?? "Action"}
      >
        {icon}
      </button>

      {showText && (state === "success" || state === "error") && (
        <span
          className={
            "text-xs " + (state === "success" ? "text-emerald-600" : "text-rose-600")
          }
        >
          {text}
        </span>
      )}
    </span>
  );
}
