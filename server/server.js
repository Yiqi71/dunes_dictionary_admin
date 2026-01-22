const express = require("express");
const path = require("path");
const sqlite3 = require("sqlite3").verbose();

const app = express();

const cors = require("cors");
app.use(cors());

const rootDir = path.join(__dirname, "..");
const publicDir = path.join(rootDir, "public");
const adminDir = path.join(rootDir, "admin");
const trackingDir = path.join(rootDir, "tracking");
const contentDir = path.join(rootDir, "content");

app.use(express.json({ limit: "200kb" }));
app.use(express.static(publicDir));
app.use("/public", express.static(publicDir));
app.use("/admin", express.static(adminDir));
app.use("/tracking", express.static(trackingDir));
app.use("/content", express.static(contentDir));

// ---- SQLite store ----
const DB_PATH = path.join(trackingDir, "events.sqlite");
const db = new sqlite3.Database(DB_PATH);

db.serialize(() => {
  db.run(
    `CREATE TABLE IF NOT EXISTS events (
      id TEXT,
      name TEXT NOT NULL,
      ts INTEGER NOT NULL,
      sessionId TEXT,
      data TEXT
    )`
  );
  db.run(`CREATE INDEX IF NOT EXISTS idx_events_ts ON events(ts)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_events_name ON events(name)`);
});

function dbRun(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) return reject(err);
      resolve(this);
    });
  });
}

function dbAll(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows);
    });
  });
}

function safeParse(json) {
  if (!json) return {};
  try {
    return JSON.parse(json);
  } catch (_) {
    return {};
  }
}

function rowToEvent(row) {
  return {
    id: row.id || null,
    name: row.name,
    ts: row.ts,
    sessionId: row.sessionId || null,
    data: safeParse(row.data)
  };
}

function startOfDay(ts) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function fmtMs(ms) {
  if (!ms || ms < 0) return "0s";
  const s = Math.round(ms / 1000);
  const m = Math.floor(s / 60);
  const r = s % 60;
  if (m <= 0) return `${r}s`;
  return `${m}m ${r}s`;
}

function buildTermAgg(events) {
  const terms = new Map();
  for (const e of events) {
    if (e.name === "word_view_start" && e.data && e.data.wordId !== undefined) {
      const id = Number(e.data.wordId);
      if (!Number.isFinite(id)) continue;
      if (!terms.has(id)) terms.set(id, { wordId: id, visits: 0, durationMs: 0, days: new Set() });
      const t = terms.get(id);
      t.visits += 1;
      t.days.add(startOfDay(e.ts));
    }
    if (e.name === "word_view_end" && e.data && e.data.wordId !== undefined) {
      const id = Number(e.data.wordId);
      if (!Number.isFinite(id)) continue;
      if (!terms.has(id)) terms.set(id, { wordId: id, visits: 0, durationMs: 0, days: new Set() });
      const t = terms.get(id);
      if (typeof e.data.durationMs === "number") t.durationMs += e.data.durationMs;
      t.days.add(startOfDay(e.ts));
    }
  }

  return Array.from(terms.values()).map(t => ({
    id: t.wordId,
    term: `Term #${t.wordId}`,
    category: "Unknown",
    visits: t.visits,
    durationMs: t.durationMs,
    durationText: fmtMs(t.durationMs),
    activeDays: t.days.size
  }));
}

function buildTrend7d(events) {
  const now = Date.now();
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now - i * 24 * 3600_000);
    d.setHours(0, 0, 0, 0);
    days.push(d.getTime());
  }
  const counts = new Map(days.map(d => [d, 0]));
  for (const e of events) {
    if (e.name !== "word_view_start") continue;
    const d = startOfDay(e.ts);
    if (counts.has(d)) counts.set(d, counts.get(d) + 1);
  }
  const labels = days.map(d => {
    const dt = new Date(d);
    return `${dt.getMonth() + 1}/${dt.getDate()}`;
  });
  const data = days.map(d => counts.get(d) || 0);

  return { labels, cn: data, en: data };
}

function buildFeature(events) {
  const total = events.length || 1;
  const shuffle = events.filter(e => e.name === "shuffle_click").length;
  const search = events.filter(e => e.name === "search_click").length;
  const download = events.filter(e => e.name === "export_click").length;
  const wordClick = events.filter(e => e.name === "word_node_click").length;

  const pct = (n) => Math.round((n / total) * 100);

  return {
    shufflePct: pct(shuffle),
    searchPct: pct(search),
    downloadPct: pct(download),
    wordClickPct: pct(wordClick)
  };
}

app.post("/events", async (req, res) => {
  const e = req.body;

  if (!e || typeof e.name !== "string" || typeof e.ts !== "number") {
    return res.status(400).json({ ok: false, error: "Invalid event" });
  }

  try {
    await dbRun(
      "INSERT INTO events (id, name, ts, sessionId, data) VALUES (?, ?, ?, ?, ?)",
      [e.id || null, e.name, e.ts, e.sessionId || null, JSON.stringify(e.data || {})]
    );
    console.log("event", e.name, e.ts, e.sessionId || "");
    res.json({ ok: true });
  } catch (err) {
    console.error("Insert event failed", err);
    res.status(500).json({ ok: false, error: "DB insert failed" });
  }
});

app.get("/events", async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit || "200", 10), 2000);
  try {
    const rows = await dbAll("SELECT * FROM events ORDER BY ts DESC LIMIT ?", [limit]);
    const events = rows.map(rowToEvent).reverse();
    res.json({ ok: true, events });
  } catch (err) {
    console.error("Fetch events failed", err);
    res.status(500).json({ ok: false, error: "DB query failed" });
  }
});

app.get("/metrics/summary", async (req, res) => {
  const range = req.query.range || "24h";
  const rangeMs =
    range === "1h" ? 3600_000 :
    range === "7d" ? 7 * 24 * 3600_000 :
    24 * 3600_000;

  const since = Date.now() - rangeMs;
  let recent = [];
  try {
    const rows = await dbAll("SELECT * FROM events WHERE ts >= ? ORDER BY ts ASC", [since]);
    recent = rows.map(rowToEvent);
  } catch (err) {
    console.error("Summary query failed", err);
    return res.status(500).json({ ok: false, error: "DB query failed" });
  }

  const sessions = new Set(recent.map(e => e.sessionId).filter(Boolean));

  const viewEnds = recent.filter(e => e.name === "word_view_end" && e.data && typeof e.data.durationMs === "number");
  const avgViewMs = viewEnds.length
    ? Math.round(viewEnds.reduce((s, e) => s + e.data.durationMs, 0) / viewEnds.length)
    : 0;

  res.json({
    ok: true,
    range,
    events: recent.length,
    sessions: sessions.size,
    avgWordViewMs: avgViewMs
  });
});

app.get("/health", (req, res) => res.send("ok"));

// Dashboard APIs
app.get("/api/dashboard", async (req, res) => {
  const rangeMs = 24 * 3600_000;
  const since24h = Date.now() - rangeMs;
  const since7d = Date.now() - 7 * 24 * 3600_000;

  let recent = [];
  let trendEvents = [];
  try {
    const recentRows = await dbAll("SELECT * FROM events WHERE ts >= ? ORDER BY ts ASC", [since24h]);
    const trendRows = await dbAll("SELECT * FROM events WHERE ts >= ? ORDER BY ts ASC", [since7d]);
    recent = recentRows.map(rowToEvent);
    trendEvents = trendRows.map(rowToEvent);
  } catch (err) {
    console.error("Dashboard query failed", err);
    return res.status(500).json({ ok: false, error: "DB query failed" });
  }

  const sessions = new Set(recent.map(e => e.sessionId).filter(Boolean)).size;

  const viewEnds = recent.filter(e => e.name === "word_view_end" && e.data && typeof e.data.durationMs === "number");
  const avgViewMs = viewEnds.length ? Math.round(viewEnds.reduce((s, e) => s + e.data.durationMs, 0) / viewEnds.length) : 0;

  const termAgg = buildTermAgg(recent);
  const activeTerms = termAgg.length;

  res.json({
    ok: true,
    stats: {
      visits24h: recent.filter(e => e.name === "word_view_start").length,
      avgStay: fmtMs(avgViewMs),
      activeTerms,
      sessions
    },
    trend7d: buildTrend7d(trendEvents),
    feature: buildFeature(recent)
  });
});

app.get("/api/terms", async (req, res) => {
  const range = req.query.range || "7d";
  const rangeMs =
    range === "24h" ? 24 * 3600_000 :
    range === "30d" ? 30 * 24 * 3600_000 :
    7 * 24 * 3600_000;

  const since = Date.now() - rangeMs;
  let recent = [];
  try {
    const rows = await dbAll("SELECT * FROM events WHERE ts >= ? ORDER BY ts ASC", [since]);
    recent = rows.map(rowToEvent);
  } catch (err) {
    console.error("Terms query failed", err);
    return res.status(500).json({ ok: false, error: "DB query failed" });
  }

  const rows = buildTermAgg(recent)
    .sort((a, b) => b.visits - a.visits)
    .slice(0, 50);

  res.json({ ok: true, terms: rows });
});





app.use("/api/content", require("./routes/content"));
app.use("/content", express.static(path.join(process.cwd(), "public", "content")));
app.use("/draft", express.static(path.join(process.cwd(), "content", "draft")));


const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server listening on http://0.0.0.0:${PORT}`);
});