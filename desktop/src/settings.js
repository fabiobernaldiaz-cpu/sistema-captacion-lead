/* ══════════════════════════════════════════════════════════════
   Ajustes de la app en %APPDATA%/RedesiaNet Monitor/settings.json.
   El token se guarda cifrado con safeStorage (DPAPI en Windows): solo
   tu usuario de Windows puede descifrarlo.
   ══════════════════════════════════════════════════════════════ */
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const DEFAULTS = {
  site: "https://redesianet.com",
  tokenEnc: "",
  tokenPlain: "",
  pollSeconds: 15,
  notifyLeads: true,
  notifySubs: true,
  notifyVisits: "new", // off | new | all
  sound: true,
  openAtLogin: true,
  minimizeToTray: true,
  trayHintShown: false,
  pausedUntil: 0,
  lastIds: null,
  rangeDays: 30,
};

class Settings {
  constructor(dir, safeStorage) {
    this.file = path.join(dir, "settings.json");
    this.safe = safeStorage;
    this.data = Object.assign({}, DEFAULTS);
    try {
      Object.assign(this.data, JSON.parse(fs.readFileSync(this.file, "utf8")));
    } catch (e) { /* primera vez */ }
  }

  get(k) { return this.data[k]; }

  set(patch) {
    Object.assign(this.data, patch);
    this.flush();
  }

  flush() {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = this.file + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2));
    fs.renameSync(tmp, this.file);
  }

  canEncrypt() {
    try { return !!(this.safe && this.safe.isEncryptionAvailable()); } catch (e) { return false; }
  }

  getToken() {
    if (this.data.tokenEnc && this.canEncrypt()) {
      try { return this.safe.decryptString(Buffer.from(this.data.tokenEnc, "base64")); } catch (e) { return ""; }
    }
    return this.data.tokenPlain || "";
  }

  setToken(token) {
    token = String(token || "").trim();
    if (this.canEncrypt()) {
      this.set({ tokenEnc: token ? this.safe.encryptString(token).toString("base64") : "", tokenPlain: "" });
    } else {
      this.set({ tokenPlain: token, tokenEnc: "" });
    }
  }

  /* Lo que puede ver la ventana: nunca el token */
  public() {
    const t = this.getToken();
    const d = Object.assign({}, this.data);
    delete d.tokenEnc;
    delete d.tokenPlain;
    delete d.lastIds;
    d.hasToken = !!t;
    d.tokenHint = t ? t.slice(0, 4) + "…" + t.slice(-4) : "";
    d.encrypted = this.canEncrypt();
    return d;
  }
}

module.exports = { Settings, DEFAULTS };
