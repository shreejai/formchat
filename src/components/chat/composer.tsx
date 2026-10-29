"use client";

import { useId, useRef, useState } from "react";
import { ImagePlus, Send, X } from "lucide-react";
import type { AnswerValue, ContactValue, Question } from "@/forms/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { paragraphHtmlToText } from "@/lib/html";
import { cn } from "@/lib/utils";
import { mockUser } from "@/lib/mock-user";
import { trimContact, validateContact, type ContactErrors } from "./contact";
import { filterLocalities } from "./localities";
import { addImageFiles, MAX_IMAGES, type FileLike } from "./upload";

type InputProps = {
  question: Question;
  /** The existing answer when editing. */
  current?: AnswerValue;
  onAnswer: (value: AnswerValue) => void;
  onSkip: () => void;
};

const chip = "h-9 rounded-full px-4";

function SkipChip({ question, onSkip }: Pick<InputProps, "question" | "onSkip">) {
  if (question.required) return null;
  return (
    <Button variant="ghost" className={cn(chip, "text-muted-foreground")} onClick={onSkip}>
      Skip
    </Button>
  );
}

function ButtonsInput({ question, current, onAnswer, onSkip }: InputProps) {
  return (
    <div className="flex flex-wrap gap-2">
      {question.options?.map((o) => (
        <Button
          key={o.value}
          variant={current === o.value ? "default" : "outline"}
          className={chip}
          onClick={() => onAnswer(o.value)}
        >
          {o.label}
        </Button>
      ))}
      <SkipChip question={question} onSkip={onSkip} />
    </div>
  );
}

const placeholders: Partial<Record<Question["kind"], string>> = {
  price: "e.g. 45 lakh, or 15,000 a month",
  number: "e.g. 1200 sq ft",
  location: "Type a locality, e.g. Dharampeth",
  longtext: "Describe the property",
};

function TextLikeInput({
  question,
  current,
  onAnswer,
  onSkip,
  localities,
}: InputProps & { localities: readonly string[] }) {
  const multiline = question.kind === "longtext";
  const [draft, setDraft] = useState(() => {
    if (typeof current !== "string") return "";
    // Descriptions are stored as escaped paragraph HTML.
    return multiline ? paragraphHtmlToText(current) : current;
  });
  const inputRef = useRef<HTMLInputElement>(null);
  const suggestions =
    question.kind === "location" ? filterLocalities(draft, localities) : [];
  const value = draft.trim();

  function send() {
    // Price and area are parsed by the chat reducer, which re-asks if they don't parse.
    if (value) onAnswer(value);
  }

  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        send();
      }}
    >
      {suggestions.length > 0 && (
        <div className="flex flex-wrap gap-1.5" aria-label="Suggested localities">
          {suggestions.map((s) => (
            <Button
              key={s}
              type="button"
              variant="secondary"
              size="sm"
              className="rounded-full"
              onClick={() => {
                setDraft(s);
                inputRef.current?.focus();
              }}
            >
              {s}
            </Button>
          ))}
        </div>
      )}
      <div className="flex items-end gap-2">
        {multiline ? (
          <Textarea
            autoFocus
            aria-label={question.label}
            placeholder={placeholders.longtext}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                send();
              }
            }}
            className="max-h-48 bg-background"
          />
        ) : (
          <Input
            ref={inputRef}
            autoFocus
            aria-label={question.label}
            placeholder={placeholders[question.kind]}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            autoComplete="off"
            className="h-10 bg-background"
          />
        )}
        <Button type="submit" size="icon-lg" className="size-10" disabled={!value} aria-label="Send">
          <Send />
        </Button>
      </div>
      <div className="flex justify-end">
        <SkipChip question={question} onSkip={onSkip} />
      </div>
    </form>
  );
}

function UploadInput({ question, current, onAnswer, onSkip }: InputProps) {
  // No storage yet, so a previous answer is just file names.
  const [files, setFiles] = useState<FileLike[]>(
    Array.isArray(current) ? current.map((name) => ({ name, type: "image/", size: 0 })) : [],
  );
  const [errors, setErrors] = useState<string[]>([]);
  const inputId = useId();

  return (
    <div className="flex flex-col gap-2">
      <input
        id={inputId}
        type="file"
        accept="image/*"
        multiple
        className="sr-only"
        onChange={(e) => {
          const picked = Array.from(e.target.files ?? []);
          const result = addImageFiles(files, picked);
          setFiles(result.files);
          setErrors(result.errors);
          // Allows picking the same file again after removing it.
          e.target.value = "";
        }}
      />
      {files.length > 0 && (
        <ul className="flex flex-col gap-1">
          {files.map((f, i) => (
            <li
              key={`${f.name}-${i}`}
              className="flex items-center justify-between gap-2 rounded-lg bg-background px-3 py-1.5 text-sm ring-1 ring-foreground/10"
            >
              <span className="truncate">{f.name}</span>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Remove ${f.name}`}
                onClick={() => {
                  setFiles(files.filter((_, j) => j !== i));
                  setErrors([]);
                }}
              >
                <X />
              </Button>
            </li>
          ))}
        </ul>
      )}
      {errors.length > 0 && (
        <ul role="alert" className="text-sm text-destructive">
          {errors.map((err, i) => (
            <li key={i}>{err}</li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <label
          htmlFor={inputId}
          className={cn(
            "inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-full border bg-background px-4 text-sm font-medium hover:bg-muted",
            files.length >= MAX_IMAGES && "pointer-events-none opacity-50",
          )}
        >
          <ImagePlus className="size-4" />
          {files.length ? "Add more" : "Add photos"}
        </label>
        <Button
          className={chip}
          disabled={files.length === 0}
          onClick={() => onAnswer(files.map((f) => f.name))}
        >
          Done
        </Button>
        <SkipChip question={question} onSkip={onSkip} />
      </div>
      <p className="text-xs text-muted-foreground">
        Up to {MAX_IMAGES} images, 10 MB each. {files.length}/{MAX_IMAGES} selected.
      </p>
    </div>
  );
}

function ContactInput({ current, onAnswer }: InputProps) {
  const initial =
    current && typeof current === "object" && !Array.isArray(current) ? current : mockUser;
  const [contact, setContact] = useState<ContactValue>(initial);
  const [errors, setErrors] = useState<ContactErrors>({});
  const id = useId();

  const fields: { key: keyof ContactValue; label: string; type: string; autoComplete: string }[] = [
    { key: "name", label: "Name", type: "text", autoComplete: "name" },
    { key: "phone", label: "Phone", type: "tel", autoComplete: "tel" },
    { key: "email", label: "Email", type: "email", autoComplete: "email" },
  ];

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        const found = validateContact(contact);
        setErrors(found);
        if (Object.keys(found).length === 0) onAnswer(trimContact(contact));
      }}
    >
      <Card size="sm">
        <CardHeader>
          <CardTitle>Your contact details</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {fields.map((f) => (
            <div key={f.key} className="flex flex-col gap-1">
              <label htmlFor={`${id}-${f.key}`} className="text-xs font-medium">
                {f.label}
              </label>
              <Input
                id={`${id}-${f.key}`}
                type={f.type}
                autoComplete={f.autoComplete}
                value={contact[f.key]}
                aria-invalid={Boolean(errors[f.key])}
                onChange={(e) => setContact({ ...contact, [f.key]: e.target.value })}
                className="h-9"
              />
              {errors[f.key] && <p className="text-xs text-destructive">{errors[f.key]}</p>}
            </div>
          ))}
        </CardContent>
        <CardFooter className="justify-end">
          <Button type="submit" className={chip}>
            Confirm
          </Button>
        </CardFooter>
      </Card>
    </form>
  );
}

/** An AI-suggested answer (e.g. a title): use it, or switch to typing your own. */
function SuggestionInput({
  suggestion,
  onAnswer,
  onWriteOwn,
}: {
  suggestion: string;
  onAnswer: (value: AnswerValue) => void;
  onWriteOwn: () => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      <Button className={chip} onClick={() => onAnswer(suggestion)}>
        Use this
      </Button>
      <Button variant="outline" className={chip} onClick={onWriteOwn}>
        Write my own
      </Button>
    </div>
  );
}

function ConfirmInput({ onConfirm, onChange }: { onConfirm: () => void; onChange: () => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      <Button className={chip} onClick={onConfirm}>
        Yes
      </Button>
      <Button variant="outline" className={chip} onClick={onChange}>
        Change
      </Button>
    </div>
  );
}

export function Composer({
  question,
  current,
  editing,
  confirming,
  suggestion,
  localities,
  onAnswer,
  onSkip,
  onConfirm,
  onChange,
  onCancelEdit,
}: InputProps & {
  editing: boolean;
  /** A parsed price is waiting for Yes or Change. */
  confirming: boolean;
  /** An AI-suggested answer, offered as Use this / Write my own. */
  suggestion?: string;
  localities: readonly string[];
  onConfirm: () => void;
  onChange: () => void;
  onCancelEdit: () => void;
}) {
  const [writingOwn, setWritingOwn] = useState(false);
  const props = { question, current, onAnswer, onSkip };
  const mode = confirming ? "confirm" : suggestion && !writingOwn ? "suggestion" : question.kind;
  let input: React.ReactNode;
  switch (mode) {
    case "confirm":
      input = <ConfirmInput onConfirm={onConfirm} onChange={onChange} />;
      break;
    case "suggestion":
      input = (
        <SuggestionInput
          suggestion={suggestion ?? ""}
          onAnswer={onAnswer}
          onWriteOwn={() => setWritingOwn(true)}
        />
      );
      break;
    case "buttons":
      input = <ButtonsInput {...props} />;
      break;
    case "upload":
      input = <UploadInput {...props} />;
      break;
    case "contact":
      input = <ContactInput {...props} />;
      break;
    default:
      input = <TextLikeInput {...props} localities={localities} />;
  }

  return (
    <div className="sticky bottom-0 border-t bg-muted/80 backdrop-blur">
      <div className="mx-auto flex w-full max-w-xl flex-col gap-2 px-4 py-3">
        {editing && (
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              Editing: <span className="font-medium text-foreground">{question.label}</span>
            </span>
            <Button variant="link" size="xs" onClick={onCancelEdit}>
              Cancel
            </Button>
          </div>
        )}
        {input}
      </div>
    </div>
  );
}
