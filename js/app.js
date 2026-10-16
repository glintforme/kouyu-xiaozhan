/* 口语小站 · 学习端主逻辑 v7 · 云同步 live + ee API */
(function () {
  "use strict";

  const St = window.KouyuStorage;
  const Gm = window.KouyuGame;
  const Ad = window.KouyuAdmin;
  const Cloud = window.KouyuCloud;

  St.migrateLegacyIfNeeded();
  let meta = St.loadMeta();
  // Force sister as learner for learn shell
  if (!meta.profiles.some((p) => p.id === St.SISTER_ID)) {
    meta = St.defaultMeta();
  }
  meta.activeProfileId = St.SISTER_ID;
  St.saveMeta(meta);
  if (!localStorage.getItem(St.profileKey(St.SISTER_ID))) {
    St.saveProfileState(St.SISTER_ID, St.emptyProfileState());
  }

  let state = St.loadProfileState(St.SISTER_ID);

  function sisterSyncPayload() {
    const profile = meta.profiles.find((p) => p.id === St.SISTER_ID) || {
      id: St.SISTER_ID,
      name: "妹妹",
      emoji: "👧",
      role: "learner",
    };
    return St.exportSisterPayload(profile, state);
  }

  function persist() {
    St.saveProfileState(St.SISTER_ID, state);
    St.saveMeta(meta);
    if (Cloud && Cloud.isConfigured()) {
      Cloud.schedulePush(() => sisterSyncPayload());
    }
  }

  function renderCloudStatus() {
    if (!Cloud) return;
    const cfg = Cloud.loadCloud();
    const el = document.getElementById("cloud-sync-status");
    if (el) {
      const when = Cloud.formatSyncTime(cfg.lastSyncAt);
      const err = cfg.lastSyncError ? ` · ${cfg.lastSyncError}` : "";
      const on = cfg.syncEnabled && cfg.apiBase ? "开" : "关";
      el.textContent = `状态：${cfg.lastSyncStatus || "未配置"}（云同步 ${on}）· 上次同步：${when}${err}`;
    }
    const badge = document.getElementById("chat-engine-badge");
    if (badge) {
      badge.textContent = (Cloud.normalizeBase(cfg.apiBase) || Cloud.DEFAULT_API_BASE)
        ? "云端 ee（可回落本地）"
        : "本地 ee";
    }
  }

  function bindCloudSettings() {
    if (!Cloud) return;
    const cfg = Cloud.loadCloud();
    const codeEl = document.getElementById("cloud-family-code");
    const baseEl = document.getElementById("cloud-api-base");
    const secEl = document.getElementById("cloud-family-secret");
    const enEl = document.getElementById("cloud-sync-enabled");
    if (codeEl) codeEl.value = cfg.familyCode || "";
    if (baseEl) baseEl.value = cfg.apiBase || Cloud.DEFAULT_API_BASE;
    if (secEl) secEl.value = cfg.familySecret || "";
    if (enEl) enEl.checked = !!cfg.syncEnabled;
    renderCloudStatus();

    document.getElementById("btn-cloud-save")?.addEventListener("click", () => {
      const next = Cloud.loadCloud();
      next.familyCode = Cloud.normalizeCode(codeEl?.value || "");
      next.apiBase = Cloud.normalizeBase(baseEl?.value || "");
      next.familySecret = (secEl?.value || "").trim();
      next.syncEnabled = !!enEl?.checked;
      if (next.syncEnabled && (!next.apiBase || next.familyCode.length < 4)) {
        toast("启用云同步需要：家庭同步码（≥4）+ API Base（Worker 地址）");
        return;
      }
      if (!next.apiBase) {
        next.lastSyncStatus = "未配置（本地模式）";
      } else if (!next.syncEnabled) {
        next.lastSyncStatus = "已填 API，未启用推送";
      } else {
        next.lastSyncStatus = "已启用，等待推送";
      }
      Cloud.saveCloud(next);
      // Keep game EE_CONFIG in sync for task fetch
      if (Gm.EE_CONFIG) {
        Gm.EE_CONFIG.apiEndpoint = next.apiBase ? next.apiBase + "/api/ee/tasks/generate" : null;
        Gm.EE_CONFIG.mode = next.apiBase ? "api" : "local-auto";
      }
      renderCloudStatus();
      toast(next.apiBase ? "云同步设置已保存" : "已保存：当前为本地模式");
    });

    document.getElementById("btn-cloud-test")?.addEventListener("click", async () => {
      document.getElementById("btn-cloud-oneclick-learn")?.click();
    });

    document.getElementById("btn-cloud-oneclick-learn")?.addEventListener("click", async () => {
      const next = Cloud.loadCloud();
      next.familyCode = Cloud.normalizeCode(codeEl?.value || "");
      next.apiBase = Cloud.normalizeBase(baseEl?.value || "") || Cloud.DEFAULT_API_BASE;
      next.familySecret = (secEl?.value || "").trim();
      next.syncEnabled = !!enEl?.checked;
      if (baseEl) baseEl.value = next.apiBase;
      Cloud.saveCloud(next);
      if (Gm.EE_CONFIG) {
        Gm.EE_CONFIG.apiEndpoint = next.apiBase + "/api/ee/tasks/generate";
        Gm.EE_CONFIG.mode = "api";
      }
      toast("正在测试云端连通…");
      try {
        const result = await Cloud.oneClickConnect({
          familyCode: next.familyCode,
          apiBase: next.apiBase,
          familySecret: next.familySecret,
          syncEnabled: next.syncEnabled,
          // learn side: health only (no admin hash)
        });
        const msg = (result.steps || []).join(" · ");
        if (result.ok) {
          toast("连通成功：" + msg);
        } else {
          toast("连通失败：" + (result.error || msg));
        }
        renderCloudStatus();
      } catch (e) {
        toast("连通失败：" + (e.message || e));
        Cloud.setStatus("连接失败", e.message || String(e));
        renderCloudStatus();
      }
    });

    document.getElementById("btn-cloud-push-now")?.addEventListener("click", async () => {
      document.getElementById("btn-cloud-save")?.click();
      if (!Cloud.isConfigured()) {
        toast("请先启用云同步并填写同步码 + API Base");
        return;
      }
      try {
        await Cloud.pushSisterProgress(sisterSyncPayload());
        toast("已推送到云端");
        renderCloudStatus();
      } catch (e) {
        toast("推送失败：" + (e.message || e));
        renderCloudStatus();
      }
    });

    window.addEventListener("kouyu-cloud-status", () => renderCloudStatus());
  }

  function refreshGameTasks(remoteTasks) {
    state = Gm.ensureEeDailyTasks(state, remoteTasks);
    state = Gm.ensureEeWeeklyChallengeHint(state);
    const admin = St.loadAdmin();
    state = Gm.mergeBrotherPublishedTasks(state, admin.publishedTasks || []);
    Gm.evaluateBadges(state);
    persist();
  }

  refreshGameTasks();
  // If API Base set, try replace today's ee tasks from Worker (once per day key)
  (async () => {
    try {
      if (!Cloud) return;
      {
        const _c = Cloud.loadCloud();
        if (!Cloud.normalizeBase(_c.apiBase)) {
          _c.apiBase = Cloud.DEFAULT_API_BASE;
          Cloud.saveCloud(_c);
        }
      }
      if (state.lastEeDailyKey === Gm.todayKey()) return;
      const remote = await Gm.fetchEeTasks();
      if (remote && remote.length) {
        state.lastEeDailyKey = null; // allow rebuild
        refreshGameTasks(remote);
        renderGameTasks();
        renderHud();
      }
    } catch (e) {
      console.warn("cloud ee tasks skip", e);
    }
  })();

  function toast(msg) {
    const el = document.getElementById("app-toast");
    if (!el) return;
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.classList.remove("show"), 3200);
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\n/g, "<br>");
  }

  function escapeAttr(s) {
    return String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
  }

  function dayOfYear() {
    const now = new Date();
    const start = new Date(now.getFullYear(), 0, 0);
    return Math.floor((now - start) / 86400000);
  }

  // —— HUD ——
  function renderHud() {
    state.level = Gm.levelFromXp(state.xp);
    const prog = Gm.xpProgress(state.xp);
    const ln = document.getElementById("hud-level-num");
    const streak = document.getElementById("streak-count");
    const xpLabel = document.getElementById("hud-xp-label");
    const xpNext = document.getElementById("hud-xp-next");
    const bar = document.getElementById("xp-bar");
    if (ln) ln.textContent = String(state.level);
    if (streak) streak.textContent = String(state.streak || 0);
    if (xpLabel) xpLabel.textContent = `${state.xp || 0} XP`;
    if (xpNext) xpNext.textContent = `本级 ${prog.into}/${prog.need}`;
    if (bar) bar.style.width = `${prog.pct}%`;
  }

  function renderGameTasks() {
    const root = document.getElementById("game-task-list");
    const label = document.getElementById("progress-label");
    if (!root) return;
    const tasks = state.gameTasks || [];
    const done = tasks.filter((t) => t.done).length;
    if (label) label.textContent = `今日任务 ${done}/${tasks.length} · Lv.${state.level} · ${state.xp} XP`;
    if (!tasks.length) {
      root.innerHTML = "<li class='hint'>暂无任务，下拉刷新或稍后再来。</li>";
      return;
    }
    root.innerHTML = tasks
      .map((t) => {
        const src = t.source === "brother" ? "哥哥" : "ee";
        return `<li class="game-task-item ${t.done ? "done" : ""}" data-task-id="${escapeAttr(t.id)}">
          <div class="meta">
            <strong>${escapeHtml(t.title)}</strong>
            <span><span class="src-tag">${src}</span> +${t.xp} XP ${t.note ? "· " + escapeHtml(t.note) : ""}</span>
          </div>
          <div class="task-actions">
            <button type="button" class="go" data-go="${escapeAttr(t.link || "#home")}">去练</button>
            ${
              t.done
                ? '<span class="done-label">已完成</span>'
                : `<button type="button" class="btn btn-primary btn-sm" data-claim="${escapeAttr(t.id)}">领取</button>`
            }
          </div>
        </li>`;
      })
      .join("");
    root.querySelectorAll("[data-go]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        location.hash = btn.getAttribute("data-go");
      });
    });
    root.querySelectorAll("[data-claim]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-claim");
        const res = Gm.completeGameTask(state, id);
        state = res.state;
        persist();
        renderHud();
        renderGameTasks();
        if (res.xpGain) {
          let msg = `✨ 完成！+${res.xpGain} XP`;
          if (res.leveled) msg = `🎉 升级到 Lv.${state.level}！` + msg;
          if (res.streakBumped) msg += ` · 🔥${state.streak}天`;
          if (res.newBadges && res.newBadges.length) msg += ` · 🏅` + res.newBadges.map((b) => b.name).join("/");
          toast(msg);
          flashXpHud();
        } else toast("任务已完成");
      });
    });
  }

  function claimModule(module, opts) {
    const silent = opts && opts.silent;
    const res = Gm.completeTaskByModule(state, module);
    state = res.state;
    persist();
    renderHud();
    renderGameTasks();
    if (res.xpGain) {
      let msg = `✨ +${res.xpGain} XP`;
      if (res.leveled) msg += ` · 升级到 Lv.${state.level}！`;
      if (res.streakBumped) msg += ` · 🔥连续 ${state.streak} 天`;
      if (res.newBadges && res.newBadges.length) msg += ` · 🏅${res.newBadges[0].name}`;
      toast(msg);
      flashXpHud();
    } else if (!silent) {
      toast("练过啦～回首页看任务；若已领取过，明天 ee 会发新任务");
    }
    return res;
  }

  function flashXpHud() {
    const hud = document.getElementById("xp-hud");
    if (!hud) return;
    hud.classList.remove("xp-pop");
    void hud.offsetWidth;
    hud.classList.add("xp-pop");
  }

  // —— Routing ——
  const pages = ["home", "path", "pronounce", "chat", "knowledge", "review", "vocab", "challenges", "progress", "admin"];

  function showLearn() {
    document.getElementById("shell-learn")?.classList.remove("hidden");
    document.getElementById("shell-admin")?.classList.add("hidden");
    document.body.classList.remove("mode-admin");
    document.querySelector(".bottom-nav")?.classList.remove("hidden");
  }

  function navigate(hash) {
    const raw = (hash || "#home").replace("#", "") || "home";
    if (raw === "admin" || raw.startsWith("admin/")) {
      Ad.enterAdminShell();
      return;
    }
    showLearn();
    refreshGameTasks();
    const pageId = pages.includes(raw) ? raw : "home";
    document.querySelectorAll("#shell-learn .page").forEach((el) => {
      el.classList.toggle("active", el.id === `page-${pageId}`);
    });
    const morePages = ["knowledge", "review", "path", "progress"];
    document.querySelectorAll(".nav-btn").forEach((btn) => {
      if (btn.id === "nav-more-btn") {
        btn.classList.toggle("active", morePages.includes(pageId));
      } else {
        btn.classList.toggle("active", btn.dataset.page === pageId);
      }
    });
    if (typeof closeMoreSheet === "function") closeMoreSheet();
    renderHud();
    if (pageId === "home") {
      renderGameTasks();
      renderVocabHomePreview();
    }
    if (pageId === "review") renderReview();
    if (pageId === "path") renderPath();
    if (pageId === "vocab") renderVocabPage();
    if (pageId === "pronounce") {
      renderPronounceChips();
      updatePronouncePanel();
    }
    if (pageId === "knowledge") renderLesson();
    if (pageId === "challenges") renderChallengeMenu();
    if (pageId === "progress") renderProgressPage();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  window.addEventListener("hashchange", () => navigate(location.hash));

  document.querySelectorAll("[data-go]").forEach((el) => {
    el.addEventListener("click", (e) => {
      e.preventDefault();
      location.hash = el.getAttribute("data-go");
    });
  });

  function openAdminConfirm() {
    document.getElementById("admin-confirm")?.classList.remove("hidden");
  }
  function closeAdminConfirm() {
    document.getElementById("admin-confirm")?.classList.add("hidden");
  }
  document.getElementById("btn-open-admin")?.addEventListener("click", openAdminConfirm);
  document.getElementById("more-open-admin")?.addEventListener("click", () => {
    closeMoreSheet();
    openAdminConfirm();
  });
  document.getElementById("admin-confirm-yes")?.addEventListener("click", () => {
    closeAdminConfirm();
    location.hash = "#admin";
  });
  document.getElementById("admin-confirm-no")?.addEventListener("click", closeAdminConfirm);
  document.getElementById("admin-confirm")?.addEventListener("click", (e) => {
    if (e.target.id === "admin-confirm") closeAdminConfirm();
  });

  // More sheet
  function openMoreSheet() {
    const sheet = document.getElementById("more-sheet");
    const btn = document.getElementById("nav-more-btn");
    sheet?.classList.remove("hidden");
    btn?.setAttribute("aria-expanded", "true");
    btn?.classList.add("active");
  }
  function closeMoreSheet() {
    const sheet = document.getElementById("more-sheet");
    const btn = document.getElementById("nav-more-btn");
    sheet?.classList.add("hidden");
    btn?.setAttribute("aria-expanded", "false");
    // keep active only if on a more-page
    const hash = (location.hash || "#home").replace("#", "");
    const morePages = ["knowledge", "review", "path", "progress"];
    if (!morePages.includes(hash)) btn?.classList.remove("active");
  }
  document.getElementById("nav-more-btn")?.addEventListener("click", () => {
    const sheet = document.getElementById("more-sheet");
    if (sheet?.classList.contains("hidden")) openMoreSheet();
    else closeMoreSheet();
  });
  document.getElementById("more-sheet-close")?.addEventListener("click", closeMoreSheet);
  document.getElementById("more-sheet")?.addEventListener("click", (e) => {
    if (e.target.id === "more-sheet") closeMoreSheet();
  });
  document.querySelectorAll("#more-sheet [data-go]").forEach((el) => {
    el.addEventListener("click", (e) => {
      e.preventDefault();
      closeMoreSheet();
      location.hash = el.getAttribute("data-go");
    });
  });

  // —— Export / Import ——
  document.getElementById("btn-export-sync")?.addEventListener("click", () => {
    const profile = meta.profiles.find((p) => p.id === St.SISTER_ID) || { id: St.SISTER_ID, name: "妹妹", emoji: "👧" };
    const payload = St.exportSisterPayload(profile, state);
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `口语小站-妹妹同步-${Gm.todayKey()}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    toast("已下载同步包，发给哥哥后他在管理端导入即可看进度");
  });

  document.getElementById("btn-import-profile")?.addEventListener("click", () => {
    document.getElementById("import-file-input")?.click();
  });

  document.getElementById("import-file-input")?.addEventListener("change", async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      let incoming = null;
      if (data && data.state && (data.kind === "kouyu-xiaozhan-sister-sync" || data.kind === "kouyu-xiaozhan-backup")) {
        incoming = St.normalizeState(data.state);
      } else if (data && (data.tasks || data.wrongBook || data.xp != null)) {
        incoming = St.normalizeState(data);
      } else {
        toast("文件格式不对");
        return;
      }
      if (!window.confirm("确定用备份覆盖本机妹妹学习数据？")) return;
      state = incoming;
      refreshGameTasks();
      persist();
      navigate(location.hash || "#home");
      toast("已导入妹妹进度");
    } catch {
      toast("导入失败");
    }
  });

  // —— Progress page ——
  function renderProgressPage() {
    const stats = document.getElementById("progress-stats");
    const bar = document.getElementById("progress-xp-bar");
    const prog = Gm.xpProgress(state.xp);
    const ownedCount = (state.rewards || []).length;
    const totalBadges = Gm.BADGE_CATALOG.length;
    const next = Gm.nextBadgeHint(state);
    if (stats) {
      stats.innerHTML = `等级 <strong>Lv.${state.level}</strong> · 累计 <strong>${state.xp} XP</strong><br>连续打卡 <strong>${state.streak || 0}</strong> 天 · 徽章 <strong>${ownedCount}/${totalBadges}</strong><br>本级进度 ${prog.into}/${prog.need} XP` +
        (next ? `<br><span class="next-badge-hint">下一枚可冲：${next.emoji} ${escapeHtml(next.name)} — ${escapeHtml(next.how || next.desc)}</span>` : "<br>徽章全收集啦！👑");
    }
    if (bar) bar.style.width = `${prog.pct}%`;
    const wall = document.getElementById("badge-wall");
    if (wall) {
      const owned = new Set((state.rewards || []).map((r) => r.id));
      wall.innerHTML = Gm.BADGE_CATALOG.map((b) => {
        const on = owned.has(b.id);
        return `<div class="badge-item ${on ? "owned" : "locked"}" title="${escapeAttr(b.how || b.desc)}">
          <span class="badge-emoji">${b.emoji}</span>
          <strong>${escapeHtml(b.name)}</strong>
          <span>${escapeHtml(b.desc)}</span>
          <span class="badge-how">${on ? "✅ 已解锁" : "🔓 " + escapeHtml(b.how || b.desc)}</span>
        </div>`;
      }).join("");
    }
    const hist = document.getElementById("challenge-history");
    if (hist) {
      const list = state.challengeResults || [];
      hist.innerHTML = list.length
        ? list
            .slice(0, 15)
            .map((c) => {
              const m = Gm.CHALLENGE_META[c.kind] || { label: c.kind, emoji: "📝" };
              return `<li>${m.emoji} ${m.label} ${c.correct}/${c.total}（${Math.round(c.ratio * 100)}%）${c.passed ? "✅" : "❌"} +${c.xp}XP</li>`;
            })
            .join("")
        : "<li class='empty-inline'>还没有测验记录，去「挑战」试试周测吧 🎯</li>";
    }
  }

  // —— Challenges ——
  let quizKind = null;
  let quizItems = [];

  function renderChallengeMenu() {
    const root = document.getElementById("challenge-menu");
    const quiz = document.getElementById("challenge-quiz");
    const result = document.getElementById("challenge-result");
    if (quiz) quiz.classList.add("hidden");
    if (result) result.classList.add("hidden");
    if (root) root.classList.remove("hidden");
    if (!root) return;
    root.innerHTML = Object.keys(Gm.CHALLENGE_META)
      .map((k) => {
        const m = Gm.CHALLENGE_META[k];
        return `<button type="button" class="challenge-card" data-challenge="${k}">
          <span class="emoji">${m.emoji}</span>
          <strong>${m.label}</strong>
          <span>通过奖励 +${m.xp} XP · ${m.countHint || ""}</span>
          <span class="hint">正确率 ≥ ${Math.round(m.passRatio * 100)}% 才算通过</span>
        </button>`;
      })
      .join("");
    root.querySelectorAll("[data-challenge]").forEach((btn) => {
      btn.addEventListener("click", () => startQuiz(btn.dataset.challenge));
    });
  }

  function startQuiz(kind) {
    quizKind = kind;
    quizItems = Gm.buildQuiz(kind);
    const menu = document.getElementById("challenge-menu");
    const quiz = document.getElementById("challenge-quiz");
    const result = document.getElementById("challenge-result");
    if (menu) menu.classList.add("hidden");
    if (result) result.classList.add("hidden");
    if (quiz) quiz.classList.remove("hidden");
    const title = document.getElementById("quiz-title");
    const body = document.getElementById("quiz-body");
    const m = Gm.CHALLENGE_META[kind];
    if (title) title.textContent = `${m.emoji} ${m.label}（共 ${quizItems.length} 题）`;
    if (body) {
      body.innerHTML = quizItems
        .map(
          (item, i) => `<div class="quiz-q" data-qi="${i}">
          <p><strong>Q${i + 1}.</strong> ${escapeHtml(item.q)}</p>
          <div class="quiz-choices">
            ${item.choices
              .map(
                (c, j) =>
                  `<label><input type="radio" name="q${i}" value="${j}" /> ${escapeHtml(c)}</label>`
              )
              .join("")}
          </div>
        </div>`
        )
        .join("");
    }
  }

  document.getElementById("btn-cancel-quiz")?.addEventListener("click", () => {
    renderChallengeMenu();
  });

  document.getElementById("btn-submit-quiz")?.addEventListener("click", () => {
    if (!quizKind || !quizItems.length) return;
    const answers = quizItems.map((_, i) => {
      const checked = document.querySelector(`input[name="q${i}"]:checked`);
      return checked ? Number(checked.value) : -1;
    });
    if (answers.some((a) => a < 0)) {
      toast("请答完所有题目再交卷");
      return;
    }
    const graded = Gm.gradeChallenge(quizKind, answers, quizItems);
    const rec = Gm.recordChallenge(state, quizKind, graded);
    state = rec.state || rec;
    persist();
    renderHud();
    renderGameTasks();
    if (rec.newBadges && rec.newBadges.length) {
      toast("🏅 解锁徽章：" + rec.newBadges.map((b) => b.emoji + b.name).join("、"));
    }
    const quiz = document.getElementById("challenge-quiz");
    const result = document.getElementById("challenge-result");
    if (quiz) quiz.classList.add("hidden");
    if (result) {
      result.classList.remove("hidden");
      const m = Gm.CHALLENGE_META[quizKind];
      const pct = Math.round(graded.ratio * 100);
      result.innerHTML = `<h3>${graded.passed ? "🎉 挑战通过！" : "💪 再练练还能过"}</h3>
        <p>${m.label}得分 ${graded.correct}/${graded.total}（${pct}%）· 获得 <strong>+${graded.xp} XP</strong></p>
        <p class="hint">${graded.passed ? "徽章可能已解锁，去「进度」看看。" : "正确率需 ≥ 60% 才算通过并拿满奖励。"}</p>
        <div class="quiz-review">${graded.quiz
          .map(
            (item, i) =>
              `<div class="quiz-q"><p>Q${i + 1}. ${escapeHtml(item.q)}</p>
              <p class="hint">你的答案：${escapeHtml(item.choices[answers[i]])} ${answers[i] === item.answer ? "✅" : "❌ 正确：" + escapeHtml(item.choices[item.answer])}</p>
              <p class="hint">${escapeHtml(item.tip || "")}</p></div>`
          )
          .join("")}</div>
        <button type="button" class="btn btn-primary" id="btn-quiz-back">返回挑战列表</button>`;
      document.getElementById("btn-quiz-back")?.addEventListener("click", () => renderChallengeMenu());
    }
    toast(graded.passed ? `通过！+${graded.xp} XP` : `已交卷 +${graded.xp} XP`);
  });

  // —— Learning path ——
  const phases = [
    {
      id: 1,
      title: "阶段一 · 发音地基",
      desc: "元音、辅音、重音节奏；每天 15–20 分钟跟读。",
      resources: [
        { name: "BBC Learning English · Pronunciation", url: "https://www.bbc.co.uk/learningenglish/english/features/pronunciation", tag: "免费" },
        { name: "Rachel's English", url: "https://rachelsenglish.com/", tag: "免费" },
        { name: "YouGlish", url: "https://youglish.com/", tag: "免费" },
      ],
    },
    {
      id: 2,
      title: "阶段二 · 跟读与影子跟读",
      desc: "短句跟读 → 影子跟读（shadowing）。",
      resources: [
        { name: "VOA Learning English", url: "https://learningenglish.voanews.com/", tag: "免费" },
        { name: "ELLLO", url: "https://www.elllo.org/", tag: "免费" },
      ],
    },
    {
      id: 3,
      title: "阶段三 · 开口输出",
      desc: "日记口述、角色扮演、presentation。",
      resources: [{ name: "Cambridge Write & Improve", url: "https://writeandimprove.com/", tag: "免费" }],
    },
    {
      id: 4,
      title: "阶段四 · 地道与思维",
      desc: "习语、语块、文学/文化讨论。",
      resources: [
        { name: "Oxford Learner's Dictionaries", url: "https://www.oxfordlearnersdictionaries.com/", tag: "免费" },
        { name: "Crash Course", url: "https://thecrashcourse.com/", tag: "免费" },
      ],
    },
  ];

  function renderPath() {
    const root = document.getElementById("phase-grid");
    if (!root) return;
    root.innerHTML = phases
      .map((p) => {
        const unlocked = p.id <= (state.pathUnlocked || 1);
        return `<article class="phase ${unlocked ? "unlocked" : "locked"}">
          <span class="phase-badge">${unlocked ? "✓ 已解锁" : "🔒 未解锁"} · 阶段 ${p.id}</span>
          <h3>${p.title}</h3><p>${p.desc}</p>
          ${
            unlocked
              ? `<ul class="resource-list">${p.resources
                  .map((r) => `<li><a href="${r.url}" target="_blank" rel="noopener noreferrer">${escapeHtml(r.name)}<span>${escapeHtml(r.tag)} ↗</span></a></li>`)
                  .join("")}</ul>`
              : `<p class="hint">完成更多任务解锁（演示可点下方按钮）。</p>`
          }
          ${!unlocked ? `<div class="lock-overlay" aria-hidden="true">🔒</div>` : ""}
        </article>`;
      })
      .join("");
  }

  document.getElementById("unlock-next")?.addEventListener("click", () => {
    state.pathUnlocked = Math.min(4, (state.pathUnlocked || 1) + 1);
    persist();
    renderPath();
  });

  // —— Pronunciation ——
  const pronounceItems = [
    { id: "th", label: "/θ/ think", word: "think", ipa: "/θɪŋk/", zh: "想；认为", tip: "舌尖轻轻放在上下牙之间，吹气，声带不振动。对比：sink /sɪŋk/（沉没）。", sentence: "I think this is a strong argument.", sentenceZh: "我认为这是一个有力的论点。" },
    { id: "dh", label: "/ð/ this", word: "this", ipa: "/ðɪs/", zh: "这个", tip: "同 /θ/ 口型，但声带振动。", sentence: "This theme appears throughout the novel.", sentenceZh: "这个主题贯穿整部小说。" },
    { id: "ae", label: "/æ/ analyze", word: "analyze", ipa: "/ˈænəlaɪz/", zh: "分析", tip: "第一音节 /æ/ 嘴张大；重音在 an-。", sentence: "Please analyze the writer's tone.", sentenceZh: "请分析作者的语气。" },
    { id: "r", label: "/r/ really", word: "really", ipa: "/ˈrɪəli/", zh: "真正地；非常", tip: "美式 /r/ 舌身后缩。", sentence: "I really enjoyed that presentation.", sentenceZh: "我真的很喜欢那场演示汇报。" },
    { id: "v", label: "/v/ very", word: "very", ipa: "/ˈveri/", zh: "非常", tip: "上齿轻触下唇，声带振动；不要发成 /w/。", sentence: "That's a very interesting point.", sentenceZh: "那是一个非常有趣的观点。" },
    { id: "w", label: "/w/ when", word: "when", ipa: "/wen/", zh: "什么时候；当……时", tip: "双唇圆拢再放开，不要发成 /v/。", sentence: "When did you finish the essay?", sentenceZh: "你什么时候写完论文的？" },
    { id: "ng", label: "/ŋ/ thinking", word: "thinking", ipa: "/ˈθɪŋkɪŋ/", zh: "思考（现在分词）", tip: "词尾 /ŋ/ 舌后抵软腭，不要加多余 /g/。", sentence: "I'm thinking about the main theme.", sentenceZh: "我在思考主题是什么。" },
    { id: "discuss", label: "discuss 讨论", word: "discuss", ipa: "/dɪˈskʌs/", zh: "讨论", tip: "重音在第二音节；不要 discuss about。", sentence: "Shall we discuss the cultural context?", sentenceZh: "我们要不要讨论一下文化语境？" },
    { id: "argue", label: "argue 论证", word: "argue", ipa: "/ˈɑːrɡjuː/", zh: "争论；论证", tip: "academic 常指提出论据。argue that… = 主张……", sentence: "The author argues that language shapes culture.", sentenceZh: "作者主张：语言塑造文化。" },
    { id: "paraphrase", label: "paraphrase 改述", word: "paraphrase", ipa: "/ˈpærəfreɪz/", zh: "释义；改述", tip: "用自己的话重述，避免抄袭。", sentence: "Try to paraphrase the quote in simpler English.", sentenceZh: "试着用更简单的英语改述这句引文。" },
    { id: "essay", label: "essay 论文", word: "essay", ipa: "/ˈeseɪ/", zh: "短文；论文", tip: "重音在第一音节。", sentence: "My essay is about modern literature.", sentenceZh: "我的论文是关于现代文学的。" },
    { id: "presentation", label: "presentation 汇报", word: "presentation", ipa: "/ˌprezənˈteɪʃn/", zh: "演示；汇报", tip: "重音在 -ta-。", sentence: "I have a presentation on Shakespeare tomorrow.", sentenceZh: "我明天有一场关于莎士比亚的汇报。" },
    { id: "literature", label: "literature 文学", word: "literature", ipa: "/ˈlɪtrətʃər/", zh: "文学", tip: "重音在第一音节；中间弱读。", sentence: "I study English literature.", sentenceZh: "我学英国文学。" },
    { id: "thesis", label: "thesis 论点", word: "thesis", ipa: "/ˈθiːsɪs/", zh: "论点；学位论文", tip: "词首 /θ/；复数 theses /ˈθiːsiːz/。", sentence: "What is your thesis statement?", sentenceZh: "你的中心论点是什么？" },
    { id: "s1", label: "寒暄 · Nice to meet you", word: "Nice to meet you", ipa: "/naɪs tə ˈmiːt ju/", zh: "很高兴认识你", tip: "to 弱读成 /tə/。", sentence: "Nice to meet you. What are you majoring in?", sentenceZh: "很高兴认识你。你主修什么专业？" },
    { id: "s2", label: "课堂 · Could you repeat…", word: "Could you repeat that?", ipa: "/kʊd ju rɪˈpiːt ðæt/", zh: "你能再说一遍吗？", tip: "Could you 比 Can you 稍客气。", sentence: "Sorry—could you repeat that more slowly?", sentenceZh: "抱歉——你能再说慢一点吗？" },
    { id: "s3", label: "观点 · In my opinion", word: "In my opinion", ipa: "/ɪn maɪ əˈpɪnjən/", zh: "在我看来", tip: "opinion 重音在 -pin-。", sentence: "In my opinion, this metaphor is powerful.", sentenceZh: "在我看来，这个隐喻很有力量。" },
    { id: "s4", label: "澄清 · What do you mean", word: "What do you mean by…?", ipa: "/wɒt də ju ˈmiːn baɪ/", zh: "你说……是什么意思？", tip: "听不懂时礼貌追问。", sentence: "What do you mean by 'tone' in this text?", sentenceZh: "你说这篇文本里的 tone（语气）是什么意思？" },
    { id: "s5", label: "同意 · That makes sense", word: "That makes sense", ipa: "/ðæt meɪks sens/", zh: "有道理；明白了", tip: "makes 词尾 /s/；sense /sens/。", sentence: "Oh, that makes sense. Thanks for explaining.", sentenceZh: "哦，明白了。谢谢你解释。" },
    { id: "s6", label: "请求 · Could you explain", word: "Could you explain…?", ipa: "/kʊd ju ɪkˈspleɪn/", zh: "你能解释一下……吗？", tip: "explain 重音在 -plain。", sentence: "Could you explain this metaphor again?", sentenceZh: "你能再解释一下这个隐喻吗？" },
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
      .map((item) => `<button type="button" class="chip ${item.id === currentPronounce.id ? "active" : ""}" data-pronounce="${item.id}">${escapeHtml(item.label)}</button>`)
      .join("");
    row.querySelectorAll("[data-pronounce]").forEach((btn) => {
      btn.addEventListener("click", () => {
        currentPronounce = pronounceItems.find((x) => x.id === btn.dataset.pronounce) || pronounceItems[0];
        updatePronouncePanel();
        renderPronounceChips();
      });
    });
  }

  function updatePronouncePanel() {
    const w = document.getElementById("p-word");
    const ipa = document.getElementById("p-ipa");
    const zhEl = document.getElementById("p-zh");
    const tip = document.getElementById("p-tip");
    const sent = document.getElementById("p-sentence");
    const sz = document.getElementById("p-sentence-zh");
    if (w) w.textContent = currentPronounce.word;
    if (ipa) ipa.textContent = currentPronounce.ipa;
    if (zhEl) zhEl.innerHTML = `<span class="gloss-label">释义</span><span class="gloss-text">${escapeHtml(currentPronounce.zh || "—")}</span>`;
    if (tip) tip.textContent = currentPronounce.tip;
    if (sent) sent.textContent = currentPronounce.sentence;
    if (sz) sz.textContent = currentPronounce.sentenceZh || "";
    const status = document.getElementById("pronounce-status");
    if (status) status.textContent = "选择条目后，可听提示、录音并对比。";
    const score = document.getElementById("mock-score");
    if (score) score.textContent = "—";
    if (recordedUrl) {
      URL.revokeObjectURL(recordedUrl);
      recordedUrl = null;
    }
  }

  function speakStatusEl() {
    return document.getElementById("pronounce-status") || document.getElementById("vocab-speak-status");
  }

  async function speakText(text) {
    const status = speakStatusEl();
    const TTS = window.KouyuTTS;
    if (!TTS) {
      if (status) status.textContent = "发音模块未加载。";
      toast("发音模块未加载");
      return;
    }
    try {
      await TTS.speak(text, {
        lang: "en-US",
        rate: 0.88,
        pitch: 1.02,
        onStatus: (msg) => {
          if (status) status.textContent = msg;
        },
      });
    } catch (e) {
      const msg = "发音失败：" + (e && e.message ? e.message : "请换浏览器或检查网络");
      if (status) status.textContent = msg;
      toast(msg);
    }
  }

  document.getElementById("btn-play-original")?.addEventListener("click", () => {
    speakText(currentPronounce.sentence || currentPronounce.word);
    state.tasks.shadow = true;
    persist();
  });

  async function startRecording() {
    const status = document.getElementById("pronounce-status");
    const btn = document.getElementById("btn-record");
    recordedChunks = [];
    if (!navigator.mediaDevices?.getUserMedia) {
      isRecording = true;
      btn?.classList.add("recording");
      if (btn) btn.textContent = "⏹ 停止（模拟）";
      if (status) status.textContent = "模拟录音中…再点一次结束。";
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
        if (status) status.textContent = "录音完成！可播放对比。";
        const scoreEl = document.getElementById("mock-score");
        if (scoreEl) scoreEl.textContent = String(72 + Math.floor(Math.random() * 24));
        state.tasks.pronounce = true;
        persist();
      };
      mediaRecorder.start();
      isRecording = true;
      btn?.classList.add("recording");
      if (btn) btn.textContent = "⏹ 停止录音";
      if (status) status.textContent = "录音中…";
    } catch {
      isRecording = true;
      btn?.classList.add("recording");
      if (btn) btn.textContent = "⏹ 停止（模拟）";
      if (status) status.textContent = "无法使用麦克风，已切换模拟。";
    }
  }

  function stopRecording() {
    const btn = document.getElementById("btn-record");
    const status = document.getElementById("pronounce-status");
    isRecording = false;
    btn?.classList.remove("recording");
    if (btn) btn.textContent = "🎤 开始录音";
    if (mediaRecorder && mediaRecorder.state !== "inactive") {
      mediaRecorder.stop();
      mediaRecorder = null;
      return;
    }
    if (status) status.textContent = "模拟录音完成。";
    const scoreEl = document.getElementById("mock-score");
    if (scoreEl) scoreEl.textContent = String(78 + Math.floor(Math.random() * 18));
    state.tasks.pronounce = true;
    persist();
  }

  document.getElementById("btn-record")?.addEventListener("click", () => {
    if (isRecording) stopRecording();
    else startRecording();
  });

  document.getElementById("btn-play-mine")?.addEventListener("click", () => {
    const status = document.getElementById("pronounce-status");
    if (recordedUrl) new Audio(recordedUrl).play();
    else if (status) status.textContent = "还没有录音。";
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
      persist();
    }
    toast(exists ? "错音本里已有" : "已加入错音本");
  });

  document.getElementById("btn-claim-pronounce")?.addEventListener("click", () => claimModule("pronounce"));

  // —— Chat ——
  const cannedReplies = [
    { test: /hello|hi\b|hey|你好/i, reply: "教练 ee：Hi! Great to see you.\n\"Hi! I'm practicing English today.\"\n\n📌 practice — 练习 · today — 今天" },
    { test: /how are you|how's it going/i, reply: "教练 ee：Nice!\n\"I'm good, thanks! A bit tired but excited to practice.\"\n\n📌 excited — 兴奋的；期待的 · tired — 累的" },
    { test: /i go to school yesterday|昨天|went to/i, reply: "教练 ee：时态修正：\n❌ I go … yesterday\n✅ I went to school yesterday.\n\n📌 went — go 的过去式 · yesterday — 昨天" },
    { test: /think|纠音|发音|\/θ\//i, reply: "教练 ee：think /θɪŋk/ — 想；认为\n舌尖在齿间吹气。\n\"I think this Thursday is free.\"" },
    { test: /discuss|argue|essay|presentation|paraphrase|论文|汇报|改述/i, reply: "教练 ee：学术词速记\n• discuss — 讨论\n• argue — 论证；主张\n• paraphrase — 改述；释义\n• essay — 短文；课程论文\n• presentation — 演示；汇报\n• thesis — 论点；学位论文" },
    { test: /foreigner|外国人|交流|conversation|流利|fluent/i, reply: "教练 ee：交流救命句\n• Could you repeat that? — 你能再说一遍吗？\n• What do you mean by…? — 你说……是什么意思？\n• I'm not sure I follow. — 我好像没跟上\n• In my opinion… — 在我看来……\n• That makes sense. — 有道理；明白了" },
    { test: /help|帮助|不会|怎么说/i, reply: "教练 ee：How do you say … in English? — ……用英语怎么说？\n也可以：What's the English for …?" },
    { test: /introduce|介绍|myself|自我/i, reply: "教练 ee：自我介绍模板\n\"Hi, I'm … I'm an English major. I love reading and practicing speaking.\"\n\n📌 major — 专业 · practicing — 练习中" },
    { test: /metaphor|theme|literature|文学|隐喻|主题/i, reply: "教练 ee：文学小词\n• literature — 文学\n• theme — 主题\n• metaphor — 隐喻\n• character — 人物\n• tone — 语气；基调\n试着说：The theme of this poem is hope." },
    { test: /thank|谢谢|thanks/i, reply: "教练 ee：You're welcome!\n也可以说：No problem. / Anytime.\n\n📌 welcome — 别客气 · anytime — 随时都可以" },
    { test: /weather|天气|fine day/i, reply: "教练 ee：It's a lovely day today!\n\"The weather is nice, so I'm in a good mood for study.\"\n\n📌 weather — 天气 · mood — 心情" },
    { test: /hobby|兴趣|喜欢|love reading/i, reply: "教练 ee：Hobbies\n\"I enjoy reading novels and watching Crash Course videos.\"\n\n📌 enjoy — 享受；喜欢 · novel — 小说" },
  ];
  const defaultCoachReply = "教练 ee：收到！试着写完整句子，例如：\n\"Yesterday I went to the library.\"\n\n📌 library — 图书馆 · yesterday — 昨天";

  function appendBubble(who, text) {
    const log = document.getElementById("chat-log");
    if (!log) return;
    const div = document.createElement("div");
    div.className = `bubble ${who}`;
    div.innerHTML = `<div class="who">${who === "bot" ? "教练 ee" : "妹妹"}</div>${escapeHtml(text)}`;
    log.appendChild(div);
    log.scrollTop = log.scrollHeight;
  }

  function coachReply(userText) {
    for (const item of cannedReplies) {
      if (item.test.test(userText)) return item.reply;
    }
    return defaultCoachReply;
  }

  const chatHistory = [];

  async function sendChat(text) {
    const trimmed = (text || "").trim();
    if (!trimmed) return;
    appendBubble("user", trimmed);
    chatHistory.push({ role: "user", content: trimmed });
    state.tasks.output = true;
    persist();

    let reply = null;
    const cfg = Cloud ? Cloud.loadCloud() : null;
    if (cfg && Cloud && (Cloud.normalizeBase(cfg.apiBase) || Cloud.DEFAULT_API_BASE)) {
      appendBubble("bot", "教练 ee 思考中…");
      const thinking = document.getElementById("chat-log")?.lastElementChild;
      try {
        const data = await Cloud.eeChat(chatHistory.slice(-12), "妹妹");
        if (data && data.reply) {
          reply = data.reply;
          if (data.engine && data.engine !== "rules") {
            reply += `\n\n（引擎：${data.engine}）`;
          }
        }
      } catch {
        reply = null;
      }
      if (thinking) thinking.remove();
    }

    if (!reply) reply = coachReply(trimmed);
    chatHistory.push({ role: "assistant", content: reply });
    appendBubble("bot", reply);
    claimModule("chat", { silent: true });
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

  // —— Knowledge ——
  const lessons = {
    cell: {
      title: "What is a cell?（细胞是什么？）",
      step1: "A cell is the basic unit of life. All living things are made of cells. Some tiny living things have only one cell. Plants and animals have many cells.",
      step1Zh: "细胞是生命的基本单位。所有生物都由细胞构成。有些微小生物只有一个细胞。植物和动物有许多细胞。",
      phrases: [
        { en: "basic unit of life", zh: "生命的基本单位" },
        { en: "living things", zh: "生物；有生命的事物" },
        { en: "made of cells", zh: "由细胞构成" },
        { en: "plants and animals", zh: "植物和动物" },
      ],
      retell: "用英语复述：细胞是什么？尽量用上 basic unit / living things。",
    },
    llm: {
      title: "What is an LLM?（大模型是什么？）",
      step1: "An LLM is a Large Language Model. It is a kind of AI. It reads lots of text and learns patterns. Then it can write sentences, answer questions, and help you practice English.",
      step1Zh: "LLM 是大型语言模型。它是一种人工智能。它阅读大量文本并学习模式。然后它可以写句子、回答问题，并帮你练习英语。",
      phrases: [
        { en: "large language model", zh: "大型语言模型" },
        { en: "kind of AI", zh: "一种人工智能" },
        { en: "learn patterns", zh: "学习模式/规律" },
        { en: "answer questions", zh: "回答问题" },
      ],
      retell: "用英语复述：大模型是什么？可以说 It is an AI that...",
    },
    python: {
      title: "Hello, Python!（你好，Python！）",
      step1: 'Python is a popular programming language. It is friendly for beginners. You can write print("Hello") to show a message. People use Python for websites, data, and AI.',
      step1Zh: "Python 是一种流行的编程语言。它对初学者很友好。你可以写 print(\"Hello\") 来显示一条消息。人们用 Python 做网站、数据和人工智能。",
      phrases: [
        { en: "programming language", zh: "编程语言" },
        { en: "friendly for beginners", zh: "对初学者友好" },
        { en: "print a message", zh: "打印/显示一条消息" },
        { en: "used for AI", zh: "用于人工智能" },
      ],
      retell: "用英语复述：Python 是什么？为什么适合初学者？",
    },
    literature: {
      title: "What is literature?（文学是什么？）",
      step1: "Literature means written works with artistic value — poems, novels, and plays. When we study literature, we discuss themes, characters, and the writer's style. It also helps us understand culture and history.",
      step1Zh: "文学指具有艺术价值的书面作品——诗歌、小说和戏剧。学习文学时，我们讨论主题、人物和作者风格。它也帮助我们理解文化与历史。",
      phrases: [
        { en: "artistic value", zh: "艺术价值" },
        { en: "discuss themes", zh: "讨论主题" },
        { en: "writer's style", zh: "作者的风格" },
        { en: "understand culture", zh: "理解文化" },
      ],
      retell: "用英语复述：文学是什么？可提到 poems / novels / themes。",
    },
  };

  let currentLesson = "cell";

  function renderLesson() {
    const L = lessons[currentLesson];
    if (!L) return;
    const title = document.getElementById("lesson-title");
    const enEl = document.getElementById("lesson-en");
    if (title) title.textContent = L.title;
    if (enEl) enEl.innerHTML = `${escapeHtml(L.step1)}<span class="lesson-zh-block">${escapeHtml(L.step1Zh || "")}</span>`;
    const phrasesEl = document.getElementById("lesson-phrases");
    if (phrasesEl) {
      phrasesEl.innerHTML = L.phrases
        .map((p) => `<span class="phrase-chip"><strong>${escapeHtml(p.en)}</strong><em>${escapeHtml(p.zh)}</em></span>`)
        .join("");
    }
    const prompt = document.getElementById("lesson-retell-prompt");
    if (prompt) prompt.textContent = L.retell;
    const retell = document.getElementById("retell-text");
    if (retell) retell.value = state.retells[currentLesson] || "";
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
    speakText(L.phrases.map((p) => p.en).join(". "));
    state.tasks.shadow = true;
    persist();
  });

  document.getElementById("btn-save-retell")?.addEventListener("click", () => {
    const text = document.getElementById("retell-text").value.trim();
    const status = document.getElementById("retell-status");
    if (!text) {
      if (status) status.textContent = "先写一两句英文再保存哦。";
      return;
    }
    state.retells[currentLesson] = text;
    state.tasks.input = true;
    state.tasks.output = true;
    persist();
    claimModule("knowledge");
    if (status) status.textContent = "已保存复述。";
  });

  // —— Vocab ——
  const vocabThemes = [
    {
      id: "campus-talk",
      title: "校园交流 · Campus Talk",
      tag: "校园",
      words: [
        { word: "major", ipa: "/ˈmeɪdʒər/", zh: "专业；主修", exampleEn: "I'm an English major.", exampleZh: "我是英语专业的。" },
        { word: "discuss", ipa: "/dɪˈskʌs/", zh: "讨论", exampleEn: "Let's discuss this chapter.", exampleZh: "我们来讨论这一章。" },
        { word: "presentation", ipa: "/ˌprezənˈteɪʃn/", zh: "演示；汇报", exampleEn: "I gave a presentation today.", exampleZh: "我今天做了一场汇报。" },
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
      tag: "学术",
      words: [
        { word: "argue", ipa: "/ˈɑːrɡjuː/", zh: "论证；主张", exampleEn: "She argues that context matters.", exampleZh: "她主张语境很重要。" },
        { word: "paraphrase", ipa: "/ˈpærəfreɪz/", zh: "改述；释义", exampleEn: "Please paraphrase this line.", exampleZh: "请改述这一行。" },
        { word: "summarize", ipa: "/ˈsʌməraɪz/", zh: "总结", exampleEn: "Summarize the main idea.", exampleZh: "总结一下主旨。" },
        { word: "analyze", ipa: "/ˈænəlaɪz/", zh: "分析", exampleEn: "Analyze the character's choice.", exampleZh: "分析这个人物的选择。" },
        { word: "thesis", ipa: "/ˈθiːsɪs/", zh: "论点；学位论文", exampleEn: "What is your thesis statement?", exampleZh: "你的中心论点是什么？" },
        { word: "evidence", ipa: "/ˈevɪdəns/", zh: "证据；依据", exampleEn: "Support your claim with evidence.", exampleZh: "用证据支撑你的观点。" },
        { word: "metaphor", ipa: "/ˈmetəfɔːr/", zh: "隐喻", exampleEn: "This metaphor is vivid.", exampleZh: "这个隐喻很生动。" },
        { word: "context", ipa: "/ˈkɑːntekst/", zh: "语境；上下文", exampleEn: "Read the word in context.", exampleZh: "在语境中理解这个词。" },
        { word: "perspective", ipa: "/pərˈspektɪv/", zh: "视角；看法", exampleEn: "From another perspective…", exampleZh: "从另一个视角来看……" },
        { word: "essay", ipa: "/ˈeseɪ/", zh: "短文；课程论文", exampleEn: "I'm writing an essay on tone.", exampleZh: "我在写一篇关于语气的论文。" },
      ],
    },
    {
      id: "conversation",
      title: "对外交流 · Real Conversation",
      tag: "交流",
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
      tag: "日常",
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
    {
      id: "linguistics",
      title: "语言学入门 · Linguistics Lite",
      tag: "语言学",
      words: [
        { word: "phonetics", ipa: "/fəˈnetɪks/", zh: "语音学", exampleEn: "Phonetics helps us study speech sounds.", exampleZh: "语音学帮助我们研究语音。" },
        { word: "phonology", ipa: "/fəˈnɒlədʒi/", zh: "音系学", exampleEn: "Phonology looks at sound patterns in a language.", exampleZh: "音系学研究一种语言里的语音模式。" },
        { word: "syntax", ipa: "/ˈsɪntæks/", zh: "句法", exampleEn: "Syntax is about how we build sentences.", exampleZh: "句法讲的是我们如何组句。" },
        { word: "semantics", ipa: "/sɪˈmæntɪks/", zh: "语义学", exampleEn: "Semantics studies meaning.", exampleZh: "语义学研究意义。" },
        { word: "pragmatics", ipa: "/præɡˈmætɪks/", zh: "语用学", exampleEn: "Pragmatics asks how context changes meaning.", exampleZh: "语用学追问语境如何改变意义。" },
        { word: "morpheme", ipa: "/ˈmɔːrfiːm/", zh: "语素", exampleEn: "A morpheme is the smallest unit of meaning.", exampleZh: "语素是最小的意义单位。" },
        { word: "dialect", ipa: "/ˈdaɪəlekt/", zh: "方言", exampleEn: "Every dialect has its own charm.", exampleZh: "每一种方言都有自己的魅力。" },
        { word: "register", ipa: "/ˈredʒɪstər/", zh: "语域；语体", exampleEn: "Academic writing uses a formal register.", exampleZh: "学术写作使用正式语体。" },
        { word: "intonation", ipa: "/ˌɪntəˈneɪʃn/", zh: "语调", exampleEn: "Rising intonation can mark a question.", exampleZh: "升调可以标记疑问。" },
        { word: "stress", ipa: "/stres/", zh: "重音；重读", exampleEn: "Word stress changes in 'photograph' and 'photography'.", exampleZh: "photograph 与 photography 的词重音不同。" },
      ],
    },
    {
      id: "writing-class",
      title: "写作课 · Writing Workshop",
      tag: "写作",
      words: [
        { word: "outline", ipa: "/ˈaʊtlaɪn/", zh: "提纲；概述", exampleEn: "First, write an outline for your essay.", exampleZh: "先为论文写一个提纲。" },
        { word: "draft", ipa: "/dræft/", zh: "草稿", exampleEn: "This is only my first draft.", exampleZh: "这只是我的初稿。" },
        { word: "revise", ipa: "/rɪˈvaɪz/", zh: "修改；修订", exampleEn: "I need to revise the conclusion.", exampleZh: "我需要修改结论部分。" },
        { word: "citation", ipa: "/saɪˈteɪʃn/", zh: "引用；文献标注", exampleEn: "Add a citation for that quote.", exampleZh: "给那句引文加上文献标注。" },
        { word: "plagiarism", ipa: "/ˈpleɪdʒərɪzəm/", zh: "抄袭；剽窃", exampleEn: "Paraphrasing helps you avoid plagiarism.", exampleZh: "改述有助于避免抄袭。" },
        { word: "coherence", ipa: "/koʊˈhɪrəns/", zh: "连贯性", exampleEn: "Good essays need coherence between paragraphs.", exampleZh: "好的论文需要段落之间的连贯。" },
        { word: "transition", ipa: "/trænˈzɪʃn/", zh: "过渡；衔接", exampleEn: "Use transition words like 'however'.", exampleZh: "使用 however 这类过渡词。" },
        { word: "conclusion", ipa: "/kənˈkluːʒn/", zh: "结论", exampleEn: "Restate your thesis in the conclusion.", exampleZh: "在结论里重述你的论点。" },
        { word: "paragraph", ipa: "/ˈpærəɡræf/", zh: "段落", exampleEn: "Each paragraph should have one main idea.", exampleZh: "每个段落应有一个中心意思。" },
        { word: "audience", ipa: "/ˈɔːdiəns/", zh: "读者；听众", exampleEn: "Think about your audience when you write.", exampleZh: "写作时想想你的读者是谁。" },
      ],
    },
    {
      id: "social-talk",
      title: "社交口语 · Social English",
      tag: "社交",
      words: [
        { word: "catch up", ipa: "/kætʃ ʌp/", zh: "叙旧；赶上", exampleEn: "Let's catch up this weekend.", exampleZh: "这周末我们叙叙旧吧。" },
        { word: "hang out", ipa: "/hæŋ aʊt/", zh: "一起闲逛；聚会", exampleEn: "Do you want to hang out after class?", exampleZh: "下课要不要一起逛逛？" },
        { word: "I'm tied up", ipa: "/aɪm taɪd ʌp/", zh: "我抽不开身；有事忙", exampleEn: "Sorry, I'm tied up tonight.", exampleZh: "抱歉，我今晚抽不开身。" },
        { word: "rain check", ipa: "/reɪn tʃek/", zh: "改天再约", exampleEn: "Can I take a rain check?", exampleZh: "能改天再约吗？" },
        { word: "my treat", ipa: "/maɪ triːt/", zh: "我请客", exampleEn: "Coffee is my treat today.", exampleZh: "今天咖啡我请客。" },
        { word: "Congrats", ipa: "/kənˈɡræts/", zh: "恭喜（口语）", exampleEn: "Congrats on your exam!", exampleZh: "恭喜你考试顺利！" },
        { word: "No worries", ipa: "/noʊ ˈwʌriz/", zh: "没事；别担心", exampleEn: "No worries—I can wait.", exampleZh: "没事——我可以等。" },
        { word: "Sounds good", ipa: "/saʊndz ɡʊd/", zh: "听起来不错", exampleEn: "Dinner at six? Sounds good!", exampleZh: "六点吃饭？听起来不错！" },
        { word: "I feel you", ipa: "/aɪ fiːl ju/", zh: "我懂你；感同身受", exampleEn: "Deadlines are hard. I feel you.", exampleZh: "截止日期真难熬。我懂你。" },
        { word: "Keep in touch", ipa: "/kiːp ɪn tʌtʃ/", zh: "保持联系", exampleEn: "It was nice talking. Keep in touch!", exampleZh: "聊得很开心。保持联系！" },
      ],
    },
    {
      id: "interview",
      title: "面试与介绍 · Intro & Interview",
      tag: "面试",
      words: [
        { word: "strength", ipa: "/streŋθ/", zh: "优点；长处", exampleEn: "My strength is careful reading.", exampleZh: "我的长处是细读文本。" },
        { word: "weakness", ipa: "/ˈwiːknəs/", zh: "弱点；不足", exampleEn: "My weakness is speaking too softly.", exampleZh: "我的不足是说话声音偏小。" },
        { word: "goal", ipa: "/ɡoʊl/", zh: "目标", exampleEn: "My goal is to become a translator.", exampleZh: "我的目标是成为翻译。" },
        { word: "internship", ipa: "/ˈɪntɜːrnʃɪp/", zh: "实习", exampleEn: "I did an internship at a publishing house.", exampleZh: "我在一家出版社实习过。" },
        { word: "teamwork", ipa: "/ˈtiːmwɜːrk/", zh: "团队合作", exampleEn: "I learned teamwork in group projects.", exampleZh: "我在小组项目中学会了团队合作。" },
        { word: "responsibility", ipa: "/rɪˌspɑːnsəˈbɪləti/", zh: "责任", exampleEn: "I take responsibility for my mistakes.", exampleZh: "我对自己的错误负责。" },
        { word: "available", ipa: "/əˈveɪləbl/", zh: "有空的；可到岗的", exampleEn: "I'm available from next Monday.", exampleZh: "我下周一起可以到岗。" },
        { word: "background", ipa: "/ˈbækɡraʊnd/", zh: "背景", exampleEn: "My academic background is English.", exampleZh: "我的学术背景是英语。" },
        { word: "contribution", ipa: "/ˌkɑːntrɪˈbjuːʃn/", zh: "贡献", exampleEn: "What contribution can you make?", exampleZh: "你能做出什么贡献？" },
        { word: "Looking forward to", ipa: "/ˈlʊkɪŋ ˈfɔːrwərd tu/", zh: "期待……", exampleEn: "I'm looking forward to your reply.", exampleZh: "期待你的回复。" },
      ],
    },
  ];

  function getTodayTheme() {
    return vocabThemes[dayOfYear() % vocabThemes.length];
  }

  function getActiveVocabTheme() {
    if (state.selectedVocabThemeId) {
      const found = vocabThemes.find((t) => t.id === state.selectedVocabThemeId);
      if (found) return found;
    }
    return getTodayTheme();
  }

  function vocabCardHtml(item) {
    return `<article class="vocab-card">
      <div class="vocab-head">
        <strong class="vocab-word">${escapeHtml(item.word)}</strong>
        <span class="vocab-ipa">${escapeHtml(item.ipa)}</span>
      </div>
      <div class="vocab-zh"><span class="gloss-label">释义</span><span class="gloss-text">${escapeHtml(item.zh)}</span></div>
      <div class="vocab-ex"><div class="en">${escapeHtml(item.exampleEn)}</div><div class="zh">${escapeHtml(item.exampleZh)}</div></div>
      <button type="button" class="btn btn-ghost btn-sm vocab-speak" data-speak="${escapeAttr(item.word)}">🔊 听发音</button>
    </article>`;
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
    if (themeEl) themeEl.textContent = `今日轮换：${theme.title} · ${theme.tag}`;
    root.innerHTML = theme.words.slice(0, 4).map((w) => vocabCardHtml(w)).join("");
    bindVocabSpeak(root);
  }

  function renderVocabPage() {
    const root = document.getElementById("vocab-full-list");
    const themeEl = document.getElementById("vocab-page-theme");
    const hint = document.getElementById("vocab-page-hint");
    if (!root) return;
    const theme = getActiveVocabTheme();
    if (themeEl) themeEl.textContent = theme.title;
    if (hint) hint.textContent = `主题「${theme.tag}」· 共 ${theme.words.length} 条 · 每条释义相互独立`;
    root.innerHTML = theme.words.map((w) => vocabCardHtml(w)).join("");
    bindVocabSpeak(root);
    const switcher = document.getElementById("vocab-theme-switch");
    if (switcher) {
      switcher.innerHTML = vocabThemes
        .map((t) => `<button type="button" class="chip ${t.id === theme.id ? "active" : ""}" data-theme-id="${t.id}">${escapeHtml(t.tag)}</button>`)
        .join("");
      switcher.querySelectorAll("[data-theme-id]").forEach((btn) => {
        btn.addEventListener("click", () => {
          state.selectedVocabThemeId = btn.dataset.themeId;
          persist();
          renderVocabPage();
        });
      });
    }
  }

  document.getElementById("btn-add-today-vocab-review")?.addEventListener("click", () => {
    const theme = getActiveVocabTheme();
    let added = 0;
    theme.words.forEach((w) => {
      if (state.wrongBook.some((c) => c.word === w.word)) return;
      state.wrongBook.push({
        id: "vocab-" + w.word + "-" + Date.now() + Math.random(),
        word: w.word,
        ipa: w.ipa,
        zh: w.zh,
        tip: `发音提示：对照 IPA ${w.ipa}`,
        exampleEn: w.exampleEn,
        exampleZh: w.exampleZh,
        due: 0,
      });
      added++;
    });
    persist();
    const status = document.getElementById("vocab-add-status");
    if (status) status.textContent = added ? `已加入 ${added} 个词` : "这些词已在复习本里";
  });

  document.getElementById("btn-claim-vocab")?.addEventListener("click", () => claimModule("vocab"));

  // —— Review ——
  function renderReview() {
    const card = document.getElementById("flashcard");
    const empty = document.getElementById("review-empty");
    const srs = document.getElementById("srs-row");
    if (!card || !empty || !srs) return;
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
    if (zhEl) zhEl.innerHTML = `<span class="gloss-label">释义</span><span class="gloss-text">${escapeHtml(item.zh || "（暂无）")}</span>`;
    const tipParts = [];
    if (item.tip) tipParts.push(item.tip);
    if (item.exampleEn) tipParts.push(`例句：${item.exampleEn}`);
    if (item.exampleZh) tipParts.push(`译文：${item.exampleZh}`);
    document.getElementById("fc-tip").textContent = tipParts.join("\n") || "（暂无提示）";
    document.getElementById("review-count").textContent = `妹妹 · ${state.reviewIndex + 1} / ${state.wrongBook.length}`;
  }

  function toggleFlashcard() {
    document.getElementById("flashcard")?.classList.toggle("revealed");
  }

  document.getElementById("flashcard")?.addEventListener("click", toggleFlashcard);
  document.getElementById("flashcard")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      toggleFlashcard();
    }
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
    persist();
    renderReview();
  }

  document.getElementById("btn-again")?.addEventListener("click", () => srsRate("again"));
  document.getElementById("btn-hard")?.addEventListener("click", () => srsRate("hard"));
  document.getElementById("btn-good")?.addEventListener("click", () => srsRate("good"));
  document.getElementById("btn-claim-review")?.addEventListener("click", () => claimModule("review"));

  // —— Init ——
  Ad.bindAdmin();
  bindCloudSettings();
  if (Cloud && Gm.EE_CONFIG) {
    const c = Cloud.loadCloud();
    const base = Cloud.normalizeBase(c.apiBase) || Cloud.DEFAULT_API_BASE;
    if (!Cloud.normalizeBase(c.apiBase)) {
      c.apiBase = Cloud.DEFAULT_API_BASE;
      Cloud.saveCloud(c);
    }
    Gm.EE_CONFIG.apiEndpoint = base + "/api/ee/tasks/generate";
    Gm.EE_CONFIG.mode = "api";
  }
  renderPronounceChips();
  updatePronouncePanel();
  renderLesson();
  navigate(location.hash || "#home");
  requestAnimationFrame(() => {
    document.getElementById("boot-loading")?.classList.add("hidden");
  });
})();
