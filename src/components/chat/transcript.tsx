import type { Answers, FormSchema, Question } from "@/forms/types";
import { cn } from "@/lib/utils";
import { formatAnswer } from "./format";
import { answeredSections } from "./state";

export function BotBubble({ children }: { children: React.ReactNode }) {
  return (
    <div className="max-w-[85%] self-start rounded-2xl rounded-bl-sm bg-background px-3.5 py-2 text-sm shadow-xs ring-1 ring-foreground/10">
      {children}
    </div>
  );
}

export function Transcript({
  schema,
  answers,
  pending,
  editingKey,
  onEdit,
}: {
  schema: FormSchema;
  answers: Answers;
  /** The question being asked now, shown last. */
  pending?: Question;
  editingKey: string | null;
  onEdit: (key: string) => void;
}) {
  return (
    <ol className="flex flex-col gap-2">
      {answeredSections(schema, answers).map(({ section, items }) => (
        <li key={section.id} className="flex flex-col gap-2">
          <p className="mt-2 text-center text-xs font-medium tracking-wide text-muted-foreground uppercase">
            {section.title}
          </p>
          {items.map(({ question, value }) => (
            <div key={question.key} className="flex flex-col gap-2">
              <BotBubble>{question.label}</BotBubble>
              <button
                type="button"
                onClick={() => onEdit(question.key)}
                aria-label={`Change answer to ${question.label}`}
                className={cn(
                  "max-w-[85%] self-end rounded-2xl rounded-br-sm bg-emerald-600 px-3.5 py-2 text-left text-sm text-white transition-colors hover:bg-emerald-700 focus-visible:ring-3 focus-visible:ring-emerald-600/40 focus-visible:outline-none",
                  editingKey === question.key && "ring-3 ring-emerald-600/40",
                )}
              >
                <span className="break-words whitespace-pre-wrap">
                  {formatAnswer(question, value)}
                </span>
                <span className="mt-0.5 block text-[0.7rem] text-white/75">Tap to change</span>
              </button>
            </div>
          ))}
        </li>
      ))}
      {pending && (
        <li className="flex flex-col">
          <BotBubble>{pending.label}</BotBubble>
        </li>
      )}
    </ol>
  );
}
