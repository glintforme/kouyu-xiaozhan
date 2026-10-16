/* 口语小站 · 云同步 + ee API 客户端 v8（探活延迟 / 重试） */
(function (global) {
  "use strict";

  const CLOUD_KEY = "kouyu-xiaozhan-cloud-v6";
  const DEFAULT_API_BASE = "https://kouyu-xiaozhan-api.kncrty.workers.dev";
  const PUSH_DEBOUNCE_MS = 2500;

  function defaultCloud() {
    return {
      version: 8,
      familyCode: "",
      apiBase: DEFAULT_API_BASE,
      syncEnabled: false,
      familySecret: "",
      lastSyncAt: null,
      lastSyncStatus: "未配置",
      lastSyncError: null,
      lastPullAt: null,
      familyInited: false,
    };
  }

  function loadCloud() {
    try {
      const raw = localStorage.getItem(CLOUD_KEY);
      if (!raw) return defaultCloud();
      const parsed = JSON.parse(raw);
      const merged = { ...defaultCloud(), ...parsed };
      // Empty saved base → use live default (still editable)
      if (!normalizeBase(parsed.apiBase)) {
        merged.apiBase = DEFAULT_API_BASE;
      }
      merged.version = 8;
      return merged;
    } catch {
      return defaultCloud();
    }
  }

  function saveCloud(cfg) {
    localStorage.setItem(CLOUD_KEY, JSON.stringify(cfg));
  }

  function normalizeBase(url) {
    return String(url || "")
      .trim()
      .replace(/\/+$/, "");
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

  async function api(path, options) {
    const cfg = loadCloud();
    const base = normalizeBase(cfg.apiBase);
    if (!base) throw new Error("未填写 API Base");
    const res = await fetch(base + path, options);
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

  async function healthCheck(options) {
    options = options || {};
    const cfg = loadCloud();
    const base = normalizeBase(cfg.apiBase) || DEFAULT_API_BASE;
    if (!base) return { ok: false, error: "无 API Base" };
    const deep = !!options.deep;
    const path = deep ? "/api/health?deep=1" : "/api/health";
    const maxAttempts = options.retries != null ? options.retries : 2;
    let lastErr = null;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const t0 = (typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now();
      try {
        const res = await fetch(base + path, {
          headers: headers(cfg),
          cache: "no-store",
        });
        const ms = Math.round(((typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now()) - t0);
        if (!res.ok) throw new Error("健康检查失败 HTTP " + res.status);
        const data = await res.json();
        data.latencyMs = ms;
        data.attempt = attempt;
        data.slow = ms >= 1500;
        return data;
      } catch (e) {
        lastErr = e;
        if (attempt < maxAttempts) {
          await new Promise((r) => setTimeout(r, 400 * attempt));
        }
      }
    }
    throw lastErr || new Error("健康检查失败");
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
    });
    cfg.familyInited = true;
    saveCloud(cfg);
    setStatus("家庭房间已就绪");
    return data;
  }

  /**
   * One-click: health → (optional) init family → toast-friendly result.
   * options: { adminPasswordHash?, familyCode?, apiBase?, syncEnabled?, familySecret? }
   * If field overrides provided, they are saved first.
   */
  async function oneClickConnect(options) {
    options = options || {};
    const cfg = loadCloud();
    if (options.apiBase !== undefined) cfg.apiBase = normalizeBase(options.apiBase);
    if (options.familyCode !== undefined) cfg.familyCode = normalizeCode(options.familyCode);
    if (options.familySecret !== undefined) cfg.familySecret = String(options.familySecret || "").trim();
    if (options.syncEnabled !== undefined) cfg.syncEnabled = !!options.syncEnabled;
    if (!normalizeBase(cfg.apiBase)) cfg.apiBase = DEFAULT_API_BASE;
    saveCloud(cfg);

    const steps = [];
    let health = null;
    try {
      health = await healthCheck({ retries: 2, deep: !!options.deep });
      if (!health || !health.ok) throw new Error("健康检查未通过");
      const lat = health.latencyMs != null ? health.latencyMs + "ms" : "?";
      const slowNote = health.slow ? " · 偏慢" : "";
      const aiNote = health.aiProbe
        ? (health.aiProbe.ok ? " aiProbe✓" : " aiProbe✗")
        : "";
      steps.push(
        "健康检查 ✓ " +
          lat +
          slowNote +
          "（sync=" +
          !!health.sync +
          " ai=" +
          !!health.ai +
          " v=" +
          (health.version || "?") +
          aiNote +
          "）"
      );
      if (health.slow) {
        steps.push("提示：延迟偏高时可稍后重试；也可继续用本地导出/导入备用");
      }
    } catch (e) {
      setStatus("连通失败", e.message || String(e));
      return {
        ok: false,
        step: "health",
        error: e.message || String(e),
        steps,
        health: null,
      };
    }

    const code = normalizeCode(cfg.familyCode);
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
        };
      }
    } else if (code.length < 4) {
      steps.push("跳过家庭初始化（请先填 ≥4 位同步码）");
    } else if (!options.adminPasswordHash) {
      steps.push("跳过家庭初始化（需管理端密码；学习端仅测连通）");
    }

    setStatus("连通成功");
    return { ok: true, step: "done", steps, health, family, error: null };
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
      });
      setStatus("已同步");
      return data;
    } catch (e) {
      setStatus("同步失败", e.message || String(e));
      throw e;
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
      });
      setStatus("已拉取");
      return data;
    } catch (e) {
      setStatus("拉取失败", e.message || String(e));
      throw e;
    }
  }

  async function eeChat(messages, learnerName) {
    const cfg = loadCloud();
    const base = normalizeBase(cfg.apiBase) || DEFAULT_API_BASE;
    if (!base) return null;
    try {
      // temporarily use base even if not in cfg for chat
      const prev = cfg.apiBase;
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
      });
      if (!prev && prev !== DEFAULT_API_BASE) {
        /* keep default */
      }
      return data;
    } catch (e) {
      console.warn("[cloud eeChat]", e);
      return null;
    }
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

  global.KouyuCloud = {
    CLOUD_KEY,
    DEFAULT_API_BASE,
    loadCloud,
    saveCloud,
    defaultCloud,
    normalizeBase,
    normalizeCode,
    isConfigured,
    healthCheck,
    probeLatency,
    initFamily,
    oneClickConnect,
    pushSisterProgress,
    schedulePush,
    pullSisterProgress,
    eeChat,
    eeGenerateTasks,
    setStatus,
    formatSyncTime,
  };
})(window);
