"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { AlertTriangle, CalendarPlus, ChevronLeft, ChevronRight, Hammer, Plus } from "lucide-react";
import type { Contact, Lead } from "@/lib/data";
import {
  addDays,
  dayLabel,
  eventsOn,
  findConflicts,
  fmtRange,
  fmtTime,
  isWeekend,
  kindLabel,
  parseKey,
  projectDay,
  todayKey,
  weekStart,
  whoLabel,
  type Crew,
  type Job,
  type ScheduleEvent,
} from "@/lib/schedule";
import { Header, Segmented } from "./ui";

type View = "day" | "week" | "list" | "todo";

export function ScheduleScreen({
  events,
  jobs,
  crews,
  contacts,
  leads,
  onOpenEvent,
  onNew,
  onScheduleJob,
  onScheduleLead,
}: {
  events: ScheduleEvent[];
  jobs: Job[];
  crews: Crew[];
  contacts: Contact[];
  leads: Lead[];
  onOpenEvent: (id: string) => void;
  onNew: (date: string) => void;
  onScheduleJob: (job: Job) => void;
  onScheduleLead: (lead: Lead) => void;
}) {
  const [view, setView] = useState<View>("day");
  const [day, setDay] = useState(todayKey);

  const live = events.filter((e) => e.status !== "canceled");
  const unscheduledJobs = jobs.filter((j) => j.status === "open" && !live.some((e) => e.jobId === j.id));
  const readyLeads = leads.filter((l) => l.status === "contacted" && !jobs.some((j) => j.leadId === l.id));
  const todoCount = unscheduledJobs.length + readyLeads.length;

  const card = (e: ScheduleEvent, key: string) => (
    <EventCard
      key={`${e.id}-${key}`}
      event={e}
      dayKey={key}
      job={jobs.find((j) => j.id === e.jobId)}
      crews={crews}
      contacts={contacts}
      clash={findConflicts(e, events, crews).length > 0 && !e.overrideReason}
      onOpen={() => onOpenEvent(e.id)}
    />
  );

  return (
    <>
      <Header
        title="Schedule"
        subtitle={dayLabel(todayKey()) + " · " + parseKey(todayKey()).toLocaleDateString("en-US", { month: "long", day: "numeric" })}
        action={
          <button className="round-btn" onClick={() => onNew(view === "day" ? day : todayKey())} aria-label="New">
            <Plus size={30} strokeWidth={2.6} />
          </button>
        }
      />

      <Segmented
        label="Schedule view"
        value={view}
        onChange={(v) => {
          setView(v);
          if (v === "day") setDay(todayKey());
        }}
        options={[
          { value: "day", label: "Today" },
          { value: "week", label: "Week" },
          { value: "list", label: "List" },
          { value: "todo", label: "To do", count: todoCount },
        ]}
      />

      {view === "day" && (
        <>
          <WeekStrip day={day} onPick={setDay} events={live} />
          <div className="day-head">
            <h2 className="day-title">{dayLabel(day)}</h2>
            <button className="text-btn" onClick={() => onNew(day)}>
              <CalendarPlus size={20} strokeWidth={2.4} /> Add
            </button>
          </div>
          <div className="stack">
            <AnimatePresence initial={false} mode="popLayout">
              {eventsOn(day, live).map((e) => card(e, day))}
            </AnimatePresence>
            {eventsOn(day, live).length === 0 && (
              <p className="empty">{isWeekend(day) ? "Weekend — nothing booked." : "Nothing booked. Tap Add to schedule."}</p>
            )}
          </div>
        </>
      )}

      {view === "week" && <WeekView day={day} setDay={setDay} live={live} card={card} />}

      {view === "list" && (
        <div className="stack">
          {Array.from({ length: 21 }, (_, i) => addDays(todayKey(), i))
            .filter((k) => eventsOn(k, live).length > 0)
            .map((k) => (
              <section key={k}>
                <h3 className="list-day">{dayLabel(k)}</h3>
                <div className="stack-sm">{eventsOn(k, live).map((e) => card(e, k))}</div>
              </section>
            ))}
          {live.length === 0 && <p className="empty">Nothing coming up.</p>}
        </div>
      )}

      {view === "todo" && (
        <div className="stack">
          {readyLeads.map((l) => (
            <div key={l.id} className="card pad todo-card">
              <p className="todo-tag">Replied lead</p>
              <p className="card-lead">{l.name}</p>
              <p className="lead-service">{l.service}</p>
              <p className="muted truncate">{l.address}</p>
              <button className="btn btn-primary btn-block todo-btn" onClick={() => onScheduleLead(l)}>
                <CalendarPlus size={22} strokeWidth={2.5} /> Schedule visit
              </button>
            </div>
          ))}
          {unscheduledJobs.map((j) => (
            <div key={j.id} className="card pad todo-card">
              <p className="todo-tag">Job without a date</p>
              <p className="card-lead">{j.customerName}</p>
              <p className="lead-service">{j.title}</p>
              <p className="muted truncate">{j.address}</p>
              <button className="btn btn-soft btn-block todo-btn" onClick={() => onScheduleJob(j)}>
                <Hammer size={22} strokeWidth={2.5} /> Schedule it
              </button>
            </div>
          ))}
          {todoCount === 0 && <p className="empty">Everything is on the calendar.</p>}
        </div>
      )}
    </>
  );
}

function WeekStrip({ day, onPick, events }: { day: string; onPick: (k: string) => void; events: ScheduleEvent[] }) {
  const mon = weekStart(day);
  const days = Array.from({ length: 7 }, (_, i) => addDays(mon, i));
  const today = todayKey();
  return (
    <div className="week-strip">
      <button className="strip-arrow" onClick={() => onPick(addDays(day, -7))} aria-label="Previous week">
        <ChevronLeft size={24} strokeWidth={2.5} />
      </button>
      {days.map((k) => {
        const d = parseKey(k);
        const busy = eventsOn(k, events).length;
        return (
          <button
            key={k}
            className={`strip-day${k === day ? " is-active" : ""}${k === today ? " is-today" : ""}`}
            aria-pressed={k === day}
            aria-label={`${dayLabel(k)}${busy ? `, ${busy} booked` : ""}`}
            onClick={() => onPick(k)}
          >
            <span className="strip-wd">{d.toLocaleDateString("en-US", { weekday: "narrow" })}</span>
            <span className="strip-num">{d.getDate()}</span>
            <span className={`strip-dot${busy ? " is-on" : ""}`} />
          </button>
        );
      })}
      <button className="strip-arrow" onClick={() => onPick(addDays(day, 7))} aria-label="Next week">
        <ChevronRight size={24} strokeWidth={2.5} />
      </button>
    </div>
  );
}

function WeekView({
  day,
  setDay,
  live,
  card,
}: {
  day: string;
  setDay: (k: string) => void;
  live: ScheduleEvent[];
  card: (e: ScheduleEvent, key: string) => React.ReactNode;
}) {
  const mon = weekStart(day);
  const fmt = (k: string) => parseKey(k).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return (
    <>
      <div className="week-nav">
        <button className="strip-arrow" onClick={() => setDay(addDays(day, -7))} aria-label="Previous week">
          <ChevronLeft size={24} strokeWidth={2.5} />
        </button>
        <span>
          {fmt(mon)} – {fmt(addDays(mon, 6))}
        </span>
        <button className="strip-arrow" onClick={() => setDay(addDays(day, 7))} aria-label="Next week">
          <ChevronRight size={24} strokeWidth={2.5} />
        </button>
      </div>
      <div className="stack">
        {Array.from({ length: 7 }, (_, i) => addDays(mon, i)).map((k) => {
          const list = eventsOn(k, live);
          if (isWeekend(k) && list.length === 0) return null;
          return (
            <section key={k}>
              <h3 className={`list-day${k === todayKey() ? " is-today" : ""}`}>{dayLabel(k, "short")}</h3>
              <div className="stack-sm">
                {list.map((e) => card(e, k))}
                {list.length === 0 && <p className="muted week-free">Open</p>}
              </div>
            </section>
          );
        })}
      </div>
    </>
  );
}

function EventCard({
  event: e,
  dayKey,
  job,
  crews,
  contacts,
  clash,
  onOpen,
}: {
  event: ScheduleEvent;
  dayKey: string;
  job?: Job;
  crews: Crew[];
  contacts: Contact[];
  clash: boolean;
  onOpen: () => void;
}) {
  const color =
    e.type === "unavailable" ? "#7D8A9C" : (crews.find((c) => e.crewIds.includes(c.id))?.color ?? "#0A6CFF");
  const allDay = e.type === "unavailable" && e.from === 0 && e.to >= 24 * 60;
  const label =
    e.type === "appointment" && e.kind ? kindLabel[e.kind] : e.type === "work_block" ? projectDay(e, dayKey) : "Time off";

  return (
    <motion.button
      layout
      className={`ev-card${e.status === "done" ? " is-done" : ""}`}
      style={{ "--ev": color } as React.CSSProperties}
      onClick={onOpen}
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.97 }}
      transition={{ type: "spring", bounce: 0, duration: 0.3 }}
    >
      <span className="ev-time">
        {allDay ? (
          <b>All day</b>
        ) : (
          <>
            <b>{fmtTime(e.from)}</b>
            <span>{fmtTime(e.to)}</span>
          </>
        )}
      </span>
      <span className="ev-body">
        <span className="ev-kind">
          {label}
          {e.status === "confirmed" && <span className="pill pill-ok">Confirmed</span>}
          {e.status === "done" && <span className="pill">Done</span>}
        </span>
        <span className="ev-title">{job ? `${job.customerName} — ${e.title}` : e.title}</span>
        {job && <span className="ev-sub truncate">{job.address}</span>}
        {e.arrive && <span className="ev-sub">Told homeowner: arrive {fmtRange(e.arrive.from, e.arrive.to)}</span>}
        <span className="ev-who">{whoLabel(e, crews, contacts)}</span>
      </span>
      {clash && (
        <span className="ev-clash" aria-label="Double-booked">
          <AlertTriangle size={22} strokeWidth={2.5} />
        </span>
      )}
    </motion.button>
  );
}
