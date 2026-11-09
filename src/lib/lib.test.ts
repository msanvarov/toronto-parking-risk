import { describe, expect, it } from "vitest";
import { fnv1a, searchStreets, shardOf, type Meta, type Street } from "./data";
import { normalizeStreet, parseAddress, prettyStreet, streetKey } from "./normalize";
import { findPlace, frequencyText, levelFor, scoreFromRate, slotRate, windowRisk } from "./risk";

describe("normalize", () => {
  it("matches the City's abbreviations", () => {
    expect(normalizeStreet("College Street")).toBe("COLLEGE ST");
    expect(normalizeStreet("Queen Street West")).toBe("QUEEN ST W");
    expect(normalizeStreet("St. Clair Avenue West")).toBe("ST CLAIR AVE W");
    expect(normalizeStreet("Birdstone Crescent")).toBe("BIRDSTONE CRES");
    expect(normalizeStreet("The Esplanade")).toBe("THE ESPLANADE");
  });

  it("parses house numbers", () => {
    expect(parseAddress("622 College St")).toEqual({ number: 622, street: "COLLEGE ST" });
    expect(parseAddress("12A Bay Street")).toEqual({ number: 12, street: "BAY ST" });
    expect(parseAddress("622 A College St")).toEqual({ number: 622, street: "COLLEGE ST" });
    expect(parseAddress("10 E Liberty St")).toEqual({ number: 10, street: "E LIBERTY ST" });
    expect(parseAddress("Yonge St")).toEqual({ number: null, street: "YONGE ST" });
  });

  it("ignores spacing in keys", () => {
    expect(streetKey("MC CAUL ST")).toBe(streetKey("McCaul St"));
  });

  it("prettifies names", () => {
    expect(prettyStreet("QUEEN ST W")).toBe("Queen St W");
    expect(prettyStreet("MCCAUL ST")).toBe("McCaul St");
  });
});

describe("sharding", () => {
  it("matches the Python FNV-1a hash", () => {
    // Values computed with fnv1a() in scripts/build_data.py
    expect(shardOf("COLLEGEST")).toBe(21);
    expect(fnv1a("")).toBe(0x811c9dc5);
    expect(fnv1a("a")).toBe(0xe40c292c);
    expect(shardOf("a")).toBe(0xe40c292c % 64);
  });
});

describe("search", () => {
  const index: [string, number][] = [
    ["YONGE ST", 100],
    ["COLLEGE ST", 50],
    ["COLLEGE VIEW AVE", 10],
    ["EAST COLLEGE ST", 5],
  ];
  it("puts prefix matches first and ignores house numbers", () => {
    expect(searchStreets(index, "622 colle").map((e) => e[0])).toEqual(["COLLEGE ST", "COLLEGE VIEW AVE", "EAST COLLEGE ST"]);
  });
});

describe("risk", () => {
  const percentiles = Array.from({ length: 101 }, (_, i) => i / 100); // rate == score/100
  const h = Array(168).fill(0);
  h[0 * 24 + 9] = 20; // Monday 9am
  const street: Street = {
    n: "TEST ST",
    t: 20,
    f: 50,
    nb: 2,
    h,
    i: [],
    b: [[600, 10, Object.assign(Array(24).fill(0), { 9: 10 }), Object.assign(Array(7).fill(0), { 0: 10 }), 0]],
  };
  const meta = { weeks: 10, percentiles } as unknown as Meta;

  it("scores by interpolating the percentile table", () => {
    expect(scoreFromRate(percentiles, 0)).toBe(0);
    expect(scoreFromRate(percentiles, 0.555)).toBeCloseTo(55.5);
    expect(scoreFromRate(percentiles, 5)).toBe(100);
    expect(levelFor(10)).toBe("low");
    expect(levelFor(90)).toBe("very-high");
  });

  it("uses block data when the block is known", () => {
    const place = findPlace(street, 650);
    expect(place.kind).toBe("block");
    expect(slotRate(place, 10, 0, 9)).toBeCloseTo(1); // 10 tickets / 10 weeks
    expect(slotRate(place, 10, 0, 10)).toBe(0);
  });

  it("averages over blocks for street-only searches", () => {
    expect(slotRate(findPlace(street, null), 10, 0, 9)).toBeCloseTo(1); // 20 / 2 blocks / 10 weeks
  });

  it("caps quiet blocks at the data threshold", () => {
    const place = findPlace(street, 1200);
    expect(place.kind).toBe("quiet-block");
    expect(slotRate(place, 10, 0, 9)).toBeCloseTo(0.4); // 4 tickets / 10 weeks
  });

  it("scores a window by its busiest hour", () => {
    const monday830 = new Date(2025, 0, 6, 8, 30); // Jan 6 2025 is a Monday
    const r = windowRisk(findPlace(street, 650), meta, monday830, 2);
    expect(r.score).toBe(100);
    expect(r.expected).toBeCloseTo(1);
  });

  it("describes frequency in plain words", () => {
    expect(frequencyText(3)).toMatch(/About 3 tickets/);
    expect(frequencyText(0.25)).toMatch(/every 4 weeks/);
    expect(frequencyText(0.001)).toMatch(/rare/);
  });
});
