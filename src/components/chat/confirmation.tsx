import { Pencil } from "lucide-react";
import type { Answers, FormSchema } from "@/forms/types";
import type { Submission } from "@/lib/flow";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatAnswer } from "./format";
import { answeredSections } from "./state";

export function Confirmation({
  schema,
  answers,
  onEdit,
  onSubmit,
}: {
  schema: FormSchema;
  answers: Answers;
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
      <Button size="lg" className="h-10 rounded-full" onClick={onSubmit}>
        Looks good, submit
      </Button>
    </div>
  );
}

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
        Nothing is sent yet. This is the payload that would be submitted:
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
