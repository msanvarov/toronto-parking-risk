import { useCallback, useEffect, useMemo, useState } from "react";
import { DayChart } from "./components/DayChart";
import { RiskGauge } from "./components/RiskGauge";
import { SearchBox } from "./components/SearchBox";
import { WhenPicker } from "./components/WhenPicker";
import { loadIndex, loadMeta, loadStreet, searchStreets, type IndexEntry, type Meta, type Street } from "./lib/data";
import { currentPosition, locationErrorMessage, reverseGeocode } from "./lib/geo";
import { parseAddress, prettyStreet } from "./lib/normalize";
import { dayProfile, findPlace, frequencyText, quietestSoon, weekdayOf, windowRisk, type Place } from "./lib/risk";

const RECENT_KEY = "recent-searches";

function readRecent(): string[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
  } catch {
    return [];
  }
}

function saveRecent(list: string[]) {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(list));
  } catch {
    /* storage unavailable: recent searches just won't persist */
  }
}

type Result =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "found"; address: string; street: Street; number: number | null }
  | { status: "missing"; address: string; alternatives: IndexEntry[] }
  | { status: "error"; message: string };

export default function App() {
  const [meta, setMeta] = useState<Meta | null>(null);
  const [index, setIndex] = useState<IndexEntry[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [query, setQuery] = useState(() => new URLSearchParams(location.search).get("a") ?? "");
  const [result, setResult] = useState<Result>({ status: "idle" });
  const [start, setStart] = useState<Date | null>(null);
  const [hours, setHours] = useState(1);
  const [chartDay, setChartDay] = useState<number | null>(null);
  const [locating, setLocating] = useState(false);
  const [recent, setRecent] = useState(readRecent);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    Promise.all([loadMeta(), loadIndex()])
      .then(([m, i]) => {
        setMeta(m);
        setIndex(i);
      })
      .catch(() => setLoadError("Couldn't load ticket data. Check your connection and reload."));
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  const lookup = useCallback(
    async (address: string) => {
      const trimmed = address.trim();
      if (!trimmed) return;
      setResult({ status: "loading" });
      setChartDay(null);
      const { number, street: name } = parseAddress(trimmed);
      try {
        let street = await loadStreet(name);
        // Typed a partial name ("college")? Use the best match.
        if (!street && index) {
          const best = searchStreets(index, name, 1)[0];
          if (best && best[0].startsWith(name)) street = await loadStreet(best[0]);
        }
        if (!street) {
          setResult({ status: "missing", address: trimmed, alternatives: index ? searchStreets(index, name, 4) : [] });
          return;
        }
        const label = (number !== null ? `${number} ` : "") + prettyStreet(street.n);
        setQuery(label);
        setResult({ status: "found", address: label, street, number });
        history.replaceState(null, "", `?a=${encodeURIComponent(label)}`);
        setRecent((prev) => {
          const next = [label, ...prev.filter((r) => r !== label)].slice(0, 5);
          saveRecent(next);
          return next;
        });
      } catch {
        setResult({ status: "error", message: "Couldn't load that street. Check your connection and try again." });
      }
    },
    [index],
  );

  // Look up an address passed in the URL once the index is ready.
  useEffect(() => {
    if (index && query && result.status === "idle") void lookup(query);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index]);

  const locate = async () => {
    setLocating(true);
    try {
      const pos = await currentPosition();
      const found = await reverseGeocode(pos.coords.latitude, pos.coords.longitude);
      const address = (found.number !== null ? `${found.number} ` : "") + found.street;
      setQuery(address);
      await lookup(address);
    } catch (err) {
      setResult({ status: "error", message: locationErrorMessage(err) });
    } finally {
      setLocating(false);
    }
  };

  return (
    <div className="app">
      <header className="top">
        <div className="brand">
          <span className="logo" aria-hidden>
            P
          </span>
          <div>
            <h1>Ticket Risk TO</h1>
            <p className="muted small">How likely is a parking ticket here?</p>
          </div>
        </div>
        <SearchBox
          index={index}
          value={query}
          onChange={setQuery}
          onSubmit={lookup}
          onLocate={locate}
          locating={locating}
          recent={recent}
        />
      </header>

      <main>
        {loadError && <p className="notice error">{loadError}</p>}
        {!loadError && !meta && <Skeleton />}

        {meta && result.status === "idle" && <Intro meta={meta} onPick={(a) => { setQuery(a); void lookup(a); }} />}
        {result.status === "loading" && <Skeleton />}
        {result.status === "error" && <p className="notice error">{result.message}</p>}
        {result.status === "missing" && (
          <div className="card">
            <h2>No tickets on record for “{result.address}”</h2>
            <p className="muted">
              Either it's very quiet or we spell it differently.
              {result.alternatives.length > 0 && " Did you mean:"}
            </p>
            <div className="chips wrap">
              {result.alternatives.map(([name]) => (
                <button key={name} className="chip" type="button" onClick={() => lookup(prettyStreet(name))}>
                  {prettyStreet(name)}
                </button>
              ))}
            </div>
          </div>
        )}

        {meta && result.status === "found" && (
          <ResultView
            meta={meta}
            street={result.street}
            number={result.number}
            start={start ?? now}
            isNow={start === null}
            hours={hours}
            chartDay={chartDay}
            onStart={setStart}
            onHours={setHours}
            onChartDay={setChartDay}
            onPickBlock={(n) => {
              const a = `${n} ${prettyStreet(result.street.n)}`;
              setQuery(a);
              void lookup(a);
              window.scrollTo({ top: 0, behavior: "smooth" });
            }}
          />
        )}
      </main>

      {meta && (
        <footer className="muted small">
          <p>
            Based on {meta.tickets.toLocaleString()} City of Toronto parking tickets from {meta.from} to {meta.to}
            {meta.excludedCodes.includes("3") && ", not counting private-property tickets"}. Source:{" "}
            <a href="https://open.toronto.ca/dataset/parking-tickets/" target="_blank" rel="noreferrer">
              Toronto Open Data
            </a>
            .
          </p>
          <p>This shows where and when tickets are usually written. It's not a guarantee — always read the signs.</p>
        </footer>
      )}
    </div>
  );
}

interface ResultProps {
  meta: Meta;
  street: Street;
  number: number | null;
  start: Date;
  isNow: boolean;
  hours: number;
  chartDay: number | null;
  onStart: (d: Date | null) => void;
  onHours: (h: number) => void;
  onChartDay: (d: number) => void;
  onPickBlock: (n: number) => void;
}

function ResultView({ meta, street, number, start, isNow, hours, chartDay, onStart, onHours, onChartDay, onPickBlock }: ResultProps) {
  const place = useMemo(() => findPlace(street, number), [street, number]);
  const risk = windowRisk(place, meta, start, hours);
  const weekday = chartDay ?? weekdayOf(start);

  const highlight = useMemo(() => {
    const set = new Set<number>();
    const t = new Date(start);
    for (let i = 0; i < Math.max(1, Math.ceil(hours)); i++) {
      if (weekdayOf(t) === weekday) set.add(t.getHours());
      t.setHours(t.getHours() + 1);
    }
    return set;
  }, [start, hours, weekday]);

  const tip = risk.level === "high" || risk.level === "very-high" ? quietestSoon(place, meta, start) : null;
  const pretty = prettyStreet(street.n);
  const topBlocks = [...street.b].sort((a, b) => b[1] - a[1]).slice(0, 5);
  const totalTop = street.i.reduce((s, [, c]) => s + c, 0);

  return (
    <>
      <section className="card hero">
        <p className="where">{placeLabel(place, pretty)}</p>
        <RiskGauge score={risk.score} level={risk.level} />
        <p className="summary">{frequencyText(risk.expected)}</p>
        <p className="muted small center">
          {isNow ? "Right now" : start.toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" })}{" "}
          for {hours < 1 ? "30 min" : `${hours} hr`}
        </p>
        {tip && tip.score < risk.score - 15 && (
          <p className="tip">
            Quieter at{" "}
            <button type="button" className="link" onClick={() => onStart(tip.at)}>
              {tip.at.toLocaleTimeString(undefined, { weekday: "short", hour: "numeric" })}
            </button>{" "}
            (risk {tip.score})
          </p>
        )}
      </section>

      <WhenPicker start={isNow ? null : start} hours={hours} onStart={onStart} onHours={onHours} />

      <DayChart
        rates={dayProfile(place, meta.weeks, weekday)}
        percentiles={meta.percentiles}
        weekday={weekday}
        highlight={highlight}
        onWeekday={onChartDay}
        onHour={(h) => {
          const d = new Date(start);
          d.setDate(d.getDate() + ((weekday - weekdayOf(d) + 7) % 7));
          d.setHours(h, 0, 0, 0);
          if (d.getTime() < Date.now() - 3600_000) d.setDate(d.getDate() + 7);
          onStart(d);
        }}
      />

      <section className="card">
        <h2>Most common tickets on {pretty}</h2>
        <ul className="list">
          {street.i.map(([idx, count]) => {
            const [code, desc, fine] = meta.infractions[idx];
            return (
              <li key={code + desc}>
                <div>
                  <span>{describeInfraction(desc)}</span>
                  <span className="muted small"> · ${fine}</span>
                </div>
                <div className="meter" aria-label={`${Math.round((count / totalTop) * 100)}%`}>
                  <span style={{ width: `${(count / totalTop) * 100}%` }} />
                </div>
              </li>
            );
          })}
        </ul>
        <p className="muted small">Average fine here: ${street.f}</p>
      </section>

      {topBlocks.length > 1 && (
        <section className="card">
          <h2>Busiest blocks on {pretty}</h2>
          <ul className="list blocks">
            {topBlocks.map(([startNo, count]) => (
              <li key={startNo}>
                <button type="button" className="row-button" onClick={() => onPickBlock(startNo)}>
                  <span>
                    {startNo}–{startNo + 99} {pretty}
                  </span>
                  <span className="muted small">{count.toLocaleString()} tickets</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

function placeLabel(place: Place, pretty: string) {
  switch (place.kind) {
    case "block":
      return `${place.block[0]}–${place.block[0] + 99} ${pretty}`;
    case "street":
      return `${pretty} (typical block)`;
    case "quiet-block":
      return `${place.blockStart}–${place.blockStart + 99} ${pretty} · very few tickets on record`;
  }
}

/** "PARK-SIGNED HWY-PROHIBIT DY/TM" -> readable text for the common codes. */
function describeInfraction(desc: string): string {
  const d = desc.toUpperCase();
  if (d.includes("FEE NOT PAID") || d.includes("MACH-NOT USED") || d.includes("MACHINE")) return "Didn't pay at the machine";
  if (d.includes("RUSH HOUR")) return "Stopped during rush hour";
  if (d.includes("NO PERMIT")) return "No permit during permit hours";
  if (d.includes("LONGER THAN 3")) return "Parked longer than 3 hours";
  if (d.includes("FIRE HYDRANT")) return "Too close to a fire hydrant";
  if (d.includes("2AM-6AM") || d.includes("2:00") || d.includes("OVERNIGHT")) return "Overnight parking (winter)";
  if (d.startsWith("STOP")) return "Stopped where prohibited";
  if (d.startsWith("STAND")) return "Standing where prohibited";
  if (d.includes("LOAD ZONE") || d.includes("LOADING")) return "In a loading zone";
  if (d.includes("PROHIBIT")) return "Parked where prohibited";
  if (d.includes("MUNICIPAL PROPERTY")) return "On city property (lot or park)";
  return desc.charAt(0) + desc.slice(1).toLowerCase();
}

function Intro({ meta, onPick }: { meta: Meta; onPick: (a: string) => void }) {
  const examples = ["622 College St", "300 Queen St W", "1000 Bay St", "2100 Danforth Ave"];
  return (
    <section className="card intro">
      <h2>Check before you park</h2>
      <p className="muted">
        Type a street or address, or tap the location button. We'll score how often tickets get written there at the
        time you're parking, using {meta.tickets.toLocaleString()} real tickets.
      </p>
      <div className="chips wrap">
        {examples.map((e) => (
          <button key={e} type="button" className="chip" onClick={() => onPick(e)}>
            {e}
          </button>
        ))}
      </div>
    </section>
  );
}

function Skeleton() {
  return <div className="card skeleton" aria-busy="true" aria-label="Loading" />;
}
