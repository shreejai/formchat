"use client";

import { useEffect, useReducer, useRef, useState, useSyncExternalStore } from "react";
import type { AnswerValue, FormSchema } from "@/forms/types";
import { Composer } from "./composer";
import { Confirmation, SubmissionPreview, SubmissionSuccess } from "./confirmation";
import { describeAnswer, newConversationId } from "./describe";
import { ChatHeader } from "./header";
import { suggestionMessage } from "./messages";
import { chatReducer, chatView, initialChatState, type ChatAction, type ChatState } from "./state";
import { submitListing, submitUnavailable } from "./submit";
import { Transcript } from "./transcript";

const noSubscribe = () => () => {};
/** `?debug=1` shows the payload under the success screen. Read on the client only. */
const isDebug = () => new URLSearchParams(window.location.search).get("debug") === "1";

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
  // Client-generated on first use (not during prerender), so the server's per-conversation
  // token cap is best effort; the per-IP rate limit is the real control.
  const conversationId = useRef<string | null>(null);
  /** A description being checked by the server, shown with a typing indicator. */
  const [checking, setChecking] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const debug = useSyncExternalStore(noSubscribe, isDebug, () => false);

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
  // Scroll the page to its very end, not a sentinel into view: the composer is sticky at the
  // bottom, so aligning a sentinel with the viewport's bottom edge leaves the new question
  // hidden behind it. At the true end the composer sits below the transcript instead.
  useEffect(() => {
    if (askingKey || replyMessage || checking) {
      window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "smooth" });
    }
  }, [askingKey, replyMessage, checking]);

  // No edits while a description is being checked, so the reply lands on the right question.
  const edit = (key: string) => {
    if (checking || sending) return;
    setSubmitError(null);
    dispatch({ type: "startEdit", key });
  };

  async function submit() {
    if (sending) return;
    // Both are set once the description is accepted, which every complete listing has.
    const id = conversationId.current;
    if (!id || !state.pdescToken) {
      setSubmitError(submitUnavailable);
      return;
    }
    setSending(true);
    setSubmitError(null);
    try {
      const result = await submitListing({
        conversationId: id,
        answers: state.answers,
        pdescToken: state.pdescToken,
        needsReview: state.needsReview,
        costUsd: state.aiCostUsd,
        attempts: state.attempts,
      });
      if (result.ok) dispatch({ type: "submit" });
      else setSubmitError(result.message);
    } finally {
      setSending(false);
    }
  }

  async function answer(key: string, value: AnswerValue) {
    if (asking?.question.kind !== "longtext" || typeof value !== "string") {
      dispatch({ type: "answer", key, value });
      return;
    }
    conversationId.current ??= newConversationId();
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
            sending={sending}
            error={submitError}
            onEdit={edit}
            onSubmit={submit}
          />
        )}
        {view.mode === "submitted" && (
          <div className="flex flex-col gap-3">
            <SubmissionSuccess />
            {debug && (
              <SubmissionPreview payload={view.payload} onBack={() => dispatch({ type: "reopen" })} />
            )}
          </div>
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
