const DURATIONS = [0.5, 1, 2, 3, 4];

interface Props {
  start: Date | null; // null = now
  hours: number;
  onStart: (d: Date | null) => void;
  onHours: (h: number) => void;
}

const pad = (n: number) => String(n).padStart(2, "0");
const toInput = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;

/** "Starting now / later" and "for how long", right under the score. */
export function WhenPicker({ start, hours, onStart, onHours }: Props) {
  return (
    <div className="when" role="group" aria-label="When are you parking?">
      <div className="when-row">
        <span className="when-label">Starting</span>
        <div className="segmented" role="group" aria-label="Start time">
          <button type="button" aria-pressed={start === null} onClick={() => onStart(null)}>
            Now
          </button>
          <button
            type="button"
            aria-pressed={start !== null}
            onClick={() => onStart(start ?? new Date(Date.now() + 60 * 60 * 1000))}
          >
            Later
          </button>
        </div>
      </div>
      {start !== null && (
        <input
          type="datetime-local"
          className="time-input"
          aria-label="Start time"
          value={toInput(start)}
          onChange={(e) => e.target.value && onStart(new Date(e.target.value))}
        />
      )}
      <div className="when-row">
        <span className="when-label">For</span>
        <div className="chips" role="group" aria-label="How long">
          {DURATIONS.map((h) => (
            <button key={h} type="button" className="chip" aria-pressed={hours === h} onClick={() => onHours(h)}>
              {h < 1 ? "30m" : `${h}h`}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
