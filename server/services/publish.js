const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..", "..");

const DRAFT = path.join(ROOT, "content", "draft");
const PUBLISHED = path.join(ROOT, "content", "published");
const PUBLIC_OUT = path.join(ROOT, "public", "content");
const PUBLIC_REPO = process.env.PUBLIC_REPO_PATH || "/root/dunes_dictionary_public";
const PUBLIC_REPO_CONTENT = path.join(PUBLIC_REPO, "content");

function ensureDir(p) { fs.mkdirSync(p, { recursive: true }); }

function clearDir(p) {
  fs.rmSync(p, { recursive: true, force: true });
  ensureDir(p);
}

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

  // 1) draft -> content/published
  clearDir(PUBLISHED);
  copyDir(DRAFT, PUBLISHED);

  // 2) content/published -> public/content (local preview)
  clearDir(PUBLIC_OUT);
  copyDir(PUBLISHED, PUBLIC_OUT);

  // 3) content/published -> public repo content, then git push
  clearDir(PUBLIC_REPO_CONTENT);
  copyDir(PUBLISHED, PUBLIC_REPO_CONTENT);
  execSync("git add content", { cwd: PUBLIC_REPO, stdio: "inherit" });
  const status = execSync("git status --porcelain", { cwd: PUBLIC_REPO }).toString().trim();
  if (status) {
    execSync("git commit -m \"Publish update\"", { cwd: PUBLIC_REPO, stdio: "inherit" });
    execSync("git push", { cwd: PUBLIC_REPO, stdio: "inherit" });
  }

  return {
    published_dir: "content/published",
    public_dir: "public/content",
    public_repo_content: PUBLIC_REPO_CONTENT
  };
}

module.exports = { publishDraft };
