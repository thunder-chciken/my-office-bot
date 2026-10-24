"use client";

import { CalendarPlus, ChevronLeft, ChevronRight } from "lucide-react";
import {
  addDays,
  dateKey,
  dayLabel,
  eventsOn,
  fmtTime,
  isWeekend,
  kindLabel,
  parseKey,
  todayKey,
  weekStart,
  type Crew,
  type Job,
  type ScheduleEvent,
} from "@/lib/schedule";

// The full calendar: a month grid with every booking on its day, and the picked day's bookings below.
// Phones show each booking as a colored bar; wider screens show its name and time.

const weekdays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function monthOf(key: string) {
  const d = parseKey(key);
  return { year: d.getFullYear(), month: d.getMonth() };
}

/** The same day in another month, clamped to that month's length (Jan 31 + 1 month = Feb 28). */
function shiftMonth(key: string, by: number) {
  const d = parseKey(key);
  const target = new Date(d.getFullYear(), d.getMonth() + by, 1);
  const last = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(d.getDate(), last));
  return dateKey(target);
}

export function MonthView({
  day,
  setDay,
  live,
  jobs,
  crews,
  card,
  onOpenEvent,
  onNew,
}: {
  day: string;
  setDay: (k: string) => void;
  live: ScheduleEvent[];
  jobs: Job[];
  crews: Crew[];
  card: (e: ScheduleEvent, key: string) => React.ReactNode;
  onOpenEvent: (id: string) => void;
  onNew: (date: string) => void;
}) {
  const { year, month } = monthOf(day);
  const first = dateKey(new Date(year, month, 1));
  const lastDate = new Date(year, month + 1, 0);
  const start = weekStart(first);
  const weeks = Math.ceil((Math.round((lastDate.getTime() - parseKey(start).getTime()) / 86_400_000) + 1) / 7);
  const cells = Array.from({ length: weeks * 7 }, (_, i) => addDays(start, i));
  const today = todayKey();
  const title = new Date(year, month, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
  const picked = eventsOn(day, live);

  const colorOf = (e: ScheduleEvent) =>
    e.type === "unavailable" ? "#7D8A9C" : (crews.find((c) => e.crewIds.includes(c.id))?.color ?? "#0A6CFF");
  const labelOf = (e: ScheduleEvent) => {
    const job = jobs.find((j) => j.id === e.jobId);
    const who = job ? job.customerName.split(" ").slice(-1)[0] : "";
    const what = e.type === "appointment" && e.kind ? kindLabel[e.kind] : e.title;
    return who ? `${what} · ${who}` : what;
  };

  return (
    <div className="month">
      <div className="month-nav">
        <button className="strip-arrow" onClick={() => setDay(shiftMonth(day, -1))} aria-label="Previous month">
          <ChevronLeft size={26} strokeWidth={2.5} />
        </button>
        <h2 className="month-title">{title}</h2>
        <button className="strip-arrow" onClick={() => setDay(shiftMonth(day, 1))} aria-label="Next month">
          <ChevronRight size={26} strokeWidth={2.5} />
        </button>
        {day !== today && (
          <button className="text-btn month-today" onClick={() => setDay(today)}>
            Today
          </button>
        )}
      </div>

      <div className="month-grid" role="grid" aria-label={title}>
        {weekdays.map((w) => (
          <div key={w} className="month-wd" role="columnheader">
            {w}
          </div>
        ))}
        {cells.map((k) => {
          const list = eventsOn(k, live);
          const inMonth = parseKey(k).getMonth() === month;
          const shown = list.slice(0, 3);
          return (
            <div
              key={k}
              role="gridcell"
              aria-selected={k === day}
              tabIndex={0}
              className={`month-cell${inMonth ? "" : " is-out"}${k === today ? " is-today" : ""}${k === day ? " is-picked" : ""}${isWeekend(k) ? " is-weekend" : ""}`}
              aria-label={`${dayLabel(k)}${list.length ? `, ${list.length} booked` : ""}`}
              onClick={() => setDay(k)}
              onDoubleClick={() => onNew(k)}
              onKeyDown={(ev) => {
                if (ev.key === "Enter" || ev.key === " ") {
                  ev.preventDefault();
                  setDay(k);
                }
              }}
            >
              <span className="month-num">{parseKey(k).getDate()}</span>
              <span className="month-events">
                {shown.map((e) => (
                  <button
                    key={e.id}
                    className={`month-chip${e.status === "done" ? " is-done" : ""}`}
                    style={{ "--ev": colorOf(e) } as React.CSSProperties}
                    title={`${e.type === "work_block" ? "" : `${fmtTime(e.from)} `}${labelOf(e)}`}
                    onClick={(ev) => {
                      ev.stopPropagation();
                      setDay(k);
                      onOpenEvent(e.id);
                    }}
                    tabIndex={-1}
                  >
                    {e.type !== "work_block" && e.type !== "unavailable" && <b>{fmtTime(e.from)}</b>} {labelOf(e)}
                  </button>
                ))}
                {list.length > shown.length && <span className="month-more">+{list.length - shown.length} more</span>}
              </span>
            </div>
          );
        })}
      </div>

      <div className="day-head">
        <h2 className="day-title">{dayLabel(day)}</h2>
        <button className="text-btn" onClick={() => onNew(day)}>
          <CalendarPlus size={20} strokeWidth={2.4} /> Add
        </button>
      </div>
      <div className="stack">
        {picked.map((e) => card(e, day))}
        {picked.length === 0 && <p className="empty">{isWeekend(day) ? "Weekend — nothing booked." : "Nothing booked this day."}</p>}
      </div>
    </div>
  );
}
