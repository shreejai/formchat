import { CircleCheck, LoaderCircle, Pencil } from "lucide-react";
import type { Answers, FormSchema } from "@/forms/types";
import type { Submission } from "@/lib/flow";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatAnswer } from "./format";
import { answeredSections } from "./state";

export function Confirmation({
  schema,
  answers,
  sending,
  error,
  onEdit,
  onSubmit,
}: {
  schema: FormSchema;
  answers: Answers;
  sending: boolean;
  /** Why the last submit failed, shown above the button. */
  error: string | null;
  onEdit: (key: string) => void;
  onSubmit: () => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">
        Check your answers. Tap Edit to change any of them.
      </p>
      {answeredSections(schema, answers).map(({ section, items }) => (
        <Card key={section.id} size="sm">
          <CardHeader>
            <CardTitle>{section.title}</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="divide-y">
              {items.map(({ question, value }) => (
                <div key={question.key} className="flex items-start gap-3 py-2">
                  <div className="min-w-0 flex-1">
                    <dt className="text-xs text-muted-foreground">{question.label}</dt>
                    <dd className="break-words whitespace-pre-wrap">
                      {formatAnswer(question, value)}
                    </dd>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={`Edit ${question.label}`}
                    disabled={sending}
                    onClick={() => onEdit(question.key)}
                  >
                    <Pencil />
                    Edit
                  </Button>
                </div>
              ))}
            </dl>
          </CardContent>
        </Card>
      ))}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <Button size="lg" className="h-10 rounded-full" disabled={sending} onClick={onSubmit}>
        {sending ? (
          <>
            <LoaderCircle className="animate-spin" />
            Sending…
          </>
        ) : (
          "Looks good, submit"
        )}
      </Button>
    </div>
  );
}

export function SubmissionSuccess() {
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-3 py-6 text-center">
        <CircleCheck className="size-10 text-primary" aria-hidden />
        <p role="status" className="font-medium">
          Thanks! Your listing has been sent for review.
        </p>
      </CardContent>
    </Card>
  );
}

/** Only shown with ?debug=1. */
export function SubmissionPreview({
  payload,
  onBack,
}: {
  payload: Submission;
  onBack: () => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">
        Debug: the lead built from your answers (the server rebuilds it before sending).
      </p>
      <pre className="overflow-x-auto rounded-xl bg-background p-4 font-mono text-xs ring-1 ring-foreground/10">
        {JSON.stringify(payload, null, 2)}
      </pre>
      <Button variant="outline" className="h-10 rounded-full" onClick={onBack}>
        Back to answers
      </Button>
    </div>
  );
}
