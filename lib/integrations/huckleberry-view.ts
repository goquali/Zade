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
function measurement(value: unknown, units: unknown, allowed: Record<string, string>): string | null {
  const n = number(value);
  if (n === null || n === 0 || typeof units !== "string" || !allowed[units]) return null;
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
  const left = number(lastNursing.leftDuration), right = number(lastNursing.rightDuration);
  // A missing side is not zero; timer values are not a completed session.
  const nursingDuration = number(lastNursing.duration) ??
    (left !== null && right !== null ? left + right : null);
  return {
    sleep: {startedAt: timestamp(lastSleep.start), duration: duration(lastSleep.duration), timer: timer(sleep.timer, true)},
    nursing: {startedAt: timestamp(lastNursing.start), duration: duration(nursingDuration),
      left: duration(left), right: duration(right), timer: timer(nursing.timer, false)},
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
