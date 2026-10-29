"use client";

import { useEffect, useReducer, useRef, useState } from "react";
import type { AnswerValue, FormSchema } from "@/forms/types";
import { Composer } from "./composer";
import { Confirmation, SubmissionPreview } from "./confirmation";
import { describeAnswer } from "./describe";
import { ChatHeader } from "./header";
import { suggestionMessage } from "./messages";
import { chatReducer, chatView, initialChatState, type ChatAction, type ChatState } from "./state";
import { Transcript } from "./transcript";

export function ChatForm({
  schema,
  localities,
}: {
  schema: FormSchema;
  localities: readonly string[];
}) {
  const [state, dispatch] = useReducer(
    (s: ChatState, a: ChatAction) => chatReducer(schema, s, a),
    initialChatState,
  );
  const view = chatView(schema, state);
  const bottomRef = useRef<HTMLDivElement>(null);
  // Client-generated on first use (not during prerender), so the server's per-conversation
  // token cap is best effort; the per-IP rate limit is the real control.
  const conversationId = useRef<string | null>(null);
  /** A description being checked by the server, shown with a typing indicator. */
  const [checking, setChecking] = useState<string | null>(null);

  const asking = view.mode === "ask" || view.mode === "edit" ? view : null;
  const reply: { input?: string; message?: string; typing?: boolean } | undefined = checking
    ? { input: checking, typing: true }
    : asking?.pendingPrice
      ? { input: asking.pendingPrice.input, message: asking.pendingPrice.message }
      : asking?.notice
        ? asking.notice
        : asking?.suggestion
          ? { message: suggestionMessage(asking.suggestion) }
          : undefined;

  const askingKey = view.mode === "ask" ? view.question.key : null;
  const replyMessage = reply?.message;
  useEffect(() => {
    if (askingKey || replyMessage || checking) {
      bottomRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
    }
  }, [askingKey, replyMessage, checking]);

  // No edits while a description is being checked, so the reply lands on the right question.
  const edit = (key: string) => {
    if (!checking) dispatch({ type: "startEdit", key });
  };

  async function answer(key: string, value: AnswerValue) {
    if (asking?.question.kind !== "longtext" || typeof value !== "string") {
      dispatch({ type: "answer", key, value });
      return;
    }
    conversationId.current ??= crypto.randomUUID();
    setChecking(value);
    try {
      dispatch(await describeAnswer(key, value, conversationId.current));
    } finally {
      setChecking(null);
    }
  }

  return (
    <div className="flex min-h-dvh flex-col bg-muted/40">
      <ChatHeader
        section={view.mode === "ask" || view.mode === "edit" ? view.section : undefined}
        progress={view.progress}
      />
      <main className="mx-auto w-full max-w-xl flex-1 px-4 py-4">
        {view.mode === "review" && (
          <Confirmation
            schema={schema}
            answers={state.answers}
            onEdit={edit}
            onSubmit={() => dispatch({ type: "submit" })}
          />
        )}
        {view.mode === "submitted" && (
          <SubmissionPreview payload={view.payload} onBack={() => dispatch({ type: "reopen" })} />
        )}
        {(view.mode === "ask" || view.mode === "edit") && (
          <Transcript
            schema={schema}
            answers={state.answers}
            pending={view.mode === "ask" ? view.question : undefined}
            reply={reply}
            editingKey={state.editingKey}
            onEdit={edit}
          />
        )}
        <div ref={bottomRef} />
      </main>
      {(view.mode === "ask" || view.mode === "edit") && !checking && (
        <Composer
          // Remount per question so drafts don't carry over.
          key={`${view.mode}-${view.question.key}`}
          question={view.question}
          current={view.current}
          editing={view.mode === "edit"}
          confirming={Boolean(view.pendingPrice)}
          suggestion={view.suggestion}
          rejected={view.notice?.input}
          localities={localities}
          onAnswer={(value) => answer(view.question.key, value)}
          onSkip={() => dispatch({ type: "skip", key: view.question.key })}
          onConfirm={() => dispatch({ type: "confirmPrice" })}
          onChange={() => dispatch({ type: "changePrice" })}
          onCancelEdit={() => dispatch({ type: "cancelEdit" })}
        />
      )}
    </div>
  );
}
