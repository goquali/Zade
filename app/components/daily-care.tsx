"use client";
import { useEffect, useState } from "react";
type Event = {at:string;kind:string;description:string;volumeMl:number|null};
export default function DailyCare({todaysMl,todaysBottles,todaysDiapers,events,historyAvailable}:{
  todaysMl:number|null;todaysBottles:number;todaysDiapers:number|null;events:Event[];historyAvailable:boolean;
}) {
  const [goal,setGoal]=useState<number|null>(null);
  const [draft,setDraft]=useState("");
  const [editing,setEditing]=useState(false);
  const [today,setToday]=useState<string|null>(null);
  useEffect(()=>{
    const parts=new Intl.DateTimeFormat("en-US",{timeZone:"America/Los_Angeles",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date());
    const pick=(type:string)=>parts.find(p=>p.type===type)?.value??"";
    setToday(pick("year")+"-"+pick("month")+"-"+pick("day"));
    const saved=window.localStorage.getItem("zade-daily-feeding-goal-ml");
    if(saved && Number(saved)>0 && Number(saved)<=2000){setGoal(Number(saved));setDraft(saved);}
  },[]);
  const percent=goal && todaysMl!==null ? Math.round(todaysMl/goal*100) : null;
  const save=(e:React.FormEvent)=>{
    e.preventDefault();
    const value=Number(draft);
    if(!Number.isFinite(value)||value<1||value>2000)return;
    setGoal(value);window.localStorage.setItem("zade-daily-feeding-goal-ml",String(value));setEditing(false);
  };
  const baselineG=2235;
  const projectedDays=today?Math.max(0,Math.floor((Date.parse(today+"T12:00:00Z")-Date.parse("2026-10-07T12:00:00Z"))/86400000)):0;
  const projectedG=baselineG+30*projectedDays;
  return <section className="daily-overview">
    <div className="sectionHead"><h2>Today at a glance</h2><span>Pacific time</span></div>
    <div className="daily-cards">
      <article className="metric daily-progress">
        <div className="metricTop"><h3>Bottle intake today</h3></div>
        <strong>{todaysMl===null?"Unavailable":todaysMl+" mL"}</strong>
        <small>{todaysMl===null?"Waiting for complete feeding history":todaysBottles+" bottles recorded today"}</small>
        <div className="progress-meta"><span>Daily care-team goal</span><strong>{goal?goal+" mL":"Not set"}</strong></div>
        <div className="progress-track" role="progressbar" aria-label="Daily bottle feeding progress" aria-valuemin={0}
          aria-valuemax={goal??100} aria-valuenow={goal&&todaysMl!==null?Math.min(todaysMl,goal):0}
          aria-valuetext={percent===null?"Goal or intake unavailable":percent+"% of daily goal"}>
          <div className="progress-fill" style={{width:(percent===null?0:Math.min(100,percent))+"%"}}/>
        </div>
        <p className="muted">{percent!==null?percent+"% of goal recorded": "Enter your care team's prescribed daily volume to track progress."}</p>
        {!editing?<button className="goal-button" onClick={()=>setEditing(true)}>{goal?"Edit daily goal":"Set daily goal"}</button>:
          <form onSubmit={save} className="goal-form">
            <label htmlFor="zade-goal">Care-team target (mL/day)</label>
            <input id="zade-goal" type="number" min="1" max="2000" step="1" value={draft} onChange={e=>setDraft(e.target.value)} required/>
            <button type="submit">Save goal</button><button type="button" onClick={()=>setEditing(false)}>Cancel</button>
          </form>}
        <small>Goal is saved in this browser only. Bottle totals exclude nursing sessions without measured volume.</small>
      </article>
      <article className="metric">
        <div className="metricTop"><h3>Growth estimate</h3></div>
        <strong>{today? (projectedG/1000).toFixed(2)+" kg":"Calculating…"}</strong>
        <small>Assuming +30 g/day since the October 7 pediatrician weight</small>
        <p className="muted">Last measured: 4 lb 14.8 oz (about 2,235 g), October 7, Stanford.</p>
        <p className="muted">Projection only, not a measured weight. Update the baseline after the next weigh-in.</p>
        <div className="progress-meta"><span>Diapers today</span><strong>{todaysDiapers===null?"Unavailable":String(todaysDiapers)}</strong></div>
      </article>
    </div>
    <div className="activity-card">
      <h3>Recent activity</h3>
      {!historyAvailable?<p className="muted">Waiting for the next history-enabled Huckleberry sync.</p>:
        events.length===0?<p className="muted">No activities in the recent sync window.</p>:
        <ul className="activity-list">{events.slice(0,24).map((e,i)=><li key={e.at+"-"+i}>
          <span><strong>{e.kind}</strong><small>{e.description}</small></span>
          <time dateTime={e.at}>{new Intl.DateTimeFormat("en-US",{timeZone:"America/Los_Angeles",month:"short",day:"numeric",hour:"numeric",minute:"2-digit"}).format(new Date(e.at))}</time>
        </li>)}</ul>}
    </div>
  </section>;
}