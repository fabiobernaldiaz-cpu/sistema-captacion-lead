/* ══════════════════════════════════════════════════════════════
   RedesiaNet Monitor · proceso principal (Electron)
   - Ventana con el panel (src/renderer)
   - Icono en la bandeja: sigue vigilando aunque cierres la ventana
   - Avisos nativos de Windows al entrar un lead o una visita
   - Arranca con Windows (opcional, en segundo plano)
   ══════════════════════════════════════════════════════════════ */
"use strict";

const path = require("node:path");
const fs = require("node:fs");
const {
  app, BrowserWindow, Tray, Menu, Notification, ipcMain, shell, nativeImage, safeStorage, dialog, net, powerMonitor,
} = require("electron");
const { Settings } = require("./settings");
const { createClient, normalizeSite } = require("./api");
const { Poller } = require("./poller");

const APP_ID = "com.redesianet.monitor";
const ROOT = path.join(__dirname, "..");
const ICON = path.join(ROOT, "build", "icon.png");
const TRAY_ICON = path.join(ROOT, "build", process.platform === "win32" ? "tray.png" : "tray@2x.png");
const TRAY_ALERT = path.join(ROOT, "build", "tray-alert.png");

app.setAppUserModelId(APP_ID); // necesario para los avisos de Windows
if (!app.requestSingleInstanceLock()) {
  app.quit();
}

let win = null;
let tray = null;
let settings = null;
let poller = null;
let client = null;
let unread = 0;
let quitting = false;
const startHidden = process.argv.includes("--hidden");

function getClient() {
  const token = settings.getToken();
  const site = settings.get("site");
  if (!token || !site) return null;
  if (!client || client.site !== normalizeSite(site) || client.token !== token) {
    client = createClient({ site, token, fetchImpl: (url, opts) => net.fetch(url, opts) });
    client.token = token;
  }
  return client;
}

/* ── Ventana ──────────────────────────────────────────────── */
function createWindow() {
  win = new BrowserWindow({
    width: 1320,
    height: 860,
    minWidth: 980,
    minHeight: 640,
    show: false,
    backgroundColor: "#000000",
    title: "RedesiaNet Monitor",
    icon: image(ICON),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });
  win.removeMenu();
  win.loadFile(path.join(__dirname, "renderer", "index.html"));
  win.once("ready-to-show", () => { if (!startHidden) win.show(); });
  win.on("focus", () => { unread = 0; refreshBadge(); });
  win.on("close", (e) => {
    if (quitting || !settings.get("minimizeToTray")) return;
    e.preventDefault();
    win.hide();
    if (!settings.get("trayHintShown")) {
      settings.set({ trayHintShown: true });
      toast({ title: "RedesiaNet Monitor sigue activo", body: "Te seguirá avisando desde la bandeja. Para salir: clic derecho en el icono → Salir." });
    }
  });
  // nada de navegar fuera del panel: los enlaces se abren en el navegador
  win.webContents.setWindowOpenHandler(({ url }) => { openExternal(url); return { action: "deny" }; });
  win.webContents.on("will-navigate", (e, url) => {
    if (!url.startsWith("file://")) { e.preventDefault(); openExternal(url); }
  });
}

function showWindow() {
  if (!win) createWindow();
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

function openExternal(url) {
  try {
    const u = new URL(url);
    if (["https:", "http:", "mailto:", "tel:"].includes(u.protocol)) shell.openExternal(u.toString());
  } catch (e) { /* URL no válida: se ignora */ }
}

function send(channel, payload) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
}

/* ── Bandeja ──────────────────────────────────────────────── */
// Los iconos van dentro de app.asar: fs sabe leer ahí, así que pasamos por un buffer
const images = {};
function image(file) {
  if (!images[file]) {
    images[file] = fs.existsSync(file) ? nativeImage.createFromBuffer(fs.readFileSync(file)) : nativeImage.createEmpty();
  }
  return images[file];
}

function trayImage(alert) {
  const file = alert && fs.existsSync(TRAY_ALERT) ? TRAY_ALERT : TRAY_ICON;
  return image(fs.existsSync(file) ? file : ICON).resize({ width: 16, height: 16 });
}

function buildTrayMenu() {
  const paused = settings.get("pausedUntil") > Date.now();
  return Menu.buildFromTemplate([
    { label: "Abrir panel", click: showWindow },
    { label: "Comprobar ahora", click: () => poller.restart() },
    { type: "separator" },
    paused
      ? { label: "Reanudar avisos", click: () => { settings.set({ pausedUntil: 0 }); refreshTray(); } }
      : { label: "Pausar avisos 1 hora", click: () => { settings.set({ pausedUntil: Date.now() + 3600e3 }); refreshTray(); } },
    { label: "Abrir la web", click: () => openExternal(settings.get("site")) },
    { type: "separator" },
    { label: "Salir", click: () => { quitting = true; app.quit(); } },
  ]);
}

function refreshTray() {
  if (!tray) return;
  const labels = { online: "conectado", offline: "sin conexión", auth_error: "token no válido", unconfigured: "sin configurar", idle: "iniciando" };
  tray.setToolTip("RedesiaNet Monitor · " + (labels[poller.status] || poller.status) + (unread ? " · " + unread + " sin ver" : ""));
  tray.setImage(trayImage(unread > 0));
  tray.setContextMenu(buildTrayMenu());
}

function refreshBadge() {
  refreshTray();
  if (!win || win.isDestroyed()) return;
  if (process.platform === "win32") {
    win.setOverlayIcon(unread > 0 ? image(TRAY_ALERT) : null, unread > 0 ? unread + " novedades" : "");
  } else if (app.setBadgeCount) {
    app.setBadgeCount(unread);
  }
}

/* ── Avisos ───────────────────────────────────────────────── */
function toast({ title, body, urgent, onClick }) {
  if (!Notification.isSupported()) return;
  const n = new Notification({
    title, body, icon: image(ICON), silent: !settings.get("sound"),
    urgency: urgent ? "critical" : "normal", timeoutType: urgent ? "never" : "default",
  });
  n.on("click", () => { showWindow(); if (onClick) onClick(); });
  n.show();
}

function onNotify(n) {
  const focused = win && win.isVisible() && win.isFocused();
  if (n.kind === "lead" || n.kind === "leads" || n.kind === "subs") {
    if (!focused) { unread++; refreshBadge(); }
    if (win && !focused && (n.kind === "lead" || n.kind === "leads")) win.flashFrame(true);
  }
  toast({
    title: n.title,
    body: n.body,
    urgent: n.urgent,
    onClick: () => send("rn:navigate", n.kind === "lead" ? { view: "leads", leadId: n.id }
      : n.kind === "leads" ? { view: "leads" } : n.kind === "subs" ? { view: "subs" } : { view: "live" }),
  });
}

/* ── IPC con la ventana ───────────────────────────────────── */
function registerIpc() {
  ipcMain.handle("rn:get-settings", () => Object.assign(settings.public(), {
    status: poller.status, version: app.getVersion(),
  }));

  ipcMain.handle("rn:save-settings", async (_e, patch) => {
    const allowed = ["site", "pollSeconds", "notifyLeads", "notifySubs", "notifyVisits", "sound", "openAtLogin", "minimizeToTray", "rangeDays"];
    const clean = {};
    for (const k of allowed) if (k in patch) clean[k] = patch[k];
    let reconnect = false;
    if ("site" in clean) {
      try { clean.site = normalizeSite(clean.site); } catch (e) { return { ok: false, error: "La dirección de la web no es válida" }; }
      if (clean.site !== settings.get("site")) reconnect = true;
    }
    if (typeof patch.token === "string" && patch.token.trim()) {
      const t = patch.token.trim();
      if (!/^[a-f0-9]{32,128}$/i.test(t)) return { ok: false, error: "El token debe ser el código que te dio setup.php (letras a-f y números)." };
      // probamos antes de guardar
      const probe = createClient({ site: clean.site || settings.get("site"), token: t, fetchImpl: (u, o) => net.fetch(u, o) });
      try { await probe.call("ping"); } catch (err) { return { ok: false, error: err.message }; }
      settings.setToken(t);
      reconnect = true;
    }
    settings.set(clean);
    if ("openAtLogin" in clean) applyLoginItem();
    if (reconnect) { client = null; poller.restart({ resetIds: true }); }
    refreshTray();
    return { ok: true, settings: settings.public() };
  });

  ipcMain.handle("rn:api", async (_e, action, opts) => {
    const c = getClient();
    if (!c) return { ok: false, error: "Configura la conexión en Ajustes" };
    if (action === "export") return { ok: false, error: "Usa exportar" };
    try { return await c.call(action, opts || {}); } catch (err) { return { ok: false, error: err.message, status: err.status }; }
  });

  ipcMain.handle("rn:test", async () => {
    const c = getClient();
    if (!c) return { ok: false, error: "Falta el token" };
    try { return await c.call("ping"); } catch (err) { return { ok: false, error: err.message }; }
  });

  ipcMain.handle("rn:export", async (_e, type) => {
    const c = getClient();
    if (!c) return { ok: false, error: "Configura la conexión en Ajustes" };
    const kind = type === "subscribers" ? "subscribers" : "leads";
    try {
      const { csv } = await c.call("export", { params: { type: kind } });
      const res = await dialog.showSaveDialog(win, {
        title: "Guardar CSV",
        defaultPath: path.join(app.getPath("documents"), "redesianet-" + kind + "-" + new Date().toISOString().slice(0, 10) + ".csv"),
        filters: [{ name: "CSV (Excel)", extensions: ["csv"] }],
      });
      if (res.canceled || !res.filePath) return { ok: false, canceled: true };
      fs.writeFileSync(res.filePath, csv, "utf8");
      shell.showItemInFolder(res.filePath);
      return { ok: true, file: res.filePath };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle("rn:open-external", (_e, url) => { openExternal(url); return true; });
  ipcMain.handle("rn:check-now", () => { poller.restart(); return true; });
}

function applyLoginItem() {
  if (process.platform !== "win32" && process.platform !== "darwin") return;
  app.setLoginItemSettings({ openAtLogin: !!settings.get("openAtLogin"), args: ["--hidden"] });
}

/* ── Arranque ─────────────────────────────────────────────── */
app.on("second-instance", showWindow);

app.whenReady().then(() => {
  settings = new Settings(app.getPath("userData"), safeStorage);
  poller = new Poller({
    getClient,
    getSettings: () => settings.data,
    loadIds: () => settings.get("lastIds"),
    saveIds: (ids) => settings.set({ lastIds: ids }),
  });
  poller.on("status", (s) => { send("rn:status", s); refreshTray(); });
  poller.on("events", (e) => send("rn:events", e));
  poller.on("notify", onNotify);

  registerIpc();
  createWindow();
  tray = new Tray(trayImage(false));
  tray.on("click", showWindow);
  refreshTray();
  applyLoginItem();
  poller.start();

  // al volver de suspensión, comprobamos enseguida
  powerMonitor.on("resume", () => poller.restart());
});

app.on("before-quit", () => { quitting = true; });
app.on("window-all-closed", () => {
  // en Windows la app sigue en la bandeja; solo sale desde el menú
  if (!settings || !settings.get("minimizeToTray")) app.quit();
});
