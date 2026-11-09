import { LEVELS, type Level } from "../lib/risk";

/** Half-circle gauge. The arc fills to `score` and takes the level's colour. */
export function RiskGauge({ score, level }: { score: number; level: Level }) {
  const r = 80;
  const len = Math.PI * r;
  const filled = (Math.max(2, score) / 100) * len;
  return (
    <div className={`gauge level-${level}`} role="img" aria-label={`Ticket risk ${score} out of 100, ${LEVELS[level].label}`}>
      <svg viewBox="0 0 200 112" aria-hidden>
        <path d="M20 100 A80 80 0 0 1 180 100" className="gauge-track" />
        <path
          d="M20 100 A80 80 0 0 1 180 100"
          className="gauge-fill"
          strokeDasharray={`${filled} ${len}`}
        />
      </svg>
      <div className="gauge-text">
        <span className="gauge-score">{score}</span>
        <span className="gauge-label">{LEVELS[level].label}</span>
      </div>
    </div>
  );
}
