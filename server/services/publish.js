const fs = require("fs");
const path = require("path");

const ROOT = process.cwd();

const DRAFT = path.join(ROOT, "content", "draft");
const PUBLISHED = path.join(ROOT, "content", "published");
const PUBLIC_OUT = path.join(ROOT, "public", "content");

function ensureDir(p) { fs.mkdirSync(p, { recursive: true }); }

function copyDir(src, dst) {
  ensureDir(dst);
  for (const name of fs.readdirSync(src)) {
    const s = path.join(src, name);
    const d = path.join(dst, name);
    const st = fs.statSync(s);
    if (st.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

async function publishDraft() {
  ensureDir(PUBLISHED);
  ensureDir(PUBLIC_OUT);

  // 1) draft -> content/published
  copyDir(DRAFT, PUBLISHED);

  // 2) content/published -> public/content（给前台 fetch）
  copyDir(PUBLISHED, PUBLIC_OUT);

  return {
    published_dir: "content/published",
    public_dir: "public/content"
  };
}

module.exports = { publishDraft };
