import { Moon, Milk, Droplets, Thermometer, Heart, TrendingUp, ShieldCheck } from "lucide-react";
const metrics = [
  { label: "Total sleep", value: "15h 10m", detail: "Last 24 hours", Icon: Moon },
  { label: "Milk intake", value: "510 mL", detail: "Last 24 hours", Icon: Milk },
  { label: "Diaper changes", value: "8", detail: "Last 24 hours", Icon: Droplets },
  { label: "Nursery temperature", value: "71°F", detail: "Sample reading", Icon: Thermometer }
];
export default function Home() {
  return <main className="shell">
    <header className="header"><div><p className="eyebrow">BABY CARE · PRIVATE DASHBOARD</p><h1>Zade <span>♡</span></h1><p className="muted">A calmer way to see the whole picture.</p></div><div className="avatar"><Heart size={24}/></div></header>
    <div className="notice"><ShieldCheck size={18}/><div><strong>Preview mode</strong><p>All numbers are illustrative. No accounts are connected and no real baby data is stored.</p></div></div>
    <section><div className="sectionHead"><h2>Today at a glance</h2><span>Sample data</span></div><div className="grid">{metrics.map(({label,value,detail,Icon})=><article className="metric" key={label}><div className="metricTop"><Icon size={20}/><span>{label}</span></div><strong>{value}</strong><small>{detail}</small></article>)}</div></section>
    <section className="panel"><div className="sectionHead"><h2>Weekly rhythm</h2><TrendingUp size={19}/></div><p className="muted">Illustrative sleep totals · hours per day</p><div className="bars">{[14.5,15.2,14.8,15.6,15.1,14.7,15.2].map((v,i)=><div className="barItem" key={i}><div className="barTrack"><div className="bar" style={{height:`${v/17*100}%`}}/></div><small>{["M","T","W","T","F","S","S"][i]}</small></div>)}</div></section>
    <section className="panel"><div className="sectionHead"><h2>Daily insights</h2><span>Coming soon</span></div><p>Once connected, this section will summarize feeding trends, sleep patterns, and changes worth reviewing.</p><p className="muted">Insights are informational and not medical guidance.</p></section>
    <section className="panel"><h2>Connections</h2><div className="connection"><span>Huckleberry</span><span className="disconnected">Not connected</span></div><div className="connection"><span>Nanit</span><span className="disconnected">Not connected</span></div><p className="muted">Integration credentials will never be entered into this preview.</p></section>
    <footer>Made for Zade · Preview v0.1</footer>
  </main>;
}
