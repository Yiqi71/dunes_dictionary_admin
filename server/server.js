const express = require("express");
const path = require("path");
const fs = require("fs");
const sqlite3 = require("sqlite3").verbose();

const app = express();

const cors = require("cors");
app.use(cors({
  origin: [
    "https://dunes-dictionary-admin.vercel.app",
    "https://dunes-dictionary.com",
    "https://www.dunes-dictionary.com",
    "http://localhost:3000",
    "http://127.0.0.1:3000"
  ],
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type"]
}));

const rootDir = path.join(__dirname, "..");
const publicDir = path.join(rootDir, "public");
const adminDir = path.join(rootDir, "admin");
const trackingDir = path.join(rootDir, "tracking");
const contentDir = path.join(rootDir, "content");

app.use(express.json({ limit: "200kb" }));
// Prevent leaking raw invite code lists from static files.
app.use((req, res, next) => {
  const reqPath = String(req.path || "");
  if (/invite-codes\.json$/i.test(reqPath)) {
    return res.status(404).json({ ok: false, error: "not_found" });
  }
  return next();
});
app.use(express.static(publicDir));
app.use(express.static(rootDir));
app.use("/public", express.static(publicDir));
app.use("/admin", express.static(adminDir));
app.use("/tracking", express.static(trackingDir));
app.use("/content", express.static(contentDir));

// ---- SQLite store ----
const DB_PATH = process.env.EVENTS_DB_PATH
  ? process.env.EVENTS_DB_PATH
  : path.join(trackingDir, "events.sqlite");

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
  db.run(
    `CREATE TABLE IF NOT EXISTS invite_codes (
      code TEXT PRIMARY KEY,
      max_devices INTEGER NOT NULL DEFAULT 5,
      status TEXT NOT NULL DEFAULT 'active',
      bound_count INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )`
  );
  db.run(
    `CREATE TABLE IF NOT EXISTS invite_devices (
      code TEXT NOT NULL,
      device_id TEXT NOT NULL,
      first_seen_at INTEGER NOT NULL,
      last_seen_at INTEGER NOT NULL,
      PRIMARY KEY (code, device_id)
    )`
  );
  db.run(`CREATE INDEX IF NOT EXISTS idx_invite_devices_code ON invite_devices(code)`);
  db.run(
    `CREATE TABLE IF NOT EXISTS invite_legacy_exempt_devices (
      code TEXT NOT NULL,
      device_id TEXT NOT NULL,
      first_seen_at INTEGER NOT NULL,
      last_seen_at INTEGER NOT NULL,
      PRIMARY KEY (code, device_id)
    )`
  );
  db.run(`CREATE INDEX IF NOT EXISTS idx_invite_legacy_code ON invite_legacy_exempt_devices(code)`);
});

function dbRun(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) return reject(err);
      resolve(this);
    });
  });
}

function dbGet(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) return reject(err);
      resolve(row || null);
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

function getEventLangKey(e) {
  const d = (e && e.data) || {};
  const raw = String(d.lang || d.language || d.locale || d.uiLang || d.to || "").toLowerCase();
  if (raw.startsWith("en")) return "en";
  if (raw.startsWith("zh") || raw.includes("cn")) return "cn";
  return null;
}

function getEventDedupeId(e) {
  const d = (e && e.data) || {};
  const deviceId = String(d.deviceId || "").trim();
  if (deviceId) return deviceId;
  const fallbackSessionId = String((e && e.sessionId) || "").trim();
  return fallbackSessionId;
}

function countUniqueUsers(events) {
  return new Set((events || []).map(getEventDedupeId).filter(Boolean)).size;
}

function loadWordTermMap() {
  const draftPath = path.join(contentDir, "draft", "data.json");
  const map = new Map();
  try {
    const raw = fs.readFileSync(draftPath, "utf8");
    const parsed = JSON.parse(raw);
    const words = Array.isArray(parsed && parsed.words) ? parsed.words : [];
    for (const word of words) {
      const id = Number(word && word.id);
      if (!Number.isFinite(id)) continue;
      const term = word && word.term ? word.term : {};
      const zh = typeof term.zh === "string" ? term.zh.trim() : "";
      const en = typeof term.en === "string" ? term.en.trim() : "";
      const label = zh || en;
      if (label) map.set(id, label);
    }
  } catch (err) {
    console.warn("Failed to read draft words for term labels:", err.message);
  }
  return map;
}

function buildTermAgg(events, wordTermMap = null) {
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
    term: (wordTermMap && wordTermMap.get(t.wordId)) || `Term #${t.wordId}`,
    category: "Unknown",
    visits: t.visits,
    durationMs: t.durationMs,
    durationText: fmtMs(t.durationMs),
    activeDays: t.days.size
  }));
}

function buildTrendNdByLang(events, daysCount) {
  const now = Date.now();
  const days = [];
  for (let i = daysCount - 1; i >= 0; i--) {
    const d = new Date(now - i * 24 * 3600_000);
    d.setHours(0, 0, 0, 0);
    days.push(d.getTime());
  }
  const cnCounts = new Map(days.map(d => [d, 0]));
  const enCounts = new Map(days.map(d => [d, 0]));
  let missingLang = 0;
  for (const e of events) {
    if (e.name !== "word_view_start") continue;
    const d = startOfDay(e.ts);
    if (!cnCounts.has(d)) continue;
    const lang = getEventLangKey(e);
    if (lang === "en") {
      enCounts.set(d, enCounts.get(d) + 1);
    } else if (lang === "cn") {
      cnCounts.set(d, cnCounts.get(d) + 1);
    } else {
      missingLang += 1;
      cnCounts.set(d, cnCounts.get(d) + 1);
    }
  }
  const labels = days.map(d => {
    const dt = new Date(d);
    return `${dt.getMonth() + 1}/${dt.getDate()}`;
  });
  const cn = days.map(d => cnCounts.get(d) || 0);
  const en = days.map(d => enCounts.get(d) || 0);

  return { labels, cn, en, missingLang };
}

function buildFeature(events) {
  const totalUsers = countUniqueUsers(events);
  const denom = totalUsers || 0;
  const buildStat = (names) => {
    const matched = events.filter(e => names.includes(e.name));
    const count = matched.length;
    const users = countUniqueUsers(matched);
    const pct = denom ? Math.round((users / denom) * 100) : 0;
    return { count, users, pct };
  };

  return {
    totalUsers,
    interactions: {
      search: buildStat(["search_click"]),
      timeline: buildStat(["year_filter_change", "timeline_click"]),
      link: buildStat(["word_node_click", "link_click"]),
      map: buildStat(["map_click", "menu_home_click"]),
      shuffle: buildStat(["shuffle_click"]),
      about: buildStat(["about_click"])
    }
  };
}

function normalizeVoteChoice(choice) {
  const v = String(choice || "").toLowerCase();
  if (v === "clear" || v === "unclear") return v;
  return null;
}

function toVoteStats(clear, unclear) {
  const safeClear = Math.max(0, Number(clear) || 0);
  const safeUnclear = Math.max(0, Number(unclear) || 0);
  const total = safeClear + safeUnclear;
  const clearPct = total > 0 ? Math.round((safeClear / total) * 100) : 0;
  const unclearPct = total > 0 ? 100 - clearPct : 0;
  return {
    clear: safeClear,
    unclear: safeUnclear,
    total,
    clearPct,
    unclearPct
  };
}

function aggregateUnderstandingVotes(events, targetWordId = null) {
  const target = targetWordId === null || targetWordId === undefined
    ? null
    : String(targetWordId);
  const latestByWordAndDevice = new Map();

  for (const e of events) {
    if (!e || e.name !== "entry_understanding_vote") continue;
    const d = e.data || {};
    const wordId = String(d.wordId || "");
    if (!wordId) continue;
    if (target !== null && wordId !== target) continue;

    const deviceId = String(d.deviceId || "").trim();
    const fallbackSessionId = String(e.sessionId || "").trim();
    const dedupeId = deviceId || fallbackSessionId;
    const choice = normalizeVoteChoice(d.choice);
    if (!dedupeId || !choice) continue;

    const key = `${wordId}::${dedupeId}`;
    const ts = Number(e.ts) || 0;
    const prev = latestByWordAndDevice.get(key);
    if (!prev || ts >= prev.ts) {
      latestByWordAndDevice.set(key, { wordId, choice, ts });
    }
  }

  const countsByWord = new Map();
  latestByWordAndDevice.forEach((entry) => {
    if (!countsByWord.has(entry.wordId)) {
      countsByWord.set(entry.wordId, { clear: 0, unclear: 0 });
    }
    const item = countsByWord.get(entry.wordId);
    item[entry.choice] += 1;
  });

  if (target !== null) {
    const item = countsByWord.get(target) || { clear: 0, unclear: 0 };
    return toVoteStats(item.clear, item.unclear);
  }

  const statsByWordId = {};
  countsByWord.forEach((item, wordId) => {
    statsByWordId[wordId] = toVoteStats(item.clear, item.unclear);
  });
  return statsByWordId;
}

function aggregateCommentLikeVotes(events, targetWordId = null) {
  const target = targetWordId === null || targetWordId === undefined
    ? null
    : String(targetWordId);
  const latestByWordCommentAndDevice = new Map();

  for (const e of events) {
    if (!e || e.name !== "comment_like_toggle") continue;
    const d = e.data || {};
    const wordId = String(d.wordId || "").trim();
    if (!wordId) continue;
    if (target !== null && wordId !== target) continue;

    const commentIndex = Number(d.commentIndex);
    if (!Number.isFinite(commentIndex)) continue;

    const deviceId = String(d.deviceId || "").trim();
    const fallbackSessionId = String(e.sessionId || "").trim();
    const dedupeId = deviceId || fallbackSessionId;
    if (!dedupeId) continue;

    const ts = Number(e.ts) || 0;
    const liked = Boolean(d.liked);
    const key = `${wordId}::${commentIndex}::${dedupeId}`;
    const prev = latestByWordCommentAndDevice.get(key);
    if (!prev || ts >= prev.ts) {
      latestByWordCommentAndDevice.set(key, { wordId, commentIndex, liked, ts });
    }
  }

  const countsByWord = new Map();
  latestByWordCommentAndDevice.forEach((entry) => {
    if (!entry.liked) return;
    if (!countsByWord.has(entry.wordId)) {
      countsByWord.set(entry.wordId, {});
    }
    const item = countsByWord.get(entry.wordId);
    const idx = String(entry.commentIndex);
    item[idx] = (item[idx] || 0) + 1;
  });

  if (target !== null) {
    return countsByWord.get(target) || {};
  }

  const countsByWordId = {};
  countsByWord.forEach((item, wordId) => {
    countsByWordId[wordId] = item;
  });
  return countsByWordId;
}

function normalizeInviteCode(value) {
  return String(value || "").trim().toUpperCase();
}

function normalizeDeviceId(value) {
  return String(value || "").trim().toLowerCase();
}

function isValidInviteCode(code) {
  return /^DUNES-[A-Z0-9]{4}$/.test(code);
}

function isValidDeviceId(deviceId) {
  return /^[a-z0-9-]{16,128}$/.test(deviceId);
}

const DEFAULT_INVITE_MAX_DEVICES = 5;
const INVITE_REVOKE_ON_LIMIT = String(process.env.INVITE_REVOKE_ON_LIMIT || "").toLowerCase() === "true";
const INVITE_CODES_SEED_PATH = process.env.INVITE_CODES_SEED_PATH
  ? process.env.INVITE_CODES_SEED_PATH
  : path.join(rootDir, "admin", "assets", "data", "invite-codes.json");

function readJsonFileWithBomSupport(filePath) {
  const bytes = fs.readFileSync(filePath);
  let text = "";

  if (bytes.length >= 2 && bytes[0] === 0xFF && bytes[1] === 0xFE) {
    text = bytes.toString("utf16le");
  } else if (bytes.length >= 2 && bytes[0] === 0xFE && bytes[1] === 0xFF) {
    const swapped = Buffer.allocUnsafe(bytes.length - 2);
    for (let i = 2; i + 1 < bytes.length; i += 2) {
      swapped[i - 2] = bytes[i + 1];
      swapped[i - 1] = bytes[i];
    }
    text = swapped.toString("utf16le");
  } else {
    text = bytes.toString("utf8");
  }

  text = text.replace(/^\uFEFF/, "").trim();
  return JSON.parse(text);
}

async function seedInviteCodesIfNeeded() {
  try {
    const row = await dbGet("SELECT COUNT(1) AS n FROM invite_codes");
    if (row && Number(row.n) > 0) return;

    if (!fs.existsSync(INVITE_CODES_SEED_PATH)) {
      console.warn("Invite seed file not found:", INVITE_CODES_SEED_PATH);
      return;
    }

    const payload = readJsonFileWithBomSupport(INVITE_CODES_SEED_PATH);
    const codes = Array.isArray(payload && payload.codes) ? payload.codes : [];
    const normalized = Array.from(new Set(codes.map(normalizeInviteCode).filter(isValidInviteCode)));
    if (!normalized.length) {
      console.warn("Invite seed file has no valid codes:", INVITE_CODES_SEED_PATH);
      return;
    }

    const now = Date.now();
    await dbRun("BEGIN IMMEDIATE TRANSACTION");
    try {
      for (const code of normalized) {
        await dbRun(
          `INSERT OR IGNORE INTO invite_codes
            (code, max_devices, status, bound_count, created_at, updated_at)
           VALUES (?, ?, 'active', 0, ?, ?)`,
          [code, DEFAULT_INVITE_MAX_DEVICES, now, now]
        );
      }
      await dbRun("COMMIT");
      console.log(`Seeded invite codes: ${normalized.length}`);
    } catch (err) {
      await dbRun("ROLLBACK");
      throw err;
    }
  } catch (err) {
    console.error("Failed to seed invite codes", err);
  }
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
  const users = countUniqueUsers(recent);

  const viewEnds = recent.filter(e => e.name === "word_view_end" && e.data && typeof e.data.durationMs === "number");
  const avgViewMs = viewEnds.length
    ? Math.round(viewEnds.reduce((s, e) => s + e.data.durationMs, 0) / viewEnds.length)
    : 0;

  res.json({
    ok: true,
    range,
    events: recent.length,
    sessions: sessions.size,
    users,
    avgWordViewMs: avgViewMs
  });
});

app.get("/health", (req, res) => res.send("ok"));

// Dashboard APIs
app.get("/api/dashboard", async (req, res) => {
  const rangeMs = 24 * 3600_000;
  const since24h = Date.now() - rangeMs;
  const since30d = Date.now() - 30 * 24 * 3600_000;

  let recent = [];
  let trendEvents = [];
  try {
    const recentRows = await dbAll("SELECT * FROM events WHERE ts >= ? ORDER BY ts ASC", [since24h]);
    const trendRows = await dbAll("SELECT * FROM events WHERE ts >= ? ORDER BY ts ASC", [since30d]);
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
      visits24h: countUniqueUsers(recent.filter(e => e.name === "word_view_start")),
      avgStay: fmtMs(avgViewMs),
      activeTerms,
      sessions
    },
    trend7d: buildTrendNdByLang(trendEvents, 7),
    trend30d: buildTrendNdByLang(trendEvents, 30),
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

  const wordTermMap = loadWordTermMap();
  const rows = buildTermAgg(recent, wordTermMap)
    .sort((a, b) => b.visits - a.visits)
    .slice(0, 50);

  res.json({ ok: true, terms: rows });
});

app.get("/api/votes/understanding", async (req, res) => {
  const wordId = req.query.wordId;
  let events = [];
  try {
    const rows = await dbAll(
      "SELECT * FROM events WHERE name = ? ORDER BY ts ASC",
      ["entry_understanding_vote"]
    );
    events = rows.map(rowToEvent);
  } catch (err) {
    console.error("Understanding vote query failed", err);
    return res.status(500).json({ ok: false, error: "DB query failed" });
  }

  if (wordId !== undefined) {
    const stats = aggregateUnderstandingVotes(events, wordId);
    return res.json({
      ok: true,
      wordId: String(wordId),
      stats
    });
  }

  const statsByWordId = aggregateUnderstandingVotes(events);
  return res.json({ ok: true, statsByWordId });
});

app.get("/api/votes/comment-likes", async (req, res) => {
  const wordId = req.query.wordId;
  let events = [];
  try {
    const rows = await dbAll(
      "SELECT * FROM events WHERE name = ? ORDER BY ts ASC",
      ["comment_like_toggle"]
    );
    events = rows.map(rowToEvent);
  } catch (err) {
    console.error("Comment like query failed", err);
    return res.status(500).json({ ok: false, error: "DB query failed" });
  }

  if (wordId !== undefined) {
    const countsByCommentIndex = aggregateCommentLikeVotes(events, wordId);
    return res.json({
      ok: true,
      wordId: String(wordId),
      countsByCommentIndex
    });
  }

  const countsByWordId = aggregateCommentLikeVotes(events);
  return res.json({ ok: true, countsByWordId });
});

app.post("/api/invite/verify", async (req, res) => {
  const code = normalizeInviteCode(req.body && req.body.code);
  const deviceId = normalizeDeviceId(req.body && req.body.device_id);
  const legacyCached = Boolean(req.body && req.body.legacy_cached);

  if (!isValidInviteCode(code)) {
    return res.status(400).json({
      ok: false,
      allowed: false,
      error: "invalid_code_format",
      message: "邀请码格式错误"
    });
  }

  if (!isValidDeviceId(deviceId)) {
    return res.status(400).json({
      ok: false,
      allowed: false,
      error: "invalid_device_id",
      message: "设备标识无效"
    });
  }

  try {
    await dbRun("BEGIN IMMEDIATE TRANSACTION");
    try {
      const invite = await dbGet(
        "SELECT code, max_devices, status, bound_count FROM invite_codes WHERE code = ?",
        [code]
      );

      if (!invite || invite.status !== "active") {
        await dbRun("ROLLBACK");
        return res.status(403).json({
          ok: false,
          allowed: false,
          error: "invite_invalid_or_inactive",
          message: "邀请码无效或已失效"
        });
      }

      const maxDevices = Math.max(1, Number(invite.max_devices) || DEFAULT_INVITE_MAX_DEVICES);
      const boundCount = Math.max(0, Number(invite.bound_count) || 0);
      const existing = await dbGet(
        "SELECT code FROM invite_devices WHERE code = ? AND device_id = ?",
        [code, deviceId]
      );
      const existingLegacyExempt = await dbGet(
        "SELECT code FROM invite_legacy_exempt_devices WHERE code = ? AND device_id = ?",
        [code, deviceId]
      );

      const now = Date.now();
      if (existing) {
        await dbRun(
          "UPDATE invite_devices SET last_seen_at = ? WHERE code = ? AND device_id = ?",
          [now, code, deviceId]
        );
        await dbRun(
          "UPDATE invite_codes SET updated_at = ? WHERE code = ?",
          [now, code]
        );
        await dbRun("COMMIT");
        return res.json({
          ok: true,
          allowed: true,
          code,
          alreadyBound: true,
          legacyExempt: false,
          boundCount,
          maxDevices,
          remaining: Math.max(0, maxDevices - boundCount)
        });
      }

      if (existingLegacyExempt) {
        await dbRun(
          "UPDATE invite_legacy_exempt_devices SET last_seen_at = ? WHERE code = ? AND device_id = ?",
          [now, code, deviceId]
        );
        await dbRun(
          "UPDATE invite_codes SET updated_at = ? WHERE code = ?",
          [now, code]
        );
        await dbRun("COMMIT");
        return res.json({
          ok: true,
          allowed: true,
          code,
          alreadyBound: false,
          legacyExempt: true,
          boundCount,
          maxDevices,
          remaining: Math.max(0, maxDevices - boundCount)
        });
      }

      if (legacyCached) {
        await dbRun(
          "INSERT INTO invite_legacy_exempt_devices (code, device_id, first_seen_at, last_seen_at) VALUES (?, ?, ?, ?)",
          [code, deviceId, now, now]
        );
        await dbRun(
          "UPDATE invite_codes SET updated_at = ? WHERE code = ?",
          [now, code]
        );
        await dbRun("COMMIT");
        return res.json({
          ok: true,
          allowed: true,
          code,
          alreadyBound: false,
          legacyExempt: true,
          boundCount,
          maxDevices,
          remaining: Math.max(0, maxDevices - boundCount)
        });
      }

      if (boundCount >= maxDevices) {
        if (INVITE_REVOKE_ON_LIMIT) {
          await dbRun(
            "UPDATE invite_codes SET status = 'revoked', updated_at = ? WHERE code = ?",
            [now, code]
          );
        } else {
          await dbRun(
            "UPDATE invite_codes SET updated_at = ? WHERE code = ?",
            [now, code]
          );
        }
        await dbRun("COMMIT");
        return res.status(403).json({
          ok: false,
          allowed: false,
          error: "device_limit_reached",
          message: "该邀请码绑定设备数量已达上限"
        });
      }

      await dbRun(
        "INSERT INTO invite_devices (code, device_id, first_seen_at, last_seen_at) VALUES (?, ?, ?, ?)",
        [code, deviceId, now, now]
      );
      await dbRun(
        "UPDATE invite_codes SET bound_count = bound_count + 1, updated_at = ? WHERE code = ?",
        [now, code]
      );
      await dbRun("COMMIT");

      const nextBoundCount = boundCount + 1;
      return res.json({
        ok: true,
        allowed: true,
        code,
        alreadyBound: false,
        legacyExempt: false,
        boundCount: nextBoundCount,
        maxDevices,
        remaining: Math.max(0, maxDevices - nextBoundCount)
      });
    } catch (err) {
      await dbRun("ROLLBACK");
      throw err;
    }
  } catch (err) {
    console.error("Invite verify failed", err);
    return res.status(500).json({
      ok: false,
      allowed: false,
      error: "server_error",
      message: "服务端校验失败"
    });
  }
});





app.use("/api/content", require("./routes/content"));
app.use("/content", express.static(path.join(process.cwd(), "public", "content")));
app.use("/draft", express.static(path.join(process.cwd(), "content", "draft")));

seedInviteCodesIfNeeded();


const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server listening on http://0.0.0.0:${PORT}`);
});
