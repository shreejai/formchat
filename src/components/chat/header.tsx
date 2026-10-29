import type { Progress, SectionPosition } from "@/lib/flow";

export function ChatHeader({
  section,
  progress,
}: {
  /** Omitted on the review and submitted screens. */
  section?: SectionPosition;
  progress: Progress;
}) {
  const percent = section
    ? Math.round((progress.answered / Math.max(progress.total, 1)) * 100)
    : 100;
  const label = section
    ? `Step ${section.number} of ${section.total} · ${section.title}`
    : "Review your answers";

  return (
    <header className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur">
      <div className="mx-auto flex w-full max-w-xl items-center justify-between gap-4 px-4 py-3">
        <span className="text-lg font-semibold tracking-tight">
          nagpur<span className="text-emerald-600">homes</span>
        </span>
        <span className="text-xs text-muted-foreground">List your property</span>
      </div>
      <div className="mx-auto w-full max-w-xl px-4 pb-3">
        <p className="mb-1.5 text-sm font-medium">{label}</p>
        <div
          role="progressbar"
          aria-label="Form progress"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
          className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
        >
          <div
            className="h-full rounded-full bg-emerald-600 transition-[width]"
            style={{ width: `${percent}%` }}
          />
        </div>
      </div>
    </header>
  );
}
