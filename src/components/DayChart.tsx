import type React from "react";
import { levelFor, scoreFromRate, weekdayOf } from "../lib/risk";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

interface Props {
  rates: number[]; // 24 hourly rates for `weekday`
  percentiles: number[];
  weekday: number;
  /** Hours (0-23) covered by the parking window on this day. */
  highlight: Set<number>;
  onWeekday: (d: number) => void;
  onHour: (h: number) => void;
}

const hourLabel = (h: number) => (h === 0 ? "12am" : h === 12 ? "12pm" : h < 12 ? `${h}am` : `${h - 12}pm`);

/** 24 bars, one per hour, coloured by risk level. Tap a bar to start there. */
export function DayChart({ rates, percentiles, weekday, highlight, onWeekday, onHour }: Props) {
  const max = Math.max(...rates, 1e-9);
  const now = new Date();
  const nowHour = weekdayOf(now) === weekday ? now.getHours() : -1;
  return (
    <section className="card" style={{ "--i": 1 } as React.CSSProperties}>
      <div className="card-head">
        <h2>Best and worst times</h2>
        <span className="muted small">Tap a bar to check it</span>
      </div>
      <div className="days" role="tablist" aria-label="Day of week">
        {DAYS.map((d, i) => (
          <button key={d} role="tab" type="button" aria-selected={i === weekday} onClick={() => onWeekday(i)}>
            {d}
          </button>
        ))}
      </div>
      <div className="bars" role="list">
        {rates.map((r, h) => {
          const score = Math.round(scoreFromRate(percentiles, r));
          return (
            <button
              key={h}
              type="button"
              role="listitem"
              className={`bar level-${levelFor(score)}${highlight.has(h) ? " selected" : ""}${h === nowHour ? " now" : ""}`}
              onClick={() => onHour(h)}
              aria-label={`${hourLabel(h)}: risk ${score}`}
            >
              <span style={{ height: `${Math.max(4, (r / max) * 100)}%` }} />
            </button>
          );
        })}
      </div>
      <div className="bar-axis muted small" aria-hidden>
        <span>12am</span>
        <span>6am</span>
        <span>12pm</span>
        <span>6pm</span>
        <span>11pm</span>
      </div>
      <div className="legend small" aria-hidden>
        <span className="level-low">Low</span>
        <span className="level-moderate">Moderate</span>
        <span className="level-high">High</span>
        <span className="level-very-high">Very high</span>
      </div>
    </section>
  );
}
