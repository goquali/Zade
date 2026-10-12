import { Droplet, Droplets, Milk, RefreshCw, Ruler, ShieldCheck } from "lucide-react";
import { formatRecordedTime, type HuckleberryDashboard, type HuckleberryView } from "../../lib/integrations/huckleberry-view";

function RecordedTime({value}: {value: string | null}) {
  return value ? <time dateTime={value}>{formatRecordedTime(value)}</time> : <>Time not recorded</>;
}
function DiaperLane({label, item}: {label:string; item:HuckleberryView["executive"]["diaper"]["pee"]}) {
  const status = item.state === "fresh" ? "Logged within 24 hours" : item.state === "stale" ? "No log in 24 hours" : "Unknown";
  const Icon = label === "Pee" ? Droplet : Droplets;
  const elapsed = item.ageHours === null ? null : Math.min(100, item.ageHours / 24 * 100);
  return <article className={`care-diaper diaper-${item.state}`} aria-label={`${label} log freshness`}>
    <div className="diaper-heading"><h3><Icon size={18}/>{label}</h3><span className="diaper-status">{status}</span></div>
    <div className="care-track diaper-track" role="img" aria-label={item.age ? `${label}: ${item.age} since last log; 24-hour flag` : `${label}: ${status}`}>
      {item.state !== "unknown" && <span className="care-fill" style={{width:`${elapsed ?? 100}%`}}/>}
    </div>
    <div className="track-labels"><span>{item.age ? `${item.age} since log` : item.state === "unknown" ? "History unavailable" : "No event in synced history"}</span><span>24h flag</span></div>
    {item.recordedAt && <p className="lane-detail">Last recorded <RecordedTime value={item.recordedAt}/></p>}
  </article>;
}
export default function HuckleberryDashboard({snapshot}: {snapshot:HuckleberryDashboard}) {
  if (snapshot.state !== "ready") return <section className="data-status" role="status">
    <RefreshCw size={20}/><div><h2>{snapshot.state === "empty" ? "Waiting for the first sync" : "Care data unavailable"}</h2>
      <p>{snapshot.state === "empty" ? "No Huckleberry snapshot has been saved yet." : "Saved care data could not be loaded. Please try again later."}</p>
      <p className="muted">Last successful sync: unavailable</p></div></section>;
  const {data} = snapshot, exec = data.executive;
  const milkPercent = exec.milk.percentValue;
  return <div className="care-lanes">
    <section className="sync-status" aria-label="Huckleberry connection">
      <ShieldCheck size={20}/><div><strong>Huckleberry connected</strong>
      <p>Last successful sync: <RecordedTime value={snapshot.syncedAt}/></p>
      {snapshot.stale && <p className="stale" role="status">Sync is over an hour old. Showing the last saved information.</p>}</div>
      <span className="care-timezone">Pacific time</span>
    </section>
    <section className="care-lane milk-lane" aria-label="Rolling bottle intake">
      <div className="lane-heading"><h2><Milk size={21}/>Milk <span>last 24 hours</span></h2>
        <span className="lane-status">{exec.milk.percent ? `${exec.milk.percent} of tracking target` : "Target unavailable"}</span></div>
      {exec.milk.historyAvailable ? <>
        <div className="milk-values"><strong className="lane-value">{exec.milk.actualMl ?? "Unavailable"}</strong>
          <div className="target-value">Daily milk target <strong>{exec.milk.targetMl ?? "Unavailable"}</strong>{exec.milk.targetOz && <span> / {exec.milk.targetOz}</span>}</div></div>
        {milkPercent !== null && <div className="care-track milk-track" role="img" aria-label={`${exec.milk.actualMl} consumed, ${exec.milk.percent} of ${exec.milk.targetMl} tracking target`}>
          <span className="care-fill" style={{width:`${Math.min(100, milkPercent)}%`}}/>
        </div>}
        <div className="track-labels"><span>{exec.milk.bottleCount ?? 0} bottles</span><span>{milkPercent !== null && milkPercent > 100 ? "Above tracking target" : "Rolling 24 hours"}</span></div>
      </> : <p className="empty">Bottle history is unavailable from the current Huckleberry sync.</p>}
      {exec.milk.latest?.recordedAt ? <div className="bottle-detail"><span>Latest bottle <strong>{exec.milk.latest.amount ?? "Amount not recorded"}</strong>{exec.milk.latest.type && <> · {exec.milk.latest.type}</>}</span>
        <span><RecordedTime value={exec.milk.latest.recordedAt}/> · {exec.milk.timeSinceLatest} ago</span></div> :
        <div className="bottle-detail" aria-label="Bottle summary">{data.bottle.recordedAt ? <><span>Last summary bottle feed <strong>{data.bottle.amount ?? "Amount not recorded"}</strong> · {data.bottle.type ?? "Milk type not recorded"}</span>
          <RecordedTime value={data.bottle.recordedAt}/></> : <span>No bottle summary available.</span>}</div>}
    </section>
    <section className="care-lane" aria-label="Diaper logs">
      <div className="lane-heading"><h2><Droplets size={21}/>Diaper logs</h2><span className="lane-status">24-hour log cutoff</span></div>
      <div className="diaper-lanes"><DiaperLane label="Pee" item={exec.diaper.pee}/><DiaperLane label="Poop" item={exec.diaper.poop}/></div>
    </section>
    <section className="care-lane growth-lane" aria-label="Growth">
      <div className="lane-heading"><h2><Ruler size={21}/>Growth</h2><span className="lane-status">{exec.weight.projectionNote ?? "Projection unavailable"}</span></div>
      <div className="growth-values">
        <div className="weight-value"><span className="value-label">Actual weight</span><strong className="lane-value">{exec.weight.actual ?? "Not recorded"}</strong>
          <small>{exec.weight.measuredAt ? <>Measured <RecordedTime value={exec.weight.measuredAt}/></> : "No growth measurement date available."}</small></div>
        <div className="weight-connector" aria-hidden="true"/>
        <div className="weight-value"><span className="value-label">Projected weight</span><strong className="lane-value">{exec.weight.projected ?? "Unavailable"}</strong><small>Estimated today</small></div>
      </div>
      <div className="growth-details"><span>Length / height <strong>{data.growth.height ?? "Not recorded"}</strong></span><span>Head circumference <strong>{data.growth.head ?? "Not recorded"}</strong></span></div>
    </section>
    <p className="muted data-note">Weight projection and milk target are tracking estimates, not medical guidance. Diaper flags reflect missing logs in the last synced history.</p>
  </div>;
}
