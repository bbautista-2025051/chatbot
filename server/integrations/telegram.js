'use strict';

const { db } = require('../lib/store');
const { respond } = require('../chat/engine');
const { safeEqual } = require('../lib/util');
const { splitText } = require('./meta');

const seenUpdates = new Set();

function remember(id) {
  if (!id) return true;
  if (seenUpdates.has(id)) return false;
  seenUpdates.add(id);
  if (seenUpdates.size > 2000) {
    const first = seenUpdates.values().next().value;
    seenUpdates.delete(first);
  }
  return true;
}

async function telegramApi(token, method, payload) {
  const url = `https://api.telegram.org/bot${token}/${method}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload || {}),
      signal: controller.signal
    });
    const raw = await res.text();
    let json = null;
    try {
      json = raw ? JSON.parse(raw) : null;
    } catch (_) {
      json = null;
    }
    if (!res.ok || !json || json.ok === false) {
      const detail = (json && json.description) || raw.slice(0, 300) || `HTTP ${res.status}`;
      throw new Error(`Telegram: ${detail}`);
    }
    return json;
  } finally {
    clearTimeout(timer);
  }
}

async function sendTelegramText(token, chatId, text) {
  const parts = splitText(text, 3900);
  for (const part of parts) {
    await telegramApi(token, 'sendMessage', {
      chat_id: chatId,
      text: part,
      disable_web_page_preview: true
    });
  }
}

async function handleTelegram(req, res) {
  const config = db.settings.data.channels.telegram;
  const secret = req.params.secret || '';
  if (!config.secret || !safeEqual(secret, config.secret)) {
    return res.status(403).json({ ok: false });
  }
  res.status(200).json({ ok: true });

  if (!config.enabled || !config.botToken) {
    console.warn('[telegram] Canal desactivado o sin bot token.');
    return;
  }

  const update = req.body || {};
  if (!remember(update.update_id)) return;
  const message = update.message || update.edited_message;
  if (!message || !message.chat || !message.chat.id) return;

  const text = message.text || message.caption || '';
  if (!text) {
    try {
      await sendTelegramText(
        config.botToken,
        message.chat.id,
        'Por ahora solo puedo leer mensajes de texto. Cuentame que necesitas.'
      );
    } catch (_) {
      /* ignore */
    }
    return;
  }

  const userName = [message.from?.first_name, message.from?.last_name].filter(Boolean).join(' ') || message.from?.username || '';
  try {
    const result = await respond({
      channel: 'telegram',
      externalId: String(message.chat.id),
      userName,
      text
    });
    await sendTelegramText(config.botToken, message.chat.id, result.reply);
  } catch (err) {
    console.error(`[telegram] Error procesando mensaje: ${err.message}`);
    try {
      await sendTelegramText(
        config.botToken,
        message.chat.id,
        'Tuve un problema al procesar tu mensaje. Intenta de nuevo en un momento.'
      );
    } catch (_) {
      /* ignore */
    }
  }
}

async function registerTelegramWebhook(publicBaseUrl) {
  const config = db.settings.data.channels.telegram;
  if (!config.botToken) throw new Error('Falta el token del bot de Telegram.');
  if (!config.secret) throw new Error('Falta el secreto del webhook de Telegram.');
  const base = String(publicBaseUrl || '').replace(/\/+$/, '');
  const url = `${base}/webhooks/telegram/${config.secret}`;
  const json = await telegramApi(config.botToken, 'setWebhook', {
    url,
    allowed_updates: ['message'],
    drop_pending_updates: false
  });
  return { webhookUrl: url, telegram: json };
}

async function getTelegramInfo() {
  const config = db.settings.data.channels.telegram;
  if (!config.botToken) throw new Error('Falta el token del bot de Telegram.');
  const [me, hook] = await Promise.all([
    telegramApi(config.botToken, 'getMe', {}),
    telegramApi(config.botToken, 'getWebhookInfo', {})
  ]);
  return { me: me.result, webhook: hook.result };
}

module.exports = { handleTelegram, registerTelegramWebhook, getTelegramInfo, sendTelegramText };
