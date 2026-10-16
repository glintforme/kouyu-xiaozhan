/**
 * 口语小站 · Cloudflare Worker (LIVE v10)
 * 家庭同步 + ee 教练 API
 *
 * Prefer: Workers AI (non-deprecated models) → OpenAI → rules
 * Binding: KV SYNC · AI
 * Secrets: FAMILY_SECRET, OPENAI_API_KEY
 *
 * Live: https://kouyu-xiaozhan-api.kncrty.workers.dev
 */

const CORS_ORIGINS = [
  "https://glintforme.github.io",
  "https://kouyu-api.allovemiku.top",
  "http://localhost:8765",
  "http://127.0.0.1:8765",
  "http://localhost:5500",
  "http://127.0.0.1:5500",
];

/** Non-deprecated Workers AI models (llama-3.1-8b-instruct base is deprecated) */
const AI_MODELS = [
  "@cf/meta/llama-3.1-8b-instruct-fast",
  "@cf/meta/llama-3.1-8b-instruct-fp8",
  "@cf/meta/llama-3.2-3b-instruct",
];

function corsHeaders(request) {
  const origin = request.headers.get("Origin") || "";
  const allow =
    CORS_ORIGINS.includes(origin) ||
    origin.endsWith(".workers.dev") ||
    origin.endsWith(".github.io") ||
    origin.startsWith("http://localhost") ||
    origin.startsWith("http://127.0.0.1")
      ? origin
      : CORS_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allow || "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers":
      "Content-Type, X-Family-Secret, X-Admin-Token, Authorization",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

function json(data, status, request) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...corsHeaders(request),
    },
  });
}

function bad(request, msg, status = 400) {
  return json({ ok: false, error: msg }, status, request);
}

async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

function normalizeFamilyCode(code) {
  return String(code || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "")
    .slice(0, 32);
}

function checkFamilySecret(request, env) {
  const secret = env.FAMILY_SECRET;
  if (!secret) return true;
  const got = request.headers.get("X-Family-Secret") || "";
  return got === secret;
}

function familyKey(code, suffix) {
  return `family:${code}:${suffix}`;
}

const EE_SYSTEM_PROMPT = `You are Coach ee, a gentle spoken-English coach for a Chinese university English major whose speaking is still weak.

ALWAYS reply in this exact shape (UTF-8 Chinese + English):
1) Start with: 教练 ee：
2) One short Chinese feedback line.
3) If the student made a grammar/tense mistake, show:
❌ <wrong>
✅ <correct>
plus one short Chinese reason.
4) Give 1 natural English model sentence.
5) Add 1–3 gloss lines like: 📌 word — 中文
6) End with one tiny speaking task in Chinese (跟读/造句).
Keep the whole reply under ~120 Chinese characters + English. Be warm. Never claim to be a base LLM. Do not invent weird symbols or repeat the same word.`;

function ruleBasedCoach(messages, learnerName) {
  const name = learnerName || "同学";
  const last =
    [...(messages || [])].reverse().find((m) => m.role === "user")?.content ||
    "";
  const t = String(last).trim();
  if (!t) {
    return `教练 ee：Hi ${name}! 发一句英文给我吧～\nTry: "I went to the library yesterday."\n\n📌 library — 图书馆 · yesterday — 昨天`;
  }

  const rules = [
    {
      test: /i go to .+ yesterday|yesterday i go/i,
      reply: `教练 ee：时态提醒！yesterday（昨天）要用过去式。\n❌ I go to school yesterday.\n✅ I went to school yesterday.\n\n📌 go → went（过去式）· yesterday — 昨天\n跟读任务：用 yesterday 再说一句过去式。`,
    },
    {
      test: /\bi am go\b|\bi can speaking\b|\bi very like\b/i,
      reply: `教练 ee：结构小修\n你写的：「${t.slice(0, 60)}」\n更自然：\n• I am going… / I can speak…（情态动词后用原形）\n• I like… very much.（不要 I very like）\n\n📌 can + 原形 · like … very much — 非常喜欢\n再发一句改正后的句子～`,
    },
    {
      test: /\bthink\b|纠音.?think|\/θ/i,
      reply: `教练 ee：think /θɪŋk/\n舌尖轻触上牙，气流从齿缝出（不要发成 sink）。\n例句：I think this essay needs a clearer thesis.\n（我认为这篇论文需要更清晰的论点。）\n\n📌 essay — 论文 · thesis — 论点\n跟读 3 遍：I think…`,
    },
    {
      test: /discuss|paraphrase|academic|学术|thesis/i,
      reply: `教练 ee：英语专业常用\n• discuss /dɪˈskʌs/ — 讨论\n• paraphrase /ˈpærəfreɪz/ — 改述\n• thesis /ˈθiːsɪs/ — 论点 / 论文主题\n试着说：Let's discuss the theme, then paraphrase the key sentence.\n\n📌 theme — 主题 · key sentence — 关键句`,
    },
    {
      test: /hello|hi\b|hey|你好/i,
      reply: `教练 ee：Hello! Nice to meet you 👋\n你可以回：Nice to meet you too. I'm an English major.\n\n📌 major — 专业 · nice to meet you — 很高兴认识你\n跟读：I'm an English major.`,
    },
    {
      test: /how'?s it going|how are you|最近好吗/i,
      reply: `教练 ee：I'm doing well, thanks! How about you?\n也可以说：Pretty good. / Not bad. / A bit tired but okay.\n\n📌 pretty good — 挺好的 · a bit — 有一点儿\n用其中一句回答我～`,
    },
    {
      test: /foreigner|外国人|听不懂|repeat|交流|跟不上/i,
      reply: `教练 ee：交流救命句\n• Could you repeat that, please? — 能再说一遍吗？\n• What do you mean by…? — ……是什么意思？\n• I'm not sure I follow. — 我好像没跟上\n• In my opinion… — 在我看来……\n\n选一句练一练，发给我听～`,
    },
    {
      test: /thank|谢谢|thanks/i,
      reply: `教练 ee：You're welcome!\n也可以：No problem. / Anytime.\n\n📌 welcome — 别客气 · anytime — 随时`,
    },
    {
      test: /metaphor|literature|文学|theme|poem/i,
      reply: `教练 ee：文学小词\n• literature — 文学\n• theme — 主题\n• metaphor — 隐喻\n试着说：The theme of this poem is hope.\n\n📌 poem — 诗 · hope — 希望`,
    },
    {
      test: /there (is|are) many|a lot of|have many/i,
      reply: `教练 ee：量词小贴士\n可数复数：There are many books.\n不可数：There is a lot of water. / much advice\n\n📌 many — 许多（可数）· a lot of — 许多（可数/不可数）\n用 There are… 造一句教室里的东西～`,
    },
  ];

  for (const r of rules) {
    if (r.test.test(t)) return r.reply;
  }

  const short = t.length < 12;
  if (short) {
    return `教练 ee：收到「${t}」～再试着说成完整句子好吗？\n例如：I want to improve my speaking this semester.\n\n📌 improve — 提高 · speaking — 口语 · semester — 学期\n把完整句发给我，我帮你纠一下。`;
  }

  return `教练 ee：收到！「${t.slice(0, 80)}${t.length > 80 ? "…" : ""}」\n不错，继续用完整句子练习。可以试试过去式或观点句：\n"Yesterday I went to the library and read for an hour."\n"In my opinion, practice every day helps a lot."\n\n📌 library — 图书馆 · in my opinion — 在我看来\n想纠音就说：帮我纠音 think`;
}

function formatMessagesForPrompt(messages) {
  return (messages || [])
    .slice(-10)
    .map((m) => {
      const role =
        m.role === "assistant" || m.role === "bot" || m.role === "ee"
          ? "ee"
          : "student";
      return `${role}: ${String(m.content || "").slice(0, 500)}`;
    })
    .join("\n");
}

function extractAiText(result) {
  if (!result) return null;
  if (typeof result === "string") return result.trim() || null;
  const candidates = [
    result.response,
    result.result?.response,
    result.result,
    result.output_text,
    result.text,
    Array.isArray(result.output)
      ? result.output.map((o) => o?.content || o?.text || "").join("")
      : null,
  ];
  for (const c of candidates) {
    if (typeof c === "string" && c.trim()) return c.trim();
  }
  return null;
}

async function runWorkersAiModel(env, model, messagesPayload, promptPayload) {
  // Try messages mode first
  try {
    const result = await env.AI.run(model, messagesPayload);
    const text = extractAiText(result);
    if (text) return { reply: text, engine: "workers-ai", model };
  } catch (e) {
    console.warn("Workers AI messages failed", model, e && e.message ? e.message : e);
  }
  // Prompt fallback
  try {
    const result = await env.AI.run(model, promptPayload);
    const text = extractAiText(result);
    if (text) return { reply: text, engine: "workers-ai", model };
  } catch (e) {
    console.warn("Workers AI prompt failed", model, e && e.message ? e.message : e);
  }
  return null;
}

async function workersAiCoach(env, messages, learnerName) {
  if (!env.AI || typeof env.AI.run !== "function") {
    return { error: "AI binding missing" };
  }
  const name = learnerName || "同学";
  const dialogue = formatMessagesForPrompt(messages);
  const userPrompt = `Learner name: ${name}\n\nDialogue:\n${dialogue || "(empty — greet the learner)"}\n\nReply now as 教练 ee： following the required shape. Correct mistakes gently.`;
  const messagesPayload = {
    messages: [
      { role: "system", content: EE_SYSTEM_PROMPT },
      { role: "user", content: userPrompt },
    ],
    max_tokens: 420,
    temperature: 0.65,
  };
  const promptPayload = {
    prompt: `${EE_SYSTEM_PROMPT}\n\n${userPrompt}\n\n教练 ee:`,
    max_tokens: 420,
  };

  const errors = [];
  for (const model of AI_MODELS) {
    const hit = await runWorkersAiModel(env, model, messagesPayload, promptPayload);
    if (hit && hit.reply) return hit;
    errors.push(model + " empty/fail");
  }
  return { error: errors.join("; ") || "all models failed" };
}

async function openAiCoach(env, messages, learnerName) {
  if (!env.OPENAI_API_KEY) return null;
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: env.OPENAI_MODEL || "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: EE_SYSTEM_PROMPT + `\nLearner name: ${learnerName || "同学"}.`,
          },
          ...(messages || []).slice(-12).map((m) => ({
            role:
              m.role === "assistant" || m.role === "bot" || m.role === "ee"
                ? "assistant"
                : "user",
            content: String(m.content || ""),
          })),
        ],
        temperature: 0.7,
        max_tokens: 420,
      }),
    });
    if (res.ok) {
      const data = await res.json();
      const text = data.choices?.[0]?.message?.content;
      if (text) return { reply: text, engine: "openai", model: env.OPENAI_MODEL || "gpt-4o-mini" };
    }
  } catch (e) {
    console.warn("OpenAI coach failed", e);
  }
  return null;
}

/** Repair UTF-8 bytes that were mis-decoded as Latin-1 (common Workers AI glitch). */
function fixMojibake(text) {
  const s = String(text || "");
  if (!s) return s;
  const hasCjk = /[\u4e00-\u9fff]/.test(s);
  // Heuristic: lots of high Latin-1 bytes typical of UTF-8-as-latin1
  let high = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c >= 0x80 && c <= 0xff) high++;
  }
  if (hasCjk && high < 3) return s;
  if (high < 4) return s;
  try {
    const bytes = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i) & 0xff;
    const decoded = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
    const cjkNew = (decoded.match(/[\u4e00-\u9fff]/g) || []).length;
    const cjkOld = (s.match(/[\u4e00-\u9fff]/g) || []).length;
    if (cjkNew > cjkOld + 1 || /教练/.test(decoded)) return decoded;
  } catch {
    /* ignore */
  }
  return s;
}

function looksLikeGoodCoachReply(text) {
  const s = fixMojibake(String(text || "").trim());
  if (s.length < 20 || s.length > 1200) return false;
  if (/\uFFFD|ï¿½/.test(s)) return false;
  if (/(.)\1{8,}/.test(s)) return false;
  const hasCjk = /[\u4e00-\u9fff]/.test(s);
  const hasLatin = /[A-Za-z]{3,}/.test(s);
  // Must be bilingual-ish for our coach persona
  if (!hasCjk || !hasLatin) return false;
  // Still reject leftover latin1 mojibake markers for Chinese prompts
  if (/æ.|ç»|å.|ï¼/.test(s) && !/教练|跟读|释义/.test(s)) return false;
  return true;
}

async function aiCoach(env, messages, learnerName) {
  const viaAi = await workersAiCoach(env, messages, learnerName);
  if (viaAi && viaAi.reply) {
    viaAi.reply = fixMojibake(viaAi.reply);
    if (looksLikeGoodCoachReply(viaAi.reply)) return viaAi;
  }

  const viaOpenAi = await openAiCoach(env, messages, learnerName);
  if (viaOpenAi && looksLikeGoodCoachReply(viaOpenAi.reply)) return viaOpenAi;
  if (viaOpenAi && viaOpenAi.reply) return viaOpenAi; // openai usually fine

  const aiErrorParts = [];
  if (viaAi && viaAi.error) aiErrorParts.push(viaAi.error);
  if (viaAi && viaAi.reply && !looksLikeGoodCoachReply(viaAi.reply)) {
    aiErrorParts.push("workers-ai reply failed quality gate");
  }

  return {
    reply: ruleBasedCoach(messages, learnerName),
    engine: "rules",
    aiError: aiErrorParts.join("; ") || null,
  };
}

async function probeAi(env) {
  if (!env.AI || typeof env.AI.run !== "function") {
    return { ok: false, error: "no AI binding" };
  }
  const t0 = Date.now();
  for (const model of AI_MODELS) {
    try {
      const result = await env.AI.run(model, {
        messages: [
          { role: "system", content: "Reply with exactly: OK" },
          { role: "user", content: "ping" },
        ],
        max_tokens: 8,
        temperature: 0,
      });
      const text = extractAiText(result);
      if (text) {
        return { ok: true, model, ms: Date.now() - t0, sample: text.slice(0, 40) };
      }
    } catch (e) {
      /* try next */
    }
  }
  return { ok: false, ms: Date.now() - t0, error: "all AI models failed probe" };
}

function generateDailyTasks(seedInput) {
  const key =
    seedInput ||
    (() => {
      const d = new Date();
      return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
    })();
  const daySeed = parseInt(String(key).replace(/\D/g, ""), 10) || 0;
  const variants = [
    [
      { type: "pronounce", title: "练发音：跟读 1 个难音/专业词", link: "#pronounce", xp: 15, module: "pronounce" },
      { type: "vocab", title: "学今日单词：读完至少 4 个词（看中文释义）", link: "#vocab", xp: 20, module: "vocab" },
      { type: "chat", title: "开口说：和教练 ee 发 1 句英文", link: "#chat", xp: 25, module: "chat" },
      { type: "knowledge", title: "知识微课：读讲解并保存复述", link: "#knowledge", xp: 20, module: "knowledge" },
    ],
    [
      { type: "pronounce", title: "练发音：录音对比 1 句跟读", link: "#pronounce", xp: 15, module: "pronounce" },
      { type: "vocab", title: "词汇本：切换主题学 5 个新词", link: "#vocab", xp: 20, module: "vocab" },
      { type: "review", title: "复习本：翻面复习至少 3 张卡", link: "#review", xp: 15, module: "review" },
      { type: "chat", title: "对话：用 discuss / paraphrase 造句", link: "#chat", xp: 25, module: "chat" },
    ],
    [
      { type: "shadow", title: "影子跟读：听原音跟读课堂句", link: "#pronounce", xp: 15, module: "pronounce" },
      { type: "vocab", title: "今日单词：听发音 + 看释义", link: "#vocab", xp: 20, module: "vocab" },
      { type: "knowledge", title: "微课：细胞 / 大模型 / 文学任选一课", link: "#knowledge", xp: 20, module: "knowledge" },
      { type: "output", title: "输出：用英语复述今天学到的一点", link: "#chat", xp: 25, module: "chat" },
    ],
  ];
  const templates = variants[daySeed % variants.length];
  const now = new Date().toISOString();
  return {
    dateKey: key,
    source: "ee-worker",
    tasks: templates.map((t, i) => ({
      id: `ee-daily-${key}-${i}`,
      ...t,
      source: "ee",
      done: false,
      claimed: false,
      createdAt: now,
      note: "",
    })),
  };
}


const STT_MODELS = [
  "@cf/openai/whisper",
  "@cf/openai/whisper-tiny-en",
  "@cf/openai/whisper-large-v3-turbo",
];

function extractSttText(result) {
  if (!result) return null;
  if (typeof result === "string" && result.trim()) return result.trim();
  const candidates = [
    result.text,
    result.result?.text,
    result.transcription,
    result.transcript,
    Array.isArray(result.segments)
      ? result.segments.map((s) => s?.text || "").join(" ").trim()
      : null,
  ];
  for (const c of candidates) {
    if (typeof c === "string" && c.trim()) return c.trim();
  }
  return null;
}

async function runWhisperStt(env, audioBytes, mimeHint) {
  if (!env.AI || typeof env.AI.run !== "function") {
    return { error: "AI binding missing" };
  }
  const bytes = audioBytes instanceof Uint8Array ? audioBytes : new Uint8Array(audioBytes);
  if (!bytes.length) return { error: "empty audio" };
  if (bytes.length > 4_500_000) return { error: "audio too large (max ~4MB)" };

  const errors = [];
  // Classic whisper: raw byte array
  for (const model of ["@cf/openai/whisper", "@cf/openai/whisper-tiny-en"]) {
    try {
      const result = await env.AI.run(model, { audio: [...bytes] });
      const text = extractSttText(result);
      if (text) return { text, engine: "workers-ai-whisper", model };
      errors.push(model + " empty");
    } catch (e) {
      errors.push(model + ": " + String(e && e.message ? e.message : e));
    }
  }

  // large-v3-turbo often wants base64 / typed input
  try {
    let binary = "";
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    }
    const b64 = btoa(binary);
    const mime = mimeHint || "audio/wav";
    const payloads = [
      { audio: b64, task: "transcribe", language: "en" },
      { audio: [...bytes], task: "transcribe", language: "en" },
      { audio: `data:${mime};base64,${b64}` },
    ];
    for (const input of payloads) {
      try {
        const result = await env.AI.run("@cf/openai/whisper-large-v3-turbo", input);
        const text = extractSttText(result);
        if (text) {
          return { text, engine: "workers-ai-whisper", model: "@cf/openai/whisper-large-v3-turbo" };
        }
      } catch (e) {
        errors.push("large-v3: " + String(e && e.message ? e.message : e));
      }
    }
  } catch (e) {
    errors.push("large-v3 prep: " + String(e && e.message ? e.message : e));
  }

  return { error: errors.join("; ") || "stt failed" };
}

async function readSttAudio(request) {
  const ct = (request.headers.get("Content-Type") || "").toLowerCase();
  if (ct.includes("application/json")) {
    const body = await readJson(request);
    if (!body) return { error: "Invalid JSON" };
    const b64 = String(body.audioBase64 || body.audio || "").replace(/^data:[^;]+;base64,/, "");
    if (!b64) return { error: "audioBase64 required" };
    try {
      const bin = atob(b64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return { bytes, mime: body.mime || body.contentType || "audio/wav", language: body.language || "en" };
    } catch {
      return { error: "invalid base64 audio" };
    }
  }
  if (ct.includes("multipart/form-data")) {
    const form = await request.formData();
    const file = form.get("audio") || form.get("file");
    if (!file || typeof file.arrayBuffer !== "function") return { error: "audio file required" };
    const buf = await file.arrayBuffer();
    return {
      bytes: new Uint8Array(buf),
      mime: file.type || "audio/wav",
      language: String(form.get("language") || "en"),
    };
  }
  // raw body (wav/webm)
  const buf = await request.arrayBuffer();
  if (!buf || buf.byteLength < 64) return { error: "audio body required" };
  return { bytes: new Uint8Array(buf), mime: ct.split(";")[0] || "application/octet-stream", language: "en" };
}


export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(request) });
    }

    // Ultra-light ping: never touches AI / KV — for CN connectivity probe
    if (url.pathname === "/api/ping") {
      return json(
        {
          ok: true,
          service: "kouyu-xiaozhan-worker",
          version: 10,
          ping: true,
          host: url.hostname,
          ts: new Date().toISOString(),
        },
        200,
        request
      );
    }

    if (url.pathname === "/" || url.pathname === "/api/health") {
      const deep = url.searchParams.get("deep") === "1" || url.searchParams.get("probe") === "ai";
      const body = {
        ok: true,
        service: "kouyu-xiaozhan-worker",
        version: 10,
        sync: !!env.SYNC,
        ai: !!(env.AI || env.OPENAI_API_KEY),
        aiBinding: !!env.AI,
        aiModels: AI_MODELS,
        familySecretRequired: !!env.FAMILY_SECRET,
        host: url.hostname,
        ts: new Date().toISOString(),
      };
      if (deep) {
        body.aiProbe = await probeAi(env);
      }
      return json(body, 200, request);
    }

    // TTS does not require family secret (public short clips)
    if (url.pathname === "/api/tts" && request.method === "GET") {
      const text = String(url.searchParams.get("text") || "").trim().slice(0, 200);
      const lang = String(url.searchParams.get("lang") || "en").slice(0, 10);
      if (!text) return bad(request, "text required");
      const targets = [
        `https://dict.youdao.com/dictvoice?audio=${encodeURIComponent(text)}&type=2`,
        `https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=${encodeURIComponent(lang)}&q=${encodeURIComponent(text)}`,
      ];
      let lastErr = "upstream failed";
      for (const target of targets) {
        try {
          const up = await fetch(target, {
            headers: {
              "User-Agent":
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
              Accept: "audio/mpeg,audio/*;q=0.9,*/*;q=0.8",
              Referer: target.includes("youdao") ? "https://www.youdao.com/" : "https://translate.google.com/",
            },
          });
          if (!up.ok) {
            lastErr = "upstream HTTP " + up.status;
            continue;
          }
          const buf = await up.arrayBuffer();
          if (!buf || buf.byteLength < 64) {
            lastErr = "empty audio";
            continue;
          }
          const ct = up.headers.get("Content-Type") || "audio/mpeg";
          return new Response(buf, {
            status: 200,
            headers: {
              "Content-Type": ct,
              "Cache-Control": "public, max-age=604800",
              ...corsHeaders(request),
            },
          });
        } catch (e) {
          lastErr = String(e && e.message ? e.message : e);
        }
      }
      return bad(request, "TTS proxy failed: " + lastErr, 502);
    }

    if (!checkFamilySecret(request, env)) {
      return bad(request, "Invalid or missing X-Family-Secret", 401);
    }

    // ee chat / tasks can work without KV for AI-only paths
    if (url.pathname === "/api/ee/chat" && request.method === "POST") {
      const body = await readJson(request);
      if (!body) return bad(request, "Invalid JSON");
      const messages = Array.isArray(body.messages) ? body.messages : [];
      const learnerName = body.learnerName || "妹妹";
      const result = await aiCoach(env, messages, learnerName);
      return json(
        {
          ok: true,
          reply: result.reply,
          engine: result.engine,
          model: result.model || null,
          aiError: result.aiError || null,
          familyCode: normalizeFamilyCode(body.familyCode) || null,
        },
        200,
        request
      );
    }

    if (url.pathname === "/api/ee/tasks/generate" && request.method === "POST") {
      const body = (await readJson(request)) || {};
      const seed = body.dateKey || body.seed || null;
      const data = generateDailyTasks(seed);
      return json({ ok: true, ...data }, 200, request);
    }

    if (url.pathname === "/api/ee/stt" && request.method === "POST") {
      const parsed = await readSttAudio(request);
      if (parsed.error) return bad(request, parsed.error);
      const result = await runWhisperStt(env, parsed.bytes, parsed.mime);
      if (result.error) {
        return json(
          { ok: false, error: result.error, engine: null, text: "" },
          502,
          request
        );
      }
      return json(
        {
          ok: true,
          text: result.text,
          engine: result.engine,
          model: result.model || null,
          mime: parsed.mime || null,
        },
        200,
        request
      );
    }


    if (!env.SYNC) {
      return bad(request, "KV binding SYNC not configured", 500);
    }

    if (url.pathname === "/api/family/init" && request.method === "POST") {
      const body = await readJson(request);
      if (!body) return bad(request, "Invalid JSON");
      const code = normalizeFamilyCode(body.familyCode);
      const hash = String(body.adminPasswordHash || "").trim();
      if (code.length < 4) return bad(request, "familyCode too short (min 4)");
      if (!hash || hash.length < 16) return bad(request, "adminPasswordHash required");

      const adminKey = familyKey(code, "admin");
      const existing = await env.SYNC.get(adminKey);
      if (existing) {
        try {
          const prev = JSON.parse(existing);
          if (prev.hash !== hash) {
            return bad(request, "Family room already exists with a different admin hash", 409);
          }
        } catch {
          return bad(request, "Family room already exists", 409);
        }
        return json({ ok: true, familyCode: code, reused: true }, 200, request);
      }

      await env.SYNC.put(
        adminKey,
        JSON.stringify({
          hash,
          createdAt: new Date().toISOString(),
        })
      );
      return json({ ok: true, familyCode: code, created: true }, 201, request);
    }

    if (url.pathname === "/api/sync/push" && request.method === "POST") {
      const body = await readJson(request);
      if (!body) return bad(request, "Invalid JSON");
      const code = normalizeFamilyCode(body.familyCode);
      const role = String(body.role || "").toLowerCase();
      if (code.length < 4) return bad(request, "familyCode required");
      if (role !== "sister" && role !== "learner") {
        return bad(request, "Only sister/learner can push progress in v1");
      }
      if (!body.payload || typeof body.payload !== "object") {
        return bad(request, "payload object required");
      }

      const updatedAt = body.updatedAt || new Date().toISOString();
      const key = familyKey(code, "sister");
      const record = {
        role: "sister",
        payload: body.payload,
        updatedAt,
        receivedAt: new Date().toISOString(),
      };
      await env.SYNC.put(key, JSON.stringify(record));
      return json({ ok: true, familyCode: code, updatedAt }, 200, request);
    }

    if (url.pathname === "/api/sync/pull" && request.method === "GET") {
      const code = normalizeFamilyCode(url.searchParams.get("familyCode"));
      const role = String(url.searchParams.get("role") || "").toLowerCase();
      if (code.length < 4) return bad(request, "familyCode required");
      if (role !== "brother" && role !== "admin") {
        return bad(request, "role=brother required for pull");
      }

      const adminToken =
        request.headers.get("X-Admin-Token") ||
        url.searchParams.get("adminToken") ||
        "";
      const adminRaw = await env.SYNC.get(familyKey(code, "admin"));
      if (!adminRaw) return bad(request, "Family room not initialized", 404);
      let admin;
      try {
        admin = JSON.parse(adminRaw);
      } catch {
        return bad(request, "Corrupt admin record", 500);
      }
      if (!adminToken || adminToken !== admin.hash) {
        return bad(request, "Invalid admin token", 403);
      }

      const sisterRaw = await env.SYNC.get(familyKey(code, "sister"));
      if (!sisterRaw) {
        return json(
          { ok: true, familyCode: code, empty: true, payload: null },
          200,
          request
        );
      }
      const sister = JSON.parse(sisterRaw);
      return json(
        {
          ok: true,
          familyCode: code,
          payload: sister.payload,
          updatedAt: sister.updatedAt,
        },
        200,
        request
      );
    }

    return bad(request, "Not found", 404);
  },
};
