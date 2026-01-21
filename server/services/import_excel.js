const ExcelJS = require("exceljs");
const fs = require("fs");
const path = require("path");

const ROOT = process.cwd();

const DRAFT_DIR = path.join(ROOT, "content", "draft");
const DRAFT_IMG_DIR = path.join(DRAFT_DIR, "images");
const DRAFT_JSON_PATH = path.join(DRAFT_DIR, "data.json");

// 你这份表头（从你导出的 xlsx 实测存在这些列）
const COLS = {
  TERM: "词条ID",
  CODE: "词条编号 ID",
  PARENT: "父记录",
  ORI: "词条原语言 Entry Source Language",
  DOMAIN: "学科类型",
  BRIEF: "简要释义",
  DETAIL: "详细释义",
  EXAMPLE: "例句",
  PROPOSER: "提出者",
  SOURCE: "出处",
  RELATED_WORKS: "相关著作",
  RELATED_TERMS: "概念相关",

  // 图片列（Excel 里是“嵌入图”，单元格值往往为空，所以图片靠锚点定位）
  PROPOSER_PHOTO: "提出者照片-1",
  SOURCE_COVER: "出处封面-1",
  DIAGRAM_IMG: "释义配图",
  AIGC_IMG: "AIGC配图-1",

  DIAGRAM_SRC: "释义配图来源",
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
  return t.split(/\r?\n/).map(x => x.trim()).filter(Boolean);
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
      name: { zh: placeholderZH("提出者"), en: placeholderEN("proposer") },
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

    contributor: { zh: placeholderZH("贡献者信息"), en: placeholderEN("contributor") },
    contribute_date: "TODO: contribute_date",
    editors: [{ zh: placeholderZH("编辑/审阅"), en: "" }],
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
    // exceljs cell.value 可能是对象
    if (v && typeof v === "object" && "text" in v) return s(v.text);
    if (v && typeof v === "object" && "richText" in v) return s(v.richText?.map(r => r.text).join("") || "");
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

  // 3) 解析图片：exceljs 能拿到图片的锚点范围（tl/br），我们用 tl.col/tl.row 来定位它属于哪一行哪一列
  //    然后按列号归类为 proposer/source_cover/diagram/aigc
  const colProposerPhoto = col(COLS.PROPOSER_PHOTO);
  const colSourceCover = col(COLS.SOURCE_COVER);
  const colDiagramImg = col(COLS.DIAGRAM_IMG);
  const colAigcImg = col(COLS.AIGC_IMG);

  // row -> { proposerPhoto, sourceCover, diagram, aigc }
  const imageByRow = new Map();

  const images = ws.getImages(); // [{imageId, range}]
  for (const it of images) {
    const img = wb.getImage(it.imageId);
    const ext = img.extension || "png";

    // range: { tl: { col,row }, br: { col,row } } 0-based
    const tl = it.range?.tl;
    if (!tl) continue;

    const row1 = tl.row + 1; // 变成 1-based 行号
    const col1 = tl.col + 1;

    let kind = null;
    if (colProposerPhoto && col1 === colProposerPhoto) kind = "proposer";
    else if (colSourceCover && col1 === colSourceCover) kind = "source_cover";
    else if (colDiagramImg && col1 === colDiagramImg) kind = "diagram";
    else if (colAigcImg && col1 === colAigcImg) kind = "aigc";

    if (!kind) continue;

    const term = cell(row1, COLS.TERM) || `row_${row1}`;
    const filename = `${term}_${kind}.${ext}`.replace(/[\\/:*?"<>|]/g, "_");
    const outAbs = path.join(DRAFT_IMG_DIR, filename);

    fs.writeFileSync(outAbs, img.buffer);

    const rel = `images/${filename}`;
    const bag = imageByRow.get(row1) || {};
    bag[kind] = rel;
    imageByRow.set(row1, bag);
  }

  // 4) 生成 words[]
  const words = [];
  let autoId = 1;

  for (const [zhTerm, zhRow] of parents.entries()) {
    const enRow = children.get(zhTerm) || null;

    const w = toWordTemplate();
    w.id = autoId++;

    // term
    w.term.zh = zhTerm;
    w.term.en = enRow ? (cell(enRow, COLS.TERM) || placeholderEN("term")) : placeholderEN("term");

    // termOri / domain
    w.termOri = cell(zhRow, COLS.ORI) || (enRow ? cell(enRow, COLS.ORI) : "") || placeholderEN("termOri");

    const domainRaw = cell(zhRow, COLS.DOMAIN) || "";
    w.domain.zh = domainRaw || placeholderZH("学科类型");
    w.domain.en = placeholderEN("domain"); // 你表里中英混写，先占位更稳

    // brief/extended/example（你前端允许 HTML，表里是纯文本也没问题）
    w.brief_definition.zh = cell(zhRow, COLS.BRIEF) || placeholderZH("简要释义");
    w.brief_definition.en = enRow ? (cell(enRow, COLS.BRIEF) || placeholderEN("brief")) : placeholderEN("brief");

    const extZh = splitLinesToArray(cell(zhRow, COLS.DETAIL));
    w.extended_definition.zh = extZh.length ? extZh : [placeholderZH("详细释义")];

    const extEn = enRow ? splitLinesToArray(cell(enRow, COLS.DETAIL)) : [];
    w.extended_definition.en = extEn.length ? extEn : [placeholderEN("extended")];

    w.example_sentence.zh = cell(zhRow, COLS.EXAMPLE) || placeholderZH("例句");
    w.example_sentence.en = enRow ? (cell(enRow, COLS.EXAMPLE) || placeholderEN("example")) : placeholderEN("example");

    // proposer/source/related works
    const proposerZh = cell(zhRow, COLS.PROPOSER) || placeholderZH("提出者");
    const proposerEn = enRow ? (cell(enRow, COLS.PROPOSER) || placeholderEN("proposer")) : placeholderEN("proposer");
    w.proposers[0].name.zh = proposerZh;
    w.proposers[0].name.en = proposerEn;

    const sourceZh = cell(zhRow, COLS.SOURCE) || placeholderZH("出处");
    const sourceEn = enRow ? (cell(enRow, COLS.SOURCE) || placeholderEN("source")) : placeholderEN("source");
    w.source.zh = sourceZh;
    w.source.en = sourceEn;

    const rwZh = cell(zhRow, COLS.RELATED_WORKS);
    if (rwZh) w.related_works = [{ zh: rwZh, en: placeholderEN("related works") }];

    // related terms（先只存文字，后续你再做 id 对齐）
    const relatedRaw = cell(zhRow, COLS.RELATED_TERMS);
    if (relatedRaw) {
      const parts = relatedRaw.split(/,|，|、|\n/).map(x => x.trim()).filter(Boolean);
      w.related_terms = parts.map(x => ({ id: x, relation: "概念相关" }));
    }

    // images（来自 imageByRow）
    const imgsZh = imageByRow.get(zhRow) || {};
    if (imgsZh.proposer) w.proposers[0].image = imgsZh.proposer;
    if (imgsZh.source_cover) w.source_image = imgsZh.source_cover;

    // 你 schema 里有 concept_image（概念图/主图），你表里没有“概念主图”专列时：先用 AIGC 配图顶上
    if (imgsZh.aigc) w.concept_image = imgsZh.aigc;

    // diagram：如果有 diagram 图，就生成 diagrams 数组；caption 从“释义配图来源”取，否则占位
    if (imgsZh.diagram) {
      w.diagrams = [{
        src: imgsZh.diagram,
        caption: {
          zh: cell(zhRow, COLS.DIAGRAM_SRC) || placeholderZH("配图来源说明"),
          en: placeholderEN("diagram caption")
        }
      }];
    }

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
