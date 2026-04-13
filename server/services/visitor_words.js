const fs = require("fs/promises");
const path = require("path");

const DATA_FILE = path.join(__dirname, "..", "..", "content", "visitor-upload-words.json");

function buildVisitorWord(rawWord) {
  const now = new Date();
  const submittedAt = now.toISOString();

  return {
    id: `visitor-${now.getTime()}`,
    term: {
      zh: rawWord,
      en: rawWord
    },
    termOri: rawWord,
    source: {
      zh: "未知",
      en: "Unknown"
    },
    proposing_country: null,
    proposing_time: null,
    isVisitorWord: true,
    status: "not reviewed",
    brief_definition: {
      zh: "访客提交词条，待补充释义。",
      en: "Visitor-submitted term. Definition pending."
    },
    extended_definition: {
      zh: ["待补充。"],
      en: ["Pending."]
    },
    example_sentence: {
      zh: ["待补充。"],
      en: ["Pending."]
    },
    proposers: [],
    related_works: [],
    contributors: [],
    editors: [],
    comments: [],
    submitted_at: submittedAt
  };
}

async function saveVisitorWord(word) {
  let data = { meta: {}, words: [] };

  try {
    const raw = await fs.readFile(DATA_FILE, "utf8");
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") {
      data = parsed;
    }
  } catch (err) {
    if (err && err.code !== "ENOENT") {
      throw err;
    }
  }

  data.meta = {
    ...(data.meta && typeof data.meta === "object" ? data.meta : {}),
    updated_at: new Date().toISOString()
  };
  data.words = Array.isArray(data.words) ? data.words : [];
  data.words.push(word);

  await fs.mkdir(path.dirname(DATA_FILE), { recursive: true });
  await fs.writeFile(DATA_FILE, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

module.exports = {
  buildVisitorWord,
  saveVisitorWord
};
