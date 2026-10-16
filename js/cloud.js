/* 口语小站 · 云同步 + ee API 客户端（Worker 未部署前本地仍可用） */
(function (global) {
  "use strict";

  const CLOUD_KEY = "kouyu-xiaozhan-cloud-v6";
  const PUSH_DEBOUNCE_MS = 2500;

  function defaultCloud() {
    return {
      version: 6,
      familyCode: "",
      apiBase: "",
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
      return { ...defaultCloud(), ...JSON.parse(raw) };
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
    if (!base) throw new Error("未填写 API Base（需先部署 Cloudflare Worker）");
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

  async function healthCheck() {
    const cfg = loadCloud();
    const base = normalizeBase(cfg.apiBase);
    if (!base) return { ok: false, error: "无 API Base" };
    const res = await fetch(base + "/api/health", { headers: headers(cfg) });
    if (!res.ok) throw new Error("健康检查失败");
    return res.json();
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
    const base = normalizeBase(cfg.apiBase);
    if (!base) return null; // caller falls back to local
    try {
      const data = await api("/api/ee/chat", {
        method: "POST",
        headers: headers(cfg),
        body: JSON.stringify({
          familyCode: normalizeCode(cfg.familyCode) || undefined,
          messages,
          learnerName: learnerName || "妹妹",
        }),
      });
      return data;
    } catch (e) {
      console.warn("[cloud eeChat]", e);
      return null;
    }
  }

  async function eeGenerateTasks(dateKey) {
    const cfg = loadCloud();
    const base = normalizeBase(cfg.apiBase);
    if (!base) return null;
    try {
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

  global.KouyuCloud = {
    CLOUD_KEY,
    loadCloud,
    saveCloud,
    defaultCloud,
    normalizeBase,
    normalizeCode,
    isConfigured,
    healthCheck,
    initFamily,
    pushSisterProgress,
    schedulePush,
    pullSisterProgress,
    eeChat,
    eeGenerateTasks,
    setStatus,
    formatSyncTime,
  };
})(window);
