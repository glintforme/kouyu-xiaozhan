/**
 * 口语小站 · Cloudflare Worker
 * 家庭同步 + ee 教练 API（规则版可即用；Workers AI / OpenAI 可后插）
 *
 * 绑定：KV namespace SYNC
 * 可选环境变量：FAMILY_SECRET、OPENAI_API_KEY、AI (Workers AI binding)
 *
 * ⚠️ 部署前云同步不可用。GitHub Pages 前端已预留 API Base 配置。
 */

const CORS_ORIGINS = [
  "https://glintforme.github.io",
  "http://localhost:8765",
  "http://127.0.0.1:8765",
  "http://localhost:5500",
  "http://127.0.0.1:5500",
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
  if (!secret) return true; // optional
  const got = request.headers.get("X-Family-Secret") || "";
  return got === secret;
}

function familyKey(code, suffix) {
  return `family:${code}:${suffix}`;
}

/** Rule-based ee coach — Chinese + English correction persona */
function ruleBasedCoach(messages, learnerName) {
  const name = learnerName || "同学";
  const last =
    [...(messages || [])].reverse().find((m) => m.role === "user")?.content ||
    "";
  const t = String(last).trim();
  if (!t) {
    return `教练 ee：Hi ${name}! 发一句英文给我吧～\nTry: "I went to the library yesterday."`;
  }

  const rules = [
    {
      test: /i go to .+ yesterday|yesterday i go/i,
      reply: `教练 ee：时态提醒！yesterday（昨天）要用过去式。\n❌ I go to school yesterday.\n✅ I went to school yesterday.\n\n📌 go → went（过去式）· yesterday — 昨天\n再试一句带 yesterday 的过去式？`,
    },
    {
      test: /\bthink\b|纠音.?think|\/θ/i,
      reply: `教练 ee：think /θɪŋk/\n舌尖轻触上牙，气流从齿缝出（不要发成 sink）。\n例句：I think this essay needs a clearer thesis.\n（我认为这篇论文需要更清晰的论点。）\n\n📌 essay — 论文 · thesis — 论点`,
    },
    {
      test: /discuss|paraphrase|academic|学术/i,
      reply: `教练 ee：英语专业常用\n• discuss /dɪˈskʌs/ — 讨论\n• paraphrase /ˈpærəfreɪz/ — 改述\n试着说：Let's discuss the theme, then paraphrase the key sentence.\n\n📌 theme — 主题 · key sentence — 关键句`,
    },
    {
      test: /hello|hi\b|hey/i,
      reply: `教练 ee：Hello! Nice to meet you 👋\n你可以回：Nice to meet you too. I'm an English major.\n\n📌 major — 专业 · nice to meet you — 很高兴认识你`,
    },
    {
      test: /how'?s it going|how are you/i,
      reply: `教练 ee：I'm doing well, thanks! How about you?\n也可以说：Pretty good. / Not bad. / A bit tired but okay.\n\n📌 pretty good — 挺好的 · a bit — 有一点儿`,
    },
    {
      test: /foreigner|外国人|听不懂|repeat|交流/i,
      reply: `教练 ee：交流救命句\n• Could you repeat that, please? — 能再说一遍吗？\n• What do you mean by…? — ……是什么意思？\n• I'm not sure I follow. — 我好像没跟上\n• In my opinion… — 在我看来……\n\n选一句练一练～`,
    },
    {
      test: /thank|谢谢|thanks/i,
      reply: `教练 ee：You're welcome!\n也可以：No problem. / Anytime.\n\n📌 welcome — 别客气 · anytime — 随时`,
    },
    {
      test: /metaphor|literature|文学|theme/i,
      reply: `教练 ee：文学小词\n• literature — 文学\n• theme — 主题\n• metaphor — 隐喻\n试着说：The theme of this poem is hope.\n\n📌 poem — 诗 · hope — 希望`,
    },
  ];

  for (const r of rules) {
    if (r.test.test(t)) return r.reply;
  }

  // Light grammar nudge for common present-perfect / article slips
  if (/\bi am go\b|\bi can speaking\b/i.test(t)) {
    return `教练 ee：结构小修\n你写的："${t}"\n更自然：试着改成 "I am going…" 或 "I can speak…"\n\n📌 情态动词后用原形：can + speak（不是 speaking）\n再发一句给我看看～`;
  }

  return `教练 ee：收到！「${t.slice(0, 80)}${t.length > 80 ? "…" : ""}」\n试着用完整句子，例如：\n"Yesterday I went to the library and read for an hour."\n\n📌 library — 图书馆 · hour — 小时\n想纠音就说：帮我纠音 think`;
}

async function aiCoach(env, messages, learnerName) {
  // Prefer OpenAI-compatible if key present
  if (env.OPENAI_API_KEY) {
    try {
      const system = `You are 教练 ee (ee), a warm English speaking coach for a Chinese sophomore English major beginner. Reply in Chinese + English: correct gently, give IPA when useful, gloss key words in Chinese (📌). Keep replies under 120 words. Learner name: ${learnerName || "同学"}.`;
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: env.OPENAI_MODEL || "gpt-4o-mini",
          messages: [
            { role: "system", content: system },
            ...(messages || []).slice(-12).map((m) => ({
              role: m.role === "assistant" || m.role === "bot" ? "assistant" : "user",
              content: String(m.content || ""),
            })),
          ],
          temperature: 0.7,
          max_tokens: 400,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        const text = data.choices?.[0]?.message?.content;
        if (text) return { reply: text, engine: "openai" };
      }
    } catch (e) {
      console.warn("OpenAI coach failed", e);
    }
  }

  // Workers AI binding (optional): env.AI.run
  if (env.AI && typeof env.AI.run === "function") {
    try {
      const prompt = `你是口语教练 ee。用中英双语温和纠正，关键词附中文释义。学习者：${learnerName || "同学"}。\n对话：\n${(messages || [])
        .slice(-8)
        .map((m) => `${m.role}: ${m.content}`)
        .join("\n")}\n\nee:`;
      const result = await env.AI.run("@cf/meta/llama-3.1-8b-instruct", {
        prompt,
        max_tokens: 300,
      });
      const text = result?.response || result?.result?.response;
      if (text) return { reply: String(text).trim(), engine: "workers-ai" };
    } catch (e) {
      console.warn("Workers AI failed", e);
    }
  }

  return {
    reply: ruleBasedCoach(messages, learnerName),
    engine: "rules",
  };
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

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(request) });
    }

    // Health
    if (url.pathname === "/" || url.pathname === "/api/health") {
      return json(
        {
          ok: true,
          service: "kouyu-xiaozhan-worker",
          sync: !!env.SYNC,
          ai: !!(env.AI || env.OPENAI_API_KEY),
          familySecretRequired: !!env.FAMILY_SECRET,
        },
        200,
        request
      );
    }

    if (!checkFamilySecret(request, env)) {
      return bad(request, "Invalid or missing X-Family-Secret", 401);
    }

    if (!env.SYNC) {
      return bad(request, "KV binding SYNC not configured", 500);
    }

    // POST /api/family/init
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
        // Allow re-init only if same hash (idempotent)
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

    // POST /api/sync/push
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

    // GET /api/sync/pull?familyCode=&role=brother
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

    // POST /api/ee/chat
    if (url.pathname === "/api/ee/chat" && request.method === "POST") {
      const body = await readJson(request);
      if (!body) return bad(request, "Invalid JSON");
      const messages = Array.isArray(body.messages) ? body.messages : [];
      const learnerName = body.learnerName || "妹妹";
      const { reply, engine } = await aiCoach(env, messages, learnerName);
      return json(
        {
          ok: true,
          reply,
          engine,
          familyCode: normalizeFamilyCode(body.familyCode) || null,
        },
        200,
        request
      );
    }

    // POST /api/ee/tasks/generate
    if (url.pathname === "/api/ee/tasks/generate" && request.method === "POST") {
      const body = (await readJson(request)) || {};
      const seed = body.dateKey || body.seed || null;
      const data = generateDailyTasks(seed);
      return json({ ok: true, ...data }, 200, request);
    }

    return bad(request, "Not found", 404);
  },
};
