import { levelFor, scoreFromRate } from "../lib/risk";

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

const hourLabel = (h: number) => (h === 0 ? "12a" : h === 12 ? "12p" : h < 12 ? `${h}a` : `${h - 12}p`);

/** 24 bars, one per hour, coloured by risk level. Tap a bar to start there. */
export function DayChart({ rates, percentiles, weekday, highlight, onWeekday, onHour }: Props) {
  const max = Math.max(...rates, 1e-9);
  return (
    <section className="card">
      <div className="card-head">
        <h2>Through the day</h2>
        <span className="muted small">Tap an hour</span>
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
              className={`bar level-${levelFor(score)}${highlight.has(h) ? " selected" : ""}`}
              onClick={() => onHour(h)}
              aria-label={`${hourLabel(h)}: risk ${score}`}
            >
              <span style={{ height: `${Math.max(3, (r / max) * 100)}%` }} />
            </button>
          );
        })}
      </div>
      <div className="bar-axis muted small" aria-hidden>
        <span>12a</span>
        <span>6a</span>
        <span>12p</span>
        <span>6p</span>
        <span>11p</span>
      </div>
    </section>
  );
}
