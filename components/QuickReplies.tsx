"use client";

import { useRef, useState } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { MAX_REPLIES, MAX_REPLY_LENGTH, fillReply } from "@/lib/data";
import { repliesFor, useAccount } from "@/lib/account";
import { Header } from "./ui";

// Your own quick text replies (D58): up to 10, in your words. {name} becomes the customer's first name.
// Tapping one on a lead opens the phone's Messages with the text ready, same as the built-in ones.

// Its own page: in the dashboard sidebar, and under Business on phones.
export function RepliesScreen({ onSave }: { onSave: (replies: string[] | null) => Promise<boolean> }) {
  const account = useAccount();
  return (
    <>
      <Header title="Quick replies" subtitle="Texts you send to a customer with one tap" />
      <div className="card pad">
        <p className="card-lead">
          {account.quickReplies === null ? "Start from these, or write your own" : `Your replies · ${account.quickReplies.length} of 10`}
        </p>
        <QuickRepliesForm onSave={onSave} />
      </div>
    </>
  );
}

export function QuickRepliesForm({ onSave }: { onSave: (replies: string[] | null) => Promise<boolean> }) {
  const account = useAccount();
  const start = repliesFor(account);
  const [draft, setDraft] = useState(start);
  const [busy, setBusy] = useState(false);
  const boxes = useRef<(HTMLTextAreaElement | null)[]>([]);

  const cleaned = draft.map((r) => r.trim()).filter(Boolean);
  const changed = cleaned.join("\n") !== start.join("\n");
  const set = (i: number, text: string) => setDraft((d) => d.map((r, j) => (j === i ? text : r)));
  const move = (i: number, by: -1 | 1) =>
    setDraft((d) => {
      const next = [...d];
      [next[i], next[i + by]] = [next[i + by]!, next[i]!];
      return next;
    });
  const add = () => {
    setDraft((d) => [...d, ""]);
    requestAnimationFrame(() => boxes.current[draft.length]?.focus());
  };

  const save = async (replies: string[] | null) => {
    setBusy(true);
    const ok = await onSave(replies);
    setBusy(false);
    if (ok) setDraft(replies ?? repliesFor({ ...account, quickReplies: null }));
  };

  return (
    <div className="form replies-form">
      <p className="muted">
        Write them the way you talk. Type <b>{"{name}"}</b> and we&apos;ll fill in the customer&apos;s first name.
      </p>

      <ol className="reply-edit-list">
        {draft.map((text, i) => (
          <li key={i} className="reply-edit">
            <textarea
              ref={(el) => {
                boxes.current[i] = el;
              }}
              className="beta-textarea"
              rows={2}
              maxLength={MAX_REPLY_LENGTH}
              value={text}
              onChange={(e) => set(i, e.target.value)}
              placeholder="Thanks {name}! I'll stop by around 4 today."
              aria-label={`Quick reply ${i + 1}`}
            />
            {/\{name\}/i.test(text) && <p className="reply-preview">Sends as: {fillReply(text, "Dana")}</p>}
            <div className="reply-edit-tools">
              {text.length > MAX_REPLY_LENGTH - 60 && (
                <span className="muted reply-count">
                  {text.length}/{MAX_REPLY_LENGTH}
                </span>
              )}
              <button className="icon-btn" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up">
                <ArrowUp size={20} strokeWidth={2.4} />
              </button>
              <button className="icon-btn" onClick={() => move(i, 1)} disabled={i === draft.length - 1} aria-label="Move down">
                <ArrowDown size={20} strokeWidth={2.4} />
              </button>
              <button className="icon-btn is-danger" onClick={() => setDraft((d) => d.filter((_, j) => j !== i))} aria-label="Delete this reply">
                <Trash2 size={20} strokeWidth={2.4} />
              </button>
            </div>
          </li>
        ))}
      </ol>

      {draft.length < MAX_REPLIES ? (
        <button className="btn btn-soft btn-block" onClick={add}>
          <Plus size={22} strokeWidth={2.5} /> Add a reply ({draft.length} of {MAX_REPLIES})
        </button>
      ) : (
        <p className="muted center-note">That&apos;s 10, the most you can have. Delete one to add another.</p>
      )}

      <button className="btn btn-primary btn-block" disabled={!changed || busy} onClick={() => save(cleaned)}>
        {busy ? "Saving…" : changed ? "Save replies" : "Saved"}
      </button>
      {account.quickReplies !== null && (
        <button className="text-btn reply-reset" disabled={busy} onClick={() => save(null)}>
          Go back to the built-in replies
        </button>
      )}
    </div>
  );
}
