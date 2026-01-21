const fs = require("fs");
const path = require("path");

const ROOT = process.cwd();

const DRAFT_DIR = path.join(ROOT, "content", "draft");
const DRAFT_IMG_DIR = path.join(DRAFT_DIR, "images");
const DRAFT_JSON_PATH = path.join(DRAFT_DIR, "data.json");

const SOURCES_DIR = path.join(ROOT, "content", "sources");
const SOURCES_IMG_DIR = path.join(SOURCES_DIR, "images");
const UPLOADS_DIR = path.join(SOURCES_DIR, "_uploads");

const HEADER_ALIASES = {
  term: ["term", "Term", "词条ID", "词条名称", "词条", "Entry"],
  term_en: ["term_en", "term en", "english", "en", "英文词条", "词条英文"],
  code: ["code", "词条编号 ID", "编号", "ID"],
  parent: ["parent", "父记录"],
  term_ori: ["termOri", "term_ori", "词条原语言 Entry Source Language", "词条原语言", "原语言"],
  domain: ["domain", "学科类型"],
  domain_en: ["domain_en", "学科类型英文", "domain en"],
  brief: ["brief", "简要释义"],
  brief_en: ["brief_en", "简要释义英文", "brief en"],
  detail: ["detail", "详细释义"],
  detail_en: ["detail_en", "详细释义英文", "detail en"],
  example: ["example", "例句"],
  example_en: ["example_en", "例句英文", "example en"],
  proposer: ["proposer", "提出者"],
  proposer_en: ["proposer_en", "提出者英文", "proposer en"],
  source: ["source", "出处"],
  source_en: ["source_en", "出处英文", "source en"],
  related_works: ["related_works", "related works", "相关著作"],
  related_works_en: ["related_works_en", "related works en", "相关著作英文"],
  related_terms: ["related_terms", "related terms", "概念相关"],
  proposer_photo: ["proposer_photo", "提出者照片1", "proposer photo", "proposer_image"],
  source_cover: ["source_cover", "出处封面-1", "source cover", "source_image"],
  diagram_img: ["diagram_img", "释义配图", "diagram", "diagram_img"],
  aigc_img: ["aigc_img", "AIGC配图-1", "aigc", "aigc_image"],
  diagram_src: ["diagram_src", "释义配图来源", "diagram source"]
};

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function s(v) {
  if (v === null || v === undefined) return "";
  return String(v).trim();
}

function splitLinesToArray(text) {
  const t = s(text);
  if (!t) return [];
  return t.split(/\r?\n/).map(x => x.trim()).filter(Boolean);
}

function placeholderZh(label) {
  return `TODO: ${label}`;
}

function placeholderEn(label) {
  return `TODO: ${label}`;
}

function toWordTemplate() {
  return {
    id: 0,
    term: { zh: placeholderZh("term"), en: placeholderEn("term") },
    termOri: placeholderEn("termOri"),
    concept_image: "TODO: concept_image",
    sm_title: { zh: placeholderZh("social title"), en: placeholderEn("social title") },
    proposers: [{
      name: { zh: placeholderZh("proposer"), en: placeholderEn("proposer") },
      year: "TODO: year",
      role: { zh: placeholderZh("role"), en: placeholderEn("role") },
      image: "TODO: proposer_image"
    }],
    source: { zh: placeholderZh("source"), en: placeholderEn("source") },
    source_image: "TODO: source_cover",
    related_works: [{ zh: placeholderZh("related works"), en: placeholderEn("related works") }],
    domain: { zh: placeholderZh("domain"), en: placeholderEn("domain") },
    proposing_country: "TODO: country",
    proposing_time: "TODO: time",
    contributor: { zh: placeholderZh("contributor"), en: placeholderEn("contributor") },
    contribute_date: "TODO: contribute_date",
    editors: [{ zh: placeholderZh("editor"), en: "" }],
    edit_date: "TODO: edit_date",
    brief_definition: { zh: placeholderZh("brief"), en: placeholderEn("brief") },
    extended_definition: { zh: [placeholderZh("extended")], en: [placeholderEn("extended")] },
    example_sentence: { zh: placeholderZh("example"), en: placeholderEn("example") },
    diagrams: [],
    related_terms: [],
    commentAbs: { content: { zh: placeholderZh("abstract"), en: placeholderEn("abstract") }, author: { zh: "TODO", en: "TODO" } },
    comments: []
  };
}

function normalizeHeader(v) {
  const t = s(v);
  const clean = t.replace(/\uFEFF/g, "").replace(/\s+/g, " ").trim();
  return clean;
}

function buildHeaderIndex(headerRow) {
  const map = new Map();
  for (let i = 0; i < headerRow.length; i++) {
    const name = normalizeHeader(headerRow[i]);
    if (!name) continue;
    map.set(name, i);
    const lower = name.toLowerCase();
    if (lower !== name) map.set(lower, i);
  }
  return map;
}

function findCol(headerIndex, names) {
  for (const name of names) {
    const key = normalizeHeader(name);
    if (headerIndex.has(key)) return headerIndex.get(key);
    const lower = key.toLowerCase();
    if (headerIndex.has(lower)) return headerIndex.get(lower);
  }
  return null;
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let i = 0;
  let inQuotes = false;

  while (i < text.length) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === "\"") {
        if (text[i + 1] === "\"") {
          cell += "\"";
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      cell += ch;
      i += 1;
      continue;
    }

    if (ch === "\"") {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (ch === ",") {
      row.push(cell);
      cell = "";
      i += 1;
      continue;
    }
    if (ch === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      i += 1;
      continue;
    }
    if (ch === "\r") {
      i += 1;
      continue;
    }
    cell += ch;
    i += 1;
  }

  if (cell.length || row.length) {
    row.push(cell);
    rows.push(row);
  }

  while (rows.length && rows[rows.length - 1].every(v => !s(v))) {
    rows.pop();
  }

  return rows;
}

function sanitizeFilename(name) {
  return name.replace(/[\\/:*?"<>|]/g, "_");
}

function findSourceImage(value, csvDir) {
  const raw = s(value);
  if (!raw) return null;

  if (path.isAbsolute(raw) && fs.existsSync(raw)) return raw;

  const candidates = [];
  if (csvDir) candidates.push(path.join(csvDir, raw));
  candidates.push(path.join(UPLOADS_DIR, raw));
  candidates.push(path.join(SOURCES_IMG_DIR, raw));
  candidates.push(path.join(SOURCES_DIR, raw));

  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }

  if (raw.startsWith("images/")) {
    const draftPath = path.join(DRAFT_DIR, raw);
    if (fs.existsSync(draftPath)) return draftPath;
  }

  return null;
}

function copyImage(value, term, kind, csvDir) {
  const src = findSourceImage(value, csvDir);
  if (!src) return "";

  const ext = path.extname(src) || ".png";
  const filename = sanitizeFilename(`${term}_${kind}${ext}`);
  const outAbs = path.join(DRAFT_IMG_DIR, filename);
  fs.copyFileSync(src, outAbs);
  return `images/${filename}`;
}

function getCell(row, colIndex) {
  if (colIndex === null || colIndex === undefined) return "";
  return s(row[colIndex]);
}

function pickEnValue(zhRow, enRow, colEn, colBase) {
  const fromEnCol = colEn !== null && colEn !== undefined ? getCell(zhRow, colEn) : "";
  if (fromEnCol) return fromEnCol;
  if (enRow) {
    const fromEnRow = colBase !== null && colBase !== undefined ? getCell(enRow, colBase) : "";
    if (fromEnRow) return fromEnRow;
  }
  return "";
}

async function importCsvToDraft(csvPath) {
  ensureDir(DRAFT_DIR);
  ensureDir(DRAFT_IMG_DIR);

  const raw = fs.readFileSync(csvPath, "utf-8");
  const rows = parseCsv(raw);
  if (!rows.length) throw new Error("CSV is empty");

  const headerIndex = buildHeaderIndex(rows[0]);
  const cols = {};
  for (const key of Object.keys(HEADER_ALIASES)) {
    cols[key] = findCol(headerIndex, HEADER_ALIASES[key]);
  }

  if (cols.term === null) throw new Error("Missing term column in CSV header");

  const parents = new Map();
  const children = new Map();

  for (let r = 1; r < rows.length; r++) {
    const term = getCell(rows[r], cols.term);
    if (!term) continue;
    const parent = cols.parent !== null ? getCell(rows[r], cols.parent) : "";
    if (parent) {
      if (!children.has(parent)) children.set(parent, r);
    } else {
      parents.set(term, r);
    }
  }

  const csvDir = path.dirname(csvPath);
  const words = [];
  let autoId = 1;

  for (const [zhTerm, zhRowIndex] of parents.entries()) {
    const zhRow = rows[zhRowIndex];
    const enRowIndex = children.get(zhTerm) || null;
    const enRow = enRowIndex ? rows[enRowIndex] : null;

    const w = toWordTemplate();
    w.id = autoId++;

    w.term.zh = zhTerm;
    const enTerm = pickEnValue(zhRow, enRow, cols.term_en, cols.term);
    w.term.en = enTerm || placeholderEn("term");

    const termOri = getCell(zhRow, cols.term_ori) || (enRow ? getCell(enRow, cols.term_ori) : "");
    w.termOri = termOri || placeholderEn("termOri");

    const domainZh = getCell(zhRow, cols.domain);
    w.domain.zh = domainZh || placeholderZh("domain");
    const domainEn = pickEnValue(zhRow, enRow, cols.domain_en, cols.domain);
    w.domain.en = domainEn || placeholderEn("domain");

    w.brief_definition.zh = getCell(zhRow, cols.brief) || placeholderZh("brief");
    const briefEn = pickEnValue(zhRow, enRow, cols.brief_en, cols.brief);
    w.brief_definition.en = briefEn || placeholderEn("brief");

    const extZh = splitLinesToArray(getCell(zhRow, cols.detail));
    w.extended_definition.zh = extZh.length ? extZh : [placeholderZh("extended")];
    const extEn = splitLinesToArray(pickEnValue(zhRow, enRow, cols.detail_en, cols.detail));
    w.extended_definition.en = extEn.length ? extEn : [placeholderEn("extended")];

    w.example_sentence.zh = getCell(zhRow, cols.example) || placeholderZh("example");
    const exampleEn = pickEnValue(zhRow, enRow, cols.example_en, cols.example);
    w.example_sentence.en = exampleEn || placeholderEn("example");

    const proposerZh = getCell(zhRow, cols.proposer) || placeholderZh("proposer");
    const proposerEn = pickEnValue(zhRow, enRow, cols.proposer_en, cols.proposer);
    w.proposers[0].name.zh = proposerZh;
    w.proposers[0].name.en = proposerEn || placeholderEn("proposer");

    const sourceZh = getCell(zhRow, cols.source) || placeholderZh("source");
    const sourceEn = pickEnValue(zhRow, enRow, cols.source_en, cols.source);
    w.source.zh = sourceZh;
    w.source.en = sourceEn || placeholderEn("source");

    const rwZh = getCell(zhRow, cols.related_works);
    const rwEn = pickEnValue(zhRow, enRow, cols.related_works_en, cols.related_works);
    if (rwZh || rwEn) {
      w.related_works = [{
        zh: rwZh || placeholderZh("related works"),
        en: rwEn || placeholderEn("related works")
      }];
    }

    const relatedRaw = getCell(zhRow, cols.related_terms);
    if (relatedRaw) {
      const parts = relatedRaw.split(/,|，|、|\n/).map(x => x.trim()).filter(Boolean);
      w.related_terms = parts.map(x => ({ id: x, relation: "概念相关" }));
    }

    const proposerImg = copyImage(getCell(zhRow, cols.proposer_photo), zhTerm, "proposer", csvDir);
    if (proposerImg) w.proposers[0].image = proposerImg;

    const sourceCover = copyImage(getCell(zhRow, cols.source_cover), zhTerm, "source_cover", csvDir);
    if (sourceCover) w.source_image = sourceCover;

    const aigcImg = copyImage(getCell(zhRow, cols.aigc_img), zhTerm, "aigc", csvDir);
    if (aigcImg) w.concept_image = aigcImg;

    const diagramImg = copyImage(getCell(zhRow, cols.diagram_img), zhTerm, "diagram", csvDir);
    if (diagramImg) {
      w.diagrams = [{
        src: diagramImg,
        caption: {
          zh: getCell(zhRow, cols.diagram_src) || placeholderZh("diagram caption"),
          en: placeholderEn("diagram caption")
        }
      }];
    }

    words.push(w);
  }

  const payload = {
    meta: { generated_at: new Date().toISOString(), source: path.basename(csvPath) },
    words
  };

  fs.writeFileSync(DRAFT_JSON_PATH, JSON.stringify(payload, null, 2), "utf-8");

  return {
    draft_json: "content/draft/data.json",
    draft_images_dir: "content/draft/images",
    words_count: words.length
  };
}

module.exports = { importCsvToDraft };
