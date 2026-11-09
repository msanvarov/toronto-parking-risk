import type { Block, Meta, Street } from "./data";

/** Blocks with fewer tickets than this are not in the data (see build_data.py). */
export const MIN_BLOCK_TICKETS = 5;

export type Level = "low" | "moderate" | "high" | "very-high";

export const LEVELS: Record<Level, { label: string; min: number }> = {
  low: { label: "Low", min: 0 },
  moderate: { label: "Moderate", min: 25 },
  high: { label: "High", min: 60 },
  "very-high": { label: "Very high", min: 85 },
};

export function levelFor(score: number): Level {
  if (score >= LEVELS["very-high"].min) return "very-high";
  if (score >= LEVELS.high.min) return "high";
  if (score >= LEVELS.moderate.min) return "moderate";
  return "low";
}

/**
 * Where you are parked: a specific 100-block, the "average" block of a street,
 * or a block too quiet to be in the data.
 */
export type Place =
  | { kind: "block"; street: Street; block: Block }
  | { kind: "street"; street: Street }
  | { kind: "quiet-block"; street: Street; blockStart: number };

export function findPlace(street: Street, houseNumber: number | null): Place {
  if (houseNumber === null) return { kind: "street", street };
  const start = Math.floor(houseNumber / 100) * 100;
  const block = street.b.find((b) => b[0] === start);
  return block ? { kind: "block", street, block } : { kind: "quiet-block", street, blockStart: start };
}

/** Expected tickets written at this place during one hour-slot in a typical week. */
export function slotRate(place: Place, weeks: number, weekday: number, hour: number): number {
  const { street } = place;
  switch (place.kind) {
    case "block": {
      const [, n, byHour, byDay] = place.block;
      return (byDay[weekday] * byHour[hour]) / n / weeks;
    }
    case "street":
      return street.h[weekday * 24 + hour] / street.nb / weeks;
    case "quiet-block":
      // Fewer than MIN_BLOCK_TICKETS on record: assume the most it could be,
      // spread over the week like the rest of the street.
      return street.t ? ((MIN_BLOCK_TICKETS - 1) * street.h[weekday * 24 + hour]) / street.t / weeks : 0;
  }
}

/** Ticket-weighted percentile (0-100) of a rate, interpolated. */
export function scoreFromRate(percentiles: number[], rate: number): number {
  if (rate <= 0) return 0;
  const last = percentiles.length - 1;
  if (rate >= percentiles[last]) return 100;
  let lo = 0;
  let hi = last;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (percentiles[mid] <= rate) lo = mid;
    else hi = mid;
  }
  const span = percentiles[hi] - percentiles[lo];
  const frac = span > 0 ? (rate - percentiles[lo]) / span : 0;
  return ((lo + frac) / last) * 100;
}

/** JS getDay() is Sun=0; the data uses Mon=0. */
export const weekdayOf = (d: Date) => (d.getDay() + 6) % 7;

export interface WindowRisk {
  score: number;
  level: Level;
  /** Expected tickets on this block across the whole window, in a typical week. */
  expected: number;
  /** Busiest hour inside the window. */
  peakRate: number;
}

/** Risk for parking from `start` for `hours` (rounded up to whole hours). */
export function windowRisk(place: Place, meta: Meta, start: Date, hours: number): WindowRisk {
  const slots = Math.max(1, Math.ceil(hours));
  let expected = 0;
  let peakRate = 0;
  const t = new Date(start);
  for (let i = 0; i < slots; i++) {
    const r = slotRate(place, meta.weeks, weekdayOf(t), t.getHours());
    expected += r;
    peakRate = Math.max(peakRate, r);
    t.setHours(t.getHours() + 1);
  }
  // Score the busiest hour: a ticket only takes one bad hour.
  const score = Math.round(scoreFromRate(meta.percentiles, peakRate));
  return { score, level: levelFor(score), expected, peakRate };
}

/** 24 hourly rates for one weekday, for the day chart. */
export function dayProfile(place: Place, weeks: number, weekday: number): number[] {
  return Array.from({ length: 24 }, (_, h) => slotRate(place, weeks, weekday, h));
}

/** Quietest upcoming hour within the next `withinHours`, for a "try instead" tip. */
export function quietestSoon(place: Place, meta: Meta, from: Date, withinHours = 12) {
  let best = { at: new Date(from), score: 101 };
  const t = new Date(from);
  t.setMinutes(0, 0, 0);
  for (let i = 0; i < withinHours; i++) {
    t.setHours(t.getHours() + 1);
    const score = Math.round(scoreFromRate(meta.percentiles, slotRate(place, meta.weeks, weekdayOf(t), t.getHours())));
    if (score < best.score) best = { at: new Date(t), score };
  }
  return best;
}

/** Expected tickets per week -> plain language. */
export function frequencyText(perWeek: number): string {
  if (perWeek >= 1.5) return `About ${Math.round(perWeek)} tickets are written here during these hours in a typical week.`;
  if (perWeek >= 0.75) return "About one ticket is written here during these hours every week.";
  if (perWeek >= 1 / 52) {
    const weeks = Math.round(1 / perWeek);
    return `About one ticket is written here during these hours every ${weeks} weeks.`;
  }
  return "Tickets here during these hours are rare — less than one a year.";
}
