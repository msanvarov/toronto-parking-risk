import { useEffect, useRef, useState } from "react";
import { LEVELS, type Level } from "../lib/risk";

const CX = 110;
const CY = 110;
const R = 88;

/** Point on the half circle: f=0 is far left, f=1 is far right. */
function point(f: number) {
  const a = Math.PI * (1 - f);
  return [CX + R * Math.cos(a), CY - R * Math.sin(a)] as const;
}

function arc(from: number, to: number) {
  const [x1, y1] = point(from);
  const [x2, y2] = point(to);
  return `M${x1.toFixed(2)} ${y1.toFixed(2)} A${R} ${R} 0 0 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`;
}

const ZONES: [number, number, Level][] = [
  [0, 0.25, "low"],
  [0.25, 0.6, "moderate"],
  [0.6, 0.85, "high"],
  [0.85, 1, "very-high"],
];

/** Animate a number toward `target` (skipped when the user prefers reduced motion). */
function useCountUp(target: number, ms = 700) {
  const [value, setValue] = useState(target);
  const from = useRef(0);
  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      setValue(target);
      from.current = target;
      return;
    }
    const start = performance.now();
    const begin = from.current;
    let frame = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / ms);
      const eased = 1 - Math.pow(1 - t, 3);
      const v = begin + (target - begin) * eased;
      setValue(v);
      from.current = v;
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, ms]);
  return value;
}

/** Half-circle gauge with faint coloured zones, a filled arc and a knob. */
export function RiskGauge({ score, level }: { score: number; level: Level }) {
  const shown = useCountUp(score);
  const f = Math.max(0.005, shown / 100);
  const [kx, ky] = point(f);
  return (
    <div className="gauge" role="img" aria-label={`Ticket risk ${score} out of 100, ${LEVELS[level].label}`}>
      <svg viewBox="0 0 220 124" aria-hidden>
        {ZONES.map(([a, b, z]) => (
          <path key={z} d={arc(a + 0.006, b - 0.006)} className={`gauge-zone level-${z}`} />
        ))}
        <path d={arc(0, f)} className="gauge-fill" />
        <circle cx={kx} cy={ky} r="11" className="gauge-knob" />
      </svg>
      <div className="gauge-text">
        <span className="gauge-score">{Math.round(shown)}</span>
        <span className="gauge-scale">out of 100</span>
      </div>
    </div>
  );
}
