/* 口语小站 · 存储 / 档案 / 管理端密码（家庭演示级） */
(function (global) {
  "use strict";

  const META_KEY = "kouyu-xiaozhan-meta-v4";
  const PROFILE_PREFIX = "kouyu-xiaozhan-profile-v4:";
  const ADMIN_KEY = "kouyu-xiaozhan-admin-v4";
  const LEGACY_META = ["kouyu-xiaozhan-meta-v3"];
  const LEGACY_PROFILE_PREFIXES = ["kouyu-xiaozhan-profile-v3:"];
  const LEGACY_STATE = ["kouyu-xiaozhan-v2", "kouyu-xiaozhan-v1"];
  const SISTER_ID = "sister";

  function clone(obj) {
    try {
      return structuredClone(obj);
    } catch {
      return JSON.parse(JSON.stringify(obj));
    }
  }

  function emptyProfileState() {
    return {
      streak: 0,
      lastCheckInDate: null,
      tasks: { pronounce: false, shadow: false, input: false, output: false },
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
      retells: {},
      selectedVocabThemeId: null,
      xp: 0,
      level: 1,
      rewards: [],
      gameTasks: [],
      challengeResults: [],
      lastEeDailyKey: null,
      lastEeWeeklyKey: null,
      claimedRewardIds: [],
    };
  }

  function defaultMeta() {
    const now = new Date().toISOString();
    return {
      version: 4,
      activeProfileId: SISTER_ID,
      profiles: [{ id: SISTER_ID, name: "妹妹", emoji: "👧", createdAt: now, role: "learner" }],
    };
  }

  function profileKey(id) {
    return PROFILE_PREFIX + id;
  }

  function normalizeState(parsed) {
    const base = emptyProfileState();
    if (!parsed || typeof parsed !== "object") return base;
    const wrongBook = Array.isArray(parsed.wrongBook)
      ? parsed.wrongBook.map((c) => ({
          id: c.id || "w-" + Date.now(),
          word: c.word || "",
          ipa: c.ipa || "",
          zh: c.zh || "",
          tip: c.tip || "",
          exampleEn: c.exampleEn || "",
          exampleZh: c.exampleZh || "",
          due: c.due || 0,
        }))
      : base.wrongBook;
    return {
      ...base,
      ...parsed,
      tasks: { ...base.tasks, ...(parsed.tasks || {}) },
      wrongBook,
      retells: parsed.retells && typeof parsed.retells === "object" ? parsed.retells : {},
      streak: Number(parsed.streak) || 0,
      pathUnlocked: Math.min(4, Math.max(1, Number(parsed.pathUnlocked) || 1)),
      reviewIndex: Number(parsed.reviewIndex) || 0,
      xp: Math.max(0, Number(parsed.xp) || 0),
      level: Math.max(1, Number(parsed.level) || 1),
      rewards: Array.isArray(parsed.rewards) ? parsed.rewards : [],
      gameTasks: Array.isArray(parsed.gameTasks) ? parsed.gameTasks : [],
      challengeResults: Array.isArray(parsed.challengeResults) ? parsed.challengeResults : [],
      claimedRewardIds: Array.isArray(parsed.claimedRewardIds) ? parsed.claimedRewardIds : [],
      lastEeDailyKey: parsed.lastEeDailyKey || null,
      lastEeWeeklyKey: parsed.lastEeWeeklyKey || null,
    };
  }

  function loadMeta() {
    try {
      const raw = localStorage.getItem(META_KEY);
      if (!raw) return defaultMeta();
      const parsed = JSON.parse(raw);
      const base = defaultMeta();
      let profiles =
        Array.isArray(parsed.profiles) && parsed.profiles.length
          ? parsed.profiles.map((p) => ({
              id: String(p.id),
              name: String(p.name || "学习者"),
              emoji: p.emoji || "📘",
              createdAt: p.createdAt || new Date().toISOString(),
              role: p.role || "learner",
            }))
          : base.profiles;
      if (!profiles.some((p) => p.id === SISTER_ID)) {
        profiles = [base.profiles[0], ...profiles];
      }
      let active = parsed.activeProfileId || SISTER_ID;
      if (!profiles.some((p) => p.id === active)) active = SISTER_ID;
      return { version: 4, activeProfileId: active, profiles };
    } catch {
      return defaultMeta();
    }
  }

  function saveMeta(meta) {
    localStorage.setItem(META_KEY, JSON.stringify(meta));
  }

  function loadProfileState(id) {
    try {
      const raw = localStorage.getItem(profileKey(id));
      if (!raw) return emptyProfileState();
      return normalizeState(JSON.parse(raw));
    } catch {
      return emptyProfileState();
    }
  }

  function saveProfileState(id, st) {
    localStorage.setItem(profileKey(id), JSON.stringify(st));
  }

  function migrateLegacyIfNeeded() {
    if (localStorage.getItem(META_KEY)) return;
    for (const key of LEGACY_META) {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      try {
        const oldMeta = JSON.parse(raw);
        const m = defaultMeta();
        if (Array.isArray(oldMeta.profiles)) {
          oldMeta.profiles.forEach((p) => {
            if (p.id === SISTER_ID) {
              m.profiles[0].name = p.name || "妹妹";
              m.profiles[0].emoji = p.emoji || "👧";
            }
          });
        }
        saveMeta(m);
        LEGACY_PROFILE_PREFIXES.forEach((pref) => {
          const sisterRaw = localStorage.getItem(pref + SISTER_ID);
          if (sisterRaw) {
            try {
              saveProfileState(SISTER_ID, normalizeState(JSON.parse(sisterRaw)));
            } catch {
              /* ignore */
            }
          }
        });
        return;
      } catch {
        /* ignore */
      }
    }
    for (const key of LEGACY_STATE) {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      try {
        const parsed = JSON.parse(raw);
        saveMeta(defaultMeta());
        saveProfileState(SISTER_ID, normalizeState(parsed));
        return;
      } catch {
        /* ignore */
      }
    }
  }

  function bufToHex(buf) {
    return Array.from(new Uint8Array(buf))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }

  function randomSalt(len) {
    const arr = new Uint8Array(len || 16);
    crypto.getRandomValues(arr);
    return bufToHex(arr);
  }

  async function hashPassword(password, salt) {
    const enc = new TextEncoder();
    const data = enc.encode(salt + "::" + password);
    const digest = await crypto.subtle.digest("SHA-256", data);
    return bufToHex(digest);
  }

  function defaultAdmin() {
    return {
      version: 4,
      username: "brother",
      salt: null,
      passwordHash: null,
      publishedTasks: [],
      importedSisterSnapshot: null,
      setupDone: false,
    };
  }

  function loadAdmin() {
    try {
      const raw = localStorage.getItem(ADMIN_KEY);
      if (!raw) return defaultAdmin();
      const parsed = JSON.parse(raw);
      return {
        ...defaultAdmin(),
        ...parsed,
        publishedTasks: Array.isArray(parsed.publishedTasks) ? parsed.publishedTasks : [],
      };
    } catch {
      return defaultAdmin();
    }
  }

  function saveAdmin(admin) {
    localStorage.setItem(ADMIN_KEY, JSON.stringify(admin));
  }

  function isAdminSession() {
    return sessionStorage.getItem("kouyu-admin-session") === "1";
  }

  function setAdminSession(ok) {
    if (ok) sessionStorage.setItem("kouyu-admin-session", "1");
    else sessionStorage.removeItem("kouyu-admin-session");
  }

  async function setupAdminPassword(password) {
    const admin = loadAdmin();
    const salt = randomSalt(16);
    const passwordHash = await hashPassword(password, salt);
    admin.salt = salt;
    admin.passwordHash = passwordHash;
    admin.setupDone = true;
    admin.username = "brother";
    saveAdmin(admin);
    setAdminSession(true);
    return true;
  }

  async function verifyAdminPassword(username, password) {
    const admin = loadAdmin();
    if ((username || "").trim() !== (admin.username || "brother")) return false;
    if (!admin.setupDone || !admin.salt || !admin.passwordHash) return false;
    const h = await hashPassword(password, admin.salt);
    return h === admin.passwordHash;
  }

  async function changeAdminPassword(oldPass, newPass) {
    const admin = loadAdmin();
    if (!(await verifyAdminPassword(admin.username, oldPass))) return false;
    const salt = randomSalt(16);
    admin.salt = salt;
    admin.passwordHash = await hashPassword(newPass, salt);
    saveAdmin(admin);
    return true;
  }

  function exportSisterPayload(profileMeta, state) {
    return {
      kind: "kouyu-xiaozhan-sister-sync",
      version: 4,
      exportedAt: new Date().toISOString(),
      profile: profileMeta,
      state: state,
      note: "妹妹进度同步包。哥哥在管理端「导入她的进度」即可查看。家庭演示用途，勿上传公开网盘密码同文件。",
    };
  }

  global.KouyuStorage = {
    SISTER_ID,
    META_KEY,
    ADMIN_KEY,
    clone,
    emptyProfileState,
    defaultMeta,
    profileKey,
    normalizeState,
    loadMeta,
    saveMeta,
    loadProfileState,
    saveProfileState,
    migrateLegacyIfNeeded,
    loadAdmin,
    saveAdmin,
    isAdminSession,
    setAdminSession,
    setupAdminPassword,
    verifyAdminPassword,
    changeAdminPassword,
    hashPassword,
    exportSisterPayload,
  };
})(window);
