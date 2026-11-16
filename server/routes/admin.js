'use strict';

const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const { db } = require('../lib/store');
const {
  publicSource,
  createSource,
  reindexSource,
  enqueueAll,
  deleteSource,
  queueStatus
} = require('../rag/indexer');
const { assertSafeUrl, ExtractError } = require('../rag/extract');
const { PROMPT_TEMPLATE, previewPrompt } = require('../chat/prompt');
const { normalizeModel } = require('../config/defaults');
const { testProvider, resolveChatConfig, cleanApiKey } = require('../llm/providers');
const { resolveEmbeddingConfig } = require('../llm/embeddings');
const { respond, resetConversation } = require('../chat/engine');
const {
  isUsingDefaultPassword,
  verifyPassword,
  setPassword,
  setSessionCookie,
  clearSessionCookie,
  verifyToken,
  requireAdmin,
  COOKIE_NAME
} = require('../lib/session');
const { rateLimit } = require('../lib/ratelimit');
const { MASK, maskSecret, unmaskSecret, truncate, toNumber, uid } = require('../lib/util');
const { registerTelegramWebhook, getTelegramInfo } = require('../integrations/telegram');

const router = express.Router();

const ALLOWED_EXT = new Set([
  '.pdf',
  '.docx',
  '.xlsx',
  '.xlsm',
  '.csv',
  '.tsv',
  '.txt',
  '.md',
  '.markdown',
  '.json',
  '.html',
  '.htm',
  '.xml',
  '.yml',
  '.yaml'
]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024, files: 1 }
});

function publicBaseUrl(req) {
  const configured = String(process.env.PUBLIC_BASE_URL || '').trim().replace(/\/+$/, '');
  if (configured) return configured;
  if (req) return `${req.protocol}://${req.get('host')}`;
  return 'http://localhost:3000';
}

function str(value, max = 500) {
  return String(value == null ? '' : value).slice(0, max).trim();
}

function bool(value, fallback = false) {
  if (value === true || value === 'true' || value === 1 || value === '1') return true;
  if (value === false || value === 'false' || value === 0 || value === '0') return false;
  return fallback;
}

function validColor(value, fallback) {
  return /^#[0-9a-f]{6}$/i.test(String(value || '')) ? String(value) : fallback;
}

const BUSINESS_FIELDS = [
  ['name', 90],
  ['tagline', 160],
  ['description', 2000],
  ['address', 220],
  ['phone', 60],
  ['whatsapp', 60],
  ['email', 120],
  ['website', 200],
  ['hours', 220],
  ['shipping', 1000],
  ['paymentMethods', 500],
  ['currency', 8],
  ['country', 80],
  ['tone', 160],
  ['language', 60]
];

const SECRET_PATHS = [
  ['ai', 'apiKey'],
  ['ai', 'embeddingApiKey'],
  ['channels', 'whatsapp', 'accessToken'],
  ['channels', 'whatsapp', 'appSecret'],
  ['channels', 'messenger', 'pageAccessToken'],
  ['channels', 'messenger', 'appSecret'],
  ['channels', 'instagram', 'accessToken'],
  ['channels', 'instagram', 'appSecret'],
  ['channels', 'telegram', 'botToken']
];

function getPath(obj, parts) {
  let current = obj;
  for (const part of parts) {
    if (!current || typeof current !== 'object') return undefined;
    current = current[part];
  }
  return current;
}

function setPath(obj, parts, value) {
  let current = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (!current[parts[i]] || typeof current[parts[i]] !== 'object') current[parts[i]] = {};
    current = current[parts[i]];
  }
  current[parts[parts.length - 1]] = value;
}

function maskedSettings() {
  const clone = JSON.parse(JSON.stringify(db.settings.data));
  for (const parts of SECRET_PATHS) {
    const value = getPath(clone, parts);
    if (value) setPath(clone, parts, MASK);
  }
  if (clone.ai && clone.ai.model) {
    clone.ai.model = normalizeModel(clone.ai.provider || 'gemini', clone.ai.model);
  }
  clone.widget = { ...clone.widget };
  return clone;
}

function applySettings(body) {
  const current = db.settings.data;
  const next = JSON.parse(JSON.stringify(current));

  if (body.business && typeof body.business === 'object') {
    for (const [key, max] of BUSINESS_FIELDS) {
      if (body.business[key] !== undefined) next.business[key] = str(body.business[key], max);
    }
    if (Array.isArray(body.business.products)) {
      next.business.products = body.business.products
        .slice(0, 60)
        .map((product) => ({
          name: str(product && product.name, 120),
          price: str(product && product.price, 40),
          description: str(product && product.description, 400)
        }))
        .filter((product) => product.name);
    }
  }

  if (body.ai && typeof body.ai === 'object') {
    const a = body.ai;
    const providers = ['openai', 'anthropic', 'gemini', 'compatible', 'demo'];
    if (a.provider !== undefined) {
      next.ai.provider = providers.includes(a.provider) ? a.provider : next.ai.provider;
    }
    if (a.assistantName !== undefined) next.ai.assistantName = str(a.assistantName, 50) || 'Vita';
    if (a.model !== undefined) {
      next.ai.model = normalizeModel(next.ai.provider || 'gemini', str(a.model, 120));
    }
    if (a.baseUrl !== undefined) next.ai.baseUrl = str(a.baseUrl, 300);
    if (a.apiKey !== undefined) next.ai.apiKey = cleanApiKey(unmaskSecret(a.apiKey, current.ai.apiKey)).slice(0, 400);
    if (a.temperature !== undefined) next.ai.temperature = toNumber(a.temperature, 0.4, 0, 2);
    if (a.maxTokens !== undefined) next.ai.maxTokens = Math.round(toNumber(a.maxTokens, 900, 64, 8192));
    if (a.topK !== undefined) next.ai.topK = Math.round(toNumber(a.topK, 6, 1, 12));
    if (a.embeddingProvider !== undefined) {
      const options = ['local', 'openai', 'gemini'];
      next.ai.embeddingProvider = options.includes(a.embeddingProvider)
        ? a.embeddingProvider
        : next.ai.embeddingProvider;
    }
    if (a.embeddingModel !== undefined) next.ai.embeddingModel = str(a.embeddingModel, 120);
    if (a.embeddingApiKey !== undefined) {
      next.ai.embeddingApiKey = unmaskSecret(a.embeddingApiKey, current.ai.embeddingApiKey).slice(0, 400);
    }
    if (a.systemPrompt !== undefined) next.ai.systemPrompt = String(a.systemPrompt || '').slice(0, 20000);
    if (a.extraInstructions !== undefined) {
      next.ai.extraInstructions = String(a.extraInstructions || '').slice(0, 6000);
    }
    if (a.greeting !== undefined) next.ai.greeting = str(a.greeting, 500);
    if (Array.isArray(a.quickReplies)) {
      next.ai.quickReplies = a.quickReplies
        .slice(0, 8)
        .map((item) => str(item, 60))
        .filter(Boolean);
    }
    if (a.captureLeads !== undefined) next.ai.captureLeads = bool(a.captureLeads, true);
    if (a.handoffEnabled !== undefined) next.ai.handoffEnabled = bool(a.handoffEnabled, true);
    if (a.maxHistory !== undefined) next.ai.maxHistory = Math.round(toNumber(a.maxHistory, 12, 2, 30));
  }

  if (body.widget && typeof body.widget === 'object') {
    const w = body.widget;
    if (w.enabled !== undefined) next.widget.enabled = bool(w.enabled, true);
    next.widget.primaryColor = validColor(w.primaryColor, current.widget.primaryColor);
    next.widget.accentColor = validColor(w.accentColor, current.widget.accentColor);
    next.widget.position = w.position === 'left' ? 'left' : 'right';
    if (w.title !== undefined) next.widget.title = str(w.title, 80);
    if (w.subtitle !== undefined) next.widget.subtitle = str(w.subtitle, 120);
    if (w.bubbleText !== undefined) next.widget.bubbleText = str(w.bubbleText, 160);
  }

  db.settings.data = next;
  db.settings.save();
  return next;
}

function applyChannels(body) {
  const current = db.settings.data.channels;
  const next = JSON.parse(JSON.stringify(current));

  const definitions = {
    whatsapp: {
      text: ['phoneNumberId', 'verifyToken', 'displayNumber'],
      secret: ['accessToken', 'appSecret']
    },
    messenger: {
      text: ['pageId', 'verifyToken'],
      secret: ['pageAccessToken', 'appSecret']
    },
    instagram: {
      text: ['igUserId', 'verifyToken'],
      secret: ['accessToken', 'appSecret']
    },
    telegram: {
      text: ['secret'],
      secret: ['botToken']
    }
  };

  for (const [channel, definition] of Object.entries(definitions)) {
    const input = body[channel];
    if (!input || typeof input !== 'object') continue;
    if (input.enabled !== undefined) next[channel].enabled = bool(input.enabled, false);
    for (const key of definition.text) {
      if (input[key] !== undefined) next[channel][key] = str(input[key], 400);
    }
    for (const key of definition.secret) {
      if (input[key] !== undefined) {
        next[channel][key] = unmaskSecret(input[key], current[channel][key]).slice(0, 600);
      }
    }
  }

  if (next.telegram.botToken && !next.telegram.secret) {
    next.telegram.secret = crypto.randomBytes(18).toString('hex');
  }

  db.settings.data.channels = next;
  db.settings.save();
  return next;
}

function channelMissing(config, fields) {
  return fields.filter(([key]) => !String(config[key] || '').trim()).map(([, label]) => label);
}

function channelsStatus(req) {
  const channels = db.settings.data.channels;
  const base = publicBaseUrl(req);
  return {
    baseUrl: base,
    whatsapp: {
      ready:
        channels.whatsapp.enabled &&
        Boolean(channels.whatsapp.phoneNumberId && channels.whatsapp.accessToken && channels.whatsapp.verifyToken),
      missing: channelMissing(channels.whatsapp, [
        ['phoneNumberId', 'Phone Number ID'],
        ['accessToken', 'Token de acceso'],
        ['verifyToken', 'Verify token']
      ]),
      webhookUrl: `${base}/webhooks/whatsapp`
    },
    messenger: {
      ready:
        channels.messenger.enabled &&
        Boolean(channels.messenger.pageAccessToken && channels.messenger.verifyToken),
      missing: channelMissing(channels.messenger, [
        ['pageAccessToken', 'Page access token'],
        ['verifyToken', 'Verify token']
      ]),
      webhookUrl: `${base}/webhooks/meta/messenger`
    },
    instagram: {
      ready:
        channels.instagram.enabled &&
        Boolean(channels.instagram.accessToken && channels.instagram.igUserId && channels.instagram.verifyToken),
      missing: channelMissing(channels.instagram, [
        ['igUserId', 'Instagram user ID'],
        ['accessToken', 'Token de acceso'],
        ['verifyToken', 'Verify token']
      ]),
      webhookUrl: `${base}/webhooks/meta/instagram`
    },
    telegram: {
      ready: channels.telegram.enabled && Boolean(channels.telegram.botToken && channels.telegram.secret),
      missing: channelMissing(channels.telegram, [
        ['botToken', 'Token del bot'],
        ['secret', 'Secreto del webhook']
      ]),
      webhookUrl: channels.telegram.secret
        ? `${base}/webhooks/telegram/${channels.telegram.secret}`
        : `${base}/webhooks/telegram/{secreto}`
    },
    widget: { ready: Boolean(db.settings.data.widget.enabled) },
    demoMode: db.settings.data.ai.provider === 'demo'
  };
}

function providerStatus() {
  const ai = db.settings.data.ai;
  const config = resolveChatConfig(ai);
  const embedding = resolveEmbeddingConfig(ai);
  const envKeys = {
    openai: Boolean(process.env.OPENAI_API_KEY),
    anthropic: Boolean(process.env.ANTHROPIC_API_KEY),
    gemini: Boolean(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY)
  };
  const envModels = {
    openai: process.env.OPENAI_MODEL || '',
    anthropic: process.env.ANTHROPIC_MODEL || '',
    gemini: process.env.GEMINI_MODEL || ''
  };
  return {
    provider: config.provider,
    model: config.model,
    label: config.label,
    configured:
      config.provider === 'demo' ||
      Boolean(config.apiKey) ||
      (config.provider === 'compatible' && Boolean(config.baseUrl)),
    apiKeyMasked: config.apiKey ? maskSecret(config.apiKey) : '',
    usingEnvKey: !ai.apiKey && Boolean(envKeys[config.provider]),
    embeddingProvider: embedding.provider,
    embeddingModel: embedding.model,
    envKeys,
    envModels
  };
}

// ------------------------------------------------------------------
// Autenticacion
// ------------------------------------------------------------------

const loginLimiter = rateLimit({ windowMs: 5 * 60_000, max: 12 });

router.get('/auth/me', (req, res) => {
  const authenticated = verifyToken(req.cookies ? req.cookies[COOKIE_NAME] : null);
  res.json({
    authenticated,
    usingDefaultPassword: isUsingDefaultPassword(),
    baseUrl: publicBaseUrl(req)
  });
});

router.post('/auth/login', loginLimiter, (req, res) => {
  const password = String((req.body && req.body.password) || '');
  if (!password || !verifyPassword(password)) {
    return res.status(401).json({ error: 'Contrasena incorrecta. Intenta de nuevo.' });
  }
  setSessionCookie(res);
  res.json({ ok: true, usingDefaultPassword: isUsingDefaultPassword() });
});

router.post('/auth/logout', (req, res) => {
  clearSessionCookie(res);
  res.json({ ok: true });
});

// A partir de aqui todas las rutas requieren sesion.
router.use(requireAdmin);

router.post('/auth/password', (req, res) => {
  const current = String((req.body && req.body.current) || '');
  const next = String((req.body && req.body.next) || '');
  if (!verifyPassword(current)) {
    return res.status(400).json({ error: 'La contrasena actual no es correcta.' });
  }
  if (next.length < 8) {
    return res.status(400).json({ error: 'La nueva contrasena debe tener al menos 8 caracteres.' });
  }
  setPassword(next);
  setSessionCookie(res);
  res.json({ ok: true });
});

// ------------------------------------------------------------------
// Panel general
// ------------------------------------------------------------------

router.get('/overview', (req, res) => {
  const conversations = db.conversations.data;
  const messages = conversations.reduce((total, conversation) => total + (conversation.messages?.length || 0), 0);
  const leads = db.leads.data;
  const sources = db.sources.data;
  const ready = sources.filter((source) => source.status === 'ready');

  const recentConversations = conversations
    .filter((conversation) => conversation.messages && conversation.messages.length)
    .sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0))
    .slice(0, 6)
    .map((conversation) => {
      const last = conversation.messages[conversation.messages.length - 1];
      return {
        id: conversation.id,
        channel: conversation.channel,
        userName: conversation.userName || 'Visitante',
        lastMessage: truncate(last?.content || '', 120),
        needsHuman: Boolean(conversation.needsHuman),
        updatedAt: conversation.updatedAt
      };
    });

  res.json({
    stats: {
      conversations: conversations.length,
      messages,
      sources: sources.length,
      readySources: ready.length,
      chunks: db.chunks.data.length,
      leads: leads.length,
      newLeads: leads.filter((lead) => lead.status === 'nuevo').length,
      needsHuman: conversations.filter((conversation) => conversation.needsHuman).length
    },
    provider: providerStatus(),
    channels: channelsStatus(req),
    queue: queueStatus(),
    recentConversations,
    recentLeads: leads
      .slice()
      .sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0))
      .slice(0, 5),
    recurrence: {
      readyToChat: ready.length > 0,
      hasProvider: providerStatus().configured
    },
    usingDefaultPassword: isUsingDefaultPassword()
  });
});

// ------------------------------------------------------------------
// Ajustes
// ------------------------------------------------------------------

router.get('/settings', (req, res) => {
  res.json({
    settings: maskedSettings(),
    provider: providerStatus(),
    baseUrl: publicBaseUrl(req),
    defaultPrompt: PROMPT_TEMPLATE,
    limits: { maxFileSizeMb: 25 }
  });
});

router.put('/settings', (req, res) => {
  if (!req.body || typeof req.body !== 'object') {
    return res.status(400).json({ error: 'Datos invalidos.' });
  }
  applySettings(req.body);
  res.json({ ok: true, settings: maskedSettings(), provider: providerStatus() });
});

router.put('/channels', (req, res) => {
  if (!req.body || typeof req.body !== 'object') {
    return res.status(400).json({ error: 'Datos invalidos.' });
  }
  applyChannels(req.body);
  const masked = JSON.parse(JSON.stringify(db.settings.data.channels));
  for (const [channel, keys] of Object.entries({
    whatsapp: ['accessToken', 'appSecret'],
    messenger: ['pageAccessToken', 'appSecret'],
    instagram: ['accessToken', 'appSecret'],
    telegram: ['botToken']
  })) {
    for (const key of keys) {
      if (masked[channel][key]) masked[channel][key] = MASK;
    }
  }
  res.json({ ok: true, channels: masked, status: channelsStatus(req) });
});

router.get('/channels', (req, res) => {
  res.json({ status: channelsStatus(req) });
});

router.post('/channels/telegram/register', async (req, res) => {
  try {
    const result = await registerTelegramWebhook(publicBaseUrl(req));
    res.json({ ok: true, ...result, status: channelsStatus(req) });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/channels/telegram/info', async (req, res) => {
  try {
    const info = await getTelegramInfo();
    res.json({ ok: true, ...info });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ------------------------------------------------------------------
// Conocimiento / entrenamiento
// ------------------------------------------------------------------

router.get('/sources', (req, res) => {
  const sources = db.sources.data
    .slice()
    .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
    .map(publicSource);
  res.json({ sources, queue: queueStatus() });
});

router.post('/sources/upload', (req, res, next) => {
  upload.single('file')(req, res, (err) => {
    if (err) {
      const message =
        err.code === 'LIMIT_FILE_SIZE'
          ? 'El archivo supera el limite de 25 MB.'
          : `No se pudo recibir el archivo: ${err.message}`;
      return res.status(400).json({ error: message });
    }
    return next();
  });
}, (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Selecciona un archivo.' });
    const original = path.basename(req.file.originalname || 'documento');
    const ext = path.extname(original).toLowerCase();
    if (!ALLOWED_EXT.has(ext)) {
      return res.status(400).json({
        error: `Formato no soportado (${ext || 'sin extension'}). Formatos permitidos: PDF, DOCX, XLSX, CSV, TXT, MD, HTML, JSON.`
      });
    }
    const safeName = original.replace(/[^\w.\-() ]+/g, '_').slice(0, 100) || `documento${ext}`;
    const stored = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}-${safeName}`;
    const filePath = path.join(db.uploadDir, stored);
    fs.writeFileSync(filePath, req.file.buffer);

    const source = createSource({
      type: 'file',
      name: safeName,
      mime: req.file.mimetype,
      size: req.file.size,
      filePath
    });
    res.status(202).json({ ok: true, source: publicSource(source), queue: queueStatus() });
  } catch (err) {
    console.error(`[admin/upload] ${err.message}`);
    res.status(500).json({ error: 'No se pudo guardar el archivo.' });
  }
});

router.post('/sources/url', (req, res) => {
  try {
    const rawUrl = str(req.body && req.body.url, 1000);
    if (!rawUrl) return res.status(400).json({ error: 'Escribe una URL.' });
    const url = assertSafeUrl(rawUrl);
    const crawl = bool(req.body && req.body.crawl, false);
    const source = createSource({
      type: 'url',
      name: str((req.body && req.body.name) || url.hostname, 160),
      url: url.toString(),
      crawl
    });
    res.status(202).json({ ok: true, source: publicSource(source), queue: queueStatus() });
  } catch (err) {
    if (err instanceof ExtractError) return res.status(400).json({ error: err.message });
    console.error(`[admin/url] ${err.message}`);
    res.status(500).json({ error: 'No se pudo agregar la URL.' });
  }
});

router.post('/sources/text', (req, res) => {
  const name = str(req.body && req.body.name, 160) || 'Nota interna';
  const text = String((req.body && req.body.text) || '').trim();
  if (text.length < 20) {
    return res.status(400).json({ error: 'El texto es demasiado corto (minimo 20 caracteres).' });
  }
  if (text.length > 400_000) {
    return res.status(400).json({ error: 'El texto es demasiado largo (maximo 400.000 caracteres).' });
  }
  const source = createSource({ type: 'text', name, rawText: text });
  res.status(202).json({ ok: true, source: publicSource(source), queue: queueStatus() });
});

router.post('/sources/reindex-all', (req, res) => {
  enqueueAll();
  res.json({ ok: true, queue: queueStatus() });
});

router.get('/sources/:id/chunks', (req, res) => {
  const source = db.sources.data.find((item) => item.id === req.params.id);
  if (!source) return res.status(404).json({ error: 'Fuente no encontrada.' });
  const chunks = db.chunks.data
    .filter((chunk) => chunk.sourceId === source.id)
    .slice(0, 40)
    .map((chunk) => ({ id: chunk.id, index: chunk.index, text: chunk.text.slice(0, 1200) }));
  res.json({ source: publicSource(source), chunks, total: source.chunkCount || chunks.length });
});

router.post('/sources/:id/reindex', (req, res) => {
  if (!reindexSource(req.params.id)) {
    return res.status(404).json({ error: 'Fuente no encontrada.' });
  }
  res.json({ ok: true, queue: queueStatus() });
});

router.delete('/sources/:id', (req, res) => {
  if (!deleteSource(req.params.id)) {
    return res.status(404).json({ error: 'Fuente no encontrada.' });
  }
  res.json({ ok: true });
});

// ------------------------------------------------------------------
// Prompt / instrucciones
// ------------------------------------------------------------------

router.get('/prompt', (req, res) => {
  res.json({
    template: db.settings.data.ai.systemPrompt || PROMPT_TEMPLATE,
    defaultTemplate: PROMPT_TEMPLATE,
    isCustom: Boolean(db.settings.data.ai.systemPrompt)
  });
});

router.post('/prompt/preview', (req, res) => {
  const template = String((req.body && req.body.template) || '').slice(0, 20000);
  const clone = JSON.parse(JSON.stringify(db.settings.data));
  clone.ai.systemPrompt = template || PROMPT_TEMPLATE;
  if (req.body && req.body.extraInstructions !== undefined) {
    clone.ai.extraInstructions = String(req.body.extraInstructions || '').slice(0, 6000);
  }
  res.json({ prompt: previewPrompt({ settings: clone }) });
});

// ------------------------------------------------------------------
// Pruebas de IA
// ------------------------------------------------------------------

router.post('/provider/test', async (req, res) => {
  try {
    const current = db.settings.data.ai;
    const body = req.body || {};
    const ai = { ...current };
    for (const key of ['provider', 'model', 'baseUrl', 'temperature', 'maxTokens']) {
      if (body[key] !== undefined) ai[key] = body[key];
    }
    if (body.apiKey !== undefined) {
      ai.apiKey = unmaskSecret(body.apiKey, current.apiKey);
    }
    const result = await testProvider(ai);
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(400).json({
      error: err.message || 'No se pudo conectar con el proveedor de IA.',
      detail: err.detail || '',
      status: err.status || 0
    });
  }
});

router.post('/chat/test', async (req, res) => {
  try {
    const body = req.body || {};
    let sessionId = String(body.sessionId || '').trim();
    if (!/^[A-Za-z0-9_-]{4,80}$/.test(sessionId)) sessionId = 'admin-test';
    if (body.reset) {
      resetConversation('admin', sessionId);
      return res.json({ ok: true, reset: true, sessionId });
    }
    const message = String(body.message || '').trim();
    if (!message) return res.status(400).json({ error: 'Escribe un mensaje.' });
    const result = await respond({
      channel: 'admin',
      externalId: sessionId,
      userName: 'Prueba interna',
      text: message,
      isAdmin: true
    });
    res.json({ ok: true, ...result, sessionId });
  } catch (err) {
    if (err && err.code === 'REQUEST_IN_PROGRESS') {
      return res.status(409).json({ error: err.message, code: 'REQUEST_IN_PROGRESS' });
    }
    console.error(`[admin/chat-test] ${err.message}`);
    res.status(500).json({ error: err.message || 'Error procesando el mensaje.' });
  }
});

// ------------------------------------------------------------------
// Conversaciones y leads
// ------------------------------------------------------------------

function conversationSummary(conversation) {
  const last = conversation.messages[conversation.messages.length - 1];
  const lead = db.leads.data.find((item) => item.conversationId === conversation.id);
  return {
    id: conversation.id,
    channel: conversation.channel,
    userName: conversation.userName || lead?.name || 'Visitante',
    externalId: conversation.externalId,
    messageCount: conversation.messages.length,
    lastMessage: truncate(last?.content || '', 150),
    lastRole: last?.role || '',
    needsHuman: Boolean(conversation.needsHuman),
    leadStatus: lead?.status || '',
    createdAt: conversation.createdAt,
    updatedAt: conversation.updatedAt
  };
}

router.get('/conversations', (req, res) => {
  const channel = str(req.query.channel, 30);
  const query = str(req.query.q, 100).toLowerCase();
  const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 60));

  let list = db.conversations.data.filter(
    (conversation) => conversation.messages && conversation.messages.length
  );
  if (channel) list = list.filter((conversation) => conversation.channel === channel);
  if (query) {
    list = list.filter(
      (conversation) =>
        String(conversation.userName || '').toLowerCase().includes(query) ||
        String(conversation.externalId || '').toLowerCase().includes(query) ||
        conversation.messages.some((message) => String(message.content || '').toLowerCase().includes(query))
    );
  }
  list = list
    .slice()
    .sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0))
    .slice(0, limit);

  res.json({
    conversations: list.map(conversationSummary),
    total: db.conversations.data.length
  });
});

router.get('/conversations/:id', (req, res) => {
  const conversation = db.conversations.data.find((item) => item.id === req.params.id);
  if (!conversation) return res.status(404).json({ error: 'Conversacion no encontrada.' });
  const lead = db.leads.data.find((item) => item.conversationId === conversation.id) || null;
  res.json({ conversation, lead });
});

router.patch('/conversations/:id', (req, res) => {
  const conversation = db.conversations.data.find((item) => item.id === req.params.id);
  if (!conversation) return res.status(404).json({ error: 'Conversacion no encontrada.' });
  if (req.body && req.body.needsHuman !== undefined) {
    conversation.needsHuman = bool(req.body.needsHuman, false);
    conversation.updatedAt = new Date().toISOString();
    db.conversations.save();
  }
  res.json({ ok: true, conversation });
});

router.delete('/conversations/:id', (req, res) => {
  const exists = db.conversations.data.some((item) => item.id === req.params.id);
  if (!exists) return res.status(404).json({ error: 'Conversacion no encontrada.' });
  db.conversations.data = db.conversations.data.filter((item) => item.id !== req.params.id);
  db.leads.data = db.leads.data.filter((item) => item.conversationId !== req.params.id);
  db.conversations.save();
  db.leads.save();
  res.json({ ok: true });
});

router.get('/leads', (req, res) => {
  const status = str(req.query.status, 30);
  let leads = db.leads.data.slice();
  if (status) leads = leads.filter((lead) => lead.status === status);
  leads.sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0));
  res.json({ leads, total: leads.length });
});

router.patch('/leads/:id', (req, res) => {
  const lead = db.leads.data.find((item) => item.id === req.params.id);
  if (!lead) return res.status(404).json({ error: 'Lead no encontrado.' });
  const body = req.body || {};
  const statuses = ['nuevo', 'contactado', 'cliente', 'descartado'];
  if (body.status !== undefined && statuses.includes(body.status)) lead.status = body.status;
  if (body.name !== undefined) lead.name = str(body.name, 100);
  if (body.phone !== undefined) lead.phone = str(body.phone, 40);
  if (body.email !== undefined) lead.email = str(body.email, 120);
  if (body.notes !== undefined) lead.notes = String(body.notes || '').slice(0, 3000);
  lead.updatedAt = new Date().toISOString();
  db.leads.save();
  res.json({ ok: true, lead });
});

router.delete('/leads/:id', (req, res) => {
  const exists = db.leads.data.some((item) => item.id === req.params.id);
  if (!exists) return res.status(404).json({ error: 'Lead no encontrado.' });
  db.leads.data = db.leads.data.filter((item) => item.id !== req.params.id);
  db.leads.save();
  res.json({ ok: true });
});

router.get('/leads/export.csv', (req, res) => {
  const rows = [
    ['Nombre', 'Telefono', 'Correo', 'Canal', 'Interes', 'Estado', 'Notas', 'Creado', 'Actualizado']
  ];
  for (const lead of db.leads.data) {
    rows.push([
      lead.name || '',
      lead.phone || '',
      lead.email || '',
      lead.channel || '',
      lead.interest || '',
      lead.status || '',
      lead.notes || '',
      lead.createdAt || '',
      lead.updatedAt || ''
    ]);
  }
  const csv = rows
    .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""').replace(/\r?\n/g, ' ')}"`).join(','))
    .join('\r\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="leads-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.send(`\uFEFF${csv}`);
});

module.exports = { router, publicBaseUrl };
