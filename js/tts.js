/* 口语小站 · 英文 TTS v8（移动端默认在线美式；缓存短音频；首触解锁） */
(function (global) {
  "use strict";

  const DEFAULT_API = "https://kouyu-xiaozhan-api.kncrty.workers.dev";
  const MAX_CHUNK = 180;
  const CACHE_LIMIT = 48;
  let voicesReady = false;
  let cachedVoices = [];
  let currentAudio = null;
  let speaking = false;
  let audioUnlocked = false;
  const blobCache = new Map(); // key → objectURL

  function apiBase() {
    try {
      const Cloud = global.KouyuCloud;
      if (Cloud) {
        const b = Cloud.normalizeBase(Cloud.loadCloud().apiBase);
        if (b) return b;
        return Cloud.DEFAULT_API_BASE || DEFAULT_API;
      }
    } catch {
      /* ignore */
    }
    return DEFAULT_API;
  }

  function isMobileLike() {
    const ua = (navigator.userAgent || "").toLowerCase();
    if (/android|iphone|ipad|ipod|mobile|micromessenger|mqqbrowser|vivo|iqoo|huawei|harmony|ucbrowser/.test(ua)) {
      return true;
    }
    try {
      if (navigator.maxTouchPoints > 1 && Math.min(screen.width, screen.height) <= 900) return true;
    } catch {
      /* ignore */
    }
    return false;
  }

  function isLikelyBrokenSpeechSynth() {
    const ua = (navigator.userAgent || "").toLowerCase();
    return /vivo|iqoo|mqqbrowser|qq\//.test(ua) || /micromessenger/.test(ua) || /ucbrowser|huawei|harmony/.test(ua);
  }

  function loadVoices() {
    if (!global.speechSynthesis) return [];
    try {
      cachedVoices = global.speechSynthesis.getVoices() || [];
      if (cachedVoices.length) voicesReady = true;
    } catch {
      cachedVoices = [];
    }
    return cachedVoices;
  }

  function ensureVoices() {
    return new Promise((resolve) => {
      if (!global.speechSynthesis) {
        resolve([]);
        return;
      }
      const v = loadVoices();
      if (v.length) {
        resolve(v);
        return;
      }
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        resolve(loadVoices());
      };
      const onChange = () => {
        try {
          global.speechSynthesis.removeEventListener("voiceschanged", onChange);
        } catch {
          /* ignore */
        }
        finish();
      };
      try {
        global.speechSynthesis.addEventListener("voiceschanged", onChange);
      } catch {
        /* ignore */
      }
      setTimeout(finish, 500);
      try {
        loadVoices();
      } catch {
        /* ignore */
      }
    });
  }

  function scoreVoice(v) {
    const name = (v.name || "").toLowerCase();
    const lang = (v.lang || "").toLowerCase();
    let s = 0;
    if (lang.startsWith("en")) s += 10;
    if (lang === "en-us") s += 6;
    if (lang === "en-gb") s += 4;
    if (/google/.test(name)) s += 12;
    if (/microsoft/.test(name) && /(aria|jenny|guy|sara|zira|natural|online)/.test(name)) s += 11;
    if (/samantha|karen|moira|daniel|alex|victoria|siri/.test(name)) s += 10;
    if (/enhanced|premium|neural|natural/.test(name)) s += 5;
    if (/compact|basic|espeak|robot/.test(name)) s -= 8;
    if (v.localService === false) s += 2;
    return s;
  }

  function pickBestEnglishVoice(voices) {
    const en = (voices || []).filter((v) => /^en(-|_)/i.test(v.lang || "") || /english/i.test(v.name || ""));
    if (!en.length) return null;
    en.sort((a, b) => scoreVoice(b) - scoreVoice(a));
    return en[0];
  }

  function canUseWebSpeech(voices) {
    if (!global.speechSynthesis || typeof SpeechSynthesisUtterance === "undefined") return false;
    const en = pickBestEnglishVoice(voices);
    if (!en) return false;
    if (isLikelyBrokenSpeechSynth()) {
      const n = (en.name || "").toLowerCase();
      if (!/google|microsoft|samantha|neural|natural/.test(n)) return false;
    }
    return true;
  }

  /** Prefer online US audio on mobile / CN WebViews for natural vocab pronunciation */
  function preferOnlineAudio() {
    if (isLikelyBrokenSpeechSynth()) return true;
    if (isMobileLike()) return true;
    return false;
  }

  function stopAll() {
    speaking = false;
    try {
      if (global.speechSynthesis) global.speechSynthesis.cancel();
    } catch {
      /* ignore */
    }
    if (currentAudio) {
      try {
        currentAudio.pause();
        currentAudio.removeAttribute("src");
        currentAudio.load();
      } catch {
        /* ignore */
      }
      currentAudio = null;
    }
  }

  /** Unlock HTMLAudio on first user gesture (required on iOS / many Android WebViews) */
  function unlockAudio() {
    if (audioUnlocked) return Promise.resolve(true);
    return new Promise((resolve) => {
      try {
        const a = new Audio();
        a.muted = true;
        a.playsInline = true;
        a.src =
          "data:audio/mp3;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4Ljc2LjEwMAAAAAAAAAAAAAAA//tQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWGluZwAAAA8AAAACAAABhgC7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7//////////////////////////////////////////////////////////////////8AAAAATGF2YzU4LjEzAAAAAAAAAAAAAAAAJAAAAAAAAAAAAYYJbQCwAAAAAAD/+1DEAAAHAAGf9AAAIgAANP8AAAD/4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4AA==";
        const p = a.play();
        const done = () => {
          audioUnlocked = true;
          try {
            a.pause();
          } catch {
            /* ignore */
          }
          resolve(true);
        };
        if (p && typeof p.then === "function") {
          p.then(done).catch(() => {
            audioUnlocked = true;
            resolve(false);
          });
        } else {
          done();
        }
      } catch {
        audioUnlocked = true;
        resolve(false);
      }
    });
  }

  function cachePut(key, objectUrl) {
    if (blobCache.has(key)) {
      try {
        URL.revokeObjectURL(blobCache.get(key));
      } catch {
        /* ignore */
      }
    }
    blobCache.set(key, objectUrl);
    while (blobCache.size > CACHE_LIMIT) {
      const first = blobCache.keys().next().value;
      try {
        URL.revokeObjectURL(blobCache.get(first));
      } catch {
        /* ignore */
      }
      blobCache.delete(first);
    }
  }

  function playUrl(url, opts) {
    opts = opts || {};
    return new Promise((resolve, reject) => {
      stopAll();
      const audio = new Audio();
      currentAudio = audio;
      speaking = true;
      audio.preload = "auto";
      audio.playsInline = true;
      // Slightly softer / less rushed for vocab words
      audio.playbackRate = opts.rate != null ? opts.rate : 0.96;
      let settled = false;
      const done = (ok, err) => {
        if (settled) return;
        settled = true;
        speaking = false;
        if (currentAudio === audio) currentAudio = null;
        if (ok) resolve(true);
        else reject(err || new Error("audio failed"));
      };
      audio.onended = () => done(true);
      audio.onerror = () => done(false, new Error("audio error"));
      audio.src = url;
      const p = audio.play();
      if (p && typeof p.then === "function") {
        p.catch((e) => done(false, e));
      }
    });
  }

  async function fetchAndCache(url, cacheKey) {
    if (blobCache.has(cacheKey)) {
      return blobCache.get(cacheKey);
    }
    const res = await fetch(url, { mode: "cors", credentials: "omit" });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const buf = await res.arrayBuffer();
    if (!buf || buf.byteLength < 64) throw new Error("empty audio");
    const ct = res.headers.get("Content-Type") || "audio/mpeg";
    const blob = new Blob([buf], { type: ct });
    const obj = URL.createObjectURL(blob);
    cachePut(cacheKey, obj);
    return obj;
  }

  function youdaoUrl(text, type) {
    return (
      "https://dict.youdao.com/dictvoice?audio=" +
      encodeURIComponent(text) +
      "&type=" +
      (type === 1 ? "1" : "2")
    );
  }

  function googleTtsUrl(text, lang) {
    return (
      "https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=" +
      encodeURIComponent(lang || "en") +
      "&q=" +
      encodeURIComponent(text)
    );
  }

  function workerTtsUrl(text, lang) {
    return (
      apiBase().replace(/\/+$/, "") +
      "/api/tts?lang=" +
      encodeURIComponent(lang || "en") +
      "&text=" +
      encodeURIComponent(text)
    );
  }

  function splitChunks(text) {
    const t = String(text || "").trim();
    if (!t) return [];
    if (t.length <= MAX_CHUNK) return [t];
    const parts = [];
    let buf = "";
    const tokens = t.split(/(\s+|[,.!?;:，。！？；：])/);
    for (const tok of tokens) {
      if ((buf + tok).length > MAX_CHUNK && buf) {
        parts.push(buf.trim());
        buf = tok;
      } else {
        buf += tok;
      }
    }
    if (buf.trim()) parts.push(buf.trim());
    return parts.filter(Boolean);
  }

  function speakWebSpeech(text, opts) {
    return new Promise(async (resolve, reject) => {
      const voices = await ensureVoices();
      if (!canUseWebSpeech(voices)) {
        reject(new Error("no suitable web speech voice"));
        return;
      }
      const voice = pickBestEnglishVoice(voices);
      stopAll();
      speaking = true;
      const u = new SpeechSynthesisUtterance(text);
      u.lang = opts.lang || voice.lang || "en-US";
      u.voice = voice;
      u.rate = opts.rate != null ? opts.rate : 0.88;
      u.pitch = opts.pitch != null ? opts.pitch : 1.02;
      u.volume = opts.volume != null ? opts.volume : 1;
      let finished = false;
      const finish = (ok, err) => {
        if (finished) return;
        finished = true;
        speaking = false;
        if (ok) resolve({ engine: "webspeech", voice: voice.name });
        else reject(err || new Error("webspeech failed"));
      };
      u.onend = () => finish(true);
      u.onerror = (e) => finish(false, new Error((e && e.error) || "webspeech error"));
      try {
        global.speechSynthesis.speak(u);
      } catch (e) {
        finish(false, e);
        return;
      }
      const ms = Math.min(30000, 1200 + text.length * 80);
      setTimeout(() => {
        if (!finished) finish(true);
      }, ms);
    });
  }

  async function speakAudioFallback(text, opts) {
    await unlockAudio();
    const lang = (opts.lang || "en-US").toLowerCase().startsWith("en-gb") ? "en" : "en";
    const chunks = splitChunks(text);
    let lastEngine = "audio";
    for (const chunk of chunks) {
      const short = chunk.length <= 80;
      const candidates = [];
      // CN mobile: Youdao US first for short clips (natural, reachable)
      if (short) {
        candidates.push({
          engine: "youdao",
          url: youdaoUrl(chunk, 2),
          key: "yd2:" + chunk,
          cache: true,
        });
      }
      // Worker proxy (CORS-safe)
      candidates.push({
        engine: "worker",
        url: workerTtsUrl(chunk, lang),
        key: "wk:" + lang + ":" + chunk,
        cache: true,
      });
      if (short) {
        candidates.push({
          engine: "google",
          url: googleTtsUrl(chunk, lang),
          key: "gg:" + chunk,
          cache: false,
        });
      }

      let ok = false;
      let err;
      for (const c of candidates) {
        try {
          let playSrc = c.url;
          if (c.cache) {
            try {
              playSrc = await fetchAndCache(c.url, c.key);
            } catch (fetchErr) {
              // fallback to direct play (may work for youdao without cors on some browsers)
              playSrc = c.url;
            }
          }
          await playUrl(playSrc, { rate: 0.96 });
          lastEngine = c.engine;
          ok = true;
          break;
        } catch (e) {
          err = e;
        }
      }
      if (!ok) throw err || new Error("all audio TTS failed");
    }
    return { engine: lastEngine };
  }

  /**
   * Speak English text.
   * Mobile / CN browsers: online US audio first.
   * Desktop Edge/Chrome: Web Speech first, then audio.
   */
  async function speak(text, opts) {
    opts = opts || {};
    const t = String(text || "").trim();
    if (!t) return { engine: "none" };

    const status = opts.onStatus;
    const useAudioFirst = opts.preferAudio || preferOnlineAudio();

    if (useAudioFirst) {
      if (status) status("在线美式发音加载中…");
      try {
        const r = await speakAudioFallback(t, opts);
        if (status) status("在线发音 · " + r.engine + "（可再点重播）");
        return r;
      } catch (e) {
        if (status) status("尝试系统发音…");
        try {
          return await speakWebSpeech(t, opts);
        } catch (e2) {
          if (status) status("当前浏览器暂时无法播放发音");
          throw e2;
        }
      }
    }

    try {
      if (status) status("系统发音中…");
      const r = await speakWebSpeech(t, opts);
      if (status) status("系统发音 · " + (r.voice || "webspeech"));
      return r;
    } catch {
      if (status) status("改用在线发音…");
      try {
        const r = await speakAudioFallback(t, opts);
        if (status) status("在线发音 · " + r.engine);
        return r;
      } catch (e) {
        if (status) status("发音失败，请检查网络后重试");
        throw e;
      }
    }
  }

  // Warm voices + unlock on first pointer/touch
  if (global.speechSynthesis) {
    try {
      ensureVoices();
      if (typeof global.speechSynthesis.addEventListener === "function") {
        global.speechSynthesis.addEventListener("voiceschanged", loadVoices);
      } else {
        global.speechSynthesis.onvoiceschanged = loadVoices;
      }
    } catch {
      /* ignore */
    }
  }

  function bindUnlockOnce() {
    const once = () => {
      unlockAudio();
      document.removeEventListener("touchstart", once, true);
      document.removeEventListener("pointerdown", once, true);
      document.removeEventListener("click", once, true);
    };
    document.addEventListener("touchstart", once, { capture: true, passive: true });
    document.addEventListener("pointerdown", once, { capture: true, passive: true });
    document.addEventListener("click", once, { capture: true, passive: true });
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bindUnlockOnce);
  } else {
    bindUnlockOnce();
  }

  global.KouyuTTS = {
    speak,
    stop: stopAll,
    unlockAudio,
    ensureVoices,
    pickBestEnglishVoice,
    isLikelyBrokenSpeechSynth,
    preferOnlineAudio,
    youdaoUrl,
    workerTtsUrl,
  };
})(window);
