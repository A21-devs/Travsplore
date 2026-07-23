const { app, BrowserWindow, ipcMain, dialog, shell } = require("electron");
const path = require("path");
const fs = require("fs");

// this is the main application window
let win = null;

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 980,
    minHeight: 640,
    backgroundColor: "#0f172a",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true
    }
  });
  win.loadFile("index.html");
}

app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

// this pulls a short readable error out of a provider response body
function providerError(status, bodyText) {
  let msg = "";
  try {
    const j = JSON.parse(bodyText);
    msg =
      (j.error && (j.error.message || j.error.status || j.error.type)) ||
      (j.message) ||
      (Array.isArray(j) && j[0] && j[0].error && j[0].error.message) ||
      "";
  } catch (_) {
    msg = (bodyText || "").slice(0, 300);
  }
  if (!msg) msg = "request failed (HTTP " + status + ")";
  return "HTTP " + status + ": " + msg;
}

// build the provider-specific request
function buildAiRequest(provider, apiKey, model, system, prompt, json) {
  if (provider === "openai") {
    const body = {
      model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: prompt }
      ],
      temperature: 0.7
    };
    if (json) body.response_format = { type: "json_object" };
    return {
      url: "https://api.openai.com/v1/chat/completions",
      headers: { Authorization: "Bearer " + apiKey, "Content-Type": "application/json" },
      body: JSON.stringify(body)
    };
  }
  if (provider === "anthropic") {
    const body = { model, max_tokens: 1024, system, messages: [{ role: "user", content: prompt }] };
    return {
      url: "https://api.anthropic.com/v1/messages",
      headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify(body)
    };
  }
  if (provider === "gemini") {
    const generationConfig = { temperature: 0.7 };
    if (json) generationConfig.responseMimeType = "application/json";
    const body = {
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig
    };
    return {
      url: "https://generativelanguage.googleapis.com/v1beta/models/" +
        encodeURIComponent(model) + ":generateContent?key=" + encodeURIComponent(apiKey),
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body)
    };
  }
  return null;
}

// pull the answer text out of each provider's response shape
function extractAiText(provider, data) {
  if (provider === "openai") {
    return data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
  }
  if (provider === "anthropic") {
    return data && data.content && data.content[0] && data.content[0].text;
  }
  if (provider === "gemini") {
    return data && data.candidates && data.candidates[0] && data.candidates[0].content &&
      data.candidates[0].content.parts && data.candidates[0].content.parts[0] &&
      data.candidates[0].content.parts[0].text;
  }
  return null;
}

// this is the real AI call, one handler for all three providers. a 429 comes
// straight back with a rateLimited flag so the renderer can fall over to the
// next key for this provider instead of blocking on a wait.
ipcMain.handle("ai:generate", async (_evt, opts) => {
  const o = opts || {};
  const provider = o.provider;
  if (!o.apiKey) return { ok: false, error: "no api key" };
  if (!o.model) return { ok: false, error: "no model set" };
  const req = buildAiRequest(provider, o.apiKey, o.model, o.system || "", o.prompt || "", !!o.json);
  if (!req) return { ok: false, error: "unknown provider" };

  try {
    const res = await fetch(req.url, { method: "POST", headers: req.headers, body: req.body });
    const raw = await res.text();
    if (res.status === 429) return { ok: false, rateLimited: true, error: providerError(res.status, raw) };
    if (!res.ok) return { ok: false, error: providerError(res.status, raw) };
    let data;
    try { data = JSON.parse(raw); } catch (_) { return { ok: false, error: "bad response from provider" }; }
    const text = extractAiText(provider, data);
    if (typeof text !== "string") return { ok: false, error: "empty response" };
    return { ok: true, text };
  } catch (err) {
    return { ok: false, error: (err && err.message) || "network error" };
  }
});

// this renders html to a pdf in a hidden window and saves it
ipcMain.handle("pdf:save", async (_evt, opts) => {
  const o = opts || {};
  const html = o.html || "";
  const suggestedName = o.suggestedName || "travsplore.pdf";
  let hidden = null;
  try {
    hidden = new BrowserWindow({
      show: false,
      webPreferences: { contextIsolation: true, nodeIntegration: false }
    });
    const dataUrl =
      "data:text/html;charset=UTF-8," + encodeURIComponent(html);
    await hidden.loadURL(dataUrl);
    const buffer = await hidden.webContents.printToPDF({ printBackground: true });

    const save = await dialog.showSaveDialog(win || hidden, {
      defaultPath: suggestedName.replace(/\.pdf$/i, "") + ".pdf",
      filters: [{ name: "PDF", extensions: ["pdf"] }]
    });
    if (save.canceled || !save.filePath) {
      return { ok: false, error: "canceled" };
    }
    await fs.promises.writeFile(save.filePath, buffer);
    return { ok: true, path: save.filePath };
  } catch (err) {
    return { ok: false, error: (err && err.message) || "pdf failed" };
  } finally {
    if (hidden) hidden.destroy();
  }
});

// this saves arbitrary text contents to a file the user picks
ipcMain.handle("file:export", async (_evt, opts) => {
  const o = opts || {};
  const suggestedName = o.suggestedName || "travsplore.json";
  const contents = o.contents != null ? String(o.contents) : "";
  try {
    const save = await dialog.showSaveDialog(win, {
      defaultPath: suggestedName
    });
    if (save.canceled || !save.filePath) return { ok: false, error: "canceled" };
    await fs.promises.writeFile(save.filePath, contents, "utf8");
    return { ok: true, path: save.filePath };
  } catch (err) {
    return { ok: false, error: (err && err.message) || "export failed" };
  }
});

// this reads a file the user picks back into the renderer
ipcMain.handle("file:import", async (_evt, opts) => {
  const o = opts || {};
  const extensions =
    Array.isArray(o.extensions) && o.extensions.length ? o.extensions : ["json"];
  try {
    const open = await dialog.showOpenDialog(win, {
      properties: ["openFile"],
      filters: [{ name: "Files", extensions }]
    });
    if (open.canceled || !open.filePaths || !open.filePaths[0]) {
      return { ok: false, error: "canceled" };
    }
    const filePath = open.filePaths[0];
    const contents = await fs.promises.readFile(filePath, "utf8");
    return { ok: true, name: path.basename(filePath), contents };
  } catch (err) {
    return { ok: false, error: (err && err.message) || "import failed" };
  }
});

// this opens a url in the user's default browser
ipcMain.on("open:external", (_evt, url) => {
  if (typeof url === "string" && /^https?:\/\//i.test(url)) {
    shell.openExternal(url);
  }
});
