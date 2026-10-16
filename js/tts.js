/* 口语小站 · 英文 TTS（Web Speech + 有道/Worker 回落，兼顾 Vivo/QQ 等国产浏览器） */
(function (global) {
  "use strict";

  const DEFAULT_API = "https://kouyu-xiaozhan-api.kncrty.workers.dev";
  const MAX_CHUNK = 180; // Google/Youdao-ish safe chunk
  let voicesReady = false;
  let cachedVoices = [];
  let currentAudio = null;
  let speaking = false;

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
      // Some Android WebViews fire voices late or never
      setTimeout(finish, 600);
      // Kick chrome
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
    // Prefer natural / neural-ish names
    if (/google/.test(name)) s += 12;
    if (/microsoft/.test(name) && /(aria|jenny|guy|sara|zira|natural|online)/.test(name)) s += 11;
    if (/samantha|karen|moira|daniel|alex|victoria|siri/.test(name)) s += 10;
    if (/enhanced|premium|neural|natural/.test(name)) s += 5;
    if (/compact|basic|espeak|robot/.test(name)) s -= 8;
    if (v.localService === false) s += 2; // often cloud neural on desktop
    return s;
  }

  function pickBestEnglishVoice(voices) {
    const en = (voices || []).filter((v) => /^en(-|_)/i.test(v.lang || "") || /english/i.test(v.name || ""));
    if (!en.length) return null;
    en.sort((a, b) => scoreVoice(b) - scoreVoice(a));
    return en[0];
  }

  function isLikelyBrokenSpeechSynth() {
    const ua = (navigator.userAgent || "").toLowerCase();
    // Vivo / QQ / WeChat / UC / Huawei often expose speechSynthesis but silent or no en voices
    return /vivo|iqoo|mqqbrowser|qq\//.test(ua) || /micromessenger/.test(ua) || /ucbrowser|huawei|harmony/.test(ua);
  }

  function canUseWebSpeech(voices) {
    if (!global.speechSynthesis || typeof SpeechSynthesisUtterance === "undefined") return false;
    const en = pickBestEnglishVoice(voices);
    if (!en) return false;
    // On known broken CN browsers, prefer audio fallback unless we clearly have Google/Microsoft
    if (isLikelyBrokenSpeechSynth()) {
      const n = (en.name || "").toLowerCase();
      if (!/google|microsoft|samantha|neural|natural/.test(n)) return false;
    }
    return true;
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
        currentAudio.src = "";
      } catch {
        /* ignore */
      }
      currentAudio = null;
    }
  }

  function playUrl(url) {
    return new Promise((resolve, reject) => {
      stopAll();
      const audio = new Audio();
      currentAudio = audio;
      speaking = true;
      audio.preload = "auto";
      // Soften harsh mobile speakers a bit via playbackRate only (volume stays 1 for audibility)
      audio.playbackRate = 1.0;
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

  function youdaoUrl(text, type) {
    // type 1 = UK, 2 = US — US usually clearer for learners
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
      // Softer defaults — less robotic / harsh
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
      // Safety: some WebViews never fire onend/onerror
      setTimeout(() => {
        if (!finished && speaking) {
          // assume playing; don't kill early for long sentences
        }
      }, 50);
      // If still "speaking" with no events after long time relative to text length
      const ms = Math.min(30000, 1200 + text.length * 80);
      setTimeout(() => {
        if (!finished) finish(true); // don't block UI forever
      }, ms);
    });
  }

  async function speakAudioFallback(text, opts) {
    const lang = (opts.lang || "en-US").toLowerCase().startsWith("en-gb") ? "en" : "en";
    const chunks = splitChunks(text);
    let lastEngine = "audio";
    for (const chunk of chunks) {
      const short = chunk.length <= 80;
      const candidates = [];
      // CN mobile: Youdao first for short clips (natural enough, reachable)
      if (short) candidates.push({ engine: "youdao", url: youdaoUrl(chunk, 2) });
      // Worker proxy (CORS-safe, can reach Google/Youdao server-side)
      candidates.push({ engine: "worker", url: workerTtsUrl(chunk, lang) });
      // Direct Google last (often blocked in CN / CORS)
      if (short) candidates.push({ engine: "google", url: googleTtsUrl(chunk, lang) });

      let ok = false;
      let err;
      for (const c of candidates) {
        try {
          await playUrl(c.url);
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
   * Speak English text. Prefer natural Web Speech; fall back to Youdao/Worker audio.
   * Always call from a user gesture on mobile.
   */
  async function speak(text, opts) {
    opts = opts || {};
    const t = String(text || "").trim();
    if (!t) return { engine: "none" };

    const status = opts.onStatus;
    if (opts.preferAudio || (isLikelyBrokenSpeechSynth() && !(await ensureVoices()).some((v) => /google|microsoft/i.test(v.name || "")))) {
      if (status) status("在线发音加载中…");
      try {
        const r = await speakAudioFallback(t, opts);
        if (status) status("在线发音 · " + r.engine);
        return r;
      } catch (e) {
        // try webspeech as last resort
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

  // Warm voices early (non-blocking)
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

  global.KouyuTTS = {
    speak,
    stop: stopAll,
    ensureVoices,
    pickBestEnglishVoice,
    isLikelyBrokenSpeechSynth,
    youdaoUrl,
    workerTtsUrl,
  };
})(window);
