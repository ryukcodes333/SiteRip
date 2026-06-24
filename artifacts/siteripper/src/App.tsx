import { useState, useEffect, useRef, useCallback } from "react";
import {
  Globe, Download, Loader2, CheckCircle2, XCircle,
  FileCode2, Image, FileText, Link2,
  ChevronRight, AlertCircle, RefreshCw,
  FolderOpen, TerminalSquare, Eye, Code2,
} from "lucide-react";

const API = "/api";

interface CrawlLog {
  ts: number;
  type: "page" | "asset" | "skip" | "error" | "info";
  msg: string;
}
interface Job {
  jobId: string;
  status: "pending" | "running" | "done" | "error";
  url: string;
  pagesFound: number;
  assetsFound: number;
  bytesTotal: number;
  message: string | null;
  downloadUrl: string | null;
  fileTree: string[];
  logs?: CrawlLog[];
}

function fmtBytes(b: number) {
  if (b < 1024) return `${b} B`;
  if (b < 1048576) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1048576).toFixed(2)} MB`;
}

function AnimCount({ value, suffix = "" }: { value: number; suffix?: string }) {
  const [n, setN] = useState(0);
  const raf = useRef(0);
  useEffect(() => {
    const diff = value - n;
    if (!diff) return;
    const dur = Math.min(1200, Math.abs(diff) * 10);
    const t0 = performance.now();
    const start = n;
    const tick = (now: number) => {
      const t = Math.min(1, (now - t0) / dur);
      const ease = 1 - Math.pow(1 - t, 3);
      setN(Math.round(start + diff * ease));
      if (t < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [value]); // eslint-disable-line
  return <>{n.toLocaleString()}{suffix}</>;
}

function FileIcon({ name }: { name: string }) {
  const e = name.split(".").pop()?.toLowerCase();
  if (e === "html") return <FileText size={11} color="#a855f7" />;
  if (e === "css") return <FileCode2 size={11} color="#4f83ff" />;
  if (["js", "ts", "mjs"].includes(e ?? "")) return <FileCode2 size={11} color="#f59e0b" />;
  if (["png", "jpg", "jpeg", "gif", "webp", "svg", "ico"].includes(e ?? "")) return <Image size={11} color="#22c55e" />;
  return <FileText size={11} color="#6b7280" />;
}

function LogDot({ type }: { type: CrawlLog["type"] }) {
  const c = type === "page" ? "#4f83ff" : type === "asset" ? "#a855f7" : type === "error" ? "#ef4444" : type === "skip" ? "#374151" : "#22c55e";
  const s = type === "page" ? "▸" : type === "asset" ? "◆" : type === "error" ? "✖" : type === "skip" ? "–" : "●";
  return <span style={{ color: c, userSelect: "none" }}>{s}</span>;
}

function StatusBadge({ status }: { status: Job["status"] }) {
  const m = {
    pending: { label: "Queued", c: "#facc15", bg: "rgba(250,204,21,0.1)", b: "rgba(250,204,21,0.2)" },
    running: { label: "Scraping…", c: "#60a5fa", bg: "rgba(96,165,250,0.1)", b: "rgba(96,165,250,0.2)" },
    done: { label: "Complete", c: "#4ade80", bg: "rgba(74,222,128,0.1)", b: "rgba(74,222,128,0.2)" },
    error: { label: "Failed", c: "#f87171", bg: "rgba(248,113,113,0.1)", b: "rgba(248,113,113,0.2)" },
  }[status];
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 700, color: m.c, background: m.bg, border: `1px solid ${m.b}`, borderRadius: 999, padding: "3px 10px" }}>
      {status === "running" && <span style={{ width: 6, height: 6, borderRadius: "50%", background: m.c, display: "inline-block", animation: "pulse 1.5s infinite" }} />}
      {status === "done" && <CheckCircle2 size={10} />}
      {status === "error" && <XCircle size={10} />}
      {m.label}
    </span>
  );
}

function TerminalPanel() {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<import("@xterm/xterm").Terminal | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    let disposed = false;
    (async () => {
      const { Terminal: XTerm } = await import("@xterm/xterm");
      const { FitAddon } = await import("@xterm/addon-fit");
      await import("@xterm/xterm/css/xterm.css");
      if (disposed || !containerRef.current) return;
      const term = new XTerm({
        theme: { background: "#0a0a0b", foreground: "#e0e0e2", cursor: "#4f83ff", selectionBackground: "rgba(79,131,255,0.3)" },
        fontFamily: "'JetBrains Mono','Fira Mono',monospace",
        fontSize: 13, cursorBlink: true, convertEol: true,
      });
      const fit = new FitAddon();
      term.loadAddon(fit);
      term.open(containerRef.current);
      fit.fit();
      termRef.current = term;
      const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
      const ws = new WebSocket(`${proto}//${window.location.host}/api/terminal`);
      wsRef.current = ws;
      ws.onopen = () => { setConnected(true); term.writeln("\x1b[32m● Connected to SiteRipper shell\x1b[0m"); term.writeln("\x1b[90mType commands to explore the environment.\x1b[0m\r\n"); };
      ws.onmessage = (e) => { const msg = JSON.parse(e.data); if (msg.type === "out") term.write(msg.data); if (msg.type === "exit") { term.writeln("\r\n\x1b[31m● Shell exited\x1b[0m"); setConnected(false); } };
      ws.onclose = () => { setConnected(false); term.writeln("\r\n\x1b[31m● Disconnected\x1b[0m"); };
      term.onData((data) => { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "input", data })); });
      const ro = new ResizeObserver(() => { try { fit.fit(); } catch {} });
      if (containerRef.current) ro.observe(containerRef.current);
    })();
    return () => { disposed = true; termRef.current?.dispose(); wsRef.current?.close(); };
  }, []);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", background: "rgba(0,0,0,0.4)", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
        <div style={{ width: 8, height: 8, borderRadius: "50%", background: connected ? "#22c55e" : "#6b7280" }} />
        <span style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", fontFamily: "monospace" }}>bash — SiteRipper shell</span>
      </div>
      <div ref={containerRef} style={{ flex: 1, overflow: "hidden", padding: 4 }} />
    </div>
  );
}

function PreviewPanel({ job }: { job: Job }) {
  const [loading, setLoading] = useState(true);
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", background: "rgba(0,0,0,0.4)", borderBottom: "1px solid rgba(255,255,255,0.05)", flexShrink: 0 }}>
        <Globe size={12} color="#4f83ff" />
        <span style={{ fontSize: 11, fontFamily: "monospace", color: "rgba(255,255,255,0.4)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{job.url}</span>
        {loading && <Loader2 size={11} color="rgba(255,255,255,0.3)" style={{ marginLeft: "auto", flexShrink: 0, animation: "spin 1s linear infinite" }} />}
      </div>
      <iframe src={`${API}/scrape/preview/${job.jobId}`} style={{ flex: 1, border: "none", width: "100%", background: "#fff" }} sandbox="allow-scripts allow-same-origin" onLoad={() => setLoading(false)} title="Site Preview" />
    </div>
  );
}

// ── Nav ─────────────────────────────────────────────────────────────────────────
function Nav() {
  return (
    <nav style={{ position: "sticky", top: 0, zIndex: 50, borderBottom: "1px solid rgba(255,255,255,0.06)", backdropFilter: "blur(14px)", background: "rgba(8,8,9,0.9)" }}>
      <div style={{ maxWidth: 1080, margin: "0 auto", height: 56, display: "flex", alignItems: "center", padding: "0 20px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
          <div style={{ width: 32, height: 32, borderRadius: 9, background: "linear-gradient(135deg,#4f83ff,#7c3aed)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Globe size={15} color="#fff" />
          </div>
          <span style={{ fontWeight: 900, fontSize: 15, letterSpacing: "-0.02em", color: "#f0f0f2" }}>SiteRipper</span>
        </div>
      </div>
    </nav>
  );
}

// ── Scraper Dashboard ───────────────────────────────────────────────────────────
function Dashboard({ basePath }: { basePath: string }) {
  const [url, setUrl] = useState("");
  const [maxPages, setMaxPages] = useState(30);
  const [job, setJob] = useState<Job | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [focused, setFocused] = useState(false);
  const [logs, setLogs] = useState<CrawlLog[]>([]);
  const [activeTab, setActiveTab] = useState<"log" | "files" | "preview" | "codespace">("log");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastTsRef = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => { if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight; }, [logs]);
  function stopPoll() { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } }
  useEffect(() => () => stopPoll(), []);

  const poll = useCallback(async (jobId: string) => {
    try {
      const r = await fetch(`${basePath}${API}/scrape/status/${jobId}?since=${lastTsRef.current}`);
      const j: Job & { logs?: CrawlLog[] } = await r.json();
      setJob(j);
      if (j.logs?.length) { lastTsRef.current = j.logs[j.logs.length - 1].ts; setLogs(prev => [...prev, ...(j.logs ?? [])].slice(-300)); }
      if (j.status === "done" || j.status === "error") stopPoll();
    } catch {}
  }, [basePath]);

  async function startScrape(e: React.FormEvent) {
    e.preventDefault();
    setError(""); setJob(null); setLogs([]); setLoading(true);
    lastTsRef.current = 0; stopPoll();
    try {
      const res = await fetch(`${basePath}${API}/scrape/start`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: url.trim(), maxPages }) });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Failed"); setLoading(false); return; }
      setJob(data); setLoading(false); setActiveTab("log");
      pollRef.current = setInterval(() => poll(data.jobId), 1000);
    } catch (err: unknown) { setError(err instanceof Error ? err.message : "Network error"); setLoading(false); }
  }

  function reset() { stopPoll(); setJob(null); setError(""); setUrl(""); setLogs([]); lastTsRef.current = 0; }

  function triggerDownload(dlUrl: string, filename: string) {
    fetch(dlUrl).then(r => r.blob()).then(blob => {
      const u = URL.createObjectURL(blob);
      const a = Object.assign(document.createElement("a"), { href: u, download: filename });
      document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(u);
    }).catch(() => setError("Download failed."));
  }

  const isRunning = job?.status === "pending" || job?.status === "running";
  const isDisabled = loading || isRunning;
  const pct = job ? job.status === "done" ? 100 : job.status === "error" ? 0 : Math.min(90, job.pagesFound * 5 + job.assetsFound * 0.3) : 0;

  const availableTabs = [
    { id: "log", label: "Live Log", icon: TerminalSquare },
    { id: "files", label: `Files (${job?.fileTree.length ?? 0})`, icon: FolderOpen },
    ...(job?.status === "done" ? [{ id: "preview", label: "Preview", icon: Eye }, { id: "codespace", label: "Codespace", icon: Code2 }] : []),
  ] as { id: string; label: string; icon: React.FC<{ size: number }> }[];

  return (
    <div style={{ fontFamily: "'Inter',-apple-system,sans-serif", background: "#080809", minHeight: "100vh", color: "#f0f0f2" }}>
      <div style={{ position: "fixed", top: -200, left: "50%", transform: "translateX(-50%)", width: 700, height: 500, background: "radial-gradient(ellipse,rgba(79,131,255,0.06) 0%,transparent 70%)", pointerEvents: "none", zIndex: 0 }} />

      <main style={{ position: "relative", zIndex: 1, maxWidth: 820, margin: "0 auto", padding: "36px 16px 100px" }}>

        {/* Header */}
        {!job && (
          <div style={{ marginBottom: 32 }}>
            <h1 style={{ fontSize: "clamp(1.4rem,5vw,2rem)", fontWeight: 900, letterSpacing: "-0.03em", marginBottom: 8 }}>Scraper Dashboard</h1>
            <p style={{ fontSize: 14, color: "rgba(255,255,255,0.35)" }}>Paste a URL below and rip the whole site.</p>
          </div>
        )}

        {/* Job header */}
        {job && (
          <div style={{ marginBottom: 18, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
                <StatusBadge status={job.status} />
                <span style={{ fontSize: 11, color: "rgba(255,255,255,0.2)", fontFamily: "monospace" }}>#{job.jobId.slice(0, 8)}</span>
              </div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", fontFamily: "monospace", wordBreak: "break-all" }}>{job.url}</div>
            </div>
            <button onClick={reset} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: "rgba(255,255,255,0.4)", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, padding: "7px 12px", cursor: "pointer" }}>
              <RefreshCw size={11} /> New scrape
            </button>
          </div>
        )}

        {/* URL input card */}
        <div style={{ background: "rgba(255,255,255,0.025)", border: `1px solid ${focused ? "rgba(79,131,255,0.35)" : "rgba(255,255,255,0.07)"}`, borderRadius: 14, padding: "18px 16px", marginBottom: 12, transition: "border-color 0.2s", backdropFilter: "blur(8px)" }}>
          <form onSubmit={startScrape}>
            <label style={{ display: "block", fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 10 }}>Website URL</label>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, background: "rgba(0,0,0,0.35)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 10, padding: "0 12px" }}>
                <Link2 size={13} color="rgba(255,255,255,0.22)" style={{ flexShrink: 0 }} />
                <input ref={inputRef} type="text" inputMode="url" required value={url}
                  onChange={e => setUrl(e.target.value)}
                  onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
                  placeholder="https://example.com" disabled={isDisabled}
                  autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false}
                  style={{ flex: 1, background: "transparent", border: "none", outline: "none", color: "#f0f0f2", fontSize: 14, padding: "14px 0", fontFamily: "'JetBrains Mono','Fira Mono',monospace", minWidth: 0, WebkitAppearance: "none" }} />
              </div>
              <button type="submit" disabled={isDisabled || !url.trim()}
                style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "14px 20px", background: isDisabled ? "rgba(79,131,255,0.3)" : "linear-gradient(135deg,#4f83ff,#6366f1)", color: "#fff", border: "none", borderRadius: 10, fontWeight: 700, fontSize: 15, cursor: isDisabled || !url.trim() ? "not-allowed" : "pointer", opacity: !url.trim() ? 0.5 : 1, transition: "all 0.2s", width: "100%" }}>
                {loading || isRunning ? <><Loader2 size={15} style={{ animation: "spin 1s linear infinite" }} />{loading ? "Starting…" : "Scraping…"}</> : <><Download size={15} />Rip It</>}
              </button>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12, marginTop: 12, paddingTop: 12, borderTop: "1px solid rgba(255,255,255,0.05)" }}>
              <label style={{ fontSize: 12, color: "rgba(255,255,255,0.32)", display: "flex", alignItems: "center", gap: 8 }}>
                Max pages:
                <select value={maxPages} onChange={e => setMaxPages(Number(e.target.value))}
                  style={{ background: "#1a1a1e", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 6, color: "#f0f0f2", fontSize: 12, padding: "4px 8px", cursor: "pointer" }}>
                  {[5, 10, 20, 30, 50, 100, 200].map(n => <option key={n} value={n}>{n}</option>)}
                </select>
              </label>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.18)" }}>Follows subdomains · Grabs CSS assets · Preserves structure</div>
            </div>
          </form>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 12 }}>
            <span style={{ fontSize: 11, color: "rgba(255,255,255,0.18)", paddingTop: 3 }}>Try:</span>
            {["https://example.com", "https://developer.mozilla.org", "https://docs.astro.build"].map(ex => (
              <button key={ex} onClick={() => { setUrl(ex); setTimeout(() => inputRef.current?.focus(), 50); }}
                style={{ fontSize: 11, color: "rgba(255,255,255,0.32)", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 6, padding: "3px 10px", cursor: "pointer", fontFamily: "monospace" }}>
                {ex.replace("https://", "")}
              </button>
            ))}
          </div>
        </div>

        {/* Error */}
        {error && (
          <div style={{ display: "flex", alignItems: "flex-start", gap: 10, background: "rgba(239,68,68,0.07)", border: "1px solid rgba(239,68,68,0.18)", borderRadius: 10, padding: "12px 14px", marginBottom: 12, color: "#ef4444", fontSize: 13 }}>
            <AlertCircle size={15} style={{ flexShrink: 0, marginTop: 1 }} />
            <span style={{ flex: 1 }}>{error}</span>
            <button onClick={() => setError("")} style={{ background: "none", border: "none", color: "rgba(239,68,68,0.5)", cursor: "pointer", fontSize: 18, lineHeight: 1 }}>×</button>
          </div>
        )}

        {/* Job stats + tabs */}
        {job && (
          <div style={{ marginBottom: 14 }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10, marginBottom: 12 }}>
              {[
                { label: "Pages crawled", value: <AnimCount value={job.pagesFound} />, color: "#4f83ff" },
                { label: "Assets grabbed", value: <AnimCount value={job.assetsFound} />, color: "#a855f7" },
                { label: "Total size", value: fmtBytes(job.bytesTotal), color: "#22c55e" },
              ].map(({ label, value, color }) => (
                <div key={label} style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 12, padding: "12px 10px", textAlign: "center" }}>
                  <div style={{ fontSize: "clamp(16px,4vw,22px)", fontWeight: 900, color, letterSpacing: "-0.02em" }}>{value}</div>
                  <div style={{ fontSize: 10, color: "rgba(255,255,255,0.28)", marginTop: 2 }}>{label}</div>
                </div>
              ))}
            </div>

            {isRunning && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                  <span style={{ fontSize: 11, color: "rgba(255,255,255,0.32)" }}>{job.message}</span>
                  <span style={{ fontSize: 11, color: "rgba(255,255,255,0.2)", fontFamily: "monospace" }}>{Math.round(pct)}%</span>
                </div>
                <div style={{ height: 3, background: "rgba(255,255,255,0.06)", borderRadius: 3, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${pct}%`, background: "linear-gradient(90deg,#4f83ff,#a855f7)", borderRadius: 3, transition: "width 0.6s ease" }} />
                </div>
              </div>
            )}

            <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 12, overflow: "hidden" }}>
              <div style={{ display: "flex", borderBottom: "1px solid rgba(255,255,255,0.06)", overflowX: "auto" }}>
                {availableTabs.map(({ id, label, icon: Icon }) => (
                  <button key={id} onClick={() => setActiveTab(id as typeof activeTab)}
                    style={{ flexShrink: 0, padding: "10px 14px", background: activeTab === id ? "rgba(79,131,255,0.08)" : "transparent", border: "none", borderBottom: activeTab === id ? "2px solid #4f83ff" : "2px solid transparent", color: activeTab === id ? "#f0f0f2" : "rgba(255,255,255,0.3)", fontSize: 12, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 5, transition: "all 0.15s", whiteSpace: "nowrap" }}>
                    <Icon size={12} /> {label}
                  </button>
                ))}
              </div>

              {(activeTab === "log" || activeTab === "files") && (
                <div ref={activeTab === "log" ? logRef : undefined}
                  style={{ height: 240, overflowY: "auto", padding: "10px 12px", fontFamily: "'JetBrains Mono','Fira Mono',monospace", fontSize: 11, lineHeight: 1.8 }}>
                  {activeTab === "log" && (
                    <>
                      {logs.length === 0 && isRunning && <div style={{ color: "rgba(255,255,255,0.2)", fontStyle: "italic" }}>Starting crawl…</div>}
                      {logs.map((l, i) => (
                        <div key={i} style={{ display: "flex", gap: 7, color: l.type === "error" ? "#ef4444" : l.type === "skip" ? "rgba(255,255,255,0.18)" : "rgba(255,255,255,0.5)", wordBreak: "break-all" }}>
                          <LogDot type={l.type} /><span>{l.msg}</span>
                        </div>
                      ))}
                      {job.status === "done" && <div style={{ color: "#22c55e", marginTop: 4 }}>✓ Crawl complete — {job.pagesFound} pages, {job.assetsFound} assets</div>}
                      {job.status === "error" && <div style={{ color: "#ef4444", marginTop: 4 }}>✖ {job.message}</div>}
                    </>
                  )}
                  {activeTab === "files" && (
                    <>
                      {job.fileTree.length === 0 && <div style={{ color: "rgba(255,255,255,0.2)", fontStyle: "italic" }}>Waiting…</div>}
                      {job.fileTree.map((f, i) => (
                        <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, color: "rgba(255,255,255,0.45)" }}>
                          <FileIcon name={f} />
                          <span style={{ color: f.endsWith(".html") ? "rgba(168,85,247,0.85)" : f.match(/\.css$/) ? "rgba(79,131,255,0.85)" : f.match(/\.(js|mjs)$/) ? "rgba(245,158,11,0.85)" : "rgba(255,255,255,0.42)" }}>{f}</span>
                        </div>
                      ))}
                    </>
                  )}
                </div>
              )}
              {activeTab === "preview" && job && <div style={{ height: 480 }}><PreviewPanel job={job} /></div>}
              {activeTab === "codespace" && <div style={{ height: 380, display: "flex", flexDirection: "column" }}><TerminalPanel /></div>}
            </div>

            <div style={{ marginTop: 12 }}>
              {job.status === "done" && job.downloadUrl && (() => {
                let hostname = ""; try { hostname = new URL(job.url).hostname; } catch {}
                return (
                  <button onClick={() => triggerDownload(job.downloadUrl!, `${hostname || "site"}.zip`)}
                    style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, width: "100%", padding: "15px 20px", background: "linear-gradient(135deg,#22c55e,#16a34a)", color: "#000", borderRadius: 12, fontWeight: 800, fontSize: 15, border: "none", cursor: "pointer", letterSpacing: "-0.01em" }}>
                    <Download size={17} />
                    Download {hostname} — .zip ({fmtBytes(job.bytesTotal)})
                    <ChevronRight size={15} />
                  </button>
                );
              })()}
              {job.status === "error" && (
                <div style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "14px", background: "rgba(239,68,68,0.07)", border: "1px solid rgba(239,68,68,0.15)", borderRadius: 10, color: "#ef4444", fontSize: 13 }}>
                  <XCircle size={15} style={{ flexShrink: 0, marginTop: 1 }} />
                  {job.message ?? "Scrape failed. The site may block bots or require authentication."}
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

// ── Root App ───────────────────────────────────────────────────────────────────
export default function App({ basePath }: { basePath: string }) {
  return (
    <>
      <Nav />
      <Dashboard basePath={basePath} />
    </>
  );
}
