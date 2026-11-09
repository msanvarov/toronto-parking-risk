import { streetKey } from "./normalize";

/** Must match SHARDS in scripts/build_data.py. */
export const SHARDS = 64;

export interface Meta {
  years: number[];
  from: string;
  to: string;
  weeks: number;
  tickets: number;
  streets: number;
  shards: number;
  excludedCodes: string[];
  generatedAt: string;
  /** Ticket-weighted quantiles (0..100) of tickets per block per hour-slot per week. */
  percentiles: number[];
  /** [code, description, typical fine] */
  infractions: [string, string, number][];
}

/** [blockStart, tickets, ticketsByHour[24], ticketsByWeekday[7], topInfractionIndex] */
export type Block = [number, number, number[], number[], number];

export interface Street {
  n: string; // display name
  t: number; // total tickets
  f: number; // average fine
  nb: number; // blocks with any tickets
  h: number[]; // 168 slots: weekday (Mon=0) * 24 + hour
  i: [number, number][]; // [infractionIndex, tickets]
  b: Block[];
}

export type IndexEntry = [name: string, tickets: number];

export function fnv1a(text: string): number {
  let h = 0x811c9dc5;
  for (const byte of new TextEncoder().encode(text)) {
    h ^= byte;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

export const shardOf = (key: string) => fnv1a(key) % SHARDS;

const base = `${import.meta.env.BASE_URL}data/`;
const cache = new Map<string, Promise<unknown>>();

function getJSON<T>(path: string): Promise<T> {
  let p = cache.get(path);
  if (!p) {
    p = fetch(base + path).then((r) => {
      if (!r.ok) throw new Error(`Failed to load ${path}`);
      return r.json();
    });
    p.catch(() => cache.delete(path));
    cache.set(path, p);
  }
  return p as Promise<T>;
}

export const loadMeta = () => getJSON<Meta>("meta.json");
export const loadIndex = () => getJSON<IndexEntry[]>("index.json");

export async function loadStreet(name: string): Promise<Street | null> {
  const key = streetKey(name);
  const shard = await getJSON<Record<string, Street>>(`s/${shardOf(key)}.json`);
  return shard[key] ?? null;
}

/** Search the street index. Prefix matches first, then busiest streets. */
export function searchStreets(index: IndexEntry[], query: string, limit = 8): IndexEntry[] {
  const q = streetKey(query.replace(/^\s*\d+[a-zA-Z]?\s+/, ""));
  if (!q) return [];
  const prefix: IndexEntry[] = [];
  const contains: IndexEntry[] = [];
  for (const entry of index) {
    const k = streetKey(entry[0]);
    if (k.startsWith(q)) prefix.push(entry);
    else if (contains.length < limit && k.includes(q)) contains.push(entry);
    if (prefix.length >= limit) break;
  }
  return [...prefix, ...contains].slice(0, limit);
}
