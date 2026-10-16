/* 口语小站 · 哥哥管理端 */
(function (global) {
  "use strict";

  const S = () => global.KouyuStorage;
  const G = () => global.KouyuGame;

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

  function getSisterViewState() {
    const St = S();
    const admin = St.loadAdmin();
    // Same browser: live sister profile
    const live = St.loadProfileState(St.SISTER_ID);
    // If brother imported a snapshot and it's newer, prefer showing snapshot note + merge display
    return {
      live,
      snapshot: admin.importedSisterSnapshot,
      using: "live", // always show live when on same device; snapshot is backup view
    };
  }

  function sisterDisplayState() {
    const St = S();
    const admin = St.loadAdmin();
    const live = St.loadProfileState(St.SISTER_ID);
    const snap = admin.importedSisterSnapshot;
    const liveActive = (live.xp || 0) > 0 || (live.gameTasks || []).some((t) => t.done) || live.lastCheckInDate;
    // If snapshot came from cloud and is newer by exportedAt, prefer it for display when brother is on another device
    if (snap && snap.state && snap.fromCloud) {
      const label =
        "云端拉取（" + (snap.exportedAt || "").slice(0, 19).replace("T", " ") + "）";
      // Same device with live activity: still show live, note cloud available
      if (liveActive) return { state: live, source: "本机妹妹档案（实时；亦可云端拉取）" };
      return { state: St.normalizeState(snap.state), source: label };
    }
    if (liveActive) return { state: live, source: "本机妹妹档案（实时）" };
    if (snap && snap.state) {
      return {
        state: St.normalizeState(snap.state),
        source: "已导入的同步包（" + (snap.exportedAt || "").slice(0, 16) + "）",
      };
    }
    return { state: live, source: "本机妹妹档案（暂无学习记录时可导入同步包 / 云端拉取）" };
  }

  function showAdminLogin() {
    const setup = document.getElementById("admin-setup");
    const login = document.getElementById("admin-login");
    const dash = document.getElementById("admin-dashboard");
    const admin = S().loadAdmin();
    if (setup) setup.style.display = admin.setupDone ? "none" : "block";
    if (login) login.style.display = admin.setupDone ? "block" : "none";
    if (dash) dash.style.display = "none";
  }

  function showAdminDash() {
    const setup = document.getElementById("admin-setup");
    const login = document.getElementById("admin-login");
    const dash = document.getElementById("admin-dashboard");
    if (setup) setup.style.display = "none";
    if (login) login.style.display = "none";
    if (dash) dash.style.display = "block";
    const Cloud = global.KouyuCloud;
    if (Cloud) {
      const cfg = Cloud.loadCloud();
      const codeEl = document.getElementById("adm-cloud-family-code");
      const baseEl = document.getElementById("adm-cloud-api-base");
      if (codeEl && !codeEl.value) codeEl.value = cfg.familyCode || "";
      if (baseEl) baseEl.value = cfg.apiBase || Cloud.DEFAULT_API_BASE;
    }
    renderDashboard();
  }

  function enterAdminShell() {
    document.getElementById("shell-learn")?.classList.add("hidden");
    document.getElementById("shell-admin")?.classList.remove("hidden");
    document.body.classList.add("mode-admin");
    document.querySelector(".bottom-nav")?.classList.add("hidden");
    if (S().isAdminSession()) showAdminDash();
    else showAdminLogin();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function leaveAdminShell() {
    S().setAdminSession(false);
    document.getElementById("shell-admin")?.classList.add("hidden");
    document.getElementById("shell-learn")?.classList.remove("hidden");
    document.body.classList.remove("mode-admin");
    document.querySelector(".bottom-nav")?.classList.remove("hidden");
    location.hash = "#home";
  }

  function renderDashboard() {
    const { state, source } = sisterDisplayState();
    const prog = G().xpProgress(state.xp || 0);
    const Cloud = global.KouyuCloud;
    const set = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.textContent = val;
    };
    set("adm-source", source);
    set("adm-level", String(state.level || G().levelFromXp(state.xp)));
    set("adm-xp", String(state.xp || 0));
    set("adm-streak", String(state.streak || 0));
    set("adm-xp-bar-label", `${prog.into} / ${prog.need} XP 升下一级`);
    const bar = document.getElementById("adm-xp-bar");
    if (bar) bar.style.width = `${prog.pct}%`;

    const tasks = state.gameTasks || [];
    const done = tasks.filter((t) => t.done).length;
    const total = tasks.length;
    const rate = total ? Math.round((done / total) * 100) : 0;
    set("adm-task-summary", `${done} / ${total} 任务已完成（完成率 ${rate}%）`);
    const rateBar = document.getElementById("adm-task-rate-bar");
    if (rateBar) rateBar.style.width = `${rate}%`;
    set("adm-task-rate-label", total ? `今日任务完成率 ${rate}%` : "暂无任务");
    const ring = document.getElementById("adm-task-ring");
    if (ring) {
      ring.style.setProperty("--pct", String(rate));
      ring.setAttribute("data-pct", total ? rate + "%" : "—");
      ring.classList.toggle("empty", !total);
    }
    const snapXp = document.getElementById("adm-snap-line");
    if (snapXp) {
      const chN = (state.challengeResults || []).length;
      const badgeN = (state.rewards || []).length;
      snapXp.textContent = `一屏速览：Lv.${state.level || 1} · ${state.xp || 0} XP · 🔥${state.streak || 0}天 · 任务 ${done}/${total}（${rate}%）· 测验 ${chN} 次 · 徽章 ${badgeN}`;
    }

    const taskList = document.getElementById("adm-task-list");
    if (taskList) {
      if (!tasks.length) {
        taskList.innerHTML = "<p class='hint'>暂无任务。ee 会在妹妹打开学习端时自动发每日任务；你也可以下方发布。</p>";
      } else {
        taskList.innerHTML = tasks
          .map(
            (t) =>
              `<li class="adm-task ${t.done ? "done" : ""}"><span class="tag">${t.source === "brother" ? "哥哥" : "ee"}</span> ${escapeHtml(t.title)} <em>+${t.xp}XP</em> ${t.done ? "✅" : "⏳"}</li>`
          )
          .join("");
      }
    }

    const rewards = state.rewards || [];
    const rewardEl = document.getElementById("adm-rewards");
    if (rewardEl) {
      rewardEl.innerHTML = rewards.length
        ? rewards.map((r) => `<span class="reward-chip">${r.emoji || "🏅"} ${escapeHtml(r.name)}</span>`).join("")
        : "<span class='hint'>暂无徽章</span>";
    }

    const challenges = state.challengeResults || [];
    const chEl = document.getElementById("adm-challenges");
    const summaryEl = document.getElementById("adm-challenge-summary");
    if (summaryEl) {
      if (!challenges.length) {
        summaryEl.innerHTML = "<p class='hint'>还没有测验记录。周 / 月 / 半年 / 年测通过后会出现在这里。</p>";
      } else {
        const byKind = {};
        challenges.forEach((c) => {
          const k = c.kind || "unknown";
          if (!byKind[k]) byKind[k] = [];
          byKind[k].push(c);
        });
        const kinds = ["weekly", "monthly", "halfyear", "yearly"];
        const chips = kinds
          .map((k) => {
            const list = byKind[k] || [];
            const meta = G().CHALLENGE_META[k] || { label: k, emoji: "📝" };
            if (!list.length) {
              return `<div class="adm-ch-chip muted">${meta.emoji} ${meta.label}<br><small>未测</small></div>`;
            }
            const best = list.reduce((a, b) => ((a.ratio || 0) >= (b.ratio || 0) ? a : b));
            const latest = list[0];
            const pct = Math.round((best.ratio || 0) * 100);
            const passN = list.filter((x) => x.passed).length;
            return `<div class="adm-ch-chip ${best.passed ? "pass" : "fail"}">${meta.emoji} ${meta.label}<br><strong>${pct}%</strong> 最佳 · ${passN}/${list.length} 过<br><small>最近 ${(latest.at || "").slice(0, 10)}</small></div>`;
          })
          .join("");
        const avg =
          Math.round(
            (challenges.reduce((s, c) => s + (c.ratio || 0), 0) / challenges.length) * 100
          ) || 0;
        const chron = [...challenges].reverse().slice(-12); // oldest→newest for trend
        const spark = chron.length
          ? `<div class="adm-spark" aria-label="测验得分趋势">${chron
              .map((c) => {
                const pct = Math.round((c.ratio || 0) * 100);
                const h = Math.max(8, Math.round((pct / 100) * 44));
                const cls = c.passed ? "pass" : "fail";
                return `<span class="adm-spark-bar ${cls}" style="height:${h}px" title="${pct}% · ${(c.at || "").slice(0, 10)}"></span>`;
              })
              .join("")}</div><p class="hint adm-spark-caption">得分趋势（近 ${chron.length} 次，左旧右新）</p>`
          : "";
        const ringPct = rate; // task completion already computed above — reuse for snapshot feel
        summaryEl.innerHTML =
          `<div class="adm-ch-summary-head">共 ${challenges.length} 次测验 · 平均得分 <strong>${avg}%</strong></div><div class="adm-ch-grid">${chips}</div>${spark}`;
      }
    }
    if (chEl) {
      if (!challenges.length) {
        chEl.innerHTML = "";
      } else {
        chEl.innerHTML = challenges
          .slice(0, 12)
          .map((c) => {
            const meta = G().CHALLENGE_META[c.kind] || { label: c.kind, emoji: "📝" };
            const pct = Math.round((c.ratio || 0) * 100);
            return `<li>${meta.emoji} ${meta.label} · ${c.correct}/${c.total}（${pct}%）${c.passed ? " · 通过" : " · 未过"} · +${c.xp}XP <small>${(c.at || "").slice(0, 16)}</small></li>`;
          })
          .join("");
      }
    }

    // Last sync time (cloud + snapshot)
    const syncEl = document.getElementById("adm-last-sync");
    if (syncEl && Cloud) {
      const cfg = Cloud.loadCloud();
      const snap = S().loadAdmin().importedSisterSnapshot;
      const parts = [];
      parts.push("云端状态：" + (cfg.lastSyncStatus || "—"));
      parts.push("上次同步：" + Cloud.formatSyncTime(cfg.lastSyncAt));
      if (cfg.lastPullAt) parts.push("上次拉取：" + Cloud.formatSyncTime(cfg.lastPullAt));
      if (snap && snap.exportedAt) {
        parts.push(
          "快照时间：" +
            Cloud.formatSyncTime(snap.exportedAt) +
            (snap.fromCloud ? "（云端）" : "（本地导入）")
        );
      }
      syncEl.textContent = parts.join(" · ");
    }

    const pub = S().loadAdmin().publishedTasks || [];
    const pubEl = document.getElementById("adm-published");
    if (pubEl) {
      pubEl.innerHTML = pub.length
        ? pub
            .map(
              (t) =>
                `<li><strong>${escapeHtml(t.title)}</strong> · +${t.xp}XP <button type="button" class="btn btn-ghost btn-sm" data-del-pub="${escapeHtml(t.id)}">删除</button></li>`
            )
            .join("")
        : "<p class='hint'>你还没发布过自定义任务。</p>";
      pubEl.querySelectorAll("[data-del-pub]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const admin = S().loadAdmin();
          admin.publishedTasks = (admin.publishedTasks || []).filter((t) => t.id !== btn.getAttribute("data-del-pub"));
          S().saveAdmin(admin);
          const st = S().loadProfileState(S().SISTER_ID);
          st.gameTasks = (st.gameTasks || []).filter((t) => t.id !== btn.getAttribute("data-del-pub") || t.done);
          S().saveProfileState(S().SISTER_ID, st);
          renderDashboard();
          toast("已删除该任务");
        });
      });
    }
  }

  function bindAdmin() {
    document.getElementById("btn-admin-setup")?.addEventListener("click", async () => {
      const p1 = document.getElementById("admin-setup-pass")?.value || "";
      const p2 = document.getElementById("admin-setup-pass2")?.value || "";
      if (p1.length < 4) {
        toast("密码至少 4 位（家庭演示用，请勿用银行卡密码）");
        return;
      }
      if (p1 !== p2) {
        toast("两次密码不一致");
        return;
      }
      await S().setupAdminPassword(p1);
      toast("管理密码已设置，已进入管理端");
      showAdminDash();
    });

    document.getElementById("btn-admin-login")?.addEventListener("click", async () => {
      const u = document.getElementById("admin-login-user")?.value || "brother";
      const p = document.getElementById("admin-login-pass")?.value || "";
      const ok = await S().verifyAdminPassword(u, p);
      if (!ok) {
        toast("账号或密码不对");
        return;
      }
      S().setAdminSession(true);
      toast("登录成功");
      showAdminDash();
    });

    document.getElementById("btn-admin-logout")?.addEventListener("click", () => {
      leaveAdminShell();
      toast("已退出管理端");
    });

    document.getElementById("btn-admin-back-learn")?.addEventListener("click", () => {
      document.getElementById("shell-admin")?.classList.add("hidden");
      document.getElementById("shell-learn")?.classList.remove("hidden");
      document.body.classList.remove("mode-admin");
      document.querySelector(".bottom-nav")?.classList.remove("hidden");
      // keep session so returning to #admin stays logged in
      location.hash = "#home";
    });

    document.getElementById("btn-publish-task")?.addEventListener("click", () => {
      const title = (document.getElementById("pub-title")?.value || "").trim();
      const xp = Number(document.getElementById("pub-xp")?.value) || 15;
      const link = document.getElementById("pub-link")?.value || "#home";
      const note = (document.getElementById("pub-note")?.value || "").trim();
      if (!title) {
        toast("请填写任务标题");
        return;
      }
      const admin = S().loadAdmin();
      const task = G().makeTask(
        {
          id: "brother-" + Date.now().toString(36),
          title,
          xp: Math.min(200, Math.max(5, xp)),
          link,
          note,
          type: "custom",
        },
        "brother"
      );
      admin.publishedTasks = admin.publishedTasks || [];
      admin.publishedTasks.unshift(task);
      S().saveAdmin(admin);
      // push into sister live profile
      const st = S().loadProfileState(S().SISTER_ID);
      G().mergeBrotherPublishedTasks(st, [task]);
      S().saveProfileState(S().SISTER_ID, st);
      document.getElementById("pub-title").value = "";
      document.getElementById("pub-note").value = "";
      renderDashboard();
      toast("已发布任务到妹妹任务列表");
    });

    document.getElementById("btn-import-sister")?.addEventListener("click", () => {
      document.getElementById("adm-import-file")?.click();
    });

    document.getElementById("adm-import-file")?.addEventListener("change", async (e) => {
      const file = e.target.files && e.target.files[0];
      e.target.value = "";
      if (!file) return;
      try {
        const data = JSON.parse(await file.text());
        if (!data || (data.kind !== "kouyu-xiaozhan-sister-sync" && data.kind !== "kouyu-xiaozhan-backup") || !data.state) {
          toast("请选择妹妹导出的同步 JSON");
          return;
        }
        const admin = S().loadAdmin();
        admin.importedSisterSnapshot = {
          exportedAt: data.exportedAt || new Date().toISOString(),
          profile: data.profile || null,
          state: data.state,
        };
        S().saveAdmin(admin);
        // Also offer to write into live sister slot for same-device continuity
        const writeLive = window.confirm(
          "同步包已保存到管理端。\n\n【确定】同时写入本机「妹妹」档案（覆盖本机妹妹数据）\n【取消】只在管理端查看快照，不改本机妹妹档案"
        );
        if (writeLive) {
          S().saveProfileState(S().SISTER_ID, S().normalizeState(data.state));
        }
        renderDashboard();
        toast(writeLive ? "已导入并写入本机妹妹档案" : "已导入快照（仅管理端查看）");
      } catch {
        toast("导入失败：无法解析文件");
      }
    });

    document.getElementById("btn-change-pass")?.addEventListener("click", async () => {
      const oldP = document.getElementById("adm-old-pass")?.value || "";
      const newP = document.getElementById("adm-new-pass")?.value || "";
      if (newP.length < 4) {
        toast("新密码至少 4 位");
        return;
      }
      const ok = await S().changeAdminPassword(oldP, newP);
      if (!ok) {
        toast("旧密码不对");
        return;
      }
      document.getElementById("adm-old-pass").value = "";
      document.getElementById("adm-new-pass").value = "";
      toast("密码已修改");
    });

    document.getElementById("btn-refresh-adm")?.addEventListener("click", () => {
      renderDashboard();
      toast("已刷新妹妹进度");
    });

    function setAdmCloudStatus(msg) {
      const el = document.getElementById("adm-cloud-status");
      if (el) el.textContent = msg;
    }

    document.getElementById("btn-cloud-init-family")?.addEventListener("click", async () => {
      const Cloud = global.KouyuCloud;
      if (!Cloud) {
        toast("云模块未加载");
        return;
      }
      const cfg = Cloud.loadCloud();
      if (!Cloud.normalizeBase(cfg.apiBase) || Cloud.normalizeCode(cfg.familyCode).length < 4) {
        toast("请先填写并保存：家庭同步码 + API Base（默认已填 Worker 地址）");
        setAdmCloudStatus("云端：未配置同步码或 API Base");
        return;
      }
      const admin = S().loadAdmin();
      if (!admin.setupDone || !admin.passwordHash) {
        toast("请先设置管理密码，再用同一哈希初始化家庭房间");
        return;
      }
      try {
        setAdmCloudStatus("云端：初始化中…");
        const data = await Cloud.initFamily(admin.passwordHash);
        setAdmCloudStatus(
          data.created
            ? "云端：家庭房间已创建"
            : data.reused
              ? "云端：家庭房间已存在（复用）"
              : "云端：家庭房间就绪"
        );
        toast("家庭房间已就绪");
        renderDashboard();
      } catch (e) {
        setAdmCloudStatus("云端：初始化失败 · " + (e.message || e));
        toast("初始化失败：" + (e.message || e));
      }
    });

    document.getElementById("btn-cloud-oneclick")?.addEventListener("click", async () => {
      const Cloud = global.KouyuCloud;
      if (!Cloud) {
        toast("云模块未加载");
        return;
      }
      const codeEl = document.getElementById("adm-cloud-family-code");
      const baseEl = document.getElementById("adm-cloud-api-base");
      const admin = S().loadAdmin();
      if (!admin.setupDone || !admin.passwordHash) {
        toast("请先设置管理密码，再一键初始化");
        return;
      }
      const familyCode =
        (codeEl && codeEl.value) ||
        Cloud.loadCloud().familyCode ||
        "";
      const apiBase =
        (baseEl && baseEl.value) ||
        Cloud.loadCloud().apiBase ||
        Cloud.DEFAULT_API_BASE;
      if (Cloud.normalizeCode(familyCode).length < 4) {
        toast("请填写家庭同步码（至少 4 位字母数字）");
        setAdmCloudStatus("云端：同步码不足 4 位");
        return;
      }
      setAdmCloudStatus("云端：一键连通中…");
      toast("正在测试连通并初始化家庭房间…");
      try {
        const result = await Cloud.oneClickConnect({
          familyCode,
          apiBase,
          syncEnabled: true,
          adminPasswordHash: admin.passwordHash,
        });
        // mirror fields into learn-side inputs if present
        const learnCode = document.getElementById("cloud-family-code");
        const learnBase = document.getElementById("cloud-api-base");
        const learnEn = document.getElementById("cloud-sync-enabled");
        if (learnCode) learnCode.value = Cloud.normalizeCode(familyCode);
        if (learnBase) learnBase.value = Cloud.normalizeBase(apiBase) || Cloud.DEFAULT_API_BASE;
        if (learnEn) learnEn.checked = true;
        if (codeEl) codeEl.value = Cloud.normalizeCode(familyCode);
        if (baseEl) baseEl.value = Cloud.normalizeBase(apiBase) || Cloud.DEFAULT_API_BASE;

        const msg = (result.steps || []).join(" · ");
        if (result.ok) {
          setAdmCloudStatus("云端：一键连通成功 · " + msg);
          toast("一键连通成功：" + msg);
        } else {
          setAdmCloudStatus("云端：一键连通失败 · " + (result.error || msg));
          toast("一键连通失败：" + (result.error || msg));
        }
        renderDashboard();
      } catch (e) {
        setAdmCloudStatus("云端：一键连通失败 · " + (e.message || e));
        toast("一键连通失败：" + (e.message || e));
      }
    });

    document.getElementById("btn-cloud-pull")?.addEventListener("click", async () => {
      const Cloud = global.KouyuCloud;
      if (!Cloud) {
        toast("云模块未加载");
        return;
      }
      const cfg = Cloud.loadCloud();
      if (!Cloud.normalizeBase(cfg.apiBase) || Cloud.normalizeCode(cfg.familyCode).length < 4) {
        toast("请先在学习端保存家庭同步码 + API Base");
        return;
      }
      const admin = S().loadAdmin();
      if (!admin.passwordHash) {
        toast("缺少管理密码哈希，请先设置管理密码");
        return;
      }
      try {
        setAdmCloudStatus("云端：拉取中…");
        const data = await Cloud.pullSisterProgress(admin.passwordHash);
        if (data.empty || !data.payload) {
          setAdmCloudStatus("云端：暂无妹妹数据（等她开启同步并学习后推送）");
          toast("云端暂无妹妹进度");
          return;
        }
        const payload = data.payload;
        const stateObj = payload.state || payload;
        admin.importedSisterSnapshot = {
          exportedAt: data.updatedAt || payload.exportedAt || new Date().toISOString(),
          profile: payload.profile || null,
          state: stateObj,
          fromCloud: true,
        };
        S().saveAdmin(admin);
        const writeLive = window.confirm(
          "已从云端拉取妹妹进度。\n\n【确定】写入本机「妹妹」档案（覆盖）\n【取消】只在管理端看板查看"
        );
        if (writeLive) {
          S().saveProfileState(S().SISTER_ID, S().normalizeState(stateObj));
        }
        renderDashboard();
        setAdmCloudStatus(
          "云端：已拉取 · " + Cloud.formatSyncTime(data.updatedAt || admin.importedSisterSnapshot.exportedAt)
        );
        toast(writeLive ? "云端进度已写入本机妹妹档案" : "云端进度已导入管理端快照");
      } catch (e) {
        setAdmCloudStatus("云端：拉取失败 · " + (e.message || e));
        toast("拉取失败：" + (e.message || e));
      }
    });
  }

  global.KouyuAdmin = {
    enterAdminShell,
    leaveAdminShell,
    showAdminLogin,
    showAdminDash,
    renderDashboard,
    bindAdmin,
    sisterDisplayState,
  };
})(window);
