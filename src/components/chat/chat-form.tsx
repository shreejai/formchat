"use client";

import { useEffect, useReducer, useRef } from "react";
import type { FormSchema } from "@/forms/types";
import { Composer } from "./composer";
import { Confirmation, SubmissionPreview } from "./confirmation";
import { ChatHeader } from "./header";
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

  const askingKey = view.mode === "ask" ? view.question.key : null;
  useEffect(() => {
    if (askingKey) bottomRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [askingKey]);

  const edit = (key: string) => dispatch({ type: "startEdit", key });

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
            editingKey={state.editingKey}
            onEdit={edit}
          />
        )}
        <div ref={bottomRef} />
      </main>
      {(view.mode === "ask" || view.mode === "edit") && (
        <Composer
          // Remount per question so drafts don't carry over.
          key={`${view.mode}-${view.question.key}`}
          question={view.question}
          current={view.current}
          editing={view.mode === "edit"}
          localities={localities}
          onAnswer={(value) => dispatch({ type: "answer", key: view.question.key, value })}
          onSkip={() => dispatch({ type: "skip", key: view.question.key })}
          onCancelEdit={() => dispatch({ type: "cancelEdit" })}
        />
      )}
    </div>
  );
}
