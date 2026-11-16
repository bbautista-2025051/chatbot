'use strict';

const crypto = require('crypto');
const { db } = require('../lib/store');
const { respond } = require('../chat/engine');
const { safeEqual } = require('../lib/util');

const GRAPH_VERSION = 'v21.0';
const seenMessages = new Set();

function remember(key) {
  if (!key) return true;
  if (seenMessages.has(key)) return false;
  seenMessages.add(key);
  if (seenMessages.size > 2000) {
    const first = seenMessages.values().next().value;
    seenMessages.delete(first);
  }
  return true;
}

function verifySignature(req, appSecret) {
  if (!appSecret) return true;
  const header = String(req.get('x-hub-signature-256') || '');
  if (!header.startsWith('sha256=')) return false;
  const raw = req.rawBody || Buffer.from(JSON.stringify(req.body || {}));
  const expected = crypto.createHmac('sha256', appSecret).update(raw).digest('hex');
  const provided = header.slice('sha256='.length);
  try {
    return crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(provided, 'hex'));
  } catch (_) {
    return false;
  }
}

function verifyChallenge(req, res, verifyToken, label) {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  if (!verifyToken) {
    console.warn(`[${label}] Webhook llamado sin verify token configurado.`);
    return res.status(403).send('Verify token no configurado');
  }
  if (mode === 'subscribe' && token && safeEqual(token, verifyToken)) {
    console.log(`[${label}] Webhook verificado correctamente.`);
    return res.status(200).send(String(challenge || ''));
  }
  console.warn(`[${label}] Verificacion fallida. Revisa el verify token.`);
  return res.status(403).send('Forbidden');
}

async function graphRequest(pathname, token, payload) {
  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${pathname}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
    const raw = await res.text();
    let json = null;
    try {
      json = raw ? JSON.parse(raw) : null;
    } catch (_) {
      json = null;
    }
    if (!res.ok) {
      const detail = (json && json.error && json.error.message) || raw.slice(0, 300);
      throw new Error(`Meta Graph ${res.status}: ${detail}`);
    }
    return json;
  } finally {
    clearTimeout(timer);
  }
}

function splitText(text, max = 3900) {
  const value = String(text || '').trim();
  if (value.length <= max) return [value];
  const parts = [];
  let rest = value;
  while (rest.length > max) {
    let cut = rest.lastIndexOf('\n\n', max);
    if (cut < max * 0.5) cut = rest.lastIndexOf('. ', max);
    if (cut < max * 0.5) cut = rest.lastIndexOf(' ', max);
    if (cut < max * 0.5) cut = max;
    parts.push(rest.slice(0, cut + 1).trim());
    rest = rest.slice(cut + 1).trim();
  }
  if (rest) parts.push(rest);
  return parts;
}

async function sendWhatsAppText(config, phoneNumberId, to, text) {
  const parts = splitText(text, 4000);
  for (const part of parts) {
    await graphRequest(`${phoneNumberId}/messages`, config.accessToken, {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'text',
      text: { body: part, preview_url: false }
    });
  }
}

async function markWhatsAppRead(config, phoneNumberId, messageId) {
  try {
    await graphRequest(`${phoneNumberId}/messages`, config.accessToken, {
      messaging_product: 'whatsapp',
      status: 'read',
      message_id: messageId
    });
  } catch (_) {
    /* opcional */
  }
}

async function handleWhatsApp(req, res) {
  const config = db.settings.data.channels.whatsapp;
  if (!verifySignature(req, config.appSecret)) {
    console.warn('[whatsapp] Firma invalida. Revisa el App Secret.');
    return res.status(403).send('Invalid signature');
  }
  res.status(200).send('EVENT_RECEIVED');

  if (!config.enabled || !config.accessToken || !config.phoneNumberId) {
    console.warn('[whatsapp] Mensaje recibido pero el canal no esta configurado/activo.');
    return;
  }

  const payload = req.body || {};
  const entries = Array.isArray(payload.entry) ? payload.entry : [];
  for (const entry of entries) {
    for (const change of entry.changes || []) {
      const value = change.value || {};
      const metadata = value.metadata || {};
      const phoneNumberId = metadata.phone_number_id || config.phoneNumberId;
      const contacts = Array.isArray(value.contacts) ? value.contacts : [];

      for (const message of value.messages || []) {
        if (!message || !message.from) continue;
        if (!remember(`wa:${message.id}`)) continue;
        if (message.from === config.displayNumber) continue;

        let text = '';
        if (message.type === 'text') text = message.text?.body || '';
        else if (message.type === 'button') text = message.button?.text || '';
        else if (message.type === 'interactive') {
          text = message.interactive?.button_reply?.title || message.interactive?.list_reply?.title || '';
        } else if (message.type === 'reaction') continue;

        markWhatsAppRead(config, phoneNumberId, message.id);

        if (!text) {
          try {
            await sendWhatsAppText(
              config,
              phoneNumberId,
              message.from,
              'Por ahora solo puedo leer mensajes de texto. Cuentame en palabras que necesitas y con gusto te ayudo.'
            );
          } catch (err) {
            console.error(`[whatsapp] Error enviando aviso: ${err.message}`);
          }
          continue;
        }

        const contact = contacts.find((item) => item.wa_id === message.from);
        const userName = contact?.profile?.name || '';
        try {
          const result = await respond({
            channel: 'whatsapp',
            externalId: message.from,
            userName,
            text
          });
          await sendWhatsAppText(config, phoneNumberId, message.from, result.reply);
        } catch (err) {
          console.error(`[whatsapp] Error procesando mensaje: ${err.message}`);
          try {
            await sendWhatsAppText(
              config,
              phoneNumberId,
              message.from,
              'Tuve un problema al procesar tu mensaje. Intenta de nuevo en un momento.'
            );
          } catch (_) {
            /* ignore */
          }
        }
      }
    }
  }
}

async function sendMessengerText(config, recipientId, text, kind) {
  const parts = splitText(text, 1900);
  for (const part of parts) {
    if (kind === 'instagram') {
      const igId = config.igUserId || 'me';
      await graphRequest(`${igId}/messages`, config.accessToken, {
        recipient: { id: recipientId },
        message: { text: part }
      });
    } else {
      await graphRequest('me/messages', config.pageAccessToken, {
        recipient: { id: recipientId },
        messaging_type: 'RESPONSE',
        message: { text: part }
      });
    }
  }
}

async function handleMetaMessaging(req, res, kind) {
  const config = kind === 'instagram' ? db.settings.data.channels.instagram : db.settings.data.channels.messenger;
  const label = kind === 'instagram' ? 'instagram' : 'messenger';

  if (!verifySignature(req, config.appSecret)) {
    console.warn(`[${label}] Firma invalida. Revisa el App Secret.`);
    return res.status(403).send('Invalid signature');
  }
  res.status(200).send('EVENT_RECEIVED');

  if (!config.enabled) {
    console.warn(`[${label}] Canal desactivado; se ignora el evento.`);
    return;
  }
  const token = kind === 'instagram' ? config.accessToken : config.pageAccessToken;
  if (!token) {
    console.warn(`[${label}] Falta el token de acceso.`);
    return;
  }

  const payload = req.body || {};
  const entries = Array.isArray(payload.entry) ? payload.entry : [];
  for (const entry of entries) {
    for (const event of entry.messaging || []) {
      if (event.message && event.message.is_echo) continue;
      const senderId = event.sender && event.sender.id;
      if (!senderId) continue;

      let text = event.message?.text || '';
      if (!text && event.postback) text = event.postback.title || event.postback.payload || '';
      if (!text) continue;
      if (!remember(`${label}:${event.message?.mid || `${senderId}:${event.timestamp}`}`)) continue;

      try {
        const result = await respond({
          channel: kind,
          externalId: senderId,
          userName: '',
          text
        });
        await sendMessengerText(config, senderId, result.reply, kind);
      } catch (err) {
        console.error(`[${label}] Error procesando mensaje: ${err.message}`);
        try {
          await sendMessengerText(
            config,
            senderId,
            'Tuve un problema al procesar tu mensaje. Intenta de nuevo en un momento.',
            kind
          );
        } catch (_) {
          /* ignore */
        }
      }
    }
  }
}

function whatsappWebhookInfo() {
  return {
    verifyToken: db.settings.data.channels.whatsapp.verifyToken,
    enabled: db.settings.data.channels.whatsapp.enabled
  };
}

module.exports = {
  verifyChallenge,
  handleWhatsApp,
  handleMetaMessaging,
  sendWhatsAppText,
  sendMessengerText,
  splitText,
  whatsappWebhookInfo
};
