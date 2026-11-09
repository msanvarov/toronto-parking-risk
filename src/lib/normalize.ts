// Street name normalization. Keep in sync with scripts/build_data.py.

const SUFFIXES: Record<string, string> = {
  AVENUE: "AVE", AV: "AVE", VE: "AVE",
  STREET: "ST",
  ROAD: "RD",
  DRIVE: "DR",
  BOULEVARD: "BLVD", BL: "BLVD",
  CRESCENT: "CRES", CR: "CRES",
  COURT: "CRT", CT: "CRT",
  PLACE: "PL",
  LN: "LANE",
  CIRCLE: "CRCL", CIR: "CRCL",
  CIRCUIT: "CRCT",
  GARDENS: "GDNS",
  TERRACE: "TER",
  TRAIL: "TRL",
  PARKWAY: "PKWY",
  HEIGHTS: "HTS",
  GATE: "GT",
  GROVE: "GRV",
  SQUARE: "SQ",
};
const DIRECTIONS: Record<string, string> = { WEST: "W", EAST: "E", NORTH: "N", SOUTH: "S" };

export function normalizeStreet(raw: string): string {
  const tokens = raw.toUpperCase().replace(/[.,]/g, " ").split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return "";
  const last = tokens.length - 1;
  if (last > 0 && DIRECTIONS[tokens[last]]) tokens[last] = DIRECTIONS[tokens[last]];
  const hasDir = last > 0 && ["W", "E", "N", "S"].includes(tokens[last]);
  const i = hasDir ? last - 1 : last;
  if (i > 0 && SUFFIXES[tokens[i]]) tokens[i] = SUFFIXES[tokens[i]];
  return tokens.join(" ");
}

/** Ignores spaces and punctuation, so "MC CAUL ST" and "McCaul St" match. */
export function streetKey(name: string): string {
  return name.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export interface ParsedAddress {
  number: number | null;
  street: string;
}

/** "622 College Street" -> { number: 622, street: "COLLEGE ST" } */
export function parseAddress(input: string): ParsedAddress {
  // Same rules as HOUSE_NUMBER in build_data.py: skip unit letters like "622A" or "622 A".
  const m = input.trim().match(/^(\d+)[a-z]?(?:-\d+[a-z]?)?(?:\s+[a-df-mo-rt-vx-z](?=\s))?\s+(.+)$/i);
  if (m) return { number: parseInt(m[1], 10), street: normalizeStreet(m[2]) };
  return { number: null, street: normalizeStreet(input) };
}

/** "COLLEGE ST" -> "College St", keeping short directionals uppercase. */
export function prettyStreet(name: string): string {
  return name
    .split(" ")
    .map((w) => (w.length === 1 ? w : w[0] + w.slice(1).toLowerCase()))
    .join(" ")
    .replace(/\bMc([a-z])/g, (_, c: string) => "Mc" + c.toUpperCase());
}
