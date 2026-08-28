"use client";

import { useState } from "react";

const LAUNCHES_FILE = "red_pump_2026_v1_launches.jsonl.gz";
const OUTCOMES_FILE = "red_pump_2026_v1_outcomes.csv.gz";
const COMPACT_FILE = "red_pump_2026_v1_compact.jsonl.gz";
const HASHES: Record<string, string> = {
  [LAUNCHES_FILE]: "042940379e8c897ac97403e6b25a5b302fb32b6902a8fc0cef4ab70ac11e8f84",
  [OUTCOMES_FILE]: "c0a327ea442d91c6f970b2bad9a2a9b778e163d8c3eb38f71eccd3e92209a974",
};

async function checkedJson(response: Response) {
  const body = await response.json() as Record<string, unknown>;
  if (!response.ok) {
    throw new Error(String(body.message ?? body.error ?? `Request failed (${response.status}).`));
  }
  return body;
}

async function sendJson(token: string, body: Record<string, unknown>) {
  return checkedJson(await fetch("/api/cohort/import", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-backfill-token": token,
    },
    body: JSON.stringify(body),
  }));
}

async function uploadRaw(token: string, file: File) {
  return checkedJson(await fetch(`/api/cohort/raw?filename=${encodeURIComponent(file.name)}`, {
    method: "PUT",
    headers: {
      "content-type": "application/gzip",
      "x-backfill-token": token,
      "x-content-sha256": HASHES[file.name] ?? "",
    },
    body: file,
  }));
}

async function* decodedLines(file: File): AsyncGenerator<string> {
  const reader = file.stream()
    .pipeThrough(new DecompressionStream("gzip"))
    .pipeThrough(new TextDecoderStream())
    .getReader();
  let remainder = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const lines = `${remainder}${value}`.split("\n");
    remainder = lines.pop() ?? "";
    for (const line of lines) if (line) yield line;
  }
  if (remainder) yield remainder;
}

export default function CohortUploadPage() {
  const [token, setToken] = useState("");
  const [launches, setLaunches] = useState<File | null>(null);
  const [outcomes, setOutcomes] = useState<File | null>(null);
  const [compact, setCompact] = useState<File | null>(null);
  const [state, setState] = useState<"idle" | "running" | "complete" | "error">("idle");
  const [message, setMessage] = useState("Choose the three frozen files to begin.");
  const [rows, setRows] = useState(0);

  const ready = token.length >= 32 &&
    launches?.name === LAUNCHES_FILE &&
    outcomes?.name === OUTCOMES_FILE &&
    compact?.name === COMPACT_FILE;

  async function runImport() {
    if (!ready || !launches || !outcomes || !compact) return;
    setState("running");
    setRows(0);
    try {
      setMessage("Opening the verified import manifest…");
      await sendJson(token, { action: "manifest" });
      setMessage("Archiving the launch source…");
      await uploadRaw(token, launches);
      setMessage("Archiving the outcome source…");
      await uploadRaw(token, outcomes);

      const batch: unknown[] = [];
      let accepted = 0;
      for await (const line of decodedLines(compact)) {
        batch.push(JSON.parse(line));
        if (batch.length === 1_000) {
          await sendJson(token, { action: "rows", rows: batch });
          accepted += batch.length;
          batch.length = 0;
          setRows(accepted);
          setMessage(`Uploading launch index: ${accepted.toLocaleString()} rows accepted.`);
        }
      }
      if (batch.length) {
        await sendJson(token, { action: "rows", rows: batch });
        accepted += batch.length;
        setRows(accepted);
      }
      setMessage("Checking exact production counts…");
      const result = await sendJson(token, { action: "finalize" });
      const dataset = result.dataset as { status?: string } | undefined;
      if (dataset?.status !== "ready") throw new Error("Final counts did not match the frozen manifest.");
      setToken("");
      setState("complete");
      setMessage(`Complete: ${accepted.toLocaleString()} historical launches are ready.`);
    } catch (error) {
      setState("error");
      setMessage(error instanceof Error ? error.message : "The import stopped unexpectedly.");
    }
  }

  return (
    <main className="operator-upload">
      <header>
        <span className="kicker">Private operator tool</span>
        <h1>Load the historical cohort</h1>
        <p>Streams the corrected RED-PUMP corpus into private raw storage and the browseable launch index. Rerunning is safe.</p>
      </header>
      <div className="operator-fields">
        <label>
          Admin token
          <input autoComplete="off" onChange={(event) => setToken(event.target.value)} type="password" value={token} />
        </label>
        <label>
          Launch source
          <input accept=".gz" onChange={(event) => setLaunches(event.target.files?.[0] ?? null)} type="file" />
        </label>
        <label>
          Outcome source
          <input accept=".gz" onChange={(event) => setOutcomes(event.target.files?.[0] ?? null)} type="file" />
        </label>
        <label>
          Compact launch index
          <input accept=".gz" onChange={(event) => setCompact(event.target.files?.[0] ?? null)} type="file" />
        </label>
      </div>
      <button className="button-primary" disabled={!ready || state === "running"} onClick={() => { void runImport(); }} type="button">
        {state === "running" ? "Importing…" : "Start verified import"}
      </button>
      <div aria-live="polite" className={`operator-progress ${state}`}>
        <strong>{state === "complete" ? "Ready" : state === "error" ? "Stopped" : "Status"}</strong>
        <p>{message}</p>
        {rows > 0 ? <progress max={860_194} value={rows}>{rows} of 860194</progress> : null}
      </div>
      <p><button className="button-secondary" onClick={() => { window.location.href = "/?screen=coins"; }} type="button">Return to Coins</button></p>
    </main>
  );
}
