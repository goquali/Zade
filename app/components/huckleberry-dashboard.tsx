import { Baby, Droplets, Milk, RefreshCw, Ruler, ShieldCheck } from "lucide-react";
import { formatRecordedTime, type HuckleberryDashboard } from "../../lib/integrations/huckleberry-view";

function RecordedTime({value}: {value: string | null}) {
  return value ? <time dateTime={value}>{formatRecordedTime(value)}</time> : <>Time not recorded</>;
}
function TimerState({timer}: {timer: {state:string; startedAt:string | null}}) {
  return <div className="timer-state"><span>Timer at last sync</span><strong>{timer.state}</strong>
    {timer.startedAt && <small>Started <RecordedTime value={timer.startedAt}/></small>}</div>;
}
function DiaperMetric({label, item}: {label:string; item:{state:"fresh"|"stale"|"unknown"; recordedAt:string|null; age:string|null}}) {
  const status = item.state === "fresh" ? "Under 6 hours" : item.state === "stale" ? "Over 6 hours" : "Unknown";
  return <article className={`metric diaper-${item.state}`}><div className="metricTop"><Droplets size={20}/><h3>{label}</h3></div>
    <strong>{status}</strong>
    {item.recordedAt ? <small>Last recorded <RecordedTime value={item.recordedAt}/>{item.age ? ` (${item.age} ago)` : ""}</small> :
      <p className="empty">No event found in the synced history window.</p>}
  </article>;
}
export default function HuckleberryDashboard({snapshot}: {snapshot:HuckleberryDashboard}) {
  if (snapshot.state !== "ready") return <section className="data-status" role="status">
    <RefreshCw size={20}/><div><h2>{snapshot.state === "empty" ? "Waiting for the first sync" : "Care data unavailable"}</h2>
      <p>{snapshot.state === "empty" ? "No Huckleberry snapshot has been saved yet." : "Saved care data could not be loaded. Please try again later."}</p>
      <p className="muted">Last successful sync: unavailable</p></div></section>;
  const {data} = snapshot, exec = data.executive;
  return <>
    <section className="sync-status" aria-label="Huckleberry connection">
      <ShieldCheck size={20}/><div><strong>Huckleberry connected</strong>
      <p>Last successful sync: <RecordedTime value={snapshot.syncedAt}/></p>
      {snapshot.stale && <p className="stale" role="status">Sync is over an hour old. Showing the last saved information.</p>}</div>
    </section>
    <section><div className="sectionHead"><h2>Executive snapshot</h2><span>Pacific time</span></div>
      <div className="grid">
        <article className="metric" aria-label="Projected weight"><div className="metricTop"><Ruler size={20}/><h3>Projected weight</h3></div>
          <strong>{exec.weight.projected ?? "Unavailable"}</strong>
          {exec.weight.actual ? <small>Actual: {exec.weight.actual}{exec.weight.measuredAt ? <> measured <RecordedTime value={exec.weight.measuredAt}/></> : ""}</small> :
            <p className="empty">No dated weight measurement available.</p>}
          {exec.weight.projectionNote && <small>{exec.weight.projectionNote}</small>}
        </article>
        <article className="metric" aria-label="Daily milk target"><div className="metricTop"><Milk size={20}/><h3>Daily milk target</h3></div>
          <strong>{exec.milk.targetMl ?? "Unavailable"}</strong>
          <small>{exec.milk.targetOz ? `${exec.milk.targetOz} from projected weight` : "Needs projected weight first"}</small>
        </article>
        <article className="metric" aria-label="Rolling bottle intake"><div className="metricTop"><Baby size={20}/><h3>24h bottle intake</h3></div>
          {exec.milk.historyAvailable ? <><strong>{exec.milk.actualMl ?? "0 mL"}</strong>
            <small>{exec.milk.percent ?? "Target unavailable"} of target from {exec.milk.bottleCount ?? 0} bottles</small>
            {exec.milk.latest?.recordedAt ? <small>Latest bottle <RecordedTime value={exec.milk.latest.recordedAt}/> ({exec.milk.timeSinceLatest} ago)</small> :
              <p className="empty">No bottle event in the last 24 hours.</p>}</> :
            <p className="empty">Bottle history is unavailable from the current Huckleberry sync.</p>}
        </article>
        <DiaperMetric label="Pee" item={exec.diaper.pee}/>
        <DiaperMetric label="Poop" item={exec.diaper.poop}/>
      </div>
    </section>
    <section><div className="sectionHead"><h2>Latest care</h2><span>Summary fallback</span></div>
      <div className="grid">
        <article className="metric" aria-label="Bottle summary"><div className="metricTop"><Milk size={20}/><h3>Latest bottle summary</h3></div>
          {data.bottle.recordedAt ? <><p className="entry-label">Last summary bottle feed</p><strong>{data.bottle.amount ?? "Amount not recorded"}</strong>
            <small>Recorded <RecordedTime value={data.bottle.recordedAt}/></small>
            <dl className="details"><div><dt>Milk type</dt><dd>{data.bottle.type ?? "Not recorded"}</dd></div></dl></> : <p className="empty">No bottle summary available.</p>}
        </article>
        <article className="metric"><div className="metricTop"><Baby size={20}/><h3>Nursing</h3></div>
          {data.nursing.startedAt ? <><p className="entry-label">Last recorded nursing session</p><strong>{data.nursing.duration ?? "Duration not recorded"}</strong>
            <small>Started <RecordedTime value={data.nursing.startedAt}/></small>
            <dl className="details"><div><dt>Left</dt><dd>{data.nursing.left ?? "Not recorded"}</dd></div><div><dt>Right</dt><dd>{data.nursing.right ?? "Not recorded"}</dd></div></dl></> : <p className="empty">No completed nursing record available.</p>}
          <TimerState timer={data.nursing.timer}/>
        </article>
      </div>
    </section>
    <section className="growth-section"><div className="sectionHead"><h2><Ruler size={20}/> Growth</h2></div>
      {data.growth.measuredAt ? <p className="muted">Latest measurement: <RecordedTime value={data.growth.measuredAt}/></p> : <p className="empty">No growth measurement date available.</p>}
      <div className="growth-grid">{[["Weight",data.growth.weight],["Length / height",data.growth.height],["Head circumference",data.growth.head]].map(([label,value])=><article className="metric" key={label}><h3>{label}</h3><strong>{value ?? "Not recorded"}</strong></article>)}</div>
    </section>
    <p className="muted data-note">Milk and diaper metrics use synced Huckleberry event history. Weight projection uses the latest actual weigh-in plus 30 g/day and is for tracking, not medical guidance.</p>
  </>;
}
