const ExcelJS = require("exceljs");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..", "..");

const DRAFT_DIR = path.join(ROOT, "content", "draft");
const DRAFT_IMG_DIR = path.join(DRAFT_DIR, "images");
const DRAFT_JSON_PATH = path.join(DRAFT_DIR, "data.json");

// 你这份表头（从你导出的 xlsx 实测存在这些列）
const COLS = {
  TERM: "\u8bcd\u6761ID",
  CODE: "\u8bcd\u6761\u7f16\u53f7 ID",
  PARENT: "\u7236\u8bb0\u5f55",
  ORI: "\u8bcd\u6761\u539f\u8bed\u8a00 Entry Source Language",
  DOMAIN: "\u5b66\u79d1\u7c7b\u578b Disciplines",
  BRIEF: "\u7b80\u8981\u91ca\u4e49 Brief Interpretation",
  DETAIL: "\u8be6\u7ec6\u91ca\u4e49 Expanded Interpretation",
  EXAMPLE: "\u4f8b\u53e5",

  SM_TITLE_WX: "\u516c\u4f17\u53f7\u6807\u9898",
  SM_TITLE_XHS: "\u5c0f\u7ea2\u4e66\u6807\u9898",
  SM_TITLE_BILI: "Bilibili\u6807\u9898",

  PROPOSER_ZH: "\u63d0\u51fa\u8005\u4e2d\u6587\u540d\u79f0",
  PROPOSER_EN: "\u63d0\u51fa\u8005\u539f\u8bed\u8a00\u540d\u79f0",
  PROPOSER_YEAR: "\u63d0\u51fa\u8005\u751f\u5352\u5e74",
  PROPOSER_COUNTRY: "\u63d0\u51fa\u8005\u56fd\u522b",
  PROPOSER_ROLE: "\u63d0\u51fa\u8005\u8eab\u4efd",

  PROPOSER_PHOTO: "\u63d0\u51fa\u8005\u7167\u7247-1",
  PROPOSER_PHOTO_SRC: "\u7167\u7247\u6765\u6e90",

  PROPOSING_YEAR: "\u63d0\u51fa\u5e74\u4efd",
  PROPOSING_PLACE: "\u63d0\u51fa\u5730\u70b9",

  SOURCE: "\u51fa\u5904",
  SOURCE_COVER: "\u51fa\u5904\u5c01\u9762-1",
  SOURCE_COVER_SRC: "\u51fa\u5904\u5c01\u9762\u56fe\u7247\u6765\u6e90",

  RELATED_WORKS: "\u76f8\u5173\u8457\u4f5c",
  RELATED_TERMS: "\u6982\u5ff5\u76f8\u5173 Conceptually Related",

  CONTRIBUTOR: "\u8d21\u732e\u8005",
  CONTRIBUTOR_ROLE: "\u8d21\u732e\u8005\u8eab\u4efd",
  CONTRIBUTE_DATE: "\u6536\u5f55\u65e5\u671f",
  EDITORS: "\u7f16\u8f91/\u5ba1\u9605",

  DIAGRAM1_IMG: "\u91ca\u4e49\u914d\u56fe1-1",
  DIAGRAM1_CAP: "\u914d\u56fe\u8bf4\u660e1",
  DIAGRAM1_SRC: "\u91ca\u4e49\u914d\u56fe\u6765\u6e901",
  DIAGRAM2_IMG: "\u91ca\u4e49\u914d\u56fe2-1",
  DIAGRAM2_CAP: "\u914d\u56fe\u8bf4\u660e2",
  DIAGRAM2_SRC: "\u91ca\u4e49\u914d\u56fe\u6765\u6e902",
  DIAGRAM3_IMG: "\u91ca\u4e49\u914d\u56fe3-1",
  DIAGRAM3_CAP: "\u914d\u56fe\u8bf4\u660e3",
  DIAGRAM3_SRC: "\u91ca\u4e49\u914d\u56fe\u6765\u6e903",
  DIAGRAM4_IMG: "\u91ca\u4e49\u914d\u56fe4-1",
  DIAGRAM4_CAP: "\u914d\u56fe\u8bf4\u660e4",
  DIAGRAM4_SRC: "\u91ca\u4e49\u914d\u56fe\u6765\u6e904",
  DIAGRAM5_IMG: "\u91ca\u4e49\u914d\u56fe5-1",
  DIAGRAM5_CAP: "\u914d\u56fe\u8bf4\u660e5",
  DIAGRAM5_SRC: "\u91ca\u4e49\u914d\u56fe\u6765\u6e905",
  DIAGRAM6_IMG: "\u91ca\u4e49\u914d\u56fe6-1",
  DIAGRAM6_CAP: "\u914d\u56fe\u8bf4\u660e6",
  DIAGRAM6_SRC: "\u91ca\u4e49\u914d\u56fe\u6765\u6e906",

  AIGC_IMG: "AIGC\u914d\u56fe-1",
  AIGC_CAP: "AIGC\u914d\u56fe\u8bf4\u660e",

  NOTE_EXCERPT: "\u7b14\u8bb0\u8282\u9009",
  NOTE_EXCERPT_AUTHOR: "\u7b14\u8bb0\u8282\u9009\u8d21\u732e\u8005",

  NOTE1_CONTENT: "\u7b14\u8bb0\u5185\u5bb91",
  NOTE1_AUTHOR: "\u7b14\u8bb0\u8d21\u732e\u80051",
  NOTE1_BG: "\u7b14\u8bb0\u8d21\u732e\u8005\u5b66\u79d11",
  NOTE2_CONTENT: "\u7b14\u8bb0\u5185\u5bb92",
  NOTE2_AUTHOR: "\u7b14\u8bb0\u8d21\u732e\u80052",
  NOTE2_BG: "\u7b14\u8bb0\u8d21\u732e\u8005\u5b66\u79d12",
  NOTE3_CONTENT: "\u7b14\u8bb0\u5185\u5bb93",
  NOTE3_AUTHOR: "\u7b14\u8bb0\u8d21\u732e\u80053",
  NOTE3_BG: "\u7b14\u8bb0\u8d21\u732e\u8005\u5b66\u79d13"
};

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function s(v) {
  if (v === null || v === undefined) return "";
  return String(v).trim();
}

function splitLinesToArray(htmlOrText) {
  const t = s(htmlOrText);
  if (!t) return [];
  // 先按换行切（你表格里“详细释义/例句”一般是长文本）
  return t.split(/\r?\n|\u2028/).map(x => x.trim()).filter(Boolean);
}

function placeholderZH(label) {
  return `TODO：${label}`;
}
function placeholderEN(label) {
  return `TODO: ${label}`;
}

function toWordTemplate() {
  // 按你现有 data.json 结构做最小兼容（缺的都用 TODO）
  return {
    id: 0,
    term: { zh: placeholderZH("词条"), en: placeholderEN("term") },
    termOri: placeholderEN("termOri"),
    concept_image: "TODO: concept_image",
    sm_title: { zh: placeholderZH("社媒标题"), en: placeholderEN("social title") },

    proposers: [{
      name: { zh: placeholderZH("提出者"), en: placeholderEN("proposer"), ori: placeholderEN("proposerOri") },
      year: "TODO: year",
      role: { zh: placeholderZH("身份"), en: placeholderEN("role") },
      image: "TODO: proposer_image"
    }],

    source: { zh: placeholderZH("出处"), en: placeholderEN("source") },
    source_image: "TODO: source_cover",

    related_works: [{ zh: placeholderZH("相关著作"), en: placeholderEN("related works") }],
    domain: { zh: placeholderZH("学科类型"), en: placeholderEN("domain") },

    proposing_country: "TODO: country",
    proposing_time: "TODO: time",

    contributors: [],
    contribute_date: "TODO: contribute_date",
    editors: [],
    edit_date: "TODO: edit_date",

    brief_definition: { zh: placeholderZH("简要释义"), en: placeholderEN("brief") },
    extended_definition: { zh: [placeholderZH("详细释义")], en: [placeholderEN("extended")] },
    example_sentence: { zh: placeholderZH("例句"), en: placeholderEN("example") },

    diagrams: [],
    related_terms: [],

    commentAbs: { content: { zh: placeholderZH("导读"), en: placeholderEN("abstract") }, author: { zh: "TODO", en: "TODO" } },
    comments: []
  };
}

// 把图片按“列”归类到字段（列号来自表头）
function buildColIndexMap(headerRowValues) {
  const map = new Map();
  for (let c = 1; c <= headerRowValues.length; c++) {
    const name = s(headerRowValues[c - 1]);
    if (name) map.set(name, c);
  }
  return map;
}

async function importExcelToDraft(xlsxPath) {
  ensureDir(DRAFT_DIR);
  ensureDir(DRAFT_IMG_DIR);

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(xlsxPath);

  const ws = wb.getWorksheet("所有词条") || wb.worksheets[0];
  if (!ws) throw new Error("No worksheet found");

  // 1) 读表头 → 列号
  const headerRow = ws.getRow(1);
  const headerValues = headerRow.values.slice(1); // values[0] 空
  const colMap = buildColIndexMap(headerValues);

  function col(name) {
    const c = colMap.get(name);
    if (!c) return null;
    return c;
  }
  function cell(row, name) {
    const c = col(name);
    if (!c) return "";
    const v = ws.getRow(row).getCell(c).value;
    if (v && typeof v === "object") {
      if ("text" in v) return s(v.text);
      if ("richText" in v) return s(v.richText?.map(r => r.text).join("") || "");
      if ("hyperlink" in v) return s(v.hyperlink);
      if ("result" in v) return s(v.result);
    }
    return s(v);
  }

  // 2) 先把每行读成记录
  const parents = new Map();   // zhTerm -> rowIndex
  const children = new Map();  // zhTerm -> rowIndex (en)

  for (let r = 2; r <= ws.rowCount; r++) {
    const term = cell(r, COLS.TERM);
    if (!term) continue;

    const parent = cell(r, COLS.PARENT);
    if (parent) {
      // 英文子行
      if (!children.has(parent)) children.set(parent, r);
    } else {
      parents.set(term, r);
    }
  }

  // 3) parse images (exceljs anchors)
  const colProposerPhoto = col(COLS.PROPOSER_PHOTO);
  const colSourceCover = col(COLS.SOURCE_COVER);
  const colAigcImg = col(COLS.AIGC_IMG);

  const diagramCols = [
    { imgName: COLS.DIAGRAM1_IMG, cap: COLS.DIAGRAM1_CAP, src: COLS.DIAGRAM1_SRC },
    { imgName: COLS.DIAGRAM2_IMG, cap: COLS.DIAGRAM2_CAP, src: COLS.DIAGRAM2_SRC },
    { imgName: COLS.DIAGRAM3_IMG, cap: COLS.DIAGRAM3_CAP, src: COLS.DIAGRAM3_SRC },
    { imgName: COLS.DIAGRAM4_IMG, cap: COLS.DIAGRAM4_CAP, src: COLS.DIAGRAM4_SRC },
    { imgName: COLS.DIAGRAM5_IMG, cap: COLS.DIAGRAM5_CAP, src: COLS.DIAGRAM5_SRC },
    { imgName: COLS.DIAGRAM6_IMG, cap: COLS.DIAGRAM6_CAP, src: COLS.DIAGRAM6_SRC }
  ];

  const diagramColIndex = new Map();
  diagramCols.forEach((d, i) => {
    const c = col(d.imgName);
    if (c) {
      d.imgCol = c;
      diagramColIndex.set(c, i);
    }
  });

  // row -> { proposer, source_cover, aigc, diagrams: [] }
  const imageByRow = new Map();

  const images = ws.getImages(); // [{imageId, range}]
  for (const it of images) {
    const img = wb.getImage(it.imageId);
    const ext = img.extension || "png";

    // range: { tl: { col,row }, br: { col,row } } 0-based
    const tl = it.range?.tl;
    if (!tl) continue;

    const row1 = tl.row + 1; // 1-based row
    const col1 = tl.col + 1;

    let kind = null;
    let diagramIndex = null;
    if (colProposerPhoto && col1 === colProposerPhoto) kind = "proposer";
    else if (colSourceCover && col1 === colSourceCover) kind = "source_cover";
    else if (colAigcImg && col1 === colAigcImg) kind = "aigc";
    else if (diagramColIndex.has(col1)) {
      kind = "diagram";
      diagramIndex = diagramColIndex.get(col1);
    }

    if (!kind) continue;

    const term = cell(row1, COLS.TERM) || `row_${row1}`;
    const filename = `${term}_${kind}${kind === "diagram" ? `_${diagramIndex + 1}` : ""}.${ext}`.replace(/[\\/:*?"<>|]/g, "_");
    const outAbs = path.join(DRAFT_IMG_DIR, filename);

    fs.writeFileSync(outAbs, img.buffer);

    const rel = `images/${filename}`;
    const bag = imageByRow.get(row1) || {};
    if (kind === "diagram") {
      const list = bag.diagrams || [];
      list[diagramIndex] = rel;
      bag.diagrams = list;
    } else {
      bag[kind] = rel;
    }
    imageByRow.set(row1, bag);
  }

  // 4) build words[]
  const words = [];
  let autoId = 1;

  function pickFirst(...values) {
    for (const v of values) {
      const sv = s(v);
      if (sv) return sv;
    }
    return "";
  }

  function pushComment(w, noteZh, noteEn, authorZh, authorEn, bgZh, bgEn, dateValue) {
    if (!s(noteZh) && !s(noteEn)) return;
    w.comments.push({
      content: { zh: s(noteZh), en: s(noteEn) },
      role: { zh: "\u8d21\u732e\u8005", en: "Contributor" },
      author: { zh: s(authorZh), en: s(authorEn) },
      background: { zh: s(bgZh), en: s(bgEn) },
      date: s(dateValue)
    });
  }

  for (const [zhTerm, zhRow] of parents.entries()) {
    const enRow = children.get(zhTerm) || null;

    const w = toWordTemplate();

    const codeRaw = cell(zhRow, COLS.CODE);
    const codeNum = parseInt(codeRaw, 10);
    w.id = Number.isFinite(codeNum) ? codeNum : autoId++;

    // term
    w.term.zh = zhTerm;
    w.term.en = enRow ? (cell(enRow, COLS.TERM) || placeholderEN("term")) : placeholderEN("term");

    // termOri / domain
    w.termOri = cell(zhRow, COLS.ORI) || (enRow ? cell(enRow, COLS.ORI) : "") || placeholderEN("termOri");

    const domainZh = cell(zhRow, COLS.DOMAIN);
    const domainEn = enRow ? cell(enRow, COLS.DOMAIN) : "";
    w.domain.zh = domainZh || placeholderZH("\u5b66\u79d1\u7c7b\u578b");
    w.domain.en = domainEn || (domainZh || placeholderEN("domain"));

    // social title
    const smZh = pickFirst(
      cell(zhRow, COLS.SM_TITLE_WX),
      cell(zhRow, COLS.SM_TITLE_XHS),
      cell(zhRow, COLS.SM_TITLE_BILI)
    );
    const smEn = enRow ? pickFirst(
      cell(enRow, COLS.SM_TITLE_WX),
      cell(enRow, COLS.SM_TITLE_XHS),
      cell(enRow, COLS.SM_TITLE_BILI)
    ) : "";
    w.sm_title.zh = smZh || placeholderZH("\u793e\u5a92\u6807\u9898");
    w.sm_title.en = smEn || placeholderEN("social title");

    // brief/extended/example (no HTML; keep plain text)
    w.brief_definition.zh = cell(zhRow, COLS.BRIEF) || placeholderZH("\u7b80\u8981\u91ca\u4e49");
    w.brief_definition.en = enRow ? (cell(enRow, COLS.BRIEF) || placeholderEN("brief")) : placeholderEN("brief");

    const extZh = splitLinesToArray(cell(zhRow, COLS.DETAIL));
    w.extended_definition.zh = extZh.length ? extZh : [placeholderZH("\u8be6\u7ec6\u91ca\u4e49")];

    const extEn = enRow ? splitLinesToArray(cell(enRow, COLS.DETAIL)) : [];
    w.extended_definition.en = extEn.length ? extEn : [placeholderEN("extended")];

    w.example_sentence.zh = cell(zhRow, COLS.EXAMPLE) || placeholderZH("\u4f8b\u53e5");
    w.example_sentence.en = enRow ? (cell(enRow, COLS.EXAMPLE) || placeholderEN("example")) : placeholderEN("example");

    // proposer
    const proposerZh = cell(zhRow, COLS.PROPOSER_ZH);
    const proposerEnFromZhCol = enRow ? cell(enRow, COLS.PROPOSER_ZH) : "";
    const proposerOri = cell(zhRow, COLS.PROPOSER_EN) || (enRow ? cell(enRow, COLS.PROPOSER_EN) : "");
    const proposerEn = proposerEnFromZhCol || proposerOri;
    w.proposers[0].name.zh = proposerZh || placeholderZH("\u63d0\u51fa\u8005");
    w.proposers[0].name.en = proposerEn || placeholderEN("proposer");
    w.proposers[0].name.ori = proposerOri || placeholderEN("proposerOri");

    w.proposers[0].year = cell(zhRow, COLS.PROPOSER_YEAR) || (enRow ? cell(enRow, COLS.PROPOSER_YEAR) : "") || "TODO: year";
    w.proposers[0].role.zh = cell(zhRow, COLS.PROPOSER_ROLE) || placeholderZH("\u8eab\u4efd");
    w.proposers[0].role.en = (enRow ? cell(enRow, COLS.PROPOSER_ROLE) : "") || placeholderEN("role");

    // source
    const sourceZh = cell(zhRow, COLS.SOURCE) || placeholderZH("\u51fa\u5904");
    const sourceEn = enRow ? (cell(enRow, COLS.SOURCE) || placeholderEN("source")) : placeholderEN("source");
    w.source.zh = sourceZh;
    w.source.en = sourceEn;

    const rwZh = cell(zhRow, COLS.RELATED_WORKS);
    const rwEn = enRow ? cell(enRow, COLS.RELATED_WORKS) : "";
    if (rwZh || rwEn) {
      w.related_works = [{
        zh: rwZh || placeholderZH("\u76f8\u5173\u8457\u4f5c"),
        en: rwEn || placeholderEN("related works")
      }];
    }

    // related terms
    const relatedRaw = cell(zhRow, COLS.RELATED_TERMS);
    if (relatedRaw) {
      const parts = relatedRaw.split(/[,\uFF0C\u3001;\uFF1B\n]/).map(x => x.trim()).filter(Boolean);
      w.related_terms = parts.map(x => ({ id: x, relation: "\u6982\u5ff5\u76f8\u5173" }));
    }

    // contributor/editor info (keep empty if missing)
    const contributorZh = cell(zhRow, COLS.CONTRIBUTOR);
    const contributorRoleZh = cell(zhRow, COLS.CONTRIBUTOR_ROLE);
    const contributorEn = enRow ? cell(enRow, COLS.CONTRIBUTOR) : "";
    const contributorRoleEn = enRow ? cell(enRow, COLS.CONTRIBUTOR_ROLE) : "";
    if (contributorZh || contributorEn || contributorRoleZh || contributorRoleEn) {
      w.contributors = [{
        name: { zh: contributorZh, en: contributorEn },
        role: { zh: contributorRoleZh, en: contributorRoleEn }
      }];
    } else {
      w.contributors = [];
    }

    w.contribute_date = cell(zhRow, COLS.CONTRIBUTE_DATE) || (enRow ? cell(enRow, COLS.CONTRIBUTE_DATE) : "") || "TODO: contribute_date";

    const editorsZh = cell(zhRow, COLS.EDITORS);
    const editorsEn = enRow ? cell(enRow, COLS.EDITORS) : "";
    if (editorsZh || editorsEn) {
      w.editors = [{ zh: editorsZh || "", en: editorsEn || "" }];
    } else {
      w.editors = [];
    }

    if (!w.edit_date || w.edit_date.startsWith("TODO")) {
      w.edit_date = w.contribute_date || w.edit_date;
    }

    // proposing place/year
    const proposingPlace = cell(zhRow, COLS.PROPOSING_PLACE) || (enRow ? cell(enRow, COLS.PROPOSING_PLACE) : "") || cell(zhRow, COLS.PROPOSER_COUNTRY);
    w.proposing_country = proposingPlace || "TODO: country";
    w.proposing_time = cell(zhRow, COLS.PROPOSING_YEAR) || (enRow ? cell(enRow, COLS.PROPOSING_YEAR) : "") || "TODO: time";

    // images from excel anchors or cell values
    const imgsZh = imageByRow.get(zhRow) || {};
    const proposerImgCell = cell(zhRow, COLS.PROPOSER_PHOTO) || (enRow ? cell(enRow, COLS.PROPOSER_PHOTO) : "");
    if (imgsZh.proposer) w.proposers[0].image = imgsZh.proposer;
    else if (proposerImgCell) w.proposers[0].image = proposerImgCell;

    const sourceCoverCell = cell(zhRow, COLS.SOURCE_COVER) || (enRow ? cell(enRow, COLS.SOURCE_COVER) : "");
    if (imgsZh.source_cover) w.source_image = imgsZh.source_cover;
    else if (sourceCoverCell) w.source_image = sourceCoverCell;

    const aigcCell = cell(zhRow, COLS.AIGC_IMG) || (enRow ? cell(enRow, COLS.AIGC_IMG) : "");
    if (imgsZh.aigc) w.concept_image = imgsZh.aigc;
    else if (aigcCell) w.concept_image = aigcCell;

    // diagrams
    const diagrams = [];
    diagramCols.forEach((d, i) => {
      if (!d.imgCol) return;
      const img = (imgsZh.diagrams && imgsZh.diagrams[i]) || cell(zhRow, d.imgName) || (enRow ? cell(enRow, d.imgName) : "");
      if (!img) return;
      const capZh = cell(zhRow, d.cap) || cell(zhRow, d.src);
      const capEn = enRow ? (cell(enRow, d.cap) || cell(enRow, d.src)) : "";
      diagrams.push({
        src: img,
        caption: {
          zh: capZh || placeholderZH("\u914d\u56fe\u8bf4\u660e"),
          en: capEn || placeholderEN("diagram caption")
        }
      });
    });
    if (diagrams.length) w.diagrams = diagrams;

    // comment abstract from excerpt
    const absZh = cell(zhRow, COLS.NOTE_EXCERPT);
    const absEn = enRow ? cell(enRow, COLS.NOTE_EXCERPT) : "";
    const absAuthorZh = cell(zhRow, COLS.NOTE_EXCERPT_AUTHOR);
    const absAuthorEn = enRow ? cell(enRow, COLS.NOTE_EXCERPT_AUTHOR) : "";
    if (absZh || absEn) {
      w.commentAbs = {
        content: {
          zh: absZh || placeholderZH("\u5bfc\u8bfb"),
          en: absEn || placeholderEN("abstract")
        },
        author: {
          zh: absAuthorZh || "TODO",
          en: absAuthorEn || "TODO"
        }
      };
    }

    // notes -> comments
    w.comments = [];
    pushComment(
      w,
      cell(zhRow, COLS.NOTE1_CONTENT),
      enRow ? cell(enRow, COLS.NOTE1_CONTENT) : "",
      cell(zhRow, COLS.NOTE1_AUTHOR),
      enRow ? cell(enRow, COLS.NOTE1_AUTHOR) : "",
      cell(zhRow, COLS.NOTE1_BG),
      enRow ? cell(enRow, COLS.NOTE1_BG) : "",
      w.contribute_date
    );
    pushComment(
      w,
      cell(zhRow, COLS.NOTE2_CONTENT),
      enRow ? cell(enRow, COLS.NOTE2_CONTENT) : "",
      cell(zhRow, COLS.NOTE2_AUTHOR),
      enRow ? cell(enRow, COLS.NOTE2_AUTHOR) : "",
      cell(zhRow, COLS.NOTE2_BG),
      enRow ? cell(enRow, COLS.NOTE2_BG) : "",
      w.contribute_date
    );
    pushComment(
      w,
      cell(zhRow, COLS.NOTE3_CONTENT),
      enRow ? cell(enRow, COLS.NOTE3_CONTENT) : "",
      cell(zhRow, COLS.NOTE3_AUTHOR),
      enRow ? cell(enRow, COLS.NOTE3_AUTHOR) : "",
      cell(zhRow, COLS.NOTE3_BG),
      enRow ? cell(enRow, COLS.NOTE3_BG) : "",
      w.contribute_date
    );

    words.push(w);
  }

  const payload = {
    meta: { generated_at: new Date().toISOString(), source: path.basename(xlsxPath) },
    words
  };

  fs.writeFileSync(DRAFT_JSON_PATH, JSON.stringify(payload, null, 2), "utf-8");

  return {
    draft_json: "content/draft/data.json",
    draft_images_dir: "content/draft/images",
    words_count: words.length
  };
}

module.exports = { importExcelToDraft };
