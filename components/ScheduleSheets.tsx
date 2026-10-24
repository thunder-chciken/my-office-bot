"use client";

import { useState } from "react";
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  CloudRain,
  Mail,
  MapPin,
  MessageSquare,
  Minus,
  Navigation,
  Pencil,
  Phone,
  Plus,
  Users,
  XCircle,
} from "lucide-react";
import { business, type Contact } from "@/lib/data";
import { mapsHref, smsHref, telHref, toE164, useIsApple, type TestTarget } from "@/lib/contact";
import {
  addDays,
  blankEvent,
  dayLabel,
  findConflicts,
  fmtRange,
  fmtTime,
  fromTimeInput,
  homeownerMessage,
  kindLabel,
  lastDay,
  newConflicts,
  nextWorkday,
  people,
  projectDay,
  slots,
  toTimeInput,
  typeLabel,
  whoLabel,
  type ApptKind,
  type Conflict,
  type Crew,
  type EventType,
  type Job,
  type ScheduleEvent,
} from "@/lib/schedule";
import { Segmented, Sheet, Toggle } from "./ui";

export type EditTarget = {
  draft: ScheduleEvent;
  job?: Job;
  mode: "new" | "edit" | "move";
  original?: ScheduleEvent;
};

const when = (e: ScheduleEvent) => {
  if (e.type === "work_block") {
    return `${dayLabel(e.date, "short")} – ${dayLabel(lastDay(e), "short")} · ${fmtRange(e.from, e.to)} each day`;
  }
  if (e.type === "unavailable" && e.from === 0 && e.to >= 24 * 60) return `${dayLabel(e.date)} · All day`;
  return `${dayLabel(e.date)} · ${fmtRange(e.from, e.to)}`;
};

const nameOf = (id: string, contacts: Contact[]) => contacts.find((c) => c.id === id)?.name ?? "Someone";

function ConflictBox({ conflicts, contacts }: { conflicts: Conflict[]; contacts: Contact[] }) {
  return (
    <div className="clash-box" role="alert">
      <p className="clash-title">
        <AlertTriangle size={22} strokeWidth={2.5} /> Double-booked
      </p>
      <ul>
        {conflicts.map((c, i) => (
          <li key={i}>
            <b>{nameOf(c.personId, contacts)}</b> is on {c.event.title} ({dayLabel(c.slot.date)},{" "}
            {fmtRange(c.slot.from, c.slot.to)})
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------- event details

export function EventSheet({
  event,
  job,
  events,
  crews,
  contacts,
  test,
  onClose,
  onMove,
  onEdit,
  onNotify,
  onStatus,
}: {
  event: ScheduleEvent | null;
  job?: Job;
  events: ScheduleEvent[];
  crews: Crew[];
  contacts: Contact[];
  test: TestTarget;
  onClose: () => void;
  onMove: (e: ScheduleEvent) => void;
  onEdit: (e: ScheduleEvent) => void;
  onNotify: (e: ScheduleEvent) => void;
  onStatus: (e: ScheduleEvent, status: ScheduleEvent["status"]) => void;
}) {
  const apple = useIsApple();
  const [confirmCancel, setConfirmCancel] = useState(false);
  const clashes = event ? findConflicts(event, events, crews) : [];
  const phone = test.phone.trim() || job?.phone || "";
  const email = test.email.trim() || job?.email || "";

  return (
    <Sheet
      open={!!event}
      onClose={() => {
        setConfirmCancel(false);
        onClose();
      }}
      title={event ? typeLabel[event.type] : ""}
    >
      {event && (
        <>
          <div className="ev-detail-head">
            <p className="ev-kind">
              {event.kind ? kindLabel[event.kind] : event.type === "work_block" ? `${event.workdays} workdays` : "Time off"}
              {event.status === "confirmed" && <span className="pill pill-ok">Homeowner told</span>}
              {event.status === "done" && <span className="pill">Done</span>}
            </p>
            <h3 className="detail-name">{job ? job.customerName : event.title}</h3>
            {job && <p className="lead-service">{event.title}</p>}
            <p className="ev-when">
              <CalendarClock size={20} strokeWidth={2.4} /> {when(event)}
            </p>
          </div>

          {job && (
            <div className="action-grid">
              <a className="action-tile is-primary" href={telHref(phone)}>
                <Phone size={28} strokeWidth={2.4} /> Call
              </a>
              <a className="action-tile" href={smsHref(phone)}>
                <MessageSquare size={28} strokeWidth={2.4} /> Text
              </a>
              <a className="action-tile" href={email ? `mailto:${email}` : undefined}>
                <Mail size={28} strokeWidth={2.4} /> Email
              </a>
              <a className="action-tile" href={mapsHref(job.address, apple)} target="_blank" rel="noopener noreferrer">
                <Navigation size={28} strokeWidth={2.4} /> Directions
              </a>
            </div>
          )}

          <ul className="card list">
            {job && (
              <li className="row">
                <MapPin size={22} className="row-icon" /> {job.address}
              </li>
            )}
            {event.arrive && (
              <li className="row">
                <CalendarClock size={22} className="row-icon" /> Homeowner told: arrive {fmtRange(event.arrive.from, event.arrive.to)}
              </li>
            )}
            <li className="row">
              <Users size={22} className="row-icon" /> {whoLabel(event, crews, contacts)}
            </li>
          </ul>

          {clashes.length > 0 &&
            (event.overrideReason ? (
              <p className="override-note">
                <AlertTriangle size={20} strokeWidth={2.4} /> Booked over a clash: “{event.overrideReason}”
              </p>
            ) : (
              <ConflictBox conflicts={clashes} contacts={contacts} />
            ))}

          <div className="stack-sm sheet-actions">
            <button className="btn btn-primary btn-block" onClick={() => onMove(event)}>
              {event.type === "work_block" ? <CloudRain size={22} strokeWidth={2.5} /> : <CalendarClock size={22} strokeWidth={2.5} />}
              {event.type === "work_block" ? "Move it (rain day)" : "Reschedule"}
            </button>
            {job && (
              <button className="btn btn-soft btn-block" onClick={() => onNotify(event)}>
                <MessageSquare size={22} strokeWidth={2.5} /> Tell the homeowner
              </button>
            )}
            <div className="btn-row">
              <button className="btn btn-soft" onClick={() => onEdit(event)}>
                <Pencil size={20} strokeWidth={2.5} /> Edit
              </button>
              <button
                className="btn btn-soft"
                onClick={() => onStatus(event, event.status === "done" ? "scheduled" : "done")}
              >
                <CheckCircle2 size={20} strokeWidth={2.5} /> {event.status === "done" ? "Not done" : "Done"}
              </button>
            </div>
            <button
              className={`btn btn-block btn-danger${confirmCancel ? " is-armed" : ""}`}
              onClick={() => {
                if (!confirmCancel) return setConfirmCancel(true);
                setConfirmCancel(false);
                onStatus(event, "canceled");
              }}
            >
              <XCircle size={20} strokeWidth={2.5} /> {confirmCancel ? "Tap again to cancel it" : `Cancel ${typeLabel[event.type].toLowerCase()}`}
            </button>
          </div>
        </>
      )}
    </Sheet>
  );
}

// ---------------------------------------------------------------- create / edit / move

export function EditorSheet({
  target,
  events,
  crews,
  contacts,
  onClose,
  onSave,
}: {
  target: EditTarget | null;
  events: ScheduleEvent[];
  crews: Crew[];
  contacts: Contact[];
  onClose: () => void;
  onSave: (draft: ScheduleEvent, job: Job | undefined, mode: EditTarget["mode"]) => void;
}) {
  const title = !target
    ? ""
    : target.mode === "move"
      ? "Move"
      : target.mode === "edit"
        ? "Edit"
        : target.job
          ? `Schedule ${target.job.customerName.split(" ")[0]}`
          : "New";
  return (
    <Sheet open={!!target} onClose={onClose} title={title}>
      {target && (
        <Editor
          key={`${target.draft.id}-${target.mode}`}
          target={target}
          events={events}
          crews={crews}
          contacts={contacts}
          onSave={onSave}
        />
      )}
    </Sheet>
  );
}

const lengths = [30, 60, 120, 180];
const reasons = ["Short visit — they'll step away", "Someone else covers"];

function Editor({
  target,
  events,
  crews,
  contacts,
  onSave,
}: {
  target: EditTarget;
  events: ScheduleEvent[];
  crews: Crew[];
  contacts: Contact[];
  onSave: (draft: ScheduleEvent, job: Job | undefined, mode: EditTarget["mode"]) => void;
}) {
  const { mode, original } = target;
  const [draft, setDraft] = useState(target.draft);
  const [job, setJob] = useState<Job | undefined>(
    target.job ?? (mode === "new" && target.draft.type !== "unavailable" ? blankJob() : undefined),
  );
  const [reason, setReason] = useState(target.draft.overrideReason ?? "");
  const set = (patch: Partial<ScheduleEvent>) => setDraft((d) => ({ ...d, ...patch }));

  const needsCustomer = draft.type !== "unavailable" && !target.job && mode === "new";
  const conflicts =
    mode === "move" && original ? newConflicts(original, draft, events, crews) : findConflicts(draft, events, crews);
  const nobody = people(draft, crews).length === 0;
  const valid =
    draft.to > draft.from &&
    !!draft.date &&
    (draft.type !== "unavailable" || !nobody) &&
    (!needsCustomer || !!job?.customerName.trim()) &&
    (draft.type !== "work_block" || !!draft.title.trim()) &&
    (conflicts.length === 0 || !!reason.trim());

  const changeType = (type: EventType) => {
    const fresh = blankEvent(type, draft.date);
    setDraft({ ...fresh, id: draft.id, jobId: draft.jobId, crewIds: draft.crewIds, personIds: draft.personIds, title: type === "work_block" ? (job?.title ?? "") : fresh.title });
    if (type !== "unavailable" && mode === "new" && !target.job && !job) setJob(blankJob());
  };

  const toggleIn = (key: "crewIds" | "personIds", id: string) =>
    set({ [key]: draft[key].includes(id) ? draft[key].filter((x) => x !== id) : [...draft[key], id] });

  const save = () => {
    const title = draft.type === "appointment" && draft.kind ? kindLabel[draft.kind] : draft.title.trim() || "Time off";
    const kept = draft.type === "unavailable" ? undefined : job;
    const finalJob = kept && needsCustomer ? { ...kept, title: kept.title || title } : kept;
    const overrideReason = conflicts.length ? reason.trim() : draft.overrideReason;
    onSave({ ...draft, title, jobId: finalJob?.id, overrideReason }, finalJob, mode);
  };

  const length = draft.to - draft.from;

  return (
    <div className="form">
      {mode === "move" && original && (
        <p className="move-from">
          Now: <b>{when(original)}</b>
        </p>
      )}

      {mode === "new" && (
        <Segmented
          label="What are you scheduling"
          value={draft.type}
          onChange={changeType}
          options={(["appointment", "work_block", "unavailable"] as EventType[]).map((t) => ({ value: t, label: typeLabel[t] }))}
        />
      )}

      {mode !== "move" && draft.type === "appointment" && (
        <div className="chip-row">
          {(Object.keys(kindLabel) as ApptKind[]).map((k) => (
            <button key={k} className="chip" aria-pressed={draft.kind === k} onClick={() => set({ kind: k })}>
              {kindLabel[k]}
            </button>
          ))}
        </div>
      )}

      {needsCustomer && job && (
        <>
          <label className="field">
            <span>Customer</span>
            <input value={job.customerName} onChange={(e) => setJob({ ...job, customerName: e.target.value })} autoComplete="off" />
          </label>
          <label className="field">
            <span>Phone</span>
            <input value={job.phone} inputMode="tel" onChange={(e) => setJob({ ...job, phone: e.target.value })} />
          </label>
          <label className="field">
            <span>Address</span>
            <input value={job.address} onChange={(e) => setJob({ ...job, address: e.target.value })} />
          </label>
        </>
      )}

      {mode !== "move" && draft.type !== "appointment" && (
        <label className="field">
          <span>{draft.type === "work_block" ? "What's the job?" : "Note"}</span>
          <input
            value={draft.title}
            placeholder={draft.type === "work_block" ? "Roof replacement" : "Time off"}
            onChange={(e) => {
              set({ title: e.target.value });
              if (job && draft.type === "work_block" && needsCustomer) setJob({ ...job, title: e.target.value });
            }}
          />
        </label>
      )}

      {mode === "move" && (
        <div className="chip-row">
          <button className="chip" onClick={() => set({ date: nextWorkday(draft.date, draft.skipWeekends) })}>
            <CloudRain size={18} strokeWidth={2.5} /> Next workday
          </button>
          <button className="chip" onClick={() => set({ date: addDays(draft.date, 7) })}>
            + 1 week
          </button>
          {original && draft.date !== original.date && (
            <button className="chip" onClick={() => set({ date: original.date, from: original.from, to: original.to })}>
              Undo
            </button>
          )}
        </div>
      )}

      <div className="field-row">
        <label className="field">
          <span>{draft.type === "work_block" ? "First day" : "Day"}</span>
          <input type="date" value={draft.date} onChange={(e) => e.target.value && set({ date: e.target.value })} />
        </label>
        {draft.type !== "work_block" && !(draft.type === "unavailable" && length >= 24 * 60) && (
          <label className="field">
            <span>Starts</span>
            <input
              type="time"
              step={900}
              value={toTimeInput(draft.from)}
              onChange={(e) => {
                if (!e.target.value) return;
                const from = fromTimeInput(e.target.value);
                set({ from, to: Math.min(from + length, 24 * 60), arrive: draft.arrive ? { from, to: from + (draft.arrive.to - draft.arrive.from) } : undefined });
              }}
            />
          </label>
        )}
      </div>

      {draft.type === "appointment" && mode !== "move" && (
        <>
          <div className="field">
            <span>How long</span>
            <div className="chip-row">
              {lengths.map((m) => (
                <button key={m} className="chip" aria-pressed={length === m} onClick={() => set({ to: Math.min(draft.from + m, 24 * 60) })}>
                  {m < 60 ? `${m} min` : `${m / 60} hr${m > 60 ? "s" : ""}`}
                </button>
              ))}
            </div>
          </div>
          <div className="field">
            <span>Arrival window you tell the homeowner</span>
            <div className="chip-row">
              <button className="chip" aria-pressed={!draft.arrive} onClick={() => set({ arrive: undefined })}>
                At {fmtTime(draft.from)}
              </button>
              {[120, 240].map((w) => (
                <button
                  key={w}
                  className="chip"
                  aria-pressed={draft.arrive?.to === draft.from + w && draft.arrive?.from === draft.from}
                  onClick={() => set({ arrive: { from: draft.from, to: Math.min(draft.from + w, 24 * 60) } })}
                >
                  {fmtRange(draft.from, draft.from + w)}
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      {draft.type === "work_block" && (
        <>
          <div className="field">
            <span>Workdays</span>
            <div className="stepper">
              <button aria-label="Fewer days" onClick={() => set({ workdays: Math.max(1, draft.workdays - 1) })}>
                <Minus size={24} strokeWidth={2.6} />
              </button>
              <b>
                {draft.workdays} day{draft.workdays > 1 ? "s" : ""}
              </b>
              <button aria-label="More days" onClick={() => set({ workdays: Math.min(30, draft.workdays + 1) })}>
                <Plus size={24} strokeWidth={2.6} />
              </button>
            </div>
          </div>
          {mode !== "move" && (
            <>
              <div className="field-row">
                <label className="field">
                  <span>Crew starts</span>
                  <input type="time" step={900} value={toTimeInput(draft.from)} onChange={(e) => e.target.value && set({ from: fromTimeInput(e.target.value) })} />
                </label>
                <label className="field">
                  <span>Wraps up</span>
                  <input type="time" step={900} value={toTimeInput(draft.to)} onChange={(e) => e.target.value && set({ to: fromTimeInput(e.target.value) })} />
                </label>
              </div>
              <div className="toggle-row">
                <span>Skip weekends</span>
                <Toggle label="Skip weekends" checked={draft.skipWeekends} onChange={(v) => set({ skipWeekends: v })} />
              </div>
            </>
          )}
          <p className="muted span-note">
            {dayLabel(slots(draft)[0]!.date, "short")} – {dayLabel(lastDay(draft), "short")}, {fmtRange(draft.from, draft.to)} each day. Nights stay free.
          </p>
        </>
      )}

      {draft.type === "unavailable" && (
        <div className="toggle-row">
          <span>All day</span>
          <Toggle
            label="All day"
            checked={length >= 24 * 60}
            onChange={(v) => set(v ? { from: 0, to: 24 * 60 } : { from: 9 * 60, to: 12 * 60 })}
          />
        </div>
      )}
      {draft.type === "unavailable" && length < 24 * 60 && (
        <label className="field">
          <span>Until</span>
          <input type="time" step={900} value={toTimeInput(draft.to)} onChange={(e) => e.target.value && set({ to: fromTimeInput(e.target.value) })} />
        </label>
      )}

      {mode !== "move" && (
        <div className="field">
          <span>{draft.type === "unavailable" ? "Who's out" : "Who's going"}</span>
          <div className="chip-row">
            {draft.type !== "unavailable" &&
              crews.map((c) => (
                <button key={c.id} className="chip" aria-pressed={draft.crewIds.includes(c.id)} onClick={() => toggleIn("crewIds", c.id)}>
                  <i className="crew-dot" style={{ background: c.color }} /> {c.name}
                </button>
              ))}
            {contacts.map((c) => (
              <button key={c.id} className="chip" aria-pressed={draft.personIds.includes(c.id)} onClick={() => toggleIn("personIds", c.id)}>
                {c.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {conflicts.length > 0 && (
        <>
          <ConflictBox conflicts={conflicts} contacts={contacts} />
          <div className="field">
            <span>Book anyway? Say why</span>
            <div className="chip-row">
              {reasons.map((r) => (
                <button key={r} className="chip" aria-pressed={reason === r} onClick={() => setReason(r)}>
                  {r}
                </button>
              ))}
            </div>
            <input className="reason-input" value={reason} placeholder="Or type a reason" onChange={(e) => setReason(e.target.value)} />
          </div>
        </>
      )}
      {draft.type !== "unavailable" && nobody && <p className="muted">Nobody assigned yet. You can add someone later.</p>}

      <button className="btn btn-primary btn-block btn-xl" disabled={!valid} onClick={save}>
        {conflicts.length > 0 ? "Book anyway" : mode === "move" ? "Move it" : mode === "edit" ? "Save" : "Book it"}
      </button>
    </div>
  );
}

function blankJob(): Job {
  return { id: `j${Date.now().toString(36)}`, title: "", customerName: "", phone: "", email: "", address: "", status: "open" };
}

// ---------------------------------------------------------------- tell the homeowner

export function NotifySheet({
  target,
  job,
  crews,
  contacts,
  test,
  onClose,
  onSent,
}: {
  target: { event: ScheduleEvent; moved: boolean } | null;
  job?: Job;
  crews: Crew[];
  contacts: Contact[];
  test: TestTarget;
  onClose: () => void;
  onSent: (e: ScheduleEvent, how: "text" | "email") => void;
}) {
  const e = target?.event;
  const msg = e && job ? homeownerMessage(e, job, business.name, target.moved) : "";
  const phone = test.phone.trim() || job?.phone || "";
  const email = test.email.trim() || job?.email || "";
  const staff = e ? people(e, crews).map((id) => nameOf(id, contacts)) : [];
  const first = job?.customerName.split(" ")[0] ?? "them";
  const testing = !!(test.phone.trim() || test.email.trim());

  return (
    <Sheet open={!!target} onClose={onClose} title={target?.moved ? "Moved" : "Booked"}>
      {e && (
        <>
          <div className="notify-head">
            <CheckCircle2 size={40} strokeWidth={2.4} />
            <div>
              <p className="card-lead">{job ? `${job.customerName} — ${e.title}` : e.title}</p>
              <p className="muted">{when(e)}</p>
              {e.type === "work_block" && <p className="muted">{projectDay(e, e.date)} starts {dayLabel(e.date)}</p>}
            </div>
          </div>

          <h4 className="sub-title">Your team</h4>
          <p className="notify-line">
            <Users size={22} strokeWidth={2.4} />
            {staff.length
              ? `${staff.join(", ")} will see it in the schedule email the evening before.`
              : "Nobody is assigned yet, so no team email goes out."}
          </p>

          {job && (
            <>
              <h4 className="sub-title">The homeowner</h4>
              <p className="muted notify-explain">
                Nothing goes to {first} until you tap below. It sends from your own phone, so it comes from your number.
              </p>
              <div className="bubble">
                <p className="bubble-label">Message</p>
                <p className="bubble-text">{msg}</p>
              </div>
              {testing && <p className="test-note">Test mode: this goes to you, not {first}</p>}
              <div className="stack-sm sheet-actions">
                <a
                  className={`btn btn-primary btn-block${toE164(phone) ? "" : " is-disabled"}`}
                  href={toE164(phone) ? smsHref(phone, msg) : undefined}
                  onClick={() => onSent(e, "text")}
                >
                  <MessageSquare size={22} strokeWidth={2.5} /> Text {first}
                </a>
                {email && (
                  <a
                    className="btn btn-soft btn-block"
                    href={`mailto:${email}?subject=${encodeURIComponent(`Your ${e.title.toLowerCase()} with ${business.name}`)}&body=${encodeURIComponent(msg)}`}
                    onClick={() => onSent(e, "email")}
                  >
                    <Mail size={22} strokeWidth={2.5} /> Email instead
                  </a>
                )}
              </div>
            </>
          )}
          <button className="btn btn-soft btn-block notify-done" onClick={onClose}>
            {job ? "Not now" : "Done"}
          </button>
        </>
      )}
    </Sheet>
  );
}
