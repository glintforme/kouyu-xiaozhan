/* 口语小站 · App logic · 英语专业向词汇 + 中文释义 */
(function () {
  "use strict";

  const STORAGE_KEY = "kouyu-xiaozhan-v2";

  const defaultState = {
    streak: 3,
    lastCheckInDate: null,
    tasks: {
      pronounce: false,
      shadow: false,
      input: false,
      output: false,
    },
    pathUnlocked: 1,
    wrongBook: [
      {
        id: "th",
        word: "think",
        ipa: "/θɪŋk/",
        zh: "想；认为",
        tip: "舌尖轻触上牙，气流从齿缝出，不要发成 /s/。",
        exampleEn: "I think this essay needs a clearer thesis.",
        exampleZh: "我认为这篇论文需要更清晰的论点。",
        due: 0,
      },
      {
        id: "discuss",
        word: "discuss",
        ipa: "/dɪˈskʌs/",
        zh: "讨论",
        tip: "重音在第二音节 -scuss；词尾 /s/ 清辅音。",
        exampleEn: "Let's discuss the main idea of this poem.",
        exampleZh: "我们来讨论一下这首诗的主旨。",
        due: 0,
      },
      {
        id: "paraphrase",
        word: "paraphrase",
        ipa: "/ˈpærəfreɪz/",
        zh: "释义；改述",
        tip: "para- 轻读，重音在第一音节；phrase 发 /freɪz/。",
        exampleEn: "Can you paraphrase this sentence in your own words?",
        exampleZh: "你能用自己的话改述这个句子吗？",
        due: 0,
      },
    ],
    reviewIndex: 0,
  };

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY) || localStorage.getItem("kouyu-xiaozhan-v1");
      if (!raw) return structuredClone(defaultState);
      const parsed = JSON.parse(raw);
      const base = structuredClone(defaultState);
      const wrongBook = Array.isArray(parsed.wrongBook)
        ? parsed.wrongBook.map((c) => ({
            zh: "",
            exampleEn: "",
            exampleZh: "",
            tip: "",
            ...c,
          }))
        : base.wrongBook;
      return {
        ...base,
        ...parsed,
        tasks: { ...base.tasks, ...(parsed.tasks || {}) },
        wrongBook,
      };
    } catch {
      return structuredClone(defaultState);
    }
  }

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  let state = loadState();

  function todayKey() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  function dayOfYear() {
    const now = new Date();
    const start = new Date(now.getFullYear(), 0, 0);
    return Math.floor((now - start) / 86400000);
  }

  function maybeResetDailyTasks() {
    const today = todayKey();
    if (state.lastCheckInDate && state.lastCheckInDate !== today) {
      state.tasks = { pronounce: false, shadow: false, input: false, output: false };
      saveState();
    }
  }

  maybeResetDailyTasks();

  // —— Routing ——
  const pages = ["home", "path", "pronounce", "chat", "knowledge", "review", "vocab"];

  function navigate(hash) {
    const id = (hash || "#home").replace("#", "") || "home";
    const pageId = pages.includes(id) ? id : "home";
    document.querySelectorAll(".page").forEach((el) => {
      el.classList.toggle("active", el.id === `page-${pageId}`);
    });
    document.querySelectorAll(".nav-btn").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.page === pageId);
    });
    if (pageId === "home") renderHome();
    if (pageId === "review") renderReview();
    if (pageId === "path") renderPath();
    if (pageId === "vocab") renderVocabPage();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  window.addEventListener("hashchange", () => navigate(location.hash));

  document.querySelectorAll("[data-go]").forEach((el) => {
    el.addEventListener("click", (e) => {
      e.preventDefault();
      location.hash = el.getAttribute("data-go");
    });
  });

  // —— Home / check-in ——
  function taskDoneCount() {
    return Object.values(state.tasks).filter(Boolean).length;
  }

  function markTask(key, done) {
    state.tasks[key] = done;
    const today = todayKey();
    if (done && taskDoneCount() > 0) {
      if (state.lastCheckInDate !== today) {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const yKey = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, "0")}-${String(yesterday.getDate()).padStart(2, "0")}`;
        if (state.lastCheckInDate === yKey) {
          state.streak = (state.streak || 0) + 1;
        } else if (!state.lastCheckInDate) {
          state.streak = Math.max(state.streak || 1, 1);
        } else {
          state.streak = 1;
        }
        state.lastCheckInDate = today;
      }
    }
    saveState();
    renderHome();
  }

  function renderHome() {
    const count = taskDoneCount();
    const pct = Math.round((count / 4) * 100);
    const bar = document.getElementById("progress-bar");
    const label = document.getElementById("progress-label");
    const streakEl = document.getElementById("streak-count");
    if (bar) bar.style.width = `${pct}%`;
    if (label) label.textContent = `今日进度 ${count}/4（${pct}%）`;
    if (streakEl) streakEl.textContent = String(state.streak || 0);

    Object.keys(state.tasks).forEach((key) => {
      const row = document.querySelector(`[data-task="${key}"]`);
      if (!row) return;
      const cb = row.querySelector('input[type="checkbox"]');
      cb.checked = !!state.tasks[key];
      row.classList.toggle("done", !!state.tasks[key]);
    });

    renderVocabHomePreview();
  }

  document.querySelectorAll("[data-task]").forEach((row) => {
    const key = row.dataset.task;
    const cb = row.querySelector('input[type="checkbox"]');
    cb.addEventListener("change", () => markTask(key, cb.checked));
  });

  // —— Learning path ——
  const phases = [
    {
      id: 1,
      title: "阶段一 · 发音地基",
      desc: "元音、辅音、重音节奏；每天 15–20 分钟跟读。重点：/θ/ /ð/ /æ/ /r/ 等难音。",
      resources: [
        { name: "BBC Learning English · Pronunciation（发音）", url: "https://www.bbc.co.uk/learningenglish/english/features/pronunciation", tag: "免费" },
        { name: "Rachel's English（美音）", url: "https://rachelsenglish.com/", tag: "免费" },
        { name: "YouGlish 查真实发音", url: "https://youglish.com/", tag: "免费" },
      ],
    },
    {
      id: 2,
      title: "阶段二 · 跟读与影子跟读",
      desc: "短句跟读 → 影子跟读（shadowing），建立语感与流利度。",
      resources: [
        { name: "VOA Learning English（慢速英语）", url: "https://learningenglish.voanews.com/", tag: "免费" },
        { name: "ELLLO 分级听力", url: "https://www.elllo.org/", tag: "免费" },
        { name: "VOA Special English 广播", url: "https://learningenglish.voanews.com/z/1689", tag: "免费" },
      ],
    },
    {
      id: 3,
      title: "阶段三 · 开口输出",
      desc: "日记口述、角色扮演、课堂 presentation（演示汇报）一分钟演讲。",
      resources: [
        { name: "Cambridge Write & Improve（写作辅助）", url: "https://writeandimprove.com/", tag: "免费" },
        { name: "italki 话题灵感（可先自练）", url: "https://www.italki.com/en/classroom", tag: "参考" },
      ],
    },
    {
      id: 4,
      title: "阶段四 · 地道与思维",
      desc: "习语、语块、文学/文化讨论（literature · culture），知识英语。",
      resources: [
        { name: "Oxford Learner's Dictionaries（牛津学习词典）", url: "https://www.oxfordlearnersdictionaries.com/", tag: "免费" },
        { name: "Crash Course（英文字幕公开课）", url: "https://thecrashcourse.com/", tag: "免费" },
      ],
    },
  ];

  function renderPath() {
    const root = document.getElementById("phase-grid");
    if (!root) return;
    root.innerHTML = phases
      .map((p) => {
        const unlocked = p.id <= (state.pathUnlocked || 1);
        return `
        <article class="phase ${unlocked ? "unlocked" : "locked"}">
          <span class="phase-badge">${unlocked ? "✓ 已解锁" : "🔒 未解锁"} · 阶段 ${p.id}</span>
          <h3>${p.title}</h3>
          <p>${p.desc}</p>
          ${
            unlocked
              ? `<ul class="resource-list">${p.resources
                  .map(
                    (r) =>
                      `<li><a href="${r.url}" target="_blank" rel="noopener noreferrer">${r.name}<span>${r.tag} ↗</span></a></li>`
                  )
                  .join("")}</ul>`
              : `<p class="hint">完成更多每日打卡后解锁（原型中可点下方按钮提前解锁）。</p>`
          }
          ${!unlocked ? `<div class="lock-overlay" aria-hidden="true">🔒</div>` : ""}
        </article>`;
      })
      .join("");
  }

  document.getElementById("unlock-next")?.addEventListener("click", () => {
    state.pathUnlocked = Math.min(4, (state.pathUnlocked || 1) + 1);
    saveState();
    renderPath();
  });

  // —— Pronunciation（含中文释义 · 日常+专业） ——
  const pronounceItems = [
    {
      id: "th",
      type: "sound",
      label: "/θ/ think",
      word: "think",
      ipa: "/θɪŋk/",
      zh: "想；认为",
      tip: "舌尖轻轻放在上下牙之间，吹气，声带不振动。对比：sink /sɪŋk/（沉没）。",
      sentence: "I think this is a strong argument.",
      sentenceZh: "我认为这是一个有力的论点。",
    },
    {
      id: "dh",
      type: "sound",
      label: "/ð/ this",
      word: "this",
      ipa: "/ðɪs/",
      zh: "这个",
      tip: "同 /θ/ 口型，但声带振动。the /ðə/、that /ðæt/ 同理。",
      sentence: "This theme appears throughout the novel.",
      sentenceZh: "这个主题贯穿整部小说。",
    },
    {
      id: "ae",
      type: "sound",
      label: "/æ/ analyze",
      word: "analyze",
      ipa: "/ˈænəlaɪz/",
      zh: "分析",
      tip: "第一音节 /æ/ 嘴张大、舌放低；重音在 an-。英式亦可 analyse /ˈænəlaɪz/。",
      sentence: "Please analyze the writer's tone.",
      sentenceZh: "请分析作者的语气。",
    },
    {
      id: "r",
      type: "sound",
      label: "/r/ really",
      word: "really",
      ipa: "/ˈrɪəli/",
      zh: "真正地；非常",
      tip: "美式 /r/ 舌身后缩，不要卷成中文「瑞」。口语里常弱读。",
      sentence: "I really enjoyed that presentation.",
      sentenceZh: "我真的很喜欢那场演示汇报。",
    },
    {
      id: "discuss",
      type: "word",
      label: "discuss 讨论",
      word: "discuss",
      ipa: "/dɪˈskʌs/",
      zh: "讨论",
      tip: "重音在第二音节；不要说成 discuss about（多余 about）。",
      sentence: "Shall we discuss the cultural context?",
      sentenceZh: "我们要不要讨论一下文化语境？",
    },
    {
      id: "argue",
      type: "word",
      label: "argue 论证",
      word: "argue",
      ipa: "/ˈɑːrɡjuː/",
      zh: "争论；论证",
      tip: "academic 语境常指「提出论据」，不一定是吵架。argue that… = 主张……",
      sentence: "The author argues that language shapes culture.",
      sentenceZh: "作者主张：语言塑造文化。",
    },
    {
      id: "paraphrase",
      type: "word",
      label: "paraphrase 改述",
      word: "paraphrase",
      ipa: "/ˈpærəfreɪz/",
      zh: "释义；改述",
      tip: "英语专业高频：用自己的话重述，避免抄袭。重音在第一音节。",
      sentence: "Try to paraphrase the quote in simpler English.",
      sentenceZh: "试着用更简单的英语改述这句引文。",
    },
    {
      id: "essay",
      type: "word",
      label: "essay 论文",
      word: "essay",
      ipa: "/ˈeseɪ/",
      zh: "短文；论文",
      tip: "重音在第一音节。campus：write an essay（写一篇论文）。",
      sentence: "My essay is about modern literature.",
      sentenceZh: "我的论文是关于现代文学的。",
    },
    {
      id: "presentation",
      type: "word",
      label: "presentation 汇报",
      word: "presentation",
      ipa: "/ˌpreznˈteɪʃn/",
      zh: "演示；汇报",
      tip: "重音在 -ta-；课堂常说 give a presentation。",
      sentence: "I have a presentation on Shakespeare tomorrow.",
      sentenceZh: "我明天有一场关于莎士比亚的汇报。",
    },
    {
      id: "s1",
      type: "sentence",
      label: "寒暄 · Nice to meet you",
      word: "Nice to meet you",
      ipa: "/naɪs tə ˈmiːt ju/",
      zh: "很高兴认识你",
      tip: "to 弱读成 /tə/；meet you 可连读。正式场合也很常用。",
      sentence: "Nice to meet you. What are you majoring in?",
      sentenceZh: "很高兴认识你。你主修什么专业？",
    },
    {
      id: "s2",
      type: "sentence",
      label: "课堂 · Could you repeat…",
      word: "Could you repeat that?",
      ipa: "/kʊd ju rɪˈpiːt ðæt/",
      zh: "你能再说一遍吗？",
      tip: "Could you 比 Can you 稍客气；th 发 /ð/。和外国人交流救命句。",
      sentence: "Sorry—could you repeat that more slowly?",
      sentenceZh: "抱歉——你能再说慢一点吗？",
    },
    {
      id: "s3",
      type: "sentence",
      label: "观点 · In my opinion",
      word: "In my opinion",
      ipa: "/ɪn maɪ əˈpɪnjən/",
      zh: "在我看来",
      tip: "opinion 重音在 -pin-。书面/口语都适合表达观点。",
      sentence: "In my opinion, this metaphor is powerful.",
      sentenceZh: "在我看来，这个隐喻很有力量。",
    },
    {
      id: "s4",
      type: "sentence",
      label: "澄清 · What do you mean",
      word: "What do you mean by…?",
      ipa: "/wɒt də ju ˈmiːn baɪ/",
      zh: "你说……是什么意思？",
      tip: "do you 弱读；mean 清晰。听不懂外国人时礼貌追问。",
      sentence: "What do you mean by 'tone' in this text?",
      sentenceZh: "你说这篇文本里的 tone（语气）是什么意思？",
    },
  ];

  let currentPronounce = pronounceItems[0];
  let mediaRecorder = null;
  let recordedChunks = [];
  let recordedUrl = null;
  let isRecording = false;

  function renderPronounceChips() {
    const row = document.getElementById("pronounce-chips");
    if (!row) return;
    row.innerHTML = pronounceItems
      .map(
        (item) =>
          `<button type="button" class="chip ${item.id === currentPronounce.id ? "active" : ""}" data-pronounce="${item.id}">${item.label}</button>`
      )
      .join("");
    row.querySelectorAll("[data-pronounce]").forEach((btn) => {
      btn.addEventListener("click", () => {
        currentPronounce = pronounceItems.find((x) => x.id === btn.dataset.pronounce);
        updatePronouncePanel();
        renderPronounceChips();
      });
    });
  }

  function updatePronouncePanel() {
    document.getElementById("p-word").textContent = currentPronounce.word;
    document.getElementById("p-ipa").textContent = currentPronounce.ipa;
    const zhEl = document.getElementById("p-zh");
    if (zhEl) zhEl.textContent = currentPronounce.zh ? `中文意思：${currentPronounce.zh}` : "";
    document.getElementById("p-tip").textContent = currentPronounce.tip;
    document.getElementById("p-sentence").textContent = currentPronounce.sentence;
    const sz = document.getElementById("p-sentence-zh");
    if (sz) sz.textContent = currentPronounce.sentenceZh || "";
    document.getElementById("pronounce-status").textContent = "选择条目后，可听提示、录音并对比。";
    document.getElementById("mock-score").textContent = "—";
    if (recordedUrl) {
      URL.revokeObjectURL(recordedUrl);
      recordedUrl = null;
    }
  }

  function speakText(text) {
    if (!window.speechSynthesis) {
      document.getElementById("pronounce-status").textContent = "当前浏览器不支持语音合成，请自行朗读对照。";
      return;
    }
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "en-US";
    u.rate = 0.9;
    window.speechSynthesis.speak(u);
    const status = document.getElementById("pronounce-status");
    if (status) status.textContent = "正在播放原音提示…";
  }

  document.getElementById("btn-play-original")?.addEventListener("click", () => {
    speakText(currentPronounce.sentence || currentPronounce.word);
    markTask("shadow", true);
  });

  async function startRecording() {
    const status = document.getElementById("pronounce-status");
    const btn = document.getElementById("btn-record");
    recordedChunks = [];

    if (!navigator.mediaDevices?.getUserMedia) {
      isRecording = true;
      btn.classList.add("recording");
      btn.textContent = "⏹ 停止（模拟）";
      status.textContent = "模拟录音中…再点一次结束（本环境无麦克风权限时使用）。";
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorder = new MediaRecorder(stream);
      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) recordedChunks.push(e.data);
      };
      mediaRecorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(recordedChunks, { type: "audio/webm" });
        if (recordedUrl) URL.revokeObjectURL(recordedUrl);
        recordedUrl = URL.createObjectURL(blob);
        status.textContent = "录音完成！可以点「播放我的录音」对比。";
        const score = 72 + Math.floor(Math.random() * 24);
        document.getElementById("mock-score").textContent = `${score}`;
        markTask("pronounce", true);
      };
      mediaRecorder.start();
      isRecording = true;
      btn.classList.add("recording");
      btn.textContent = "⏹ 停止录音";
      status.textContent = "录音中…大声清晰地读出来。";
    } catch (err) {
      isRecording = true;
      btn.classList.add("recording");
      btn.textContent = "⏹ 停止（模拟）";
      status.textContent = "无法使用麦克风，已切换模拟录音。再点一次结束。";
    }
  }

  function stopRecording() {
    const btn = document.getElementById("btn-record");
    const status = document.getElementById("pronounce-status");
    isRecording = false;
    btn.classList.remove("recording");
    btn.textContent = "🎤 开始录音";

    if (mediaRecorder && mediaRecorder.state !== "inactive") {
      mediaRecorder.stop();
      mediaRecorder = null;
      return;
    }
    status.textContent = "模拟录音完成！（真实环境将保存你的音频）评分仅供演示。";
    document.getElementById("mock-score").textContent = String(78 + Math.floor(Math.random() * 18));
    markTask("pronounce", true);
  }

  document.getElementById("btn-record")?.addEventListener("click", () => {
    if (isRecording) stopRecording();
    else startRecording();
  });

  document.getElementById("btn-play-mine")?.addEventListener("click", () => {
    const status = document.getElementById("pronounce-status");
    if (recordedUrl) {
      const audio = new Audio(recordedUrl);
      audio.play();
      status.textContent = "正在播放你的录音…";
    } else {
      status.textContent = "还没有录音。请先点「开始录音」。（模拟模式下停止后也可看分数）";
    }
  });

  document.getElementById("btn-add-wrong")?.addEventListener("click", () => {
    const exists = state.wrongBook.some((c) => c.word === currentPronounce.word);
    if (!exists) {
      state.wrongBook.push({
        id: currentPronounce.id + "-" + Date.now(),
        word: currentPronounce.word,
        ipa: currentPronounce.ipa,
        zh: currentPronounce.zh || "",
        tip: currentPronounce.tip,
        exampleEn: currentPronounce.sentence || "",
        exampleZh: currentPronounce.sentenceZh || "",
        due: 0,
      });
      saveState();
    }
    document.getElementById("pronounce-status").textContent = exists
      ? "错音本里已有这个词啦。"
      : "已加入错音本，可去「复习」里练。";
  });

  // —— Chat (canned coach · 双语+词汇释义) ——
  const cannedReplies = [
    {
      test: /hello|hi|hey|你好/i,
      reply:
        "教练 ee：Hi! Great to see you. 很高兴见到你～\n试着完整说：\n\"Hi! I'm practicing English today.\"\n（嗨！我今天在练习英语。）\n\n📌 关键词\n• practice /ˈpræktɪs/ — 练习\n• today /təˈdeɪ/ — 今天\n你也可以告诉我今天想练什么～",
    },
    {
      test: /how are you|how's it going/i,
      reply:
        "教练 ee：Nice question! 好问题！\n更自然的回答：\n\"I'm good, thanks! A bit tired but excited to practice.\"\n（我挺好的，谢谢！有点累，但很想练习。）\n\n📌 关键词\n• excited /ɪkˈsaɪtɪd/ — 兴奋的；期待的\n• a bit — 有一点（口语）\nI'm good 比 I'm fine 更口语。你再回我一句吧！",
    },
    {
      test: /i go to school yesterday|昨天.*图书馆|went to/i,
      reply:
        "教练 ee：意思我懂！时态小修正：\n❌ I go to school yesterday\n✅ I went to school yesterday.\n（我昨天去学校了。）\n因为有 yesterday（昨天），要用过去式 went。\n\n📌 关键词\n• went /went/ — go 的过去式：去\n• yesterday /ˈjestərdeɪ/ — 昨天\n再试一次？",
    },
    {
      test: /think|θ|纠音|发音/i,
      reply:
        "教练 ee：练 /θ/ 很棒！\nTip: tongue between teeth, blow air — think /θɪŋk/（想；认为）。\n跟我读：\"I think this Thursday is free.\"\n（我觉得这个星期四有空。）\n\n📌 关键词\n• think /θɪŋk/ — 想；认为\n• Thursday /ˈθɜːrzdeɪ/ — 星期四（也有 /θ/）\n读完打字告诉我感觉如何～",
    },
    {
      test: /discuss|argue|essay|presentation|paraphrase|文学|论文|汇报|改述/i,
      reply:
        "教练 ee：英语专业高频词练起来！\n\n📌 校园 / 学术词\n• discuss /dɪˈskʌs/ — 讨论（不要 discuss about）\n• argue /ˈɑːrɡjuː/ — 论证；主张（argue that…）\n• paraphrase /ˈpærəfreɪz/ — 改述；释义\n• essay /ˈeseɪ/ — 短文；论文\n• presentation /ˌpreznˈteɪʃn/ — 演示；汇报\n\n试着写一句：\"I'd like to discuss…\"（我想讨论……）发给我改！",
    },
    {
      test: /cell|细胞|llm|大模型|python|文学|literature|culture|历史/i,
      reply:
        "教练 ee：知识+英语模式开启！\n用简单英语说：\n\"A cell is the basic unit of life.\"（细胞是生命的基本单位。）\n或 \"Literature helps us understand culture.\"（文学帮助我们理解文化。）\n\n📌 关键词\n• basic unit — 基本单位\n• literature /ˈlɪtrətʃər/ — 文学\n• culture /ˈkʌltʃər/ — 文化\n你选一个主题，用英文写 1–2 句给我批改。",
    },
    {
      test: /foreigner|外国人|交流|conversation|流利|fluent/i,
      reply:
        "教练 ee：和外国人聊天救命句 💬\n\n📌 实用语块\n• Nice to meet you. — 很高兴认识你\n• Could you repeat that? — 你能再说一遍吗？\n• What do you mean by…? — 你说……是什么意思？\n• In my opinion… — 在我看来……\n• I'm not sure I follow. — 我好像没跟上（礼貌说听不懂）\n\n选一句练发音，或自己造句发给我！",
    },
    {
      test: /help|帮助|不会|怎么说/i,
      reply:
        "教练 ee：没问题！你可以：\n1) 用中文说意思，我帮你译成自然英文\n2) 直接写英文，我帮你改得更地道\n\n📌 提问句式\n• How do you say … in English? — ……用英语怎么说？\n• Is it natural to say …? — 说……自然吗？\n现在把你想说的发给我吧 💪",
    },
  ];

  const defaultCoachReply =
    "教练 ee：收到！（原型阶段我用预设回复）\n建议你把句子写完整。例如：\n\"Yesterday I went to the library and read for two hours.\"\n（昨天我去图书馆读了两个小时。）\n\n📌 关键词\n• library /ˈlaɪbreri/ — 图书馆\n• yesterday /ˈjestərdeɪ/ — 昨天\n小提示：多用 I + 动词过去式 讲昨天的事。继续发一句，我帮你改！";

  function appendBubble(who, text) {
    const log = document.getElementById("chat-log");
    const div = document.createElement("div");
    div.className = `bubble ${who}`;
    div.innerHTML = `<div class="who">${who === "bot" ? "教练 ee" : "我"}</div>${escapeHtml(text)}`;
    log.appendChild(div);
    log.scrollTop = log.scrollHeight;
  }

  function escapeHtml(s) {
    return s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\n/g, "<br>");
  }

  function coachReply(userText) {
    for (const item of cannedReplies) {
      if (item.test.test(userText)) return item.reply;
    }
    return defaultCoachReply;
  }

  function sendChat(text) {
    const trimmed = (text || "").trim();
    if (!trimmed) return;
    appendBubble("user", trimmed);
    markTask("output", true);
    setTimeout(() => {
      appendBubble("bot", coachReply(trimmed));
    }, 400);
  }

  document.getElementById("chat-form")?.addEventListener("submit", (e) => {
    e.preventDefault();
    const input = document.getElementById("chat-input");
    sendChat(input.value);
    input.value = "";
    input.focus();
  });

  document.querySelectorAll("[data-quick]").forEach((btn) => {
    btn.addEventListener("click", () => sendChat(btn.dataset.quick));
  });

  // —— Knowledge lessons（关键词带中文） ——
  const lessons = {
    cell: {
      title: "What is a cell?（细胞是什么？）",
      step1:
        "A cell is the basic unit of life. All living things are made of cells. Some tiny living things have only one cell. Plants and animals have many cells.",
      step1Zh: "细胞是生命的基本单位。所有生物都由细胞构成。有些微小生物只有一个细胞。植物和动物有许多细胞。",
      phrases: [
        { en: "basic unit of life", zh: "生命的基本单位" },
        { en: "living things", zh: "生物；有生命的事物" },
        { en: "made of cells", zh: "由细胞构成" },
        { en: "plants and animals", zh: "植物和动物" },
      ],
      retell: "用英语复述：细胞是什么？尽量用上 basic unit（基本单位）/ living things（生物）。",
    },
    llm: {
      title: "What is an LLM?（大模型是什么？）",
      step1:
        "An LLM is a Large Language Model. It is a kind of AI. It reads lots of text and learns patterns. Then it can write sentences, answer questions, and help you practice English.",
      step1Zh: "LLM 是大型语言模型。它是一种人工智能。它阅读大量文本并学习模式。然后它可以写句子、回答问题，并帮你练习英语。",
      phrases: [
        { en: "large language model", zh: "大型语言模型" },
        { en: "kind of AI", zh: "一种人工智能" },
        { en: "learn patterns", zh: "学习模式/规律" },
        { en: "answer questions", zh: "回答问题" },
      ],
      retell: "用英语复述：大模型是什么？可以说 It is an AI that...（它是一种……的人工智能）",
    },
    python: {
      title: "Hello, Python!（你好，Python！）",
      step1:
        "Python is a popular programming language. It is friendly for beginners. You can write print(\"Hello\") to show a message. People use Python for websites, data, and AI.",
      step1Zh: "Python 是一种流行的编程语言。它对初学者很友好。你可以写 print(\"Hello\") 来显示一条消息。人们用 Python 做网站、数据和人工智能。",
      phrases: [
        { en: "programming language", zh: "编程语言" },
        { en: "friendly for beginners", zh: "对初学者友好" },
        { en: "print a message", zh: "打印/显示一条消息" },
        { en: "used for AI", zh: "用于人工智能" },
      ],
      retell: "用英语复述：Python 是什么？为什么适合初学者（beginners）？",
    },
    literature: {
      title: "What is literature?（文学是什么？）",
      step1:
        "Literature means written works with artistic value — poems, novels, and plays. When we study literature, we discuss themes, characters, and the writer's style. It also helps us understand culture and history.",
      step1Zh: "文学指具有艺术价值的书面作品——诗歌、小说和戏剧。学习文学时，我们讨论主题、人物和作者风格。它也帮助我们理解文化与历史。",
      phrases: [
        { en: "artistic value", zh: "艺术价值" },
        { en: "discuss themes", zh: "讨论主题" },
        { en: "writer's style", zh: "作者的风格" },
        { en: "understand culture", zh: "理解文化" },
      ],
      retell: "用英语复述：文学是什么？可提到 poems（诗歌）/ novels（小说）/ themes（主题）。",
    },
  };

  let currentLesson = "cell";

  function renderLesson() {
    const L = lessons[currentLesson];
    document.getElementById("lesson-title").textContent = L.title;
    const enEl = document.getElementById("lesson-en");
    enEl.innerHTML = `${escapeHtml(L.step1)}<span class="lesson-zh-block">${escapeHtml(L.step1Zh || "")}</span>`;
    document.getElementById("lesson-phrases").innerHTML = L.phrases
      .map((p) => {
        if (typeof p === "string") return `<span class="phrase-chip">${escapeHtml(p)}</span>`;
        return `<span class="phrase-chip"><strong>${escapeHtml(p.en)}</strong><em>${escapeHtml(p.zh)}</em></span>`;
      })
      .join("");
    document.getElementById("lesson-retell-prompt").textContent = L.retell;
    document.querySelectorAll(".lesson-tab").forEach((t) => {
      t.classList.toggle("active", t.dataset.lesson === currentLesson);
    });
  }

  document.querySelectorAll(".lesson-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      currentLesson = tab.dataset.lesson;
      renderLesson();
    });
  });

  document.getElementById("btn-shadow-phrases")?.addEventListener("click", () => {
    const L = lessons[currentLesson];
    const text = L.phrases.map((p) => (typeof p === "string" ? p : p.en)).join(". ");
    speakText(text);
    markTask("shadow", true);
  });

  document.getElementById("btn-save-retell")?.addEventListener("click", () => {
    const text = document.getElementById("retell-text").value.trim();
    const status = document.getElementById("retell-status");
    if (!text) {
      status.textContent = "先写一两句英文再保存哦。";
      return;
    }
    markTask("input", true);
    markTask("output", true);
    status.textContent = "已保存到本地（原型）。你可以复制到「对话练习」让教练帮你改！";
  });

  // —— 词汇本 / 今日单词 ——
  const vocabThemes = [
    {
      id: "campus-talk",
      title: "校园交流 · Campus Talk",
      tag: "日常+专业",
      words: [
        { word: "major", ipa: "/ˈmeɪdʒər/", zh: "专业；主修", exampleEn: "I'm an English major.", exampleZh: "我是英语专业的。" },
        { word: "discuss", ipa: "/dɪˈskʌs/", zh: "讨论", exampleEn: "Let's discuss this chapter.", exampleZh: "我们来讨论这一章。" },
        { word: "presentation", ipa: "/ˌpreznˈteɪʃn/", zh: "演示；汇报", exampleEn: "I gave a presentation today.", exampleZh: "我今天做了一场汇报。" },
        { word: "deadline", ipa: "/ˈdedlaɪn/", zh: "截止日期", exampleEn: "The essay deadline is Friday.", exampleZh: "论文截止日期是周五。" },
        { word: "seminar", ipa: "/ˈsemɪnɑːr/", zh: "研讨课", exampleEn: "Our seminar starts at nine.", exampleZh: "我们的研讨课九点开始。" },
        { word: "assignment", ipa: "/əˈsaɪnmənt/", zh: "作业；任务", exampleEn: "I finished my assignment.", exampleZh: "我写完作业了。" },
        { word: "literature", ipa: "/ˈlɪtrətʃər/", zh: "文学", exampleEn: "I love modern literature.", exampleZh: "我喜欢现代文学。" },
        { word: "culture", ipa: "/ˈkʌltʃər/", zh: "文化", exampleEn: "Language and culture are linked.", exampleZh: "语言与文化是相连的。" },
        { word: "fluent", ipa: "/ˈfluːənt/", zh: "流利的", exampleEn: "I want to be fluent in English.", exampleZh: "我想英语说得流利。" },
        { word: "In my opinion", ipa: "/ɪn maɪ əˈpɪnjən/", zh: "在我看来", exampleEn: "In my opinion, this poem is moving.", exampleZh: "在我看来，这首诗很动人。" },
      ],
    },
    {
      id: "academic",
      title: "学术表达 · Academic English",
      tag: "专业核心",
      words: [
        { word: "argue", ipa: "/ˈɑːrɡjuː/", zh: "论证；主张", exampleEn: "She argues that context matters.", exampleZh: "她主张语境很重要。" },
        { word: "paraphrase", ipa: "/ˈpærəfreɪz/", zh: "改述；释义", exampleEn: "Please paraphrase this line.", exampleZh: "请改述这一行。" },
        { word: "summarize", ipa: "/ˈsʌməraɪz/", zh: "总结", exampleEn: "Summarize the main idea.", exampleZh: "总结一下主旨。" },
        { word: "analyze", ipa: "/ˈænəlaɪz/", zh: "分析", exampleEn: "Analyze the character's choice.", exampleZh: "分析这个人物的选择。" },
        { word: "thesis", ipa: "/ˈθiːsɪs/", zh: "论点；论文", exampleEn: "What is your thesis statement?", exampleZh: "你的中心论点是什么？" },
        { word: "evidence", ipa: "/ˈevɪdəns/", zh: "证据；依据", exampleEn: "Support your claim with evidence.", exampleZh: "用证据支撑你的观点。" },
        { word: "metaphor", ipa: "/ˈmetəfɔːr/", zh: "隐喻", exampleEn: "This metaphor is vivid.", exampleZh: "这个隐喻很生动。" },
        { word: "context", ipa: "/ˈkɑːntekst/", zh: "语境；上下文", exampleEn: "Read the word in context.", exampleZh: "在语境中理解这个词。" },
        { word: "perspective", ipa: "/pərˈspektɪv/", zh: "视角；看法", exampleEn: "From another perspective…", exampleZh: "从另一个视角来看……" },
        { word: "essay", ipa: "/ˈeseɪ/", zh: "短文；论文", exampleEn: "I'm writing an essay on tone.", exampleZh: "我在写一篇关于语气的论文。" },
      ],
    },
    {
      id: "conversation",
      title: "对外交流 · Real Conversation",
      tag: "流利对话",
      words: [
        { word: "Nice to meet you", ipa: "/naɪs tə ˈmiːt ju/", zh: "很高兴认识你", exampleEn: "Nice to meet you!", exampleZh: "很高兴认识你！" },
        { word: "How's it going?", ipa: "/haʊz ɪt ˈɡoʊɪŋ/", zh: "最近怎么样？", exampleEn: "Hey! How's it going?", exampleZh: "嘿！最近怎么样？" },
        { word: "Could you repeat that?", ipa: "/kʊd ju rɪˈpiːt ðæt/", zh: "你能再说一遍吗？", exampleEn: "Sorry, could you repeat that?", exampleZh: "抱歉，你能再说一遍吗？" },
        { word: "What do you mean by…?", ipa: "/wɒt də ju ˈmiːn baɪ/", zh: "你说……是什么意思？", exampleEn: "What do you mean by 'casual'?", exampleZh: "你说 casual（随意）是什么意思？" },
        { word: "I'm not sure I follow", ipa: "/aɪm nɒt ʃʊr aɪ ˈfɒloʊ/", zh: "我好像没跟上", exampleEn: "I'm not sure I follow. Could you explain?", exampleZh: "我好像没跟上。你能解释一下吗？" },
        { word: "That makes sense", ipa: "/ðæt meɪks sens/", zh: "有道理；明白了", exampleEn: "Oh, that makes sense.", exampleZh: "哦，明白了。" },
        { word: "By the way", ipa: "/baɪ ðə weɪ/", zh: "顺便说一下", exampleEn: "By the way, are you free later?", exampleZh: "顺便问下，你等会儿有空吗？" },
        { word: "I'd like to point out", ipa: "/aɪd laɪk tə pɔɪnt aʊt/", zh: "我想指出", exampleEn: "I'd like to point out one detail.", exampleZh: "我想指出一个细节。" },
        { word: "conversation", ipa: "/ˌkɑːnvərˈseɪʃn/", zh: "对话；交谈", exampleEn: "I enjoyed our conversation.", exampleZh: "我很享受我们的交谈。" },
        { word: "pronunciation", ipa: "/prəˌnʌnsiˈeɪʃn/", zh: "发音", exampleEn: "My pronunciation is improving.", exampleZh: "我的发音在进步。" },
      ],
    },
    {
      id: "daily-plus",
      title: "日常加深 · Daily + Depth",
      tag: "生活+表达",
      words: [
        { word: "prefer", ipa: "/prɪˈfɜːr/", zh: "更喜欢", exampleEn: "I prefer reading to watching TV.", exampleZh: "比起看电视，我更喜欢阅读。" },
        { word: "recommend", ipa: "/ˌrekəˈmend/", zh: "推荐", exampleEn: "Can you recommend a novel?", exampleZh: "你能推荐一本小说吗？" },
        { word: "experience", ipa: "/ɪkˈspɪriəns/", zh: "经历；体验", exampleEn: "It was a valuable experience.", exampleZh: "那是一次宝贵的经历。" },
        { word: "challenge", ipa: "/ˈtʃælɪndʒ/", zh: "挑战", exampleEn: "Speaking is my biggest challenge.", exampleZh: "口语是我最大的挑战。" },
        { word: "confident", ipa: "/ˈkɑːnfɪdənt/", zh: "自信的", exampleEn: "I feel more confident now.", exampleZh: "我现在更自信了。" },
        { word: "opinion", ipa: "/əˈpɪnjən/", zh: "观点；看法", exampleEn: "What's your opinion on this?", exampleZh: "你对此有什么看法？" },
        { word: "explain", ipa: "/ɪkˈspleɪn/", zh: "解释", exampleEn: "Could you explain that again?", exampleZh: "你能再解释一遍吗？" },
        { word: "appreciate", ipa: "/əˈpriːʃieɪt/", zh: "感激；欣赏", exampleEn: "I appreciate your help.", exampleZh: "感谢你的帮助。" },
        { word: "theme", ipa: "/θiːm/", zh: "主题", exampleEn: "The theme of the story is hope.", exampleZh: "这个故事的主题是希望。" },
        { word: "accent", ipa: "/ˈæksent/", zh: "口音；重音", exampleEn: "Your accent is clear.", exampleZh: "你的口音很清晰。" },
      ],
    },
  ];

  function getTodayTheme() {
    return vocabThemes[dayOfYear() % vocabThemes.length];
  }

  function vocabCardHtml(item, opts) {
    const speak = opts && opts.speak ? "true" : "false";
    return `<article class="vocab-card" data-speak-word="${escapeAttr(item.word)}">
      <div class="vocab-head">
        <strong class="vocab-word">${escapeHtml(item.word)}</strong>
        <span class="vocab-ipa">${escapeHtml(item.ipa)}</span>
      </div>
      <div class="vocab-zh">中文意思：${escapeHtml(item.zh)}</div>
      <div class="vocab-ex">
        <div class="en">${escapeHtml(item.exampleEn)}</div>
        <div class="zh">${escapeHtml(item.exampleZh)}</div>
      </div>
      <button type="button" class="btn btn-ghost btn-sm vocab-speak" data-speak="${escapeAttr(item.word)}">🔊 听发音</button>
    </article>`;
  }

  function escapeAttr(s) {
    return String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
  }

  function bindVocabSpeak(root) {
    root.querySelectorAll("[data-speak]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        speakText(btn.getAttribute("data-speak"));
      });
    });
  }

  function renderVocabHomePreview() {
    const root = document.getElementById("vocab-home-list");
    const themeEl = document.getElementById("vocab-home-theme");
    if (!root) return;
    const theme = getTodayTheme();
    if (themeEl) themeEl.textContent = `${theme.title} · ${theme.tag}`;
    const preview = theme.words.slice(0, 4);
    root.innerHTML = preview.map((w) => vocabCardHtml(w)).join("");
    bindVocabSpeak(root);
  }

  function renderVocabPage() {
    const root = document.getElementById("vocab-full-list");
    const themeEl = document.getElementById("vocab-page-theme");
    const hint = document.getElementById("vocab-page-hint");
    if (!root) return;
    const theme = getTodayTheme();
    if (themeEl) themeEl.textContent = theme.title;
    if (hint) hint.textContent = `今日主题「${theme.tag}」· 共 ${theme.words.length} 条 · 适合英语专业口语与课堂表达（约 CEFR B1–B2，句子保持简短好开口）`;
    root.innerHTML = theme.words.map((w) => vocabCardHtml(w)).join("");
    bindVocabSpeak(root);

    const switcher = document.getElementById("vocab-theme-switch");
    if (switcher && !switcher.dataset.bound) {
      switcher.dataset.bound = "1";
      switcher.innerHTML = vocabThemes
        .map((t, i) => `<button type="button" class="chip" data-theme-idx="${i}">${t.tag}</button>`)
        .join("");
      switcher.querySelectorAll("[data-theme-idx]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const idx = Number(btn.dataset.themeIdx);
          const t = vocabThemes[idx];
          document.getElementById("vocab-page-theme").textContent = t.title;
          document.getElementById("vocab-page-hint").textContent = `主题「${t.tag}」· 共 ${t.words.length} 条（手动切换预览；首页「今日」按日期轮换）`;
          root.innerHTML = t.words.map((w) => vocabCardHtml(w)).join("");
          bindVocabSpeak(root);
          switcher.querySelectorAll(".chip").forEach((c) => c.classList.toggle("active", c === btn));
        });
      });
    }
  }

  document.getElementById("btn-add-today-vocab-review")?.addEventListener("click", () => {
    const theme = getTodayTheme();
    let added = 0;
    theme.words.forEach((w) => {
      if (state.wrongBook.some((c) => c.word === w.word)) return;
      state.wrongBook.push({
        id: "vocab-" + w.word + "-" + Date.now() + Math.random(),
        word: w.word,
        ipa: w.ipa,
        zh: w.zh,
        tip: `中文意思：${w.zh}`,
        exampleEn: w.exampleEn,
        exampleZh: w.exampleZh,
        due: 0,
      });
      added++;
    });
    saveState();
    const status = document.getElementById("vocab-add-status");
    if (status) status.textContent = added ? `已把 ${added} 个今日单词加入复习本。` : "这些词已经在复习本里啦。";
  });

  // —— Review / SRS ——
  function renderReview() {
    const card = document.getElementById("flashcard");
    const empty = document.getElementById("review-empty");
    const srs = document.getElementById("srs-row");
    if (!state.wrongBook.length) {
      card.style.display = "none";
      srs.style.display = "none";
      empty.style.display = "block";
      return;
    }
    empty.style.display = "none";
    card.style.display = "flex";
    srs.style.display = "grid";

    if (state.reviewIndex >= state.wrongBook.length) state.reviewIndex = 0;
    const item = state.wrongBook[state.reviewIndex];
    card.classList.remove("revealed");
    document.getElementById("fc-word").textContent = item.word;
    document.getElementById("fc-ipa").textContent = item.ipa;
    const zhEl = document.getElementById("fc-zh");
    if (zhEl) zhEl.textContent = item.zh ? `中文意思：${item.zh}` : "";
    const tipParts = [];
    if (item.tip) tipParts.push(item.tip);
    if (item.exampleEn) tipParts.push(`例句：${item.exampleEn}`);
    if (item.exampleZh) tipParts.push(`译文：${item.exampleZh}`);
    document.getElementById("fc-tip").textContent = tipParts.join("\n") || "（暂无提示）";
    document.getElementById("review-count").textContent = `${state.reviewIndex + 1} / ${state.wrongBook.length}`;
  }

  document.getElementById("flashcard")?.addEventListener("click", () => {
    document.getElementById("flashcard").classList.toggle("revealed");
  });

  function srsRate(level) {
    if (!state.wrongBook.length) return;
    const item = state.wrongBook[state.reviewIndex];
    if (level === "good") {
      item.due = (item.due || 0) + 1;
      if (item.due >= 2) {
        state.wrongBook.splice(state.reviewIndex, 1);
        if (state.reviewIndex >= state.wrongBook.length) state.reviewIndex = 0;
      } else {
        state.reviewIndex = (state.reviewIndex + 1) % Math.max(state.wrongBook.length, 1);
      }
    } else if (level === "hard") {
      state.reviewIndex = (state.reviewIndex + 1) % state.wrongBook.length;
    } else {
      const cur = state.wrongBook.splice(state.reviewIndex, 1)[0];
      state.wrongBook.push(cur);
      if (state.reviewIndex >= state.wrongBook.length) state.reviewIndex = 0;
    }
    saveState();
    renderReview();
  }

  document.getElementById("btn-again")?.addEventListener("click", () => srsRate("again"));
  document.getElementById("btn-hard")?.addEventListener("click", () => srsRate("hard"));
  document.getElementById("btn-good")?.addEventListener("click", () => srsRate("good"));

  // —— Init ——
  renderPronounceChips();
  updatePronouncePanel();
  renderLesson();
  navigate(location.hash || "#home");
})();
