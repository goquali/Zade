import DailyCare from "./daily-care";
import { Moon, Milk, Ruler, RefreshCw, ShieldCheck } from "lucide-react";
import { formatRecordedTime, type HuckleberryDashboard } from "../../lib/integrations/huckleberry-view";

function RecordedTime({value}: {value: string | null}) {
  return value ? <time dateTime={value}>{formatRecordedTime(value)}</time> : <>Time not recorded</>;
}
function TimerState({timer}: {timer: {state:string; startedAt:string | null}}) {
  return <div className="timer-state"><span>Timer at last sync</span><strong>{timer.state}</strong>
    {timer.startedAt && <small>Started <RecordedTime value={timer.startedAt}/></small>}</div>;
}
export default function HuckleberryDashboard({snapshot}: {snapshot:HuckleberryDashboard}) {
  if (snapshot.state !== "ready") return <section className="data-status" role="status">
    <RefreshCw size={20}/><div><h2>{snapshot.state === "empty" ? "Waiting for the first sync" : "Care data unavailable"}</h2>
      <p>{snapshot.state === "empty" ? "No Huckleberry snapshot has been saved yet." : "Saved care data could not be loaded. Please try again later."}</p>
      <p className="muted">Last successful sync: unavailable</p></div></section>;
  const {data} = snapshot;
  return <>
    <section className="sync-status" aria-label="Huckleberry connection">
      <ShieldCheck size={20}/><div><strong>Huckleberry connected</strong>
      <p>Last successful sync: <RecordedTime value={snapshot.syncedAt}/></p>
      {snapshot.stale && <p className="stale" role="status">Sync is over an hour old. Showing the last saved information.</p>}</div>
    </section>
    <DailyCare {...data.history} historyAvailable={data.history.available}/>
    <section><div className="sectionHead"><h2>Latest care</h2><span>Pacific time</span></div>
      <div className="grid">
        <article className="metric" aria-label="Bottle feeding"><div className="metricTop"><Milk size={20}/><h3>Bottle</h3></div>
          {data.bottle.recordedAt ? <><p className="entry-label">Last recorded bottle feed</p><strong>{data.bottle.amount ?? "Amount not recorded"}</strong>
            <small>Recorded <RecordedTime value={data.bottle.recordedAt}/></small>
            <dl className="details"><div><dt>Milk type</dt><dd>{data.bottle.type ?? "Not recorded"}</dd></div></dl></> : <p className="empty">No bottle feed record available.</p>}
        </article>
        <article className="metric"><div className="metricTop"><Moon size={20}/><h3>Sleep</h3></div>
          {data.sleep.startedAt ? <><p className="entry-label">Last recorded sleep</p><strong>{data.sleep.duration ?? "Duration not recorded"}</strong>
            <small>Started <RecordedTime value={data.sleep.startedAt}/></small></> : <p className="empty">No completed sleep record available.</p>}
          <TimerState timer={data.sleep.timer}/>
        </article>
        <article className="metric"><div className="metricTop"><Milk size={20}/><h3>Nursing</h3></div>
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
    <p className="muted data-note">Daily totals come from recent Huckleberry history. This dashboard does not replace advice from Zade’s care team.</p>
  </>;
}
