const express = require("express");

const { buildVisitorWord, saveVisitorWord } = require("../services/visitor_words");

const router = express.Router();

router.post("/", async (req, res) => {
  const rawWord = String(req.body && req.body.word ? req.body.word : "").trim();

  if (!rawWord) {
    return res.status(400).json({ ok: false, error: "word is required" });
  }

  try {
    const word = buildVisitorWord(rawWord);
    await saveVisitorWord(word);
    return res.status(201).json({ ok: true, word });
  } catch (err) {
    console.error("Visitor word save failed", err);
    return res.status(500).json({ ok: false, error: "server_error" });
  }
});

module.exports = router;
