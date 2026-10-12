"use client";

import { useState } from "react";

type Preview = { headers: string[]; rows: string[][]; count: number; filename: string };

// Parse quoted CSV fields, including embedded commas and line breaks.
function parseCSV(input: string): string[][] {
  const result: string[][] = [];
  let row: string[] = [], cell = "", quoted = false;
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (ch === '"') {
      if (quoted && input[i + 1] === '"') { cell += '"'; i++; }
      else quoted = !quoted;
    } else if (ch === "," && !quoted) { row.push(cell); cell = ""; }
    else if ((ch === "\n" || ch === "\r") && !quoted) {
      if (ch === "\r" && input[i + 1] === "\n") i++;
      row.push(cell); cell = "";
      if (row.some(v => v.trim())) result.push(row);
      row = [];
    } else cell += ch;
  }
  if (quoted) throw new Error("The CSV has an unclosed quoted field.");
  row.push(cell);
  if (row.some(v => v.trim())) result.push(row);
  return result;
}

export default function HuckleberryImport() {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState("");
  async function load(file?: File) {
    setPreview(null); setError("");
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".csv")) { setError("Please select a CSV export."); return; }
    if (file.size > 8 * 1024 * 1024) { setError("Please select a CSV smaller than 8 MB."); return; }
    try {
      const rows = parseCSV((await file.text()).replace(/^\uFEFF/, ""));
      if (rows.length < 2) throw new Error("The CSV has no data rows.");
      setPreview({ headers: rows[0], rows: rows.slice(1, 4), count: rows.length - 1, filename: file.name });
    } catch (e) { setError(e instanceof Error ? e.message : "Could not read the CSV."); }
  }
  return <div style={{marginTop:16}}>
    <label htmlFor="huckleberry-csv" style={{display:"block",fontWeight:600,marginBottom:8}}>Import Huckleberry tracking export</label>
    <input id="huckleberry-csv" type="file" accept=".csv,text/csv" onChange={e=>void load(e.target.files?.[0])} />
    <p className="muted" style={{marginTop:8}}>The file is read only in this browser tab. It is not uploaded to Zade's server or saved.</p>
    {error && <p role="alert" style={{color:"#a33"}}>{error}</p>}
    {preview && <div style={{marginTop:12}}>
      <p><strong>{preview.count} data rows found</strong> in {preview.filename}</p>
      <p className="muted">Detected columns: {preview.headers.join(", ")}</p>
      <p className="muted">Import preview only. These records are not yet synced or stored, and are not included in dashboard totals.</p>
      <button type="button" onClick={()=>setPreview(null)}>Clear preview</button>
    </div>}
  </div>;
}
