'use strict';

const express = require('express');
const { db } = require('../lib/store');
const { respond, resetConversation, getConversationHistory, providerReady } = require('../chat/engine');
const { resolveChatConfig } = require('../llm/providers');
const { rateLimit } = require('../lib/ratelimit');
const { uid } = require('../lib/util');

const router = express.Router();

router.get('/config', (req, res) => {
  const settings = db.settings.data;
  const business = settings.business;
  const aiConfig = resolveChatConfig(settings.ai);
  const ready = providerReady(settings.ai);
  const demoMode = !ready || aiConfig.provider === 'demo';

  res.set('Cache-Control', 'no-store');
  res.json({
    business: {
      name: business.name,
      tagline: business.tagline,
      address: business.address,
      phone: business.phone,
      email: business.email,
      whatsapp: business.whatsapp,
      website: business.website,
      hours: business.hours,
      currency: business.currency || 'Q',
      country: business.country || 'Guatemala',
      shipping: business.shipping || '',
      paymentMethods: business.paymentMethods || '',
      products: Array.isArray(business.products) ? business.products : []
    },
    assistant: {
      name: settings.ai.assistantName || 'Asistente',
      greeting: settings.ai.greeting,
      quickReplies: settings.ai.quickReplies || [],
      provider: demoMode ? 'demo' : aiConfig.provider,
      providerLabel: demoMode ? 'Modo demostración' : aiConfig.label,
      model: demoMode ? 'demo' : aiConfig.model,
      ready,
      demoMode
    },
    widget: settings.widget,
    channels: {
      whatsapp: business.whatsapp || settings.channels.whatsapp.displayNumber || ''
    }
  });
});

router.get('/health', (req, res) => {
  const aiConfig = resolveChatConfig(db.settings.data.ai);
  res.json({
    ok: true,
    uptime: Math.round(process.uptime()),
    sources: db.sources.data.filter((source) => source.status === 'ready').length,
    chunks: db.chunks.data.length,
    ai: {
      provider: aiConfig.provider,
      model: aiConfig.model,
      configured: providerReady(db.settings.data.ai)
    }
  });
});

router.get('/chat/history', (req, res) => {
  const sessionId = String((req.query && req.query.sessionId) || '').trim();
  if (!/^[A-Za-z0-9_-]{8,80}$/.test(sessionId)) {
    return res.json({ sessionId: '', messages: [], needsHuman: false });
  }
  const history = getConversationHistory('web', sessionId);
  res.set('Cache-Control', 'no-store');
  return res.json({
    sessionId,
    ...history
  });
});

router.post('/chat/reset', (req, res) => {
  const body = req.body || {};
  const sessionId = String(body.sessionId || '').trim();
  if (sessionId && /^[A-Za-z0-9_-]{8,80}$/.test(sessionId)) {
    resetConversation('web', sessionId);
  }
  const newSessionId = uid('web_');
  const ai = db.settings.data.ai || {};
  return res.json({
    ok: true,
    sessionId: newSessionId,
    greeting: ai.greeting || '¡Hola! Soy tu asesora virtual. ¿En qué puedo ayudarte hoy?',
    quickReplies: Array.isArray(ai.quickReplies) ? ai.quickReplies.slice(0, 6) : []
  });
});

router.post(
  '/chat',
  rateLimit({
    windowMs: 60_000,
    max: Number(process.env.PUBLIC_RATE_LIMIT) || 20
  }),
  async (req, res) => {
    try {
      const body = req.body || {};
      let sessionId = String(body.sessionId || '').trim();
      if (!/^[A-Za-z0-9_-]{8,80}$/.test(sessionId)) {
        sessionId = uid('web_');
      }
      const message = String(body.message || '').trim();
      if (!message) {
        return res.status(400).json({ error: 'Escribe un mensaje para continuar.', code: 'EMPTY_MESSAGE' });
      }
      if (message.length > 2000) {
        return res.status(400).json({
          error: 'El mensaje es demasiado largo (máximo 2000 caracteres).',
          code: 'MESSAGE_TOO_LONG'
        });
      }
      const name = String(body.name || '').trim().slice(0, 60);
      const result = await respond({
        channel: 'web',
        externalId: sessionId,
        userName: name,
        text: message,
        rejectIfBusy: true
      });
      return res.json({ ...result, sessionId });
    } catch (err) {
      if (err && err.code === 'REQUEST_IN_PROGRESS') {
        return res.status(409).json({
          error: err.message,
          code: 'REQUEST_IN_PROGRESS'
        });
      }
      console.error(`[public/chat] ${err.message}`);
      return res.status(500).json({
        error: 'No pude procesar tu mensaje en este momento. Intenta de nuevo en unos segundos.',
        code: 'INTERNAL_ERROR'
      });
    }
  }
);

module.exports = router;
