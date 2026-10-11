type Document = Record<string, unknown>;
function document(value: unknown): Document {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Document : {};
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
function measurement(value: unknown, units: unknown, allowed: Record<string, string>, allowZero = false): string | null {
  const n = number(value);
  if (n === null || (!allowZero && n === 0) || typeof units !== "string" || !Object.hasOwn(allowed, units)) return null;
  return `${n.toLocaleString("en-US", {maximumFractionDigits: 3})} ${allowed[units]}`;
}
function timer(value: unknown, sleep: boolean) {
  const data = document(value);
  return {
    state: data.active === true ? (data.paused === true ? "Paused" : "Running") :
      data.active === false ? "Not running" : "Unavailable",
    startedAt: data.active === true ? timestamp(sleep ? data.timerStartTime : data.feedStartTime, sleep) : null,
  };
}
export function normalizeHuckleberry(payload: unknown) {
  const data = document(payload);
  const sleep = document(data.sleep), nursing = document(data.nursing), growth = document(data.growth);
  const lastSleep = document(document(sleep.prefs).lastSleep);
  const lastNursing = document(document(nursing.prefs).lastNursing);
  const lastBottle = document(document(nursing.prefs).lastBottle);
  const bottleTypes = ["Breast Milk", "Formula", "Tube Feeding", "Cow Milk", "Goat Milk", "Soy Milk", "Other"];
  const left = number(lastNursing.leftDuration), right = number(lastNursing.rightDuration);
  // A missing side is not zero; timer values are not a completed session.
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
