'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { defaultSettings, normalizeModel } = require('../config/defaults');

const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.cwd(), process.env.DATA_DIR)
  : path.join(__dirname, '..', '..', 'data');

const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');

for (const dir of [DATA_DIR, UPLOAD_DIR]) {
  fs.mkdirSync(dir, { recursive: true });
}

function readJson(file, fallback) {
  try {
    const raw = fs.readFileSync(path.join(DATA_DIR, file), 'utf8');
    if (!raw.trim()) return fallback;
    return JSON.parse(raw);
  } catch (err) {
    if (err.code !== 'ENOENT') {
      console.warn(`[store] No se pudo leer ${file}: ${err.message}`);
    }
    return fallback;
  }
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function deepMerge(base, extra) {
  if (!isPlainObject(base)) return extra === undefined ? base : extra;
  if (!isPlainObject(extra)) return base;
  const out = { ...base };
  for (const [key, value] of Object.entries(extra)) {
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue;
    if (isPlainObject(value) && isPlainObject(base[key])) {
      out[key] = deepMerge(base[key], value);
    } else {
      out[key] = value;
    }
  }
  return out;
}

class Collection {
  constructor(name, fallback) {
    this.name = name;
    this.fallback = fallback;
    this.file = path.join(DATA_DIR, `${name}.json`);
    this.dirty = false;
    this.lastCheck = Date.now();
    this.lastMtime = this.getFileMtime();
    this._data = this.load(fallback);
    this.timer = null;
  }

  getFileMtime() {
    try {
      return fs.statSync(this.file).mtimeMs;
    } catch (_) {
      return 0;
    }
  }

  get data() {
    const now = Date.now();
    if (!this.dirty && now - this.lastCheck > 1000) {
      this.lastCheck = now;
      const mtime = this.getFileMtime();
      if (mtime && mtime !== this.lastMtime) {
        this.lastMtime = mtime;
        this._data = this.load(this.fallback);
      }
    }
    return this._data;
  }

  set data(next) {
    this._data = next;
    this.dirty = true;
  }

  load(fallback) {
    let value = readJson(`${this.name}.json`, fallback);
    if (this.name === 'settings') {
      const defaults = defaultSettings();
      value = deepMerge(defaults, value || {});
      if (value.ai) {
        value.ai.model = normalizeModel(value.ai.provider, value.ai.model);
        if (
          value.ai.systemPrompt &&
          value.ai.systemPrompt.includes('Eres {{asistente}}, el asistente virtual de {{negocio_nombre}}.') &&
          !value.ai.systemPrompt.includes('Quetzales')
        ) {
          value.ai.systemPrompt = '';
        }
      }
      if (value.business) {
        if (value.business.country === 'Colombia' || !value.business.country) {
          value.business.country = defaults.business.country;
        }
        if (/Bogot[aá]/i.test(value.business.address || '')) {
          value.business.address = defaults.business.address;
        }
        if (/^\+57\b/.test(value.business.phone || '')) {
          value.business.phone = defaults.business.phone;
        }
        if (Array.isArray(value.business.products) && value.business.products.some((p) => p && p.price === '89.900')) {
          value.business.products = defaults.business.products;
        }
      }
    }
    this.lastMtime = this.getFileMtime();
    return value;
  }

  save() {
    this.dirty = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), 120);
    if (this.timer.unref) this.timer.unref();
    return this;
  }

  flush() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (!this.dirty) return;
    const tmp = `${this.file}.${process.pid}.tmp`;
    try {
      fs.writeFileSync(tmp, JSON.stringify(this._data, null, 0), 'utf8');
      fs.renameSync(tmp, this.file);
      this.dirty = false;
      this.lastMtime = this.getFileMtime();
    } catch (err) {
      console.error(`[store] Error guardando ${this.name}: ${err.message}`);
      try {
        fs.unlinkSync(tmp);
      } catch (_) {
        /* ignore */
      }
    }
  }
}

const db = {
  dir: DATA_DIR,
  uploadDir: UPLOAD_DIR,
  settings: new Collection('settings', defaultSettings()),
  sources: new Collection('sources', []),
  chunks: new Collection('chunks', []),
  conversations: new Collection('conversations', []),
  leads: new Collection('leads', []),
  auth: new Collection('auth', {}),

  getSecret() {
    if (process.env.SESSION_SECRET && process.env.SESSION_SECRET.trim()) {
      return process.env.SESSION_SECRET.trim();
    }
    const file = path.join(DATA_DIR, '.secret');
    try {
      const existing = fs.readFileSync(file, 'utf8').trim();
      if (existing.length >= 32) return existing;
    } catch (_) {
      /* generar */
    }
    const secret = crypto.randomBytes(48).toString('hex');
    fs.writeFileSync(file, secret, { mode: 0o600 });
    return secret;
  },

  flushAll() {
    for (const key of ['settings', 'sources', 'chunks', 'conversations', 'leads', 'auth']) {
      this[key].flush();
    }
  },

  trimConversations(max = 1500) {
    const list = this.conversations.data;
    if (list.length <= max) return;
    list.sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0));
    this.conversations.data = list.slice(0, max);
    this.conversations.save();
  }
};

process.on('exit', () => {
  try {
    db.flushAll();
  } catch (_) {
    /* ignore */
  }
});
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    try {
      db.flushAll();
    } catch (_) {
      /* ignore */
    }
    process.exit(0);
  });
}

module.exports = { db, DATA_DIR, UPLOAD_DIR, deepMerge, isPlainObject };
