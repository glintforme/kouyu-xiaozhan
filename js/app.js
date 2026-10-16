/* 口语小站 · App logic */
(function () {
  "use strict";

  const STORAGE_KEY = "kouyu-xiaozhan-v1";

  const defaultState = {
    streak: 3,
    lastCheckInDate: null,
    tasks: {
      pronounce: false,
      shadow: false,
      input: false,
      output: false,
    },
    pathUnlocked: 1, // phase 1 unlocked (1-based)
    wrongBook: [
      { id: "th", word: "think", ipa: "/θɪŋk/", tip: "舌尖轻触上牙，气流从齿缝出，不要发成 /s/。", due: 0 },
      { id: "r", word: "really", ipa: "/ˈrɪəli/", tip: "美式 /r/ 舌身后缩，不要卷成中文「瑞」。", due: 0 },
      { id: "v", word: "very", ipa: "/ˈveri/", tip: "上齿轻咬下唇，振动发 /v/，别发成 /w/。", due: 0 },
    ],
    reviewIndex: 0,
  };

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return structuredClone(defaultState);
      const parsed = JSON.parse(raw);
      const base = structuredClone(defaultState);
      return {
        ...base,
        ...parsed,
        tasks: { ...base.tasks, ...(parsed.tasks || {}) },
        wrongBook: Array.isArray(parsed.wrongBook) ? parsed.wrongBook : base.wrongBook,
      };
    } catch {
      return structuredClone(defaultState);
    }
  }

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  let state = loadState();

  // —— Date helpers (Asia/Shanghai local box time) ——
  function todayKey() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  function maybeResetDailyTasks() {
    const today = todayKey();
    if (state.lastCheckInDate && state.lastCheckInDate !== today) {
      // New day: reset task checkboxes; streak handled on first complete
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yKey = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, "0")}-${String(yesterday.getDate()).padStart(2, "0")}`;
      if (state.lastCheckInDate !== yKey && state.lastCheckInDate !== today) {
        // missed more than one day — soft reset streak display but keep history friendly
        // only reset if they had completed something previously and gap > 1
      }
      state.tasks = { pronounce: false, shadow: false, input: false, output: false };
      saveState();
    }
  }

  maybeResetDailyTasks();

  // —— Routing ——
  const pages = ["home", "path", "pronounce", "chat", "knowledge", "review"];

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
      desc: "元音、辅音、重音节奏；每天 15–20 分钟跟读。",
      resources: [
        { name: "BBC Learning English · Pronunciation", url: "https://www.bbc.co.uk/learningenglish/english/features/pronunciation", tag: "免费" },
        { name: "Rachel's English（美音）", url: "https://rachelsenglish.com/", tag: "免费" },
        { name: "YouGlish 查真实发音", url: "https://youglish.com/", tag: "免费" },
      ],
    },
    {
      id: 2,
      title: "阶段二 · 跟读与影子跟读",
      desc: "短句跟读 → 影子跟读，建立语感与流利度。",
      resources: [
        { name: "VOA Learning English", url: "https://learningenglish.voanews.com/", tag: "免费" },
        { name: "ELLLO 分级听力", url: "https://www.elllo.org/", tag: "免费" },
        { name: "Spotify / Podcasts 慢速英语", url: "https://learningenglish.voanews.com/z/1689", tag: "免费" },
      ],
    },
    {
      id: 3,
      title: "阶段三 · 开口输出",
      desc: "日记口述、角色扮演、主题一分钟演讲。",
      resources: [
        { name: "Cambridge Write & Improve（写作辅助）", url: "https://writeandimprove.com/", tag: "免费" },
        { name: "italki 话题灵感（可先自练）", url: "https://www.italki.com/en/classroom", tag: "参考" },
      ],
    },
    {
      id: 4,
      title: "阶段四 · 地道与思维",
      desc: "习语、语块、知识英语（历史/生物/AI/编程）。",
      resources: [
        { name: "Oxford Learner's Dictionaries", url: "https://www.oxfordlearnersdictionaries.com/", tag: "免费" },
        { name: "Crash Course（英文字幕）", url: "https://thecrashcourse.com/", tag: "免费" },
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

  // —— Pronunciation ——
  const pronounceItems = [
    { id: "th", type: "sound", label: "/θ/ think", word: "think", ipa: "/θɪŋk/", tip: "舌尖轻轻放在上下牙之间，吹气，声带不振动。对比：sink /sɪŋk/。", sentence: "I think this is the right thing." },
    { id: "ae", type: "sound", label: "/æ/ cat", word: "cat", ipa: "/kæt/", tip: "嘴张大、舌放低，类似「啊」但更靠前。不要发成 /e/。", sentence: "The black cat sat on the mat." },
    { id: "r", type: "sound", label: "/r/ red", word: "red", ipa: "/red/", tip: "舌尖上卷但不碰牙龈（美音），双唇略圆。", sentence: "Really red roses are rare." },
    { id: "s1", type: "sentence", label: "日常句 1", word: "How are you today?", ipa: "/haʊ ər ju təˈdeɪ/", tip: "注意 are you 连读成 /ər ju/，today 重音在第二音节。", sentence: "How are you today?" },
    { id: "s2", type: "sentence", label: "日常句 2", word: "Could you say that again?", ipa: "/kʊd ju seɪ ðæt əˈɡen/", tip: "Could you 弱读；th 发 /ð/；again 重音在 -gain。", sentence: "Could you say that again?" },
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
    document.getElementById("p-tip").textContent = currentPronounce.tip;
    document.getElementById("p-sentence").textContent = currentPronounce.sentence;
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
    document.getElementById("pronounce-status").textContent = "正在播放原音提示…";
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
      // Mock fallback
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
        // Mock score 72–95
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
    // Mock path
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
        tip: currentPronounce.tip,
        due: 0,
      });
      saveState();
    }
    document.getElementById("pronounce-status").textContent = exists
      ? "错音本里已有这个词啦。"
      : "已加入错音本，可去「复习」里练。";
  });

  // —— Chat (canned coach) ——
  const cannedReplies = [
    {
      test: /hello|hi|hey|你好/i,
      reply: "教练 ee：Hi! Great to see you. 试着完整说一句：\n\"Hi! I'm practicing English today.\"\n你也可以告诉我今天想练什么～",
    },
    {
      test: /how are you/i,
      reply: "教练 ee：Nice question! 更自然的回答可以是：\n\"I'm good, thanks! A bit tired but excited to practice.\"\n注意：I'm good 比 I'm fine 更口语。你再回我一句吧！",
    },
    {
      test: /i go to school yesterday|昨天/i,
      reply: "教练 ee：意思我懂！时态小修正：\n❌ I go to school yesterday\n✅ I went to school yesterday.\n因为有 yesterday，要用过去式 went。再试一次？",
    },
    {
      test: /think|θ|纠音|发音/i,
      reply: "教练 ee：练 /θ/ 很棒！\nTip: tongue between teeth, blow air — think /θɪŋk/.\n跟我读：\"I think this Thursday is free.\"\n读完打字告诉我感觉如何～",
    },
    {
      test: /cell|细胞|llm|大模型|python/i,
      reply: "教练 ee：知识+英语模式开启！\n用简单英语说：\n\"A cell is the basic unit of life.\"\n或 \"An LLM is an AI that predicts the next word.\"\n你选一个主题，用英文写 1–2 句给我批改。",
    },
    {
      test: /help|帮助|不会|怎么说/i,
      reply: "教练 ee：没问题！你可以：\n1) 用中文说意思，我帮你译成自然英文\n2) 直接写英文，我帮你改得更地道\n现在把你想说的发给我吧 💪",
    },
  ];

  const defaultCoachReply =
    "教练 ee：收到！（原型阶段我用预设回复）\n建议你把句子写完整。例如：\n\"Yesterday I went to the library and read for two hours.\"\n\n小提示：多用 I + 动词过去式 讲昨天的事。继续发一句，我帮你改！";

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

  // —— Knowledge lessons ——
  const lessons = {
    cell: {
      title: "What is a cell?",
      step1: "A cell is the basic unit of life. All living things are made of cells. Some tiny living things have only one cell. Plants and animals have many cells.",
      phrases: ["basic unit of life", "living things", "made of cells", "plants and animals"],
      retell: "用英语复述：细胞是什么？尽量用上 basic unit / living things。",
    },
    llm: {
      title: "What is an LLM?",
      step1: "An LLM is a Large Language Model. It is a kind of AI. It reads lots of text and learns patterns. Then it can write sentences, answer questions, and help you practice English.",
      phrases: ["large language model", "kind of AI", "learn patterns", "answer questions"],
      retell: "用英语复述：大模型是什么？可以说 It is an AI that...",
    },
    python: {
      title: "Hello, Python!",
      step1: "Python is a popular programming language. It is friendly for beginners. You can write print(\"Hello\") to show a message. People use Python for websites, data, and AI.",
      phrases: ["programming language", "friendly for beginners", "print a message", "used for AI"],
      retell: "用英语复述：Python 是什么？为什么适合初学者？",
    },
  };

  let currentLesson = "cell";

  function renderLesson() {
    const L = lessons[currentLesson];
    document.getElementById("lesson-title").textContent = L.title;
    document.getElementById("lesson-en").textContent = L.step1;
    document.getElementById("lesson-phrases").innerHTML = L.phrases.map((p) => `<span>${p}</span>`).join("");
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
    speakText(L.phrases.join(". "));
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
    document.getElementById("fc-tip").textContent = item.tip;
    document.getElementById("review-count").textContent = `${state.reviewIndex + 1} / ${state.wrongBook.length}`;
  }

  document.getElementById("flashcard")?.addEventListener("click", () => {
    document.getElementById("flashcard").classList.toggle("revealed");
  });

  function srsRate(level) {
    if (!state.wrongBook.length) return;
    const item = state.wrongBook[state.reviewIndex];
    // Simple mock: Again keeps; Hard moves back; Good advances / soft remove after Good spam
    if (level === "good") {
      item.due = (item.due || 0) + 1;
      if (item.due >= 2) {
        // graduate from book after 2 goods in prototype
        state.wrongBook.splice(state.reviewIndex, 1);
        if (state.reviewIndex >= state.wrongBook.length) state.reviewIndex = 0;
      } else {
        state.reviewIndex = (state.reviewIndex + 1) % Math.max(state.wrongBook.length, 1);
      }
    } else if (level === "hard") {
      state.reviewIndex = (state.reviewIndex + 1) % state.wrongBook.length;
    } else {
      // again: stay / reshuffle to end
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
