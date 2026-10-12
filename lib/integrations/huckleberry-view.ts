type Document = Record<string, unknown>;
const ML_PER_OUNCE = 29.5735295625;
const GRAMS_PER_POUND = 453.59237;
const bottleTypes = ["Breast Milk", "Formula", "Tube Feeding", "Cow Milk", "Goat Milk", "Soy Milk", "Other"];

function document(value: unknown): Document {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Document : {};
}
function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}
function number(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}
function timestamp(value: unknown, milliseconds = false): string | null {
  const n = number(value);
  if (n === null || n === 0) return null;
  const date = new Date(milliseconds ? n : n * 1000);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}
function duration(value: unknown): string | null {
  const seconds = number(value);
  if (seconds === null) return null;
  if (seconds < 60) return `${Math.round(seconds)} sec`;
  const minutes = Math.floor(seconds / 60);
  return minutes >= 60 ? `${Math.floor(minutes / 60)}h ${minutes % 60}m` : `${minutes} min`;
}
function relativeDuration(ms: number): string {
  const minutes = Math.max(0, Math.floor(ms / 60000));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}
function measurement(value: unknown, units: unknown, allowed: Record<string, string>, allowZero = false): string | null {
  const n = number(value);
  if (n === null || (!allowZero && n === 0) || typeof units !== "string" || !Object.hasOwn(allowed, units)) return null;
  return `${n.toLocaleString("en-US", {maximumFractionDigits: 3})} ${allowed[units]}`;
}
function displayMl(value: number): string {
  return `${Math.round(value).toLocaleString("en-US")} mL`;
}
function displayOz(value: number): string {
  return `${value.toLocaleString("en-US", {maximumFractionDigits: 1})} oz`;
}
function timer(value: unknown, sleep: boolean) {
  const data = document(value);
  return {
    state: data.active === true ? (data.paused === true ? "Paused" : "Running") :
      data.active === false ? "Not running" : "Unavailable",
    startedAt: data.active === true ? timestamp(sleep ? data.timerStartTime : data.feedStartTime, sleep) : null,
  };
}
function weightPounds(value: unknown, units: unknown): number | null {
  const n = number(value);
  if (n === null || n === 0) return null;
  if (units === "kg") return n * 1000 / GRAMS_PER_POUND;
  if (units === "lbs.oz") return n;
  return null;
}
function bottleAmountMl(value: unknown, units: unknown): number | null {
  const n = number(value);
  if (n === null || typeof units !== "string") return null;
  if (units === "ml") return n;
  if (units === "oz") return n * ML_PER_OUNCE;
  return null;
}
function history(payload: Document) {
  const history = document(payload.history);
  const fallbackFeed = array(payload.feedIntervals);
  const fallbackDiaper = array(payload.diaperIntervals);
  return {
    feedAvailable: history.feedAvailable === true || Array.isArray(payload.feedIntervals),
    diaperAvailable: history.diaperAvailable === true || Array.isArray(payload.diaperIntervals),
    feed: array(history.feed).length ? array(history.feed) : fallbackFeed,
    diaper: array(history.diaper).length ? array(history.diaper) : fallbackDiaper,
  };
}
function executiveMetrics(payload: Document, now: Date) {
  const events = history(payload);
  const growth = document(payload.growth);
  const measuredAt = timestamp(growth.start);
  const actualWeightLb = weightPounds(growth.weight, growth.weightUnits);
  const daysSinceWeighIn = actualWeightLb !== null && measuredAt
    ? Math.max(0, (now.getTime() - new Date(measuredAt).getTime()) / 86400000) : null;
  const projectedWeightLb = actualWeightLb !== null && daysSinceWeighIn !== null
    ? actualWeightLb + daysSinceWeighIn * 30 / GRAMS_PER_POUND : null;
  const dailyTargetOz = projectedWeightLb !== null ? projectedWeightLb * 2 : null;
  const since24h = now.getTime() - 24 * 60 * 60 * 1000;
  const bottles = events.feed.map(document).filter(entry => entry.mode === "bottle")
    .map(entry => ({recordedAt: timestamp(entry.start), amountMl: bottleAmountMl(entry.amount, entry.units),
      amount: measurement(entry.amount, entry.units, {ml:"mL", oz:"oz"}, true),
      type: typeof entry.bottleType === "string" && bottleTypes.includes(entry.bottleType) ? entry.bottleType : null}))
    .filter(entry => entry.recordedAt !== null)
    .sort((a, b) => Date.parse(a.recordedAt!) - Date.parse(b.recordedAt!));
  const rollingBottles = bottles.filter(entry => Date.parse(entry.recordedAt!) >= since24h);
  const actualMl = rollingBottles.reduce((total, entry) => entry.amountMl === null ? total : total + entry.amountMl, 0);
  const latestBottle = bottles.at(-1) ?? null;
  const diaperEntries = events.diaper.map(document)
    .map(entry => ({recordedAt: timestamp(entry.start), mode: typeof entry.mode === "string" ? entry.mode : null}))
    .filter(entry => entry.recordedAt !== null)
    .sort((a, b) => Date.parse(a.recordedAt!) - Date.parse(b.recordedAt!));
  const latestFor = (kind: "pee" | "poo") => diaperEntries.filter(entry =>
    entry.mode === kind || entry.mode === "both").at(-1) ?? null;
  const diaperStatus = (kind: "pee" | "poo") => {
    const latest = latestFor(kind);
    if (!events.diaperAvailable) return {state:"unknown" as const, recordedAt:null, age:null, ageHours:null};
    if (!latest?.recordedAt) return {state:"stale" as const, recordedAt:null, age:null, ageHours:null};
    const ageMs = now.getTime() - Date.parse(latest.recordedAt);
    return {state:ageMs >= 24 * 60 * 60 * 1000 ? "stale" as const : "fresh" as const,
      recordedAt:latest.recordedAt, age:relativeDuration(ageMs), ageHours:Math.max(0, ageMs / 3600000)};
  };
  const percentValue = events.feedAvailable && dailyTargetOz !== null && dailyTargetOz > 0
    ? actualMl / (dailyTargetOz * ML_PER_OUNCE) * 100 : null;
  return {
    weight: {
      measuredAt,
      actual: measurement(growth.weight, growth.weightUnits, {kg:"kg", "lbs.oz":"lb"}),
      projected: projectedWeightLb === null ? null : `${projectedWeightLb.toLocaleString("en-US", {maximumFractionDigits: 2})} lb`,
      projectionNote: daysSinceWeighIn === null ? null : `+30 g/day for ${daysSinceWeighIn.toLocaleString("en-US", {maximumFractionDigits: 1})} days`,
    },
    milk: {
      historyAvailable: events.feedAvailable,
      targetOz: dailyTargetOz === null ? null : displayOz(dailyTargetOz),
      targetMl: dailyTargetOz === null ? null : displayMl(dailyTargetOz * ML_PER_OUNCE),
      actualMl: events.feedAvailable ? displayMl(actualMl) : null,
      percentValue,
      percent: percentValue === null ? null : `${Math.round(percentValue)}%`,
      bottleCount: events.feedAvailable ? rollingBottles.length : null,
      latest: latestBottle,
      timeSinceLatest: latestBottle?.recordedAt ? relativeDuration(now.getTime() - Date.parse(latestBottle.recordedAt)) : null,
    },
    diaper: {pee: diaperStatus("pee"), poop: diaperStatus("poo"), historyAvailable: events.diaperAvailable},
  };
}

export function normalizeHuckleberry(payload: unknown, now: Date = new Date()) {
  const data = document(payload);
  const sleep = document(data.sleep), nursing = document(data.nursing), growth = document(data.growth);
  const lastSleep = document(document(sleep.prefs).lastSleep);
  const lastNursing = document(document(nursing.prefs).lastNursing);
  const lastBottle = document(document(nursing.prefs).lastBottle);
  const left = number(lastNursing.leftDuration), right = number(lastNursing.rightDuration);
  const nursingDuration = number(lastNursing.duration) ??
    (left !== null && right !== null ? left + right : null);

  // Historical intervals are optional for older snapshots; never infer zero
  // intake from an absent or partially populated history.
  const feedRows = Array.isArray(data.feedIntervals) ? data.feedIntervals : null;
  const diaperRows = Array.isArray(data.diaperIntervals) ? data.diaperIntervals : null;
  const sleepRows = Array.isArray(data.sleepIntervals) ? data.sleepIntervals : null;
  const dateKey = (iso: string) => {
    const parts = new Intl.DateTimeFormat("en-US",{timeZone:"America/Los_Angeles",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date(iso));
    const pick = (type:string) => parts.find(p=>p.type===type)?.value ?? "";
    return pick("year")+"-"+pick("month")+"-"+pick("day");
  };
  const today = dateKey(new Date().toISOString());
  const feedEvents = (feedRows ?? []).flatMap((raw) => {
    const e = document(raw), at = timestamp(e.start);
    if (!at) return [];
    const amount = number(e.amount);
    const units = e.units === "oz" ? "oz" : e.units === "ml" ? "ml" : null;
    const ml = amount !== null && units ? (units === "oz" ? amount * 29.5735295625 : amount) : null;
    return [{at,kind:e.mode === "bottle" ? "Bottle" : e.mode === "breast" ? "Nursing" : "Feeding",
      volumeMl:e.mode === "bottle" ? ml : null,description:e.mode === "bottle"
        ? (ml !== null ? Math.round(ml) + " mL " + (e.bottleType ?? "bottle") : "Bottle · volume unavailable")
        : e.mode === "breast" ? "Nursing session" : "Feeding"}];
  });
  const diaperEvents = (diaperRows ?? []).flatMap(raw => {
    const e=document(raw),at=timestamp(e.start);
    return at ? [{at,kind:"Diaper",volumeMl:null,description:"Diaper · " + (typeof e.mode === "string" ? e.mode : "recorded")}] : [];
  });
  const sleepEvents = (sleepRows ?? []).flatMap(raw => {
    const e=document(raw),at=timestamp(e.start);
    return at ? [{at,kind:"Sleep",volumeMl:null,description:"Sleep · " + (duration(e.duration) ?? "duration unavailable")}] : [];
  });
  const events = [...feedEvents,...diaperEvents,...sleepEvents].sort((a,b)=>b.at.localeCompare(a.at));
  const todaysBottles = feedEvents.filter(e=>e.kind==="Bottle" && dateKey(e.at)===today);
  const completeBottleVolumes = todaysBottles.every(e=>e.volumeMl !== null);
  const todaysMl = feedRows !== null && completeBottleVolumes
    ? Math.round(todaysBottles.reduce((sum,e)=>sum+(e.volumeMl ?? 0),0)) : null;
  const todaysDiapers = diaperRows === null ? null :
    diaperEvents.filter(e=>dateKey(e.at)===today).length;
  return {
    history: {events: events.slice(0,80), todaysMl, todaysBottles:todaysBottles.length, todaysDiapers, available: feedRows !== null && diaperRows !== null},
    sleep: {startedAt: timestamp(lastSleep.start), duration: duration(lastSleep.duration), timer: timer(sleep.timer, true)},
    nursing: {startedAt: timestamp(lastNursing.start), duration: duration(nursingDuration),
      left: duration(left), right: duration(right), timer: timer(nursing.timer, false)},
    bottle: {recordedAt: timestamp(lastBottle.start),
      amount: measurement(lastBottle.bottleAmount, lastBottle.bottleUnits, {ml:"mL", oz:"oz"}, true),
      type: typeof lastBottle.bottleType === "string" && bottleTypes.includes(lastBottle.bottleType) ? lastBottle.bottleType : null},
    growth: {measuredAt: timestamp(growth.start),
      weight: measurement(growth.weight, growth.weightUnits, {kg:"kg", "lbs.oz":"lb"}),
      height: measurement(growth.height, growth.heightUnits, {cm:"cm", "ft.in":"in"}),
      head: measurement(growth.head, growth.headUnits, {hcm:"cm", hin:"in"})},
    executive: executiveMetrics(data, now),
  };
}
export type HuckleberryView = ReturnType<typeof normalizeHuckleberry>;
export type HuckleberryDashboard =
  | {state: "ready"; syncedAt: string; stale: boolean; data: HuckleberryView}
  | {state: "empty" | "unavailable"};

export function formatRecordedTime(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone:"America/Los_Angeles", month:"short", day:"numeric", year:"numeric",
    hour:"numeric", minute:"2-digit", timeZoneName:"short",
  }).format(new Date(value));
}
