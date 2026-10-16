/* 口语小站 · 游戏化：XP / 等级 / ee 任务 / 挑战测验 / 奖励 · v5 */
(function (global) {
  "use strict";

  const XP_PER_LEVEL = 100;

  const BADGE_CATALOG = [
    { id: "first_task", name: "初次打卡", emoji: "🌱", desc: "完成任意学习任务", how: "首页点「领取」完成任意一条任务", check: "first_task" },
    { id: "streak_3", name: "三天坚持", emoji: "🔥", desc: "连续打卡 3 天", how: "连续 3 天完成至少 1 项任务", needStreak: 3 },
    { id: "streak_7", name: "一周达人", emoji: "⭐", desc: "连续打卡 7 天", how: "连续 7 天打卡（中断会重置）", needStreak: 7 },
    { id: "streak_14", name: "两周不停", emoji: "💪", desc: "连续打卡 14 天", how: "连续 14 天学习打卡", needStreak: 14 },
    { id: "level_3", name: "升到 3 级", emoji: "🥉", desc: "达到等级 3", how: "累计约 200 XP（每 100 XP 一级）", needLevel: 3 },
    { id: "level_5", name: "升到 5 级", emoji: "🥈", desc: "达到等级 5", how: "累计约 400 XP", needLevel: 5 },
    { id: "level_10", name: "十级达人", emoji: "🥇", desc: "达到等级 10", how: "累计约 900 XP", needLevel: 10 },
    { id: "xp_200", name: "经验猎人", emoji: "💎", desc: "累计 200 XP", how: "完成任务与测验攒够 200 XP", needXp: 200 },
    { id: "xp_500", name: "经验大师", emoji: "💠", desc: "累计 500 XP", how: "累计获得 500 XP", needXp: 500 },
    { id: "weekly_pass", name: "周测通过", emoji: "📅", desc: "周测得分 ≥ 60%", how: "挑战页完成周测且正确率 ≥ 60%", needChallenge: "weekly" },
    { id: "monthly_pass", name: "月测通过", emoji: "🗓️", desc: "月测得分 ≥ 60%", how: "挑战页完成月测且正确率 ≥ 60%", needChallenge: "monthly" },
    { id: "semi_pass", name: "半年测通过", emoji: "🏅", desc: "半年测得分 ≥ 60%", how: "挑战页完成半年测且正确率 ≥ 60%", needChallenge: "semi" },
    { id: "yearly_pass", name: "年测通过", emoji: "👑", desc: "年测得分 ≥ 60%", how: "挑战页完成年测且正确率 ≥ 60%", needChallenge: "yearly" },
    { id: "vocab_master", name: "词汇小能手", emoji: "📖", desc: "完成「今日单词」任务", how: "词汇本学完后点「完成单词任务并领 XP」", taskType: "vocab" },
    { id: "speak_up", name: "开口勇士", emoji: "🗣️", desc: "完成对话输出任务", how: "和教练 ee 发英文并领取对话任务", taskType: "chat" },
    { id: "pronounce_star", name: "发音新星", emoji: "🎤", desc: "完成发音任务", how: "练发音后点「完成发音任务并领 XP」", taskType: "pronounce" },
    { id: "knowledge_seeker", name: "知识探索者", emoji: "📚", desc: "完成知识微课复述", how: "知识页保存英文复述并领 XP", taskType: "knowledge" },
  ];

  /** ee API stub — 以后可换成真实 Grok Bot / ee 接口（见 README） */
  const EE_CONFIG = {
    mode: "local-auto", // "local-auto" | "api"
    apiEndpoint: null,
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
      source: source,
      done: false,
      claimed: false,
      createdAt: partial.createdAt || new Date().toISOString(),
      note: partial.note || "",
    };
  }

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
    if (state.lastEeDailyKey === key) return state;
    const daySeed = parseInt(key.replace(/-/g, ""), 10) || 0;
    const templates = eeDailyTemplates(daySeed);
    const daily = templates.map((t, i) =>
      makeTask({ id: `ee-daily-${key}-${i}`, ...t, createdAt: new Date().toISOString() }, "ee")
    );
    const keep = (state.gameTasks || []).filter((t) => t.source === "brother" && !t.done);
    state.gameTasks = [...daily, ...keep];
    state.lastEeDailyKey = key;
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
    if (!t || t.done) return { state, xpGain: 0, leveled: false, streakBumped: false };
    const prevStreak = state.streak || 0;
    const prevDate = state.lastCheckInDate;
    t.done = true;
    bumpStreakOnActivity(state);
    const streakBumped = state.lastCheckInDate !== prevDate || state.streak !== prevStreak;
    const result = awardXp(state, t.xp, t.title);
    if (t.module === "pronounce" || t.type === "pronounce" || t.type === "shadow") state.tasks.pronounce = true;
    if (t.type === "shadow") state.tasks.shadow = true;
    if (t.module === "knowledge" || t.type === "knowledge") state.tasks.input = true;
    if (t.module === "chat" || t.type === "chat" || t.type === "output") state.tasks.output = true;
    if (t.module === "vocab" || t.type === "vocab") state.tasks.input = true;
    const newBadges = evaluateBadges(state);
    return { state, xpGain: result.add, leveled: result.leveled, task: t, streakBumped, newBadges };
  }

  function completeTaskByModule(state, module) {
    const open = (state.gameTasks || []).find((t) => !t.done && (t.module === module || t.type === module));
    if (!open) {
      bumpStreakOnActivity(state);
      return { state, xpGain: 0, leveled: false, task: null, streakBumped: false, newBadges: [] };
    }
    return completeGameTask(state, open.id);
  }

  function evaluateBadges(state) {
    const owned = new Set((state.rewards || []).map((r) => r.id));
    const newly = [];
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
      if (b.check === "first_task" && (state.gameTasks || []).some((t) => t.done)) ok = true;
      if (b.taskType && (state.gameTasks || []).some((t) => t.done && (t.type === b.taskType || t.module === b.taskType)))
        ok = true;
      if (ok) {
        state.rewards = state.rewards || [];
        const entry = { id: b.id, name: b.name, emoji: b.emoji, earnedAt: new Date().toISOString() };
        state.rewards.push(entry);
        newly.push(entry);
      }
    });
    return newly;
  }

  function nextBadgeHint(state) {
    const owned = new Set((state.rewards || []).map((r) => r.id));
    for (const b of BADGE_CATALOG) {
      if (owned.has(b.id)) continue;
      return b;
    }
    return null;
  }

  // —— Quiz banks (each item unique; mix vocab / IPA / dialogue) ——
  const Q = (q, choices, answer, tip) => ({ q, choices, answer, tip });

  const QUIZ_BANK = {
    weekly: [
      Q("discuss 的中文意思是？", ["讨论", "争论吵架（仅此义）", "忽视", "翻译"], 0, "discuss = 讨论；不要说 discuss about。"),
      Q("paraphrase 更接近哪个意思？", ["抄写原文", "用自己的话改述", "大声朗读", "写摘要标题"], 1, "paraphrase = 改述 / 释义。"),
      Q("think 的词首辅音是？", ["/s/", "/θ/", "/t/", "/f/"], 1, "/θ/：舌尖轻触上下牙之间。"),
      Q("和外国人没听清时，可以说：", ["What?", "Could you repeat that?", "You what?", "Say again now!"], 1, "Could you repeat that? 更礼貌。"),
      Q("essay 在校园语境常指：", ["考试分数", "短文 / 课程论文", "字典", "口音"], 1, "essay = 短文；课程论文。"),
      Q("major 作名词时，英语专业可说：", ["I'm an English major.", "I major English only.", "My major is speak.", "I am majoring the English."], 0, "I'm an English major. / I major in English."),
      Q("deadline 的意思是？", ["开始时间", "截止日期", "讲座主题", "口音类型"], 1, "The deadline is Friday."),
      Q("/ð/ 出现在哪个词？", ["think", "this", "sink", "thick"], 1, "this /ðɪs/ 声带振动；think 是 /θ/。"),
      Q("In my opinion 的意思是？", ["顺便说", "在我看来", "我不同意", "请重复"], 1, "表达观点的常用语块。"),
      Q("fluent 的意思是？", ["流利的", "困难的", "安静的", "书面的"], 0, "be fluent in English。"),
    ],
    monthly: [
      Q("thesis 最贴切的释义是？", ["隐喻", "论点 / 学位论文", "截止日期", "研讨课"], 1, "thesis statement = 中心论点。"),
      Q("A cell is the _____ of life.", ["basic unit", "large model", "deadline", "accent"], 0, "basic unit of life = 生命的基本单位。"),
      Q("argue that… 在学术英语里常表示：", ["吵架", "主张 / 论证……", "放弃", "翻译"], 1, "academic argue ≠ 一定吵架。"),
      Q("presentation 课堂意思是？", ["礼物", "演示 / 汇报", "请假条", "宿舍"], 1, "give a presentation = 做汇报。"),
      Q("I'm not sure I follow. 意思接近：", ["我跟上了", "我好像没跟上", "我拒绝", "我同意"], 1, "听不懂时礼貌表达。"),
      Q("metaphor 的意思是？", ["隐喻", "标点", "口音", "作业"], 0, "This metaphor is vivid."),
      Q("context 最常用释义是？", ["语境；上下文", "食堂", "考试", "社团"], 0, "Read the word in context."),
      Q("That makes sense. 接近：", ["有道理；明白了", "我不懂", "再见", "加油"], 0, "表示理解对方的话。"),
      Q("analyze 的重音大致在？", ["第一音节 an-", "最后音节", "没有重音", "只在辅音"], 0, "/ˈænəlaɪz/ 重音在第一音节。"),
      Q("Could you explain that again? 用于：", ["请人再解释", "结束对话", "点餐", "请假"], 0, "礼貌请求解释。"),
      Q("evidence 的意思是？", ["证据；依据", "情绪", "标题", "口音"], 0, "Support your claim with evidence."),
      Q("By the way 的意思是？", ["顺便说一下", "换句话说", "总而言之", "对不起"], 0, "转换话题时常用。"),
    ],
    semi: [
      Q("summarize 的意思是？", ["总结", "翻译成诗", "提高音量", "忽略细节"], 0, "Summarize the main idea."),
      Q("seminar 校园语境指：", ["研讨课", "运动会", "食堂窗口", "宿舍楼"], 0, "Our seminar starts at nine."),
      Q("perspective 接近：", ["视角；看法", "标点符号", "打印机", "口音"], 0, "From another perspective…"),
      Q("assignment 的意思是？", ["作业；任务", "假期", "社团费", "考试座位"], 0, "I finished my assignment."),
      Q("What do you mean by…? 用来：", ["礼貌追问含义", "骂人", "告别", "点赞"], 0, "听不懂某个词时用。"),
      Q("literature 的意思是？", ["文学", "理科实验", "体育课", "食堂菜单"], 0, "modern literature = 现代文学。"),
      Q("appreciate 最贴切：", ["感激；欣赏", "批评", "推迟", "抄写"], 0, "I appreciate your help."),
      Q("theme（文学）常指：", ["主题", "页码", "字体", "座位号"], 0, "The theme of the story is hope."),
      Q("accent 可以指：", ["口音；重音", "论文提纲", "考试分数", "社团名"], 0, "Your accent is clear."),
      Q("I'd like to point out… 接近：", ["我想指出……", "我想离开……", "我想吃饭……", "我想睡觉……"], 0, "正式场合提出观点。"),
      Q("paraphrase 与抄袭的关系？", ["改述可避免照搬原文", "必须一字不差抄", "不能用于课堂", "等于翻译软件"], 0, "用自己的话改述。"),
      Q("/æ/ 更接近哪个词的元音？", ["analyze 的第一音节", "see 的元音", "food 的元音", "boot 的元音"], 0, "/æ/ 嘴张大，如 cat / analyze。"),
    ],
    yearly: [
      Q("culture 的意思是？", ["文化", "化学试剂", "计算器", "课间操"], 0, "Language and culture are linked."),
      Q("confident 的意思是？", ["自信的", "饥饿的", "迟到的", "安静的"], 0, "I feel more confident now."),
      Q("recommend 的意思是？", ["推荐", "拒绝", "删除", "打印"], 0, "Can you recommend a novel?"),
      Q("prefer A to B 表示：", ["比起 B 更喜欢 A", "只喜欢 B", "讨厌 A 和 B", "必须选 B"], 0, "I prefer reading to watching TV."),
      Q("conversation 的意思是？", ["对话；交谈", "作文格式", "考试大纲", "实验室"], 0, "I enjoyed our conversation."),
      Q("pronunciation 的意思是？", ["发音", "语法书", "作文纸", "耳机"], 0, "My pronunciation is improving."),
      Q("challenge（学习语境）可指：", ["挑战；难题", "奖状", "校服", "校车"], 0, "Speaking is my biggest challenge."),
      Q("experience 的意思是？", ["经历；体验", "说明书", "校徽", "闹钟"], 0, "It was a valuable experience."),
      Q("explain 的意思是？", ["解释", "考试", "报名", "请假"], 0, "Could you explain that again?"),
      Q("opinion 的意思是？", ["观点；看法", "食堂窗口", "体育器材", "宿舍钥匙"], 0, "What's your opinion on this?"),
      Q("How's it going? 是：", ["打招呼问近况", "问考试分数", "问路", "点餐"], 0, "Hey! How's it going?"),
      Q("Nice to meet you 用于：", ["初次见面问候", "下课铃响", "交作业", "退课"], 0, "很高兴认识你。"),
    ],
  };

  function shuffleCopy(arr) {
    const a = arr.map((x) => ({ ...x, choices: [...x.choices] }));
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function buildQuiz(kind) {
    if (kind === "weekly") return shuffleCopy(QUIZ_BANK.weekly).slice(0, 10);
    if (kind === "monthly") return shuffleCopy(QUIZ_BANK.monthly).slice(0, 10);
    if (kind === "semi") return shuffleCopy(QUIZ_BANK.semi).slice(0, 12);
    if (kind === "yearly") {
      const pool = [...QUIZ_BANK.yearly, ...QUIZ_BANK.semi, ...QUIZ_BANK.monthly];
      // unique by question text
      const seen = new Set();
      const unique = [];
      for (const item of shuffleCopy(pool)) {
        if (seen.has(item.q)) continue;
        seen.add(item.q);
        unique.push(item);
        if (unique.length >= 12) break;
      }
      return unique;
    }
    return shuffleCopy(QUIZ_BANK.weekly).slice(0, 8);
  }

  const CHALLENGE_META = {
    weekly: { label: "周测", emoji: "📅", xp: 50, passRatio: 0.6, countHint: "10 题" },
    monthly: { label: "月测", emoji: "🗓️", xp: 120, passRatio: 0.6, countHint: "10 题" },
    semi: { label: "半年测", emoji: "🏅", xp: 250, passRatio: 0.6, countHint: "12 题" },
    yearly: { label: "年测", emoji: "👑", xp: 500, passRatio: 0.6, countHint: "12 题" },
  };

  function gradeChallenge(kind, answers) {
    const quiz = buildQuiz.__last || null;
    // Use the items passed via answers length — caller must use same quizItems
    // gradeChallenge receives answers; quiz rebuilt would reshuffle. App keeps quizItems.
    // So grade with provided quiz via optional 3rd approach: answers paired with stored quiz in app.
    // Here we accept quizOverride via gradeChallenge(kind, answers, quizItems)
    return null;
  }

  function gradeQuizItems(kind, quizItems, answers) {
    let correct = 0;
    quizItems.forEach((item, i) => {
      if (Number(answers[i]) === item.answer) correct++;
    });
    const total = quizItems.length;
    const ratio = total ? correct / total : 0;
    const meta = CHALLENGE_META[kind];
    const passed = ratio >= meta.passRatio;
    return {
      correct,
      total,
      ratio,
      passed,
      xp: passed ? meta.xp : Math.round(meta.xp * ratio * 0.4),
      quiz: quizItems,
    };
  }

  // Keep backward-compatible wrapper used by older app: rebuild is unsafe due to shuffle.
  // New app should call gradeQuizItems. Provide gradeChallenge that uses a fixed non-shuffle path for grading only if needed.
  function gradeChallengeCompat(kind, answers, quizItems) {
    if (quizItems && quizItems.length) return gradeQuizItems(kind, quizItems, answers);
    // fallback: build once (may not match UI if shuffled differently — app must pass quizItems)
    const quiz = buildQuiz(kind);
    return gradeQuizItems(kind, quiz, answers);
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
    if (kind === "weekly") {
      const wk = weekKey();
      const t = (state.gameTasks || []).find((x) => x.id === `ee-weekly-${wk}`);
      if (t && !t.done) t.done = true;
    }
    const newBadges = evaluateBadges(state);
    return { state, newBadges };
  }

  function quizBankCounts() {
    return {
      weekly: QUIZ_BANK.weekly.length,
      monthly: QUIZ_BANK.monthly.length,
      semi: QUIZ_BANK.semi.length,
      yearly: QUIZ_BANK.yearly.length,
    };
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
    nextBadgeHint,
    buildQuiz,
    CHALLENGE_META,
    gradeChallenge: gradeChallengeCompat,
    gradeQuizItems,
    recordChallenge,
    fetchEeTasks,
    makeTask,
    quizBankCounts,
    QUIZ_BANK,
  };
})(window);
