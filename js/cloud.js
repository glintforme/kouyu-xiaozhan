/* 口语小站 · 云同步 + ee API 客户端 v10（国内自定义域名 + 多端点回退） */
(function (global) {
  "use strict";

  const CLOUD_KEY = "kouyu-xiaozhan-cloud-v6";
  /** Primary: custom domain on Cloudflare zone (CN-friendlier than *.workers.dev) */
  const DEFAULT_API_BASE = "https://kouyu-api.allovemiku.top";
  /** Legacy workers.dev — often blocked/slow in mainland China */
  const LEGACY_API_BASE = "https://kouyu-xiaozhan-api.kncrty.workers.dev";
  const FALLBACK_API_BASES = [DEFAULT_API_BASE, LEGACY_API_BASE];
  const PUSH_DEBOUNCE_MS = 2500;
  const DEFAULT_TIMEOUT_MS = 12000;
  const HEALTH_TIMEOUT_MS = 8000;

  function defaultCloud() {
    return {
      version: 10,
      familyCode: "",
      apiBase: DEFAULT_API_BASE,
      apiBaseAlt: "",
      syncEnabled: false,
      familySecret: "",
      lastSyncAt: null,
      lastSyncStatus: "未配置",
      lastSyncError: null,
      lastPullAt: null,
      lastLatencyMs: null,
      familyInited: false,
      preferredBase: DEFAULT_API_BASE,
    };
  }

  function normalizeBase(url) {
    return String(url || "")
      .trim()
      .replace(/\/+$/, "");
  }

  function isLegacyWorkersDev(base) {
    const b = normalizeBase(base).toLowerCase();
    return b === LEGACY_API_BASE.toLowerCase() || /\.workers\.dev$/i.test(b);
  }

  function loadCloud() {
    try {
      const raw = localStorage.getItem(CLOUD_KEY);
      if (!raw) return defaultCloud();
      const parsed = JSON.parse(raw);
      const merged = { ...defaultCloud(), ...parsed };
      const saved = normalizeBase(parsed.apiBase);
      // Empty → default custom domain
      if (!saved) {
        merged.apiBase = DEFAULT_API_BASE;
      } else if (isLegacyWorkersDev(saved) && !parsed.preferLegacyWorkersDev) {
        // Auto-migrate from workers.dev (often blocked in CN) to custom domain
        merged.apiBase = DEFAULT_API_BASE;
        merged.apiBaseAlt = merged.apiBaseAlt || LEGACY_API_BASE;
        merged.lastSyncStatus = merged.lastSyncStatus || "已切换到国内友好域名";
      }
      merged.version = 10;
      return merged;
    } catch {
      return defaultCloud();
    }
  }

  function saveCloud(cfg) {
    localStorage.setItem(CLOUD_KEY, JSON.stringify(cfg));
  }

  function normalizeCode(code) {
    return String(code || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, "")
      .slice(0, 32);
  }

  function isConfigured(cfg) {
    cfg = cfg || loadCloud();
    return !!(normalizeBase(cfg.apiBase) && normalizeCode(cfg.familyCode) && cfg.syncEnabled);
  }

  function headers(cfg, extra) {
    const h = { "Content-Type": "application/json", ...(extra || {}) };
    if (cfg.familySecret) h["X-Family-Secret"] = cfg.familySecret;
    return h;
  }

  function candidateBases(cfg) {
    cfg = cfg || loadCloud();
    const list = [];
    const push = (u) => {
      const b = normalizeBase(u);
      if (b && !list.includes(b)) list.push(b);
    };
    push(cfg.apiBase);
    push(cfg.preferredBase);
    push(cfg.apiBaseAlt);
    FALLBACK_API_BASES.forEach(push);
    return list;
  }

  function cnFriendlyError(err) {
    const msg = String((err && err.message) || err || "请求失败");
    const low = msg.toLowerCase();
    if (
      low.includes("failed to fetch") ||
      low.includes("networkerror") ||
      low.includes("load failed") ||
      low.includes("network request failed") ||
      low.includes("timeout") ||
      low.includes("aborted") ||
      low.includes("timed out")
    ) {
      return (
        "国内可能访问不了当前 API（*.workers.dev 常被拦）。" +
        "已优先用 kouyu-api.allovemiku.top；仍失败请点「一键重试」或「导出给哥哥导入」。原文：" +
        msg
      );
    }
    return msg;
  }

  function fetchWithTimeout(url, options, timeoutMs) {
    const ms = timeoutMs || DEFAULT_TIMEOUT_MS;
    const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timer = setTimeout(() => {
      try {
        if (ctrl) ctrl.abort();
      } catch {
        /* ignore */
      }
    }, ms);
    const opts = { ...(options || {}) };
    if (ctrl) opts.signal = ctrl.signal;
    return fetch(url, opts).finally(() => clearTimeout(timer));
  }

  async function api(path, options) {
    const cfg = loadCloud();
    const base = normalizeBase(cfg.apiBase);
    if (!base) throw new Error("未填写 API Base");
    const timeoutMs = (options && options.timeoutMs) || DEFAULT_TIMEOUT_MS;
    const fetchOpts = { ...(options || {}) };
    delete fetchOpts.timeoutMs;
    delete fetchOpts._retried;
    let res;
    try {
      res = await fetchWithTimeout(base + path, fetchOpts, timeoutMs);
    } catch (e) {
      // One automatic failover to next candidate base on network failure
      if (!options || !options._retried) {
        const alts = candidateBases(cfg).filter((b) => b !== base);
        for (const alt of alts) {
          try {
            const res2 = await fetchWithTimeout(alt + path, fetchOpts, timeoutMs);
            if (res2.ok || res2.status < 500) {
              cfg.apiBase = alt;
              cfg.preferredBase = alt;
              saveCloud(cfg);
              res = res2;
              break;
            }
          } catch {
            /* try next */
          }
        }
      }
      if (!res) throw new Error(cnFriendlyError(e));
    }
    let data = null;
    try {
      data = await res.json();
    } catch {
      data = null;
    }
    if (!res.ok) {
      const msg = (data && data.error) || res.statusText || "请求失败";
      throw new Error(msg);
    }
    return data;
  }

  let pushTimer = null;

  function setStatus(status, error) {
    const cfg = loadCloud();
    cfg.lastSyncStatus = status;
    cfg.lastSyncError = error || null;
    if (status === "已同步" || status === "已拉取") {
      cfg.lastSyncAt = new Date().toISOString();
      if (status === "已拉取") cfg.lastPullAt = cfg.lastSyncAt;
    }
    saveCloud(cfg);
    try {
      global.dispatchEvent(new CustomEvent("kouyu-cloud-status", { detail: { ...cfg } }));
    } catch {
      /* ignore */
    }
    return cfg;
  }

  async function probeOneBase(base, cfg, options) {
    options = options || {};
    const deep = !!options.deep;
    // Prefer /api/ping for CN connectivity (never touches AI)
    const path = deep ? "/api/health?deep=1" : options.useHealth ? "/api/health" : "/api/ping";
    const t0 =
      typeof performance !== "undefined" && performance.now ? performance.now() : Date.now();
    const res = await fetchWithTimeout(
      base + path,
      { headers: headers(cfg), cache: "no-store" },
      options.timeoutMs || HEALTH_TIMEOUT_MS
    );
    const ms = Math.round(
      ((typeof performance !== "undefined" && performance.now ? performance.now() : Date.now()) -
        t0)
    );
    if (!res.ok) throw new Error("探活失败 HTTP " + res.status);
    const data = await res.json();
    // If ping-only succeeded, optionally enrich with /api/health (sync/ai flags) without blocking CN
    if (!deep && path === "/api/ping" && data && data.ok) {
      try {
        const hRes = await fetchWithTimeout(
          base + "/api/health",
          { headers: headers(cfg), cache: "no-store" },
          Math.min(HEALTH_TIMEOUT_MS, 6000)
        );
        if (hRes.ok) {
          const health = await hRes.json();
          Object.assign(data, health, { ping: true });
        }
      } catch {
        /* ping alone is enough for connectivity */
        data.sync = data.sync != null ? data.sync : null;
        data.ai = data.ai != null ? data.ai : null;
      }
    }
    data.latencyMs = ms;
    data.base = base;
    data.slow = ms >= 2000;
    data.ok = data.ok !== false;
    return data;
  }

  async function healthCheck(options) {
    options = options || {};
    const cfg = loadCloud();
    const bases = candidateBases(cfg);
    if (!bases.length) return { ok: false, error: "无 API Base" };
    const maxAttempts = options.retries != null ? options.retries : 2;
    const errors = [];
    for (const base of bases) {
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          const data = await probeOneBase(base, cfg, options);
          data.attempt = attempt;
          data.triedBases = bases;
          // Persist working base
          if (normalizeBase(cfg.apiBase) !== base) {
            cfg.apiBase = base;
            cfg.preferredBase = base;
            cfg.lastSyncStatus = "已自动切换可用节点";
          }
          cfg.lastLatencyMs = data.latencyMs;
          saveCloud(cfg);
          try {
            global.dispatchEvent(new CustomEvent("kouyu-cloud-status", { detail: { ...cfg } }));
          } catch {
            /* ignore */
          }
          return data;
        } catch (e) {
          errors.push(base + " #" + attempt + ": " + ((e && e.message) || e));
          if (attempt < maxAttempts) {
            await new Promise((r) => setTimeout(r, 350 * attempt));
          }
        }
      }
    }
    const err = new Error(
      cnFriendlyError(errors[0] || "健康检查失败") +
        (errors.length > 1 ? "｜已试 " + bases.length + " 个节点均失败" : "")
    );
    throw err;
  }

  async function initFamily(adminPasswordHash) {
    const cfg = loadCloud();
    const code = normalizeCode(cfg.familyCode);
    if (code.length < 4) throw new Error("家庭同步码至少 4 位");
    if (!adminPasswordHash) throw new Error("缺少管理密码哈希");
    const data = await api("/api/family/init", {
      method: "POST",
      headers: headers(cfg),
      body: JSON.stringify({ familyCode: code, adminPasswordHash }),
      timeoutMs: 15000,
    });
    cfg.familyInited = true;
    saveCloud(cfg);
    setStatus("家庭房间已就绪");
    return data;
  }

  /**
   * One-click: multi-base health → (optional) init family.
   * Auto-switches apiBase to the first working host (custom domain preferred).
   */
  async function oneClickConnect(options) {
    options = options || {};
    const cfg = loadCloud();
    if (options.apiBase !== undefined) cfg.apiBase = normalizeBase(options.apiBase);
    if (options.apiBaseAlt !== undefined) cfg.apiBaseAlt = normalizeBase(options.apiBaseAlt);
    if (options.familyCode !== undefined) cfg.familyCode = normalizeCode(options.familyCode);
    if (options.familySecret !== undefined) cfg.familySecret = String(options.familySecret || "").trim();
    if (options.syncEnabled !== undefined) cfg.syncEnabled = !!options.syncEnabled;
    if (!normalizeBase(cfg.apiBase)) cfg.apiBase = DEFAULT_API_BASE;
    // Prefer custom domain over legacy workers.dev when user still has legacy
    if (isLegacyWorkersDev(cfg.apiBase) && !options.forceLegacy) {
      cfg.apiBaseAlt = cfg.apiBaseAlt || LEGACY_API_BASE;
      cfg.apiBase = DEFAULT_API_BASE;
    }
    saveCloud(cfg);

    const steps = [];
    let health = null;
    try {
      health = await healthCheck({
        retries: options.retries != null ? options.retries : 2,
        deep: !!options.deep,
      });
      if (!health || !health.ok) throw new Error("健康检查未通过");
      const used = health.base || normalizeBase(cfg.apiBase);
      const lat = health.latencyMs != null ? health.latencyMs + "ms" : "?";
      const slowNote = health.slow ? " · 偏慢" : "";
      const switched =
        used && normalizeBase(options.apiBase || "") && used !== normalizeBase(options.apiBase)
          ? " · 已切到 " + used.replace(/^https?:\/\//, "")
          : used && used === DEFAULT_API_BASE
            ? " · 国内域名"
            : used && isLegacyWorkersDev(used)
              ? " · workers.dev"
              : "";
      steps.push(
        "连通 ✓ " +
          lat +
          slowNote +
          switched +
          "（sync=" +
          !!health.sync +
          " ai=" +
          !!health.ai +
          " v=" +
          (health.version || "?") +
          "）"
      );
      if (health.slow) {
        steps.push("提示：延迟偏高可稍后重试；也可用「导出给哥哥」本地同步");
      }
      // Refresh cfg after possible base switch
      const fresh = loadCloud();
      if (fresh.apiBase !== cfg.apiBase) {
        steps.push("已自动改用可用节点：" + fresh.apiBase);
      }
    } catch (e) {
      const friendly = cnFriendlyError(e);
      setStatus("连通失败", friendly);
      return {
        ok: false,
        step: "health",
        error: friendly,
        steps: steps.concat(["连通失败：可点一键重试，或导出 JSON 发给哥哥导入"]),
        health: null,
        suggestExport: true,
        triedBases: candidateBases(cfg),
      };
    }

    const code = normalizeCode(loadCloud().familyCode);
    let family = null;
    if (options.adminPasswordHash && code.length >= 4) {
      try {
        family = await initFamily(options.adminPasswordHash);
        steps.push(
          family.created
            ? "家庭房间已创建 ✓"
            : family.reused
              ? "家庭房间已存在（复用）✓"
              : "家庭房间就绪 ✓"
        );
      } catch (e) {
        steps.push("家庭初始化 ✗ · " + (e.message || e));
        setStatus("连通部分成功", e.message || String(e));
        return {
          ok: false,
          step: "init",
          error: e.message || String(e),
          steps,
          health,
          family: null,
          suggestExport: false,
        };
      }
    } else if (code.length < 4) {
      steps.push("跳过家庭初始化（请先填 ≥4 位同步码）");
    } else if (!options.adminPasswordHash) {
      steps.push("跳过家庭初始化（需管理端密码；学习端仅测连通）");
    }

    setStatus("连通成功");
    return { ok: true, step: "done", steps, health, family, error: null, suggestExport: false };
  }

  async function pushSisterProgress(payload) {
    const cfg = loadCloud();
    if (!isConfigured(cfg)) return { skipped: true };
    const code = normalizeCode(cfg.familyCode);
    setStatus("同步中…");
    try {
      const data = await api("/api/sync/push", {
        method: "POST",
        headers: headers(cfg),
        body: JSON.stringify({
          familyCode: code,
          role: "sister",
          payload,
          updatedAt: new Date().toISOString(),
        }),
        timeoutMs: 15000,
      });
      setStatus("已同步");
      return data;
    } catch (e) {
      const friendly = cnFriendlyError(e);
      setStatus("同步失败", friendly);
      const err = new Error(friendly);
      err.suggestExport = true;
      throw err;
    }
  }

  function schedulePush(payloadBuilder) {
    const cfg = loadCloud();
    if (!isConfigured(cfg)) return;
    clearTimeout(pushTimer);
    pushTimer = setTimeout(() => {
      try {
        const payload = typeof payloadBuilder === "function" ? payloadBuilder() : payloadBuilder;
        pushSisterProgress(payload).catch(() => {
          /* status already set */
        });
      } catch {
        /* ignore */
      }
    }, PUSH_DEBOUNCE_MS);
  }

  async function pullSisterProgress(adminToken) {
    const cfg = loadCloud();
    const base = normalizeBase(cfg.apiBase);
    const code = normalizeCode(cfg.familyCode);
    if (!base || code.length < 4) throw new Error("请先配置 API Base 与家庭同步码");
    if (!adminToken) throw new Error("缺少管理端令牌（密码哈希）");
    setStatus("拉取中…");
    try {
      const q = `?familyCode=${encodeURIComponent(code)}&role=brother`;
      const data = await api("/api/sync/pull" + q, {
        method: "GET",
        headers: headers(cfg, { "X-Admin-Token": adminToken }),
        timeoutMs: 15000,
      });
      setStatus("已拉取");
      return data;
    } catch (e) {
      const friendly = cnFriendlyError(e);
      setStatus("拉取失败", friendly);
      throw new Error(friendly);
    }
  }

  async function eeChat(messages, learnerName) {
    const cfg = loadCloud();
    const base = normalizeBase(cfg.apiBase) || DEFAULT_API_BASE;
    if (!base) return null;
    try {
      if (!normalizeBase(cfg.apiBase)) {
        cfg.apiBase = DEFAULT_API_BASE;
        saveCloud(cfg);
      }
      const data = await api("/api/ee/chat", {
        method: "POST",
        headers: headers(cfg),
        body: JSON.stringify({
          familyCode: normalizeCode(cfg.familyCode) || undefined,
          messages,
          learnerName: learnerName || "妹妹",
        }),
        timeoutMs: 45000,
      });
      return data;
    } catch (e) {
      console.warn("[cloud eeChat]", e);
      return null;
    }
  }


  async function eeStt(blobOrBase64, options) {
    options = options || {};
    const cfg = loadCloud();
    const base = normalizeBase(cfg.apiBase) || DEFAULT_API_BASE;
    if (!base) throw new Error("未配置 API Base，无法语音转写");
    if (!normalizeBase(cfg.apiBase)) {
      cfg.apiBase = DEFAULT_API_BASE;
      saveCloud(cfg);
    }

    let audioBase64 = "";
    let mime = options.mime || "audio/wav";
    if (typeof blobOrBase64 === "string") {
      audioBase64 = blobOrBase64.replace(/^data:[^;]+;base64,/, "");
    } else if (blobOrBase64 && typeof blobOrBase64.arrayBuffer === "function") {
      mime = blobOrBase64.type || mime;
      const buf = await blobOrBase64.arrayBuffer();
      const bytes = new Uint8Array(buf);
      let binary = "";
      const chunk = 0x8000;
      for (let i = 0; i < bytes.length; i += chunk) {
        binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
      }
      audioBase64 = btoa(binary);
    } else {
      throw new Error("需要录音数据");
    }
    if (!audioBase64) throw new Error("录音为空");

    const data = await api("/api/ee/stt", {
      method: "POST",
      headers: headers(cfg),
      body: JSON.stringify({
        audioBase64,
        mime,
        language: options.language || "en",
        familyCode: normalizeCode(cfg.familyCode) || undefined,
      }),
      timeoutMs: options.timeoutMs || 60000,
    });
    return data;
  }

  async function eeGenerateTasks(dateKey) {
    const cfg = loadCloud();
    const base = normalizeBase(cfg.apiBase) || DEFAULT_API_BASE;
    if (!base) return null;
    try {
      if (!normalizeBase(cfg.apiBase)) {
        cfg.apiBase = DEFAULT_API_BASE;
        saveCloud(cfg);
      }
      const data = await api("/api/ee/tasks/generate", {
        method: "POST",
        headers: headers(cfg),
        body: JSON.stringify({
          familyCode: normalizeCode(cfg.familyCode) || undefined,
          dateKey: dateKey || undefined,
        }),
        timeoutMs: 20000,
      });
      return data;
    } catch (e) {
      console.warn("[cloud eeTasks]", e);
      return null;
    }
  }

  function formatSyncTime(iso) {
    if (!iso) return "尚未同步";
    try {
      const d = new Date(iso);
      return d.toLocaleString("zh-CN", { hour12: false });
    } catch {
      return iso;
    }
  }

  async function probeLatency(options) {
    return healthCheck(options || { retries: 2 });
  }

  function resetToChinaFriendlyBase() {
    const cfg = loadCloud();
    cfg.apiBase = DEFAULT_API_BASE;
    cfg.apiBaseAlt = LEGACY_API_BASE;
    cfg.preferredBase = DEFAULT_API_BASE;
    cfg.lastSyncStatus = "已重置为国内友好域名";
    saveCloud(cfg);
    return cfg;
  }

  global.KouyuCloud = {
    CLOUD_KEY,
    DEFAULT_API_BASE,
    LEGACY_API_BASE,
    FALLBACK_API_BASES,
    loadCloud,
    saveCloud,
    defaultCloud,
    normalizeBase,
    normalizeCode,
    isConfigured,
    isLegacyWorkersDev,
    candidateBases,
    healthCheck,
    probeLatency,
    initFamily,
    oneClickConnect,
    pushSisterProgress,
    schedulePush,
    pullSisterProgress,
    eeChat,
    eeStt,
    eeGenerateTasks,
    setStatus,
    formatSyncTime,
    resetToChinaFriendlyBase,
    cnFriendlyError,
  };
})(window);
