const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const { importExcelToDraft } = require("../services/import_excel");
const { importCsvToDraft } = require("../services/import_csv");
const { publishDraft } = require("../services/publish");

const router = express.Router();
const upload = multer({ dest: path.join(process.cwd(), "content", "sources", "_uploads") });

// 上传并导入到 draft
router.post("/import-excel", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ ok: false, error: "No file" });

    const xlsxPath = req.file.path;
    const result = await importExcelToDraft(xlsxPath);

    return res.json({ ok: true, ...result });
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// 上传 CSV 并导入到 draft
router.post("/import-csv", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ ok: false, error: "No file" });

    const csvPath = req.file.path;
    const result = await importCsvToDraft(csvPath);

    return res.json({ ok: true, ...result });
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// 发布：draft -> published，并同步到 public/content（给前台用）
router.post("/publish", async (req, res) => {
  try {
    const result = await publishDraft();
    return res.json({ ok: true, ...result });
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

module.exports = router;
