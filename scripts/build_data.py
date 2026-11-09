#!/usr/bin/env python3
"""Build the app's static data from the City of Toronto parking ticket dataset.

Usage:
    python3 scripts/build_data.py --years 2024 2025

Downloads the yearly ZIPs from Toronto Open Data (cached in data-raw/), then
writes compact JSON to public/data/:

    meta.json        dataset info, infraction lookup, citywide percentile table
    index.json       [[street, tickets], ...] for search, busiest first
    s/<shard>.json   per-street detail, sharded by a hash of the street key

Standard library only, so it runs anywhere Python 3.9+ is installed.
"""
from __future__ import annotations

import argparse
import csv
import io
import json
import re
import sys
import urllib.request
import zipfile
from collections import Counter, defaultdict
from datetime import date, datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW_DIR = ROOT / "data-raw"
OUT_DIR = ROOT / "public" / "data"
CKAN = "https://ckan0.cf.opendata.inter.prod-toronto.ca/api/3/action/package_show?id=parking-tickets"

SHARDS = 64  # must match SHARDS in src/lib/streets.ts
MIN_STREET_TICKETS = 10
MIN_BLOCK_TICKETS = 5
MAX_BLOCKS_PER_STREET = 150
TOP_INFRACTIONS = 5

# Ticket types that are not about parking on the street.
# 3 = "PARK ON PRIVATE PROPERTY" (malls, condo lots), ~19% of all tickets.
DEFAULT_EXCLUDED_CODES = {"3"}

# Keep in sync with src/lib/normalize.ts
SUFFIXES = {
    "AVENUE": "AVE", "AV": "AVE", "VE": "AVE",
    "STREET": "ST",
    "ROAD": "RD",
    "DRIVE": "DR",
    "BOULEVARD": "BLVD", "BL": "BLVD",
    "CRESCENT": "CRES", "CR": "CRES",
    "COURT": "CRT", "CT": "CRT",
    "PLACE": "PL",
    "LN": "LANE",
    "CIRCLE": "CRCL", "CIR": "CRCL",
    "CIRCUIT": "CRCT",
    "GARDENS": "GDNS",
    "TERRACE": "TER",
    "TRAIL": "TRL",
    "PARKWAY": "PKWY",
    "HEIGHTS": "HTS",
    "GATE": "GT",
    "GROVE": "GRV",
    "SQUARE": "SQ",
}
DIRECTIONS = {"WEST": "W", "EAST": "E", "NORTH": "N", "SOUTH": "S"}
# "622 COLLEGE ST", "622A COLLEGE ST", "622 A COLLEGE ST", "620-622 COLLEGE ST".
# A lone unit letter is skipped unless it's a direction (N/S/E/W).
HOUSE_NUMBER = re.compile(r"^(\d+)[A-Z]?(?:-\d+[A-Z]?)?(?:\s+[A-DF-MO-RT-VX-Z](?=\s))?\s+(.+)$")


def normalize_street(raw: str) -> str:
    s = raw.upper().replace(".", " ").replace(",", " ")
    tokens = s.split()
    if not tokens:
        return ""
    if len(tokens) > 1 and tokens[-1] in DIRECTIONS:
        tokens[-1] = DIRECTIONS[tokens[-1]]
    has_dir = len(tokens) > 1 and tokens[-1] in ("W", "E", "N", "S")
    i = len(tokens) - 2 if has_dir else len(tokens) - 1
    if i > 0 and tokens[i] in SUFFIXES:
        tokens[i] = SUFFIXES[tokens[i]]
    return " ".join(tokens)


def street_key(name: str) -> str:
    """Key that ignores spaces, so 'MC CAUL ST' and 'MCCAUL ST' match."""
    return re.sub(r"[^A-Z0-9]", "", name.upper())


def fnv1a(text: str) -> int:
    h = 0x811C9DC5
    for b in text.encode("utf-8"):
        h ^= b
        h = (h * 0x01000193) & 0xFFFFFFFF
    return h


def shard_of(key: str) -> int:
    return fnv1a(key) % SHARDS


def resource_urls() -> dict[int, str]:
    with urllib.request.urlopen(CKAN, timeout=60) as resp:
        pkg = json.load(resp)["result"]
    urls = {}
    for res in pkg["resources"]:
        m = re.search(r"(20\d\d)", res["name"])
        if m and res["format"].upper() == "ZIP":
            urls[int(m.group(1))] = res["url"]
    return urls


def fetch_year(year: int, urls: dict[int, str]) -> Path:
    RAW_DIR.mkdir(exist_ok=True)
    dest = RAW_DIR / f"parking-tickets-{year}.zip"
    if not dest.exists():
        if year not in urls:
            sys.exit(f"No download for {year}. Available: {sorted(urls)}")
        print(f"Downloading {year} ...", flush=True)
        urllib.request.urlretrieve(urls[year], dest)
    return dest


def iter_rows(zip_path: Path):
    """Yield dict rows from every CSV in the ZIP (some years are split)."""
    with zipfile.ZipFile(zip_path) as zf:
        for name in sorted(zf.namelist()):
            if not name.lower().endswith(".csv"):
                continue
            with zf.open(name) as fh:
                text = io.TextIOWrapper(fh, encoding="latin-1", newline="")
                # Skip blank lines before the header (the 2025 file has one).
                lines = (line for line in text)
                first = next(lines)
                while not first.strip():
                    first = next(lines)
                header = [h.strip().strip('"').lower() for h in next(csv.reader([first]))]
                for row in csv.reader(lines):
                    if len(row) >= len(header) - 1:
                        yield dict(zip(header, row))


class Street:
    __slots__ = ("total", "fines", "slots", "inf", "blocks", "names")

    def __init__(self):
        self.total = 0
        self.fines = 0
        self.slots = [0] * 168
        self.inf = Counter()
        self.blocks = defaultdict(lambda: {"n": 0, "hod": [0] * 24, "dow": [0] * 7, "inf": Counter()})
        self.names = Counter()


def build(years: list[int], excluded: set[str]) -> None:
    urls = resource_urls() if any(not (RAW_DIR / f"parking-tickets-{y}.zip").exists() for y in years) else {}
    streets: dict[str, Street] = defaultdict(Street)
    infractions: dict[tuple[str, str], Counter] = defaultdict(Counter)  # (code, desc) -> fines
    first_day: date | None = None
    last_day: date | None = None
    kept = skipped = 0

    for year in years:
        for row in iter_rows(fetch_year(year, urls)):
            code = (row.get("infraction_code") or "").strip()
            loc = (row.get("location2") or "").strip()
            if code in excluded or not loc:
                skipped += 1
                continue
            try:
                d = datetime.strptime(row["date_of_infraction"].strip()[:8], "%Y%m%d").date()
                t = (row.get("time_of_infraction") or "").strip().zfill(4)
                hour = int(t[:2])
                if hour > 23:
                    raise ValueError
            except (ValueError, KeyError):
                skipped += 1
                continue

            m = HOUSE_NUMBER.match(loc.upper())
            number = int(m.group(1)) if m else None
            name = normalize_street(m.group(2) if m else loc)
            if not name:
                skipped += 1
                continue

            first_day = d if first_day is None or d < first_day else first_day
            last_day = d if last_day is None or d > last_day else last_day
            dow = d.weekday()  # 0 = Monday
            desc = (row.get("infraction_description") or "").strip()
            try:
                fine = int(float(row.get("set_fine_amount") or 0))
            except ValueError:
                fine = 0

            st = streets[street_key(name)]
            st.names[name] += 1
            st.total += 1
            st.fines += fine
            st.slots[dow * 24 + hour] += 1
            st.inf[(code, desc)] += 1
            infractions[(code, desc)][fine] += 1
            if number is not None:
                b = st.blocks[number // 100 * 100]
                b["n"] += 1
                b["hod"][hour] += 1
                b["dow"][dow] += 1
                b["inf"][(code, desc)] += 1
            kept += 1

    if not kept:
        sys.exit("No rows parsed.")

    weeks = ((last_day - first_day).days + 1) / 7
    print(f"Kept {kept:,} tickets, skipped {skipped:,}, {first_day}..{last_day} ({weeks:.1f} weeks)")

    # Infraction lookup table, most common first.
    inf_list = sorted(infractions, key=lambda k: -sum(infractions[k].values()))
    inf_index = {k: i for i, k in enumerate(inf_list)}

    # Citywide distribution of "tickets per hour-slot per week" on a block.
    # Used to turn a raw rate into a 0-100 percentile score in the app.
    rates: list[float] = []
    shards: list[dict] = [{} for _ in range(SHARDS)]
    index = []
    for key, st in streets.items():
        if st.total < MIN_STREET_TICKETS:
            continue
        name = st.names.most_common(1)[0][0]
        blocks = sorted(
            ((start, b) for start, b in st.blocks.items() if b["n"] >= MIN_BLOCK_TICKETS),
            key=lambda x: -x[1]["n"],
        )[:MAX_BLOCKS_PER_STREET]
        for _, b in blocks:
            n = b["n"]
            for dw in range(7):
                for hr in range(24):
                    rates.append(b["dow"][dw] * b["hod"][hr] / n / weeks)
        shards[shard_of(key)][key] = {
            "n": name,
            "t": st.total,
            "f": round(st.fines / st.total),
            "nb": max(1, len(st.blocks)),
            "h": st.slots,
            "i": [[inf_index[k], c] for k, c in st.inf.most_common(TOP_INFRACTIONS)],
            "b": sorted(
                [
                    [start, b["n"], b["hod"], b["dow"], inf_index[b["inf"].most_common(1)[0][0]]]
                    for start, b in blocks
                ]
            ),
        }
        index.append([name, st.total])

    # Ticket-weighted quantiles: percentiles[q] is the rate below which q% of
    # all tickets were issued. A score of 80 means 80% of tickets happen at
    # quieter blocks and hours than this one.
    rates.sort()
    total_weight = sum(rates)
    percentiles, acc, q = [], 0.0, 0
    for r in rates:
        acc += r
        while q <= 100 and acc >= q / 100 * total_weight:
            percentiles.append(round(r, 5))
            q += 1
    while len(percentiles) < 101:
        percentiles.append(round(rates[-1], 5))
    index.sort(key=lambda x: -x[1])

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    (OUT_DIR / "s").mkdir(exist_ok=True)
    for old in (OUT_DIR / "s").glob("*.json"):
        old.unlink()
    dump = lambda obj: json.dumps(obj, separators=(",", ":"))
    for i, shard in enumerate(shards):
        (OUT_DIR / "s" / f"{i}.json").write_text(dump(shard))
    (OUT_DIR / "index.json").write_text(dump(index))
    (OUT_DIR / "meta.json").write_text(
        dump(
            {
                "years": years,
                "from": first_day.isoformat(),
                "to": last_day.isoformat(),
                "weeks": round(weeks, 2),
                "tickets": kept,
                "streets": len(index),
                "shards": SHARDS,
                "excludedCodes": sorted(excluded),
                "generatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
                "percentiles": percentiles,
                "infractions": [
                    [code, desc, infractions[(code, desc)].most_common(1)[0][0]] for code, desc in inf_list
                ],
            }
        )
    )
    print(f"Wrote {len(index):,} streets to {OUT_DIR}")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--years", type=int, nargs="+", default=[date.today().year - 1])
    ap.add_argument(
        "--exclude-codes",
        nargs="*",
        default=sorted(DEFAULT_EXCLUDED_CODES),
        help="Infraction codes to leave out (default: 3, private property). Pass nothing to keep all.",
    )
    args = ap.parse_args()
    build(sorted(set(args.years)), set(args.exclude_codes))


if __name__ == "__main__":
    main()
