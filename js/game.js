/* 口语小站 · 游戏化：XP / 等级 / ee 任务 / 挑战测验 / 奖励 */
(function (global) {
  "use strict";

  const XP_PER_LEVEL = 100;

  const BADGE_CATALOG = [
    { id: "first_task", name: "初次打卡", emoji: "🌱", desc: "完成任意学习任务", xpNeed: 0 },
    { id: "streak_3", name: "三天坚持", emoji: "🔥", desc: "连续打卡 3 天", needStreak: 3 },
    { id: "streak_7", name: "一周达人", emoji: "⭐", desc: "连续打卡 7 天", needStreak: 7 },
    { id: "level_3", name: "升到 3 级", emoji: "🥉", desc: "达到等级 3", needLevel: 3 },
    { id: "level_5", name: "升到 5 级", emoji: "🥈", desc: "达到等级 5", needLevel: 5 },
    { id: "xp_200", name: "经验猎人", emoji: "💎", desc: "累计 200 XP", needXp: 200 },
    { id: "weekly_pass", name: "周测通过", emoji: "📅", desc: "周测得分 ≥ 60%", needChallenge: "weekly" },
    { id: "monthly_pass", name: "月测通过", emoji: "🗓️", desc: "月测得分 ≥ 60%", needChallenge: "monthly" },
    { id: "semi_pass", name: "半年测通过", emoji: "🏅", desc: "半年测得分 ≥ 60%", needChallenge: "semi" },
    { id: "yearly_pass", name: "年测通过", emoji: "👑", desc: "年测得分 ≥ 60%", needChallenge: "yearly" },
    { id: "vocab_master", name: "词汇小能手", emoji: "📖", desc: "完成「今日单词」任务", taskType: "vocab" },
    { id: "speak_up", name: "开口勇士", emoji: "🗣️", desc: "完成对话输出任务", taskType: "chat" },
  ];

  /** ee API stub — 以后可换成真实 Grok Bot / ee 接口 */
  const EE_CONFIG = {
    mode: "local-auto", // "local-auto" | "api"
    apiEndpoint: null, // e.g. "https://your-ee-api.example/tasks"
    apiKeyHint: "把真实 API 填到 EE_CONFIG.apiEndpoint，并在 fetchEeTasks 里接认证",
  };

  function todayKey() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  function weekKey() {
    const d = new Date();
    const onejan = new Date(d.getFullYear(), 0, 1);
    const week = Math.ceil(((d - onejan) / 86400000 + onejan.getDay() + 1) / 7);
    return `${d.getFullYear()}-W${String(week).padStart(2, "0")}`;
  }

  function monthKey() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  }

  function levelFromXp(xp) {
    return Math.max(1, Math.floor(Number(xp) / XP_PER_LEVEL) + 1);
  }

  function xpProgress(xp) {
    const cur = Number(xp) || 0;
    const into = cur % XP_PER_LEVEL;
    return { into, need: XP_PER_LEVEL, pct: Math.round((into / XP_PER_LEVEL) * 100) };
  }

  function awardXp(state, amount, reason) {
    const add = Math.max(0, Number(amount) || 0);
    if (!add) return { state, leveled: false, add: 0 };
    const before = state.level || levelFromXp(state.xp);
    state.xp = (state.xp || 0) + add;
    state.level = levelFromXp(state.xp);
    const leveled = state.level > before;
    return { state, leveled, add, reason: reason || "" };
  }

  function bumpStreakOnActivity(state) {
    const today = todayKey();
    if (state.lastCheckInDate === today) return state;
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yKey = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, "0")}-${String(yesterday.getDate()).padStart(2, "0")}`;
    if (state.lastCheckInDate === yKey) {
      state.streak = (state.streak || 0) + 1;
    } else if (!state.lastCheckInDate) {
      state.streak = Math.max(state.streak || 0, 1);
    } else {
      state.streak = 1;
    }
    state.lastCheckInDate = today;
    return state;
  }

  function eeDailyTemplates(daySeed) {
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
    return variants[daySeed % variants.length];
  }

  function makeTask(partial, source) {
    return {
      id: partial.id || source + "-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 6),
      title: partial.title,
      type: partial.type || "custom",
      link: partial.link || "#home",
      xp: partial.xp || 10,
      module: partial.module || "",
      source: source, // "ee" | "brother"
      done: false,
      claimed: false,
      createdAt: partial.createdAt || new Date().toISOString(),
      note: partial.note || "",
    };
  }

  /** 本地 ee 自动生成每日任务；预留 API 钩子 */
  async function fetchEeTasks() {
    if (EE_CONFIG.mode === "api" && EE_CONFIG.apiEndpoint) {
      try {
        const res = await fetch(EE_CONFIG.apiEndpoint);
        if (res.ok) return await res.json();
      } catch (e) {
        console.warn("[ee stub] API failed, fallback local-auto", e);
      }
    }
    return null;
  }

  function ensureEeDailyTasks(state) {
    const key = todayKey();
    if (state.lastEeDailyKey === key) {
      // still merge any missing brother tasks handled elsewhere
      return state;
    }
    const daySeed = parseInt(key.replace(/-/g, ""), 10) || 0;
    const templates = eeDailyTemplates(daySeed);
    const daily = templates.map((t, i) =>
      makeTask(
        {
          id: `ee-daily-${key}-${i}`,
          ...t,
          createdAt: new Date().toISOString(),
        },
        "ee"
      )
    );
    // keep unfinished brother tasks + unfinished older ee? reset daily ee
    const keep = (state.gameTasks || []).filter((t) => t.source === "brother" && !t.done);
    state.gameTasks = [...daily, ...keep];
    state.lastEeDailyKey = key;
    // reset legacy daily task flags
    state.tasks = { pronounce: false, shadow: false, input: false, output: false };
    return state;
  }

  function ensureEeWeeklyChallengeHint(state) {
    const wk = weekKey();
    if (state.lastEeWeeklyKey === wk) return state;
    const exists = (state.gameTasks || []).some((t) => t.id === `ee-weekly-${wk}`);
    if (!exists) {
      state.gameTasks = state.gameTasks || [];
      state.gameTasks.push(
        makeTask(
          {
            id: `ee-weekly-${wk}`,
            title: "挑战：完成本周周测（≥60% 可领徽章）",
            type: "challenge-weekly",
            link: "#challenges",
            xp: 50,
            module: "challenges",
          },
          "ee"
        )
      );
    }
    state.lastEeWeeklyKey = wk;
    return state;
  }

  function mergeBrotherPublishedTasks(state, publishedTasks) {
    if (!Array.isArray(publishedTasks)) return state;
    state.gameTasks = state.gameTasks || [];
    publishedTasks.forEach((pt) => {
      if (!pt || !pt.id) return;
      if (state.gameTasks.some((t) => t.id === pt.id)) return;
      state.gameTasks.push(
        makeTask(
          {
            id: pt.id,
            title: pt.title,
            type: pt.type || "custom",
            link: pt.link || "#home",
            xp: pt.xp || 15,
            note: pt.note || "",
            createdAt: pt.createdAt,
          },
          "brother"
        )
      );
    });
    return state;
  }

  function completeGameTask(state, taskId) {
    const t = (state.gameTasks || []).find((x) => x.id === taskId);
    if (!t || t.done) return { state, xpGain: 0, leveled: false };
    t.done = true;
    bumpStreakOnActivity(state);
    const result = awardXp(state, t.xp, t.title);
    // map to legacy flags for compatibility
    if (t.module === "pronounce" || t.type === "pronounce" || t.type === "shadow") state.tasks.pronounce = true;
    if (t.type === "shadow") state.tasks.shadow = true;
    if (t.module === "knowledge" || t.type === "knowledge") state.tasks.input = true;
    if (t.module === "chat" || t.type === "chat" || t.type === "output") state.tasks.output = true;
    if (t.module === "vocab" || t.type === "vocab") state.tasks.input = true;
    evaluateBadges(state);
    return { state, xpGain: result.add, leveled: result.leveled, task: t };
  }

  function completeTaskByModule(state, module) {
    const open = (state.gameTasks || []).find((t) => !t.done && (t.module === module || t.type === module));
    if (!open) {
      // still give small XP for module activity once per day via legacy
      bumpStreakOnActivity(state);
      return { state, xpGain: 0, leveled: false, task: null };
    }
    return completeGameTask(state, open.id);
  }

  function evaluateBadges(state) {
    const owned = new Set((state.rewards || []).map((r) => r.id));
    const passChallenges = new Set(
      (state.challengeResults || []).filter((c) => c.passed).map((c) => c.kind)
    );
    BADGE_CATALOG.forEach((b) => {
      if (owned.has(b.id)) return;
      let ok = false;
      if (b.needStreak && (state.streak || 0) >= b.needStreak) ok = true;
      if (b.needLevel && (state.level || 1) >= b.needLevel) ok = true;
      if (b.needXp && (state.xp || 0) >= b.needXp) ok = true;
      if (b.needChallenge && passChallenges.has(b.needChallenge)) ok = true;
      if (b.id === "first_task" && (state.gameTasks || []).some((t) => t.done)) ok = true;
      if (b.taskType && (state.gameTasks || []).some((t) => t.done && (t.type === b.taskType || t.module === b.taskType)))
        ok = true;
      if (ok) {
        state.rewards = state.rewards || [];
        state.rewards.push({
          id: b.id,
          name: b.name,
          emoji: b.emoji,
          earnedAt: new Date().toISOString(),
        });
      }
    });
    return state;
  }

  // —— Quiz banks ——
  const QUIZ_BANK = {
    weekly: [
      {
        q: "discuss 的中文意思是？",
        choices: ["讨论", "争论吵架（仅此义）", "忽视", "翻译"],
        answer: 0,
        tip: "discuss = 讨论；不要说 discuss about。",
      },
      {
        q: "paraphrase 更接近哪个意思？",
        choices: ["抄写原文", "用自己的话改述", "大声朗读", "写摘要标题"],
        answer: 1,
        tip: "paraphrase = 改述 / 释义。",
      },
      {
        q: "think 的词首辅音是？",
        choices: ["/s/", "/θ/", "/t/", "/f/"],
        answer: 1,
        tip: "/θ/：舌尖轻触上下牙之间。",
      },
      {
        q: "和外国人没听清时，可以说：",
        choices: ["What?", "Could you repeat that?", "You what?", "Say again now!"],
        answer: 1,
        tip: "Could you repeat that? 更礼貌。",
      },
      {
        q: "essay 在校园语境常指：",
        choices: ["考试分数", "短文 / 课程论文", "字典", "口音"],
        answer: 1,
        tip: "essay = 短文；课程论文。",
      },
    ],
    monthly: [
      {
        q: "In my opinion 的意思是？",
        choices: ["顺便说", "在我看来", "我不同意", "请重复"],
        answer: 1,
        tip: "表达观点的常用语块。",
      },
      {
        q: "thesis 最贴切的释义是？",
        choices: ["隐喻", "论点 / 学位论文", "截止日期", "研讨课"],
        answer: 1,
        tip: "thesis statement = 中心论点。",
      },
      {
        q: "A cell is the _____ of life.",
        choices: ["basic unit", "large model", "deadline", "accent"],
        answer: 0,
        tip: "basic unit of life = 生命的基本单位。",
      },
      {
        q: "argue that… 在学术英语里常表示：",
        choices: ["吵架", "主张 / 论证……", "放弃", "翻译"],
        answer: 1,
        tip: "academic argue ≠ 一定吵架。",
      },
      {
        q: "presentation 课堂意思是？",
        choices: ["礼物", "演示 / 汇报", "请假条", "宿舍"],
        answer: 1,
        tip: "give a presentation = 做汇报。",
      },
      {
        q: "I'm not sure I follow. 意思接近：",
        choices: ["我跟上了", "我好像没跟上", "我拒绝", "我同意"],
        answer: 1,
        tip: "听不懂时礼貌表达。",
      },
      {
        q: "/ð/ 出现在哪个词？",
        choices: ["think", "this", "sink", "sing"],
        answer: 1,
        tip: "this /ðɪs/ 声带振动。",
      },
      {
        q: "fluent 的意思是？",
        choices: ["流利的", "困难的", "安静的", "书面的"],
        answer: 0,
        tip: "be fluent in English。",
      },
    ],
    semi: null, // built from weekly+monthly mix
    yearly: null,
  };

  function buildQuiz(kind) {
    if (kind === "weekly") return QUIZ_BANK.weekly.map((x) => ({ ...x }));
    if (kind === "monthly") return QUIZ_BANK.monthly.map((x) => ({ ...x }));
    const pool = [...QUIZ_BANK.weekly, ...QUIZ_BANK.monthly];
    if (kind === "semi") return pool.slice(0, 10).map((x) => ({ ...x }));
    // yearly
    return pool.map((x) => ({ ...x }));
  }

  const CHALLENGE_META = {
    weekly: { label: "周测", emoji: "📅", xp: 50, passRatio: 0.6 },
    monthly: { label: "月测", emoji: "🗓️", xp: 120, passRatio: 0.6 },
    semi: { label: "半年测", emoji: "🏅", xp: 250, passRatio: 0.6 },
    yearly: { label: "年测", emoji: "👑", xp: 500, passRatio: 0.6 },
  };

  function gradeChallenge(kind, answers) {
    const quiz = buildQuiz(kind);
    let correct = 0;
    quiz.forEach((item, i) => {
      if (Number(answers[i]) === item.answer) correct++;
    });
    const total = quiz.length;
    const ratio = total ? correct / total : 0;
    const meta = CHALLENGE_META[kind];
    const passed = ratio >= meta.passRatio;
    return { correct, total, ratio, passed, xp: passed ? meta.xp : Math.round(meta.xp * ratio * 0.4), quiz };
  }

  function recordChallenge(state, kind, result) {
    const entry = {
      kind,
      correct: result.correct,
      total: result.total,
      ratio: result.ratio,
      passed: result.passed,
      xp: result.xp,
      at: new Date().toISOString(),
    };
    state.challengeResults = state.challengeResults || [];
    state.challengeResults.unshift(entry);
    if (state.challengeResults.length > 40) state.challengeResults.length = 40;
    bumpStreakOnActivity(state);
    awardXp(state, result.xp, CHALLENGE_META[kind].label);
    // auto-complete weekly ee task if weekly passed/done
    if (kind === "weekly") {
      const wk = weekKey();
      const t = (state.gameTasks || []).find((x) => x.id === `ee-weekly-${wk}`);
      if (t && !t.done) {
        t.done = true;
      }
    }
    evaluateBadges(state);
    return state;
  }

  global.KouyuGame = {
    XP_PER_LEVEL,
    BADGE_CATALOG,
    EE_CONFIG,
    todayKey,
    weekKey,
    monthKey,
    levelFromXp,
    xpProgress,
    awardXp,
    bumpStreakOnActivity,
    ensureEeDailyTasks,
    ensureEeWeeklyChallengeHint,
    mergeBrotherPublishedTasks,
    completeGameTask,
    completeTaskByModule,
    evaluateBadges,
    buildQuiz,
    CHALLENGE_META,
    gradeChallenge,
    recordChallenge,
    fetchEeTasks,
    makeTask,
  };
})(window);
