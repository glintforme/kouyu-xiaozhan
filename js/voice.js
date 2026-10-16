/* 口语小站 · 按住说话 / 语音转写 v10（Web Speech → Whisper 云端） */
(function (global) {
  "use strict";

  const MAX_MS = 15000;
  const MIN_MS = 350;

  function hasMediaRecorder() {
    return !!(global.navigator && navigator.mediaDevices && navigator.mediaDevices.getUserMedia && global.MediaRecorder);
  }

  function SpeechRec() {
    return global.SpeechRecognition || global.webkitSpeechRecognition || null;
  }

  function hasWebSpeechRec() {
    return !!SpeechRec();
  }

  function pickRecorderMime() {
    if (!global.MediaRecorder || typeof MediaRecorder.isTypeSupported !== "function") {
      return "";
    }
    const candidates = [
      "audio/webm;codecs=opus",
      "audio/webm",
      "audio/mp4",
      "audio/ogg;codecs=opus",
    ];
    for (const c of candidates) {
      try {
        if (MediaRecorder.isTypeSupported(c)) return c;
      } catch {
        /* ignore */
      }
    }
    return "";
  }

  function writeString(view, offset, str) {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  }

  function encodeWav(samples, sampleRate) {
    const buffer = new ArrayBuffer(44 + samples.length * 2);
    const view = new DataView(buffer);
    writeString(view, 0, "RIFF");
    view.setUint32(4, 36 + samples.length * 2, true);
    writeString(view, 8, "WAVE");
    writeString(view, 12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeString(view, 36, "data");
    view.setUint32(40, samples.length * 2, true);
    let offset = 44;
    for (let i = 0; i < samples.length; i++, offset += 2) {
      const s = Math.max(-1, Math.min(1, samples[i]));
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    }
    return new Blob([buffer], { type: "audio/wav" });
  }

  function downsampleTo16k(float32, fromRate) {
    if (fromRate === 16000) return float32;
    const ratio = fromRate / 16000;
    const newLen = Math.max(1, Math.round(float32.length / ratio));
    const out = new Float32Array(newLen);
    for (let i = 0; i < newLen; i++) {
      const idx = Math.min(float32.length - 1, Math.floor(i * ratio));
      out[i] = float32[idx];
    }
    return out;
  }

  async function blobToWav16k(blob) {
    const AC = global.AudioContext || global.webkitAudioContext;
    if (!AC) throw new Error("AudioContext 不可用，无法转 WAV");
    const ctx = new AC();
    try {
      const ab = await blob.arrayBuffer();
      const decoded = await ctx.decodeAudioData(ab.slice(0));
      const ch0 = decoded.getChannelData(0);
      // mixdown if stereo
      let mono = ch0;
      if (decoded.numberOfChannels > 1) {
        const ch1 = decoded.getChannelData(1);
        mono = new Float32Array(ch0.length);
        for (let i = 0; i < ch0.length; i++) mono[i] = (ch0[i] + ch1[i]) * 0.5;
      }
      const samples = downsampleTo16k(mono, decoded.sampleRate);
      return encodeWav(samples, 16000);
    } finally {
      try {
        await ctx.close();
      } catch {
        /* ignore */
      }
    }
  }

  async function blobToBase64(blob) {
    const buf = await blob.arrayBuffer();
    const bytes = new Uint8Array(buf);
    let binary = "";
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    }
    return btoa(binary);
  }

  /**
   * Extract English-ish lines from ee bilingual reply for TTS.
   */
  function englishForSpeak(reply) {
    const s = String(reply || "");
    if (!s.trim()) return "";
    const lines = s.split(/\n+/).map((l) => l.trim()).filter(Boolean);
    const en = [];
    for (const line of lines) {
      // skip meta engine footer
      if (/^（引擎：/.test(line) || /^引擎：/.test(line)) continue;
      // strip leading bullets / marks but keep English content
      const cleaned = line
        .replace(/^[•\-–—✅❌📌]\s*/, "")
        .replace(/^教练 ee[：:]\s*/i, "")
        .replace(/（[^）]*）/g, " ")
        .replace(/\([^)]*\)/g, " ")
        .trim();
      const latin = (cleaned.match(/[A-Za-z]/g) || []).length;
      const cjk = (cleaned.match(/[\u4e00-\u9fff]/g) || []).length;
      if (latin >= 8 && latin > cjk * 1.2) {
        en.push(cleaned.replace(/\s+/g, " ").slice(0, 180));
      } else if (/^[A-Za-z0-9]/.test(cleaned) && latin >= 6) {
        en.push(cleaned.replace(/\s+/g, " ").slice(0, 180));
      }
    }
    if (en.length) return en.slice(0, 3).join(". ").slice(0, 220);
    // fallback: pull quoted English
    const q = s.match(/"([^"]{6,120})"/);
    if (q) return q[1];
    return "";
  }

  function createSession(opts) {
    opts = opts || {};
    const onStatus = typeof opts.onStatus === "function" ? opts.onStatus : () => {};
    let active = false;
    let startedAt = 0;
    let maxTimer = null;
    let stream = null;
    let recorder = null;
    let chunks = [];
    let recognition = null;
    let webSpeechText = "";
    let mode = "none";

    function clearMax() {
      if (maxTimer) {
        clearTimeout(maxTimer);
        maxTimer = null;
      }
    }

    async function start() {
      if (active) return { ok: false, reason: "already" };
      active = true;
      startedAt = Date.now();
      webSpeechText = "";
      chunks = [];
      mode = "none";

      // Prefer Web Speech on Chrome/Edge (incl. Android Chrome)
      const SR = SpeechRec();
      if (SR) {
        try {
          recognition = new SR();
          recognition.lang = opts.lang || "en-US";
          recognition.interimResults = true;
          recognition.continuous = true;
          recognition.maxAlternatives = 1;
          recognition.onresult = (ev) => {
            let finalText = "";
            let interim = "";
            for (let i = ev.resultIndex; i < ev.results.length; i++) {
              const r = ev.results[i];
              const t = r[0] && r[0].transcript ? r[0].transcript : "";
              if (r.isFinal) finalText += t;
              else interim += t;
            }
            if (finalText) webSpeechText = (webSpeechText + " " + finalText).trim();
            const show = (webSpeechText + " " + interim).trim();
            if (show) onStatus("识别中：" + show.slice(0, 48));
          };
          recognition.onerror = () => {
            /* keep recording path if any */
          };
          recognition.start();
          mode = "webspeech";
          onStatus("正在听你说…（本机识别）");
        } catch {
          recognition = null;
        }
      }

      // Always try MediaRecorder as backup / for Whisper path
      if (hasMediaRecorder()) {
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            audio: {
              echoCancellation: true,
              noiseSuppression: true,
              channelCount: 1,
            },
          });
          const mime = pickRecorderMime();
          recorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
          chunks = [];
          recorder.ondataavailable = (e) => {
            if (e.data && e.data.size > 0) chunks.push(e.data);
          };
          recorder.start(200);
          if (mode === "none") {
            mode = "recorder";
            onStatus("正在录音…松手后发给 ee");
          } else {
            mode = "webspeech+recorder";
          }
        } catch (e) {
          if (mode === "none") {
            active = false;
            onStatus("无法开麦克风，请允许权限后重试");
            return { ok: false, reason: "mic-denied", error: e };
          }
        }
      } else if (mode === "none") {
        active = false;
        onStatus("当前浏览器不支持录音");
        return { ok: false, reason: "no-recorder" };
      }

      clearMax();
      maxTimer = setTimeout(() => {
        onStatus("已达 15 秒上限，正在转写…");
        // caller should stop; fire custom event
        try {
          global.dispatchEvent(new CustomEvent("kouyu-voice-max"));
        } catch {
          /* ignore */
        }
      }, MAX_MS);

      return { ok: true, mode };
    }

    function stopTracks() {
      if (stream) {
        try {
          stream.getTracks().forEach((t) => t.stop());
        } catch {
          /* ignore */
        }
        stream = null;
      }
    }

    function stopRecognition() {
      if (recognition) {
        try {
          recognition.onresult = null;
          recognition.onerror = null;
          recognition.stop();
        } catch {
          try {
            recognition.abort();
          } catch {
            /* ignore */
          }
        }
        recognition = null;
      }
    }

    function stopRecorder() {
      return new Promise((resolve) => {
        if (!recorder || recorder.state === "inactive") {
          resolve(null);
          return;
        }
        const rec = recorder;
        recorder = null;
        const done = () => {
          const mime = rec.mimeType || "audio/webm";
          const blob = chunks.length ? new Blob(chunks, { type: mime }) : null;
          resolve(blob);
        };
        rec.onstop = done;
        try {
          rec.stop();
        } catch {
          done();
        }
      });
    }

    async function stop() {
      if (!active) return { ok: false, text: "", engine: null };
      active = false;
      clearMax();
      const elapsed = Date.now() - startedAt;
      stopRecognition();
      const blob = await stopRecorder();
      stopTracks();

      if (elapsed < MIN_MS) {
        onStatus("说得太短了，请按住多说一会儿");
        return { ok: false, text: "", engine: null, reason: "too-short" };
      }

      const localText = webSpeechText.trim();
      if (localText && localText.length >= 2) {
        onStatus("本机识别完成");
        return { ok: true, text: localText, engine: "webspeech", blob };
      }

      if (!blob || blob.size < 64) {
        onStatus("没录到声音，请靠近麦克风再试");
        return { ok: false, text: "", engine: null, reason: "empty" };
      }

      const Cloud = global.KouyuCloud;
      if (!Cloud || typeof Cloud.eeStt !== "function") {
        onStatus("云端转写不可用，请用文字输入，或换 Chrome/Edge");
        return { ok: false, text: "", engine: null, reason: "no-stt", blob };
      }

      onStatus("正在云端转写英文…");
      try {
        let wav;
        try {
          wav = await blobToWav16k(blob);
        } catch (e) {
          // send original if decode fails
          wav = blob;
        }
        const data = await Cloud.eeStt(wav, { mime: wav.type || "audio/wav" });
        const text = data && data.text ? String(data.text).trim() : "";
        if (!text) {
          onStatus("没听清，请再说一次或改打字");
          return { ok: false, text: "", engine: data && data.engine, reason: "empty-stt" };
        }
        onStatus("转写完成 · " + (data.model || data.engine || "whisper"));
        return { ok: true, text, engine: data.engine || "whisper", model: data.model, blob: wav };
      } catch (e) {
        const msg = e && e.message ? e.message : String(e);
        onStatus("转写失败：" + msg.slice(0, 80));
        return { ok: false, text: "", engine: null, reason: "stt-error", error: e };
      }
    }

    function isActive() {
      return active;
    }

    function cancel() {
      active = false;
      clearMax();
      stopRecognition();
      try {
        if (recorder && recorder.state !== "inactive") recorder.stop();
      } catch {
        /* ignore */
      }
      recorder = null;
      stopTracks();
      chunks = [];
      webSpeechText = "";
    }

    return { start, stop, cancel, isActive };
  }

  global.KouyuVoice = {
    hasWebSpeechRec,
    hasMediaRecorder,
    createSession,
    englishForSpeak,
    blobToWav16k,
    MAX_MS,
    MIN_MS,
  };
})(window);
