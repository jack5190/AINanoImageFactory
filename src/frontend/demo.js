const STORAGE_KEY = "nanoimg.settings";
const API_BASE = "/api";

const el = (id) => document.getElementById(id);

function loadSettings() {
  try {
    const data = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return data || {};
  } catch (err) {
    return {};
  }
}

function saveSettings(settings) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

function hydrate() {
  const settings = loadSettings();
  el("demoApiKey").value = settings.apiKey || "";
  el("demoBaseUrl").value =
    settings.baseUrl ||
    "https://generativelanguage.googleapis.com/v1beta/models/imagen-4.0-fast-generate-001:predict";
  el("demoModel").value = settings.model || "imagen-4.0-fast-generate-001";
  el("demoReturnType").value = settings.returnType || "base64";
}

function readSettings() {
  return {
    apiKey: el("demoApiKey").value.trim(),
    baseUrl: el("demoBaseUrl").value.trim(),
    model: el("demoModel").value.trim(),
    returnType: el("demoReturnType").value,
  };
}

async function validateKey() {
  const settings = readSettings();
  const response = await fetch(`${API_BASE}/key/status`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": settings.apiKey,
      "X-Base-Url": settings.baseUrl,
    },
    body: JSON.stringify({ api_key: settings.apiKey, base_url: settings.baseUrl }),
  });
  const data = await response.json();
  const status = el("validateStatus");
  if (data.ok) {
    status.textContent = `Key valid. Models: ${(data.models || []).join(", ") || "unknown"}`;
  } else {
    status.textContent = `Key invalid: ${data.message || "check console"}`;
  }
}

function getImageSrc(image) {
  if (image.url) return image.url;
  if (image.data) {
    const mime = image.mime || "image/png";
    return `data:${mime};base64,${image.data}`;
  }
  return "";
}

async function runTest() {
  const settings = readSettings();
  const payload = {
    prompt: el("demoPrompt").value.trim(),
    negative_prompt: el("demoNegative").value.trim(),
    count: parseInt(el("demoCount").value, 10) || 1,
    return_type: settings.returnType,
  };

  const response = await fetch(`${API_BASE}/generate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": settings.apiKey,
      "X-Base-Url": settings.baseUrl,
      "X-Model": settings.model,
      "X-Return-Type": settings.returnType,
    },
    body: JSON.stringify(payload),
  });
  const data = await response.json();
  const output = el("demoOutput");
  output.innerHTML = "";

  (data.results || []).forEach((result) => {
    (result.images || []).forEach((image) => {
      const card = document.createElement("div");
      card.className = "output-card";
      const src = getImageSrc(image);
      card.innerHTML = `
        <img src="${src}" alt="preview" />
        <div style="font-size: 12px; opacity: 0.7">${result.prompt}</div>
      `;
      output.appendChild(card);
    });
  });

  el("demoLog").textContent = JSON.stringify(data, null, 2);
}

function init() {
  hydrate();
  el("saveConfigBtn").addEventListener("click", () => {
    const settings = readSettings();
    saveSettings(settings);
  });
  el("validateKeyBtn").addEventListener("click", validateKey);
  el("testGenerateBtn").addEventListener("click", runTest);
}

init();
