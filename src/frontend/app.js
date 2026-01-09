const API_BASE = "/api";
const STORAGE_KEYS = {
  templates: "nanoimg.templates",
  settings: "nanoimg.settings",
  history: "nanoimg.history",
};

const state = {
  templates: [],
  selectedTemplateId: null,
  outputs: [],
  history: [],
  settings: {
    apiKey: "",
    baseUrl: "",
    model: "",
    returnType: "base64",
  },
};

const el = (id) => document.getElementById(id);

const promptOutput = el("promptOutput");
const templateGrid = el("templateGrid");
const templateMeta = el("templateMeta");
const outputGrid = el("outputGrid");
const historyList = el("historyList");
const apiDot = el("apiDot");
const apiStatus = el("apiStatus");
const queueStatus = el("queueStatus");
const imageCount = el("imageCount");

function loadLocal(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch (err) {
    return fallback;
  }
}

function saveLocal(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function updateStatus({ apiOk, message }) {
  apiDot.className = `status-dot ${apiOk ? "ok" : "warn"}`;
  apiStatus.textContent = message;
}

function getFieldValues() {
  return {
    industry: el("fieldIndustry").value.trim(),
    audience: el("fieldAudience").value.trim(),
    selling: el("fieldSelling").value.trim(),
    style: el("fieldStyle").value.trim(),
    size: el("fieldSize").value.trim(),
    language: el("fieldLanguage").value.trim(),
    forbidden: el("fieldForbidden").value.trim(),
    count: parseInt(el("fieldCount").value, 10) || 1,
  };
}

function getSettings() {
  return {
    apiKey: el("fieldApiKey").value.trim(),
    returnType: el("fieldReturnType").value,
    concurrency: parseInt(el("fieldConcurrency").value, 10) || 1,
    retry: parseInt(el("fieldRetry").value, 10) || 0,
  };
}

function hydrateSettings() {
  const settings = loadLocal(STORAGE_KEYS.settings, state.settings);
  state.settings = settings;
  el("fieldApiKey").value = settings.apiKey || "";
  el("fieldReturnType").value = settings.returnType || "base64";
}

function persistSettings() {
  const current = getSettings();
  state.settings = { ...state.settings, ...current };
  saveLocal(STORAGE_KEYS.settings, state.settings);
}

function replaceTokens(templateString, fields, template) {
  const tokens = {
    industry: fields.industry,
    audience: fields.audience,
    selling: fields.selling,
    style: fields.style,
    size: fields.size,
    language: fields.language,
    forbidden: fields.forbidden,
    template: template.name,
  };

  let output = templateString || "";
  Object.entries(tokens).forEach(([key, value]) => {
    const regex = new RegExp(`\\{${key}\\}`, "g");
    output = output.replace(regex, value || "");
  });
  return output.trim();
}

function applyTemplatePrompt(template, fields) {
  let prompt = replaceTokens(template.prompt || "", fields, template);

  const tail = [
    fields.size && !prompt.includes(fields.size) ? `Size: ${fields.size}` : "",
    fields.language && !prompt.includes(fields.language) ? `Language: ${fields.language}` : "",
  ]
    .filter(Boolean)
    .join(" | ");

  if (tail) {
    prompt = `${prompt}\n${tail}`.trim();
  }

  return prompt.trim();
}

function buildPrompt() {
  const fields = getFieldValues();
  const template = state.templates.find((item) => item.id === state.selectedTemplateId) || state.templates[0];
  if (!template) {
    promptOutput.value = "";
    return { prompt: "", negativePrompt: "" };
  }
  const prompt = applyTemplatePrompt(template, fields);
  const negativePrompt = [
    replaceTokens(template.negative || "", fields, template),
    fields.forbidden,
  ]
    .filter(Boolean)
    .join(", ");
  promptOutput.value = prompt;
  return { prompt, negativePrompt };
}

function renderTemplates() {
  templateGrid.innerHTML = "";
  templateMeta.innerHTML = "";

  if (!state.templates.length) {
    templateGrid.innerHTML = "<p>No templates loaded.</p>";
    return;
  }

  const categories = new Set(state.templates.map((template) => template.category));
  templateMeta.innerHTML = `
    <span>Total: ${state.templates.length}</span>
    ${[...categories]
      .map((category) => `<span>${category}</span>`)
      .join("")}
  `;

  state.templates.forEach((template) => {
    const card = document.createElement("div");
    card.className = "template-card";
    if (template.id === state.selectedTemplateId) {
      card.classList.add("active");
    }
    card.innerHTML = `
      <h4>${template.name}</h4>
      <div class="kv">
        <span>${template.format}</span>
        <span>${template.ratio}</span>
        <span>${template.category}</span>
      </div>
      <p style="font-size: 12px; opacity: 0.7">${template.description}</p>
      <span class="badge">${template.id}</span>
    `;
    card.addEventListener("click", () => {
      state.selectedTemplateId = template.id;
      saveLocal(STORAGE_KEYS.templates, state.templates);
      renderTemplates();
      buildPrompt();
    });
    templateGrid.appendChild(card);
  });
}

async function loadTemplates() {
  const stored = loadLocal(STORAGE_KEYS.templates, null);
  if (stored && Array.isArray(stored) && stored.length) {
    state.templates = stored;
    state.selectedTemplateId = stored[0].id;
    renderTemplates();
    buildPrompt();
    return;
  }

  const response = await fetch("/config/templates.json");
  const payload = await response.json();
  state.templates = payload.templates || [];
  state.selectedTemplateId = state.templates[0]?.id || null;
  saveLocal(STORAGE_KEYS.templates, state.templates);
  renderTemplates();
  buildPrompt();
}

function renderOutputs() {
  outputGrid.innerHTML = "";
  state.outputs.forEach((asset) => {
    const card = document.createElement("div");
    card.className = "output-card";
    card.innerHTML = `
      <img src="${asset.src}" alt="generated asset" />
      <div class="output-actions">
        <button class="button ghost" data-action="copy">Copy Prompt</button>
        <a class="button secondary" href="${asset.src}" download="${asset.filename}">Download</a>
      </div>
      <div style="font-size: 12px; opacity: 0.7">${asset.prompt}</div>
    `;
    card.querySelector('[data-action="copy"]').addEventListener("click", () => {
      navigator.clipboard.writeText(asset.prompt || "");
    });
    outputGrid.appendChild(card);
  });
  imageCount.textContent = String(state.outputs.length);
}

function renderHistory() {
  historyList.innerHTML = "";
  if (!state.history.length) {
    historyList.innerHTML = "<p>No history yet.</p>";
    return;
  }
  state.history.slice(0, 8).forEach((item) => {
    const row = document.createElement("div");
    row.className = "history-item";
    row.textContent = `${item.date} | ${item.template} | ${item.prompt}`;
    historyList.appendChild(row);
  });
}

function pushHistory(entry) {
  state.history.unshift(entry);
  saveLocal(STORAGE_KEYS.history, state.history.slice(0, 40));
  renderHistory();
}

async function apiGenerate(prompt, negativePrompt, count, returnType, size) {
  const settings = getSettings();
  const baseUrl = state.settings.baseUrl || "";
  const model = state.settings.model || "";
  const payload = {
    prompt,
    negative_prompt: negativePrompt,
    count,
    return_type: returnType,
    size,
  };
  const response = await fetch(`${API_BASE}/generate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": settings.apiKey || state.settings.apiKey || "",
      "X-Base-Url": baseUrl,
      "X-Model": model,
      "X-Return-Type": returnType || "base64",
    },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || "Request failed");
  }
  return response.json();
}

function getImageSrc(image) {
  if (image.url) return image.url;
  if (image.data) {
    const mime = image.mime || "image/png";
    return `data:${mime};base64,${image.data}`;
  }
  return "";
}

class QueueRunner {
  constructor({ concurrency, retry }) {
    this.concurrency = concurrency;
    this.retry = retry;
    this.pending = [];
    this.active = 0;
  }

  add(task, fallback) {
    this.pending.push({ task, fallback, attempts: 0 });
  }

  async run() {
    return new Promise((resolve) => {
      const next = () => {
        if (this.pending.length === 0 && this.active === 0) {
          resolve();
          return;
        }
        while (this.active < this.concurrency && this.pending.length) {
          const job = this.pending.shift();
          job.attempts += 1;
          this.active += 1;
          queueStatus.textContent = `Running (${this.active} active)`;
          job
            .task()
            .catch((err) => {
              if (job.attempts <= this.retry) {
                this.pending.push(job);
              } else {
                console.warn("Job failed", err);
                if (job.fallback) {
                  job.fallback(err);
                }
              }
            })
            .finally(() => {
              this.active -= 1;
              next();
            });
        }
      };
      next();
    });
  }
}

function base64ToUint8(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function stringToBase64(value) {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

function buildFallbackSvg(prompt) {
  const safe = (prompt || "")
    .slice(0, 90)
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="768">
  <defs>
    <linearGradient id="bg" x1="0" x2="1" y1="0" y2="1">
      <stop offset="0%" stop-color="#0b1020" />
      <stop offset="100%" stop-color="#00a6a6" />
    </linearGradient>
  </defs>
  <rect width="100%" height="100%" fill="url(#bg)" />
  <rect x="64" y="64" width="896" height="640" rx="32" fill="rgba(255,255,255,0.1)" />
  <text x="96" y="160" fill="#ffffff" font-size="34" font-family="Space Grotesk, sans-serif">Fallback Asset</text>
  <text x="96" y="220" fill="#f6c453" font-size="18" font-family="IBM Plex Sans, sans-serif">${safe}</text>
</svg>`;
}

function makeFallbackAsset(prompt) {
  const svg = buildFallbackSvg(prompt);
  const base64 = stringToBase64(svg);
  return `data:image/svg+xml;base64,${base64}`;
}

function crc32(bytes) {
  let crc = 0 ^ -1;
  for (let i = 0; i < bytes.length; i += 1) {
    crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ bytes[i]) & 0xff];
  }
  return (crc ^ -1) >>> 0;
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
})();

function createZip(files) {
  let offset = 0;
  const fileData = [];
  const directory = [];

  files.forEach((file) => {
    const nameBytes = new TextEncoder().encode(file.name);
    const data = file.data;
    const crc = crc32(data);

    const localHeader = new Uint8Array(30 + nameBytes.length);
    const view = new DataView(localHeader.buffer);
    view.setUint32(0, 0x04034b50, true);
    view.setUint16(4, 20, true);
    view.setUint16(6, 0, true);
    view.setUint16(8, 0, true);
    view.setUint16(10, 0, true);
    view.setUint16(12, 0, true);
    view.setUint32(14, crc, true);
    view.setUint32(18, data.length, true);
    view.setUint32(22, data.length, true);
    view.setUint16(26, nameBytes.length, true);
    view.setUint16(28, 0, true);
    localHeader.set(nameBytes, 30);

    fileData.push(localHeader, data);

    const centralHeader = new Uint8Array(46 + nameBytes.length);
    const cview = new DataView(centralHeader.buffer);
    cview.setUint32(0, 0x02014b50, true);
    cview.setUint16(4, 20, true);
    cview.setUint16(6, 20, true);
    cview.setUint16(8, 0, true);
    cview.setUint16(10, 0, true);
    cview.setUint16(12, 0, true);
    cview.setUint16(14, 0, true);
    cview.setUint32(16, crc, true);
    cview.setUint32(20, data.length, true);
    cview.setUint32(24, data.length, true);
    cview.setUint16(28, nameBytes.length, true);
    cview.setUint16(30, 0, true);
    cview.setUint16(32, 0, true);
    cview.setUint16(34, 0, true);
    cview.setUint16(36, 0, true);
    cview.setUint32(38, 0, true);
    cview.setUint32(42, offset, true);
    centralHeader.set(nameBytes, 46);

    directory.push(centralHeader);
    offset += localHeader.length + data.length;
  });

  const centralSize = directory.reduce((sum, entry) => sum + entry.length, 0);
  const endRecord = new Uint8Array(22);
  const eview = new DataView(endRecord.buffer);
  eview.setUint32(0, 0x06054b50, true);
  eview.setUint16(4, 0, true);
  eview.setUint16(6, 0, true);
  eview.setUint16(8, files.length, true);
  eview.setUint16(10, files.length, true);
  eview.setUint32(12, centralSize, true);
  eview.setUint32(16, offset, true);
  eview.setUint16(20, 0, true);

  return new Blob([...fileData, ...directory, endRecord], { type: "application/zip" });
}

function downloadZip() {
  if (!state.outputs.length) return;
  const files = state.outputs.map((asset, index) => {
    const isSvg = asset.src.startsWith("data:image/svg+xml");
    const base64 = asset.src.split(",")[1];
    return {
      name: `asset-${String(index + 1).padStart(2, "0")}.${isSvg ? "svg" : "png"}`,
      data: base64ToUint8(base64),
    };
  });
  const blob = createZip(files);
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "nanoimg-delivery.zip";
  document.body.appendChild(link);
  link.click();
  link.remove();
}

async function handleGenerate() {
  persistSettings();
  const fields = getFieldValues();
  const { prompt, negativePrompt } = buildPrompt();
  if (!prompt) return;

  state.outputs = [];
  renderOutputs();

  const settings = getSettings();
  const queue = new QueueRunner({
    concurrency: settings.concurrency,
    retry: settings.retry,
  });

  for (let i = 0; i < fields.count; i += 1) {
    queue.add(
      async () => {
        const data = await apiGenerate(prompt, negativePrompt, 1, settings.returnType, fields.size);
        data.results.forEach((result) => {
          result.images.forEach((image) => {
            const src = getImageSrc(image);
            if (!src) return;
            state.outputs.push({
              src,
              prompt,
              filename: `asset-${state.outputs.length + 1}.png`,
            });
          });
        });
        renderOutputs();
      },
      () => {
        const src = makeFallbackAsset(prompt);
        state.outputs.push({
          src,
          prompt,
          filename: `asset-${state.outputs.length + 1}.svg`,
        });
        renderOutputs();
      }
    );
  }

  queueStatus.textContent = "Queued";
  await queue.run();
  queueStatus.textContent = "Complete";

  pushHistory({
    date: new Date().toISOString().slice(0, 19).replace("T", " "),
    template: state.selectedTemplateId,
    prompt,
  });
}

async function checkHealth() {
  try {
    const response = await fetch(`${API_BASE}/health`);
    if (!response.ok) throw new Error("Health check failed");
    updateStatus({ apiOk: true, message: "Proxy reachable" });
  } catch (err) {
    updateStatus({ apiOk: false, message: "Proxy offline" });
  }
}

function exportTemplates() {
  const blob = new Blob([JSON.stringify({ templates: state.templates }, null, 2)], {
    type: "application/json",
  });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "nanoimg-templates.json";
  document.body.appendChild(link);
  link.click();
  link.remove();
}

function importTemplates(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      if (Array.isArray(data.templates)) {
        state.templates = data.templates;
        state.selectedTemplateId = data.templates[0]?.id || null;
        saveLocal(STORAGE_KEYS.templates, state.templates);
        renderTemplates();
      }
    } catch (err) {
      console.warn("Failed to import templates", err);
    }
  };
  reader.readAsText(file);
}

function init() {
  state.history = loadLocal(STORAGE_KEYS.history, []);
  renderHistory();
  hydrateSettings();
  loadTemplates();
  checkHealth();

  el("generatePromptBtn").addEventListener("click", () => buildPrompt());
  el("generateImagesBtn").addEventListener("click", handleGenerate);
  el("downloadZipBtn").addEventListener("click", downloadZip);
  el("exportTemplatesBtn").addEventListener("click", exportTemplates);
  el("importTemplatesInput").addEventListener("change", importTemplates);
  el("fieldApiKey").addEventListener("change", persistSettings);

  [
    "fieldIndustry",
    "fieldAudience",
    "fieldSelling",
    "fieldStyle",
    "fieldSize",
    "fieldLanguage",
    "fieldForbidden",
  ].forEach((id) => {
    el(id).addEventListener("change", buildPrompt);
  });
}

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("service-worker.js");
}

init();
