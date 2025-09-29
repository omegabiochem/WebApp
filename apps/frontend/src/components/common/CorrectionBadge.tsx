export default function CorrectionBadge({ title }: { title: string }) {
  if (!title) return null;
  return (
    <span
      title={title}
      className="ml-1 inline-flex items-center rounded bg-rose-100 px-1.5 py-0.5 text-[10px] font-medium text-rose-700 ring-1 ring-rose-200"
    >
      !
    </span>
  );
}
