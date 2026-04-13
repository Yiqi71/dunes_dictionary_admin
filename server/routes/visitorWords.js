const express = require("express");

const {
  buildVisitorWord,
  hasTencentCloudCredentials,
  logBlockedVisitorWord,
  moderateVisitorWord,
  moderateVisitorWordWithAI,
  saveVisitorWord
} = require("../services/visitor_words");

const router = express.Router();

router.post("/", async (req, res) => {
  const rawWord = String(req.body && req.body.word ? req.body.word : "").trim();
  console.log("[visitor-words] Incoming submit", {
    rawWord,
    tencentConfigured: hasTencentCloudCredentials()
  });

  if (!rawWord) {
    return res.status(400).json({ ok: false, error: "word is required" });
  }

  try {
    const moderation = moderateVisitorWord(rawWord);
    if (!moderation.allowed) {
      console.log("[visitor-words] Blocked by keyword filter", {
        rawWord,
        reason: moderation.reason
      });
      await logBlockedVisitorWord(rawWord, {
        source: "keyword",
        reason: moderation.reason
      });
      return res.status(422).json({
        ok: false,
        error: "word_not_allowed",
        reason: moderation.reason
      });
    }

    const aiModeration = await moderateVisitorWordWithAI(rawWord);
    if (!aiModeration.allowed) {
      console.log("[visitor-words] Blocked by Tencent moderation", {
        rawWord,
        reason: aiModeration.reason,
        categories: aiModeration.categories || null
      });
      await logBlockedVisitorWord(rawWord, {
        source: "ai",
        reason: aiModeration.reason,
        categories: aiModeration.categories || null,
        flagged: aiModeration.flagged === true
      });
      return res.status(422).json({
        ok: false,
        error: "word_not_allowed",
        reason: aiModeration.reason
      });
    }

    console.log("[visitor-words] Allowed submission", { rawWord });
    const word = buildVisitorWord(rawWord);
    await saveVisitorWord(word);
    return res.status(201).json({ ok: true, word });
  } catch (err) {
    console.error("Visitor word save failed", err);
    return res.status(500).json({ ok: false, error: "server_error" });
  }
});

module.exports = router;
