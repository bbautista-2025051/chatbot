'use strict';

const { db } = require('../lib/store');
const { uid, nowIso, truncate, extractEmail, extractPhone } = require('../lib/util');
const { retrieve, buildContext } = require('../rag/retrieve');
const { buildSystemPrompt, contactLine } = require('./prompt');
const { chat, AIError, resolveChatConfig } = require('../llm/providers');

const locks = new Map();

function isSessionBusy(channel, externalId) {
  return locks.has(`${channel}:${externalId}`);
}

async function withLock(key, fn) {
  const previous = locks.get(key) || Promise.resolve();
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const queued = previous.then(() => gate);
  locks.set(key, queued);
  await previous;
  try {
    return await fn();
  } finally {
    release();
    if (locks.get(key) === queued) locks.delete(key);
  }
}

function findConversation(channel, externalId) {
  return (
    db.conversations.data.find(
      (conversation) => conversation.channel === channel && conversation.externalId === externalId
    ) || null
  );
}

function getOrCreateConversation({ channel, externalId, userName }) {
  let conversation = findConversation(channel, externalId);
  if (conversation) {
    if (userName && !conversation.userName) conversation.userName = userName;
    return conversation;
  }
  const now = nowIso();
  conversation = {
    id: uid('conv_'),
    channel,
    externalId,
    userName: userName || '',
    messages: [],
    needsHuman: false,
    leadId: '',
    createdAt: now,
    updatedAt: now
  };
  db.conversations.data.push(conversation);
  db.trimConversations();
  db.conversations.save();
  return conversation;
}

const HANDOFF_RE =
  /(hablar con (un |una )?(asesor|humano|persona|agente|vendedor)|atencion al cliente|que me llamen|comunicarme con alguien|necesito ayuda personalizada)/i;
const BUY_INTENT_RE =
  /(comprar|compra|precio|cuanto (vale|cuesta)|quetzal|quetzales|pedido|pedir|domicilio|envio|enviar|encargar|disponible|stock|promocion|descuento|pago|visacuota|banrural|industrial|cargo expreso|forza|guatex|departamento|zona\s*\d+|factura|nit)/i;

function maybeCaptureLead(conversation, userText, userName, settings) {
  if (!settings.ai.captureLeads) return;
  const email = extractEmail(userText);
  const phoneRaw = extractPhone(userText);
  const phoneDigits = String(phoneRaw || '').replace(/\D/g, '');
  // En Guatemala los teléfonos locales tienen 8 dígitos (o 11 con prefijo +502)
  const phone = phoneDigits.length >= 8 ? phoneRaw : '';
  const nameMatch = userText.match(/(?:me llamo|mi nombre es|soy)\s+([A-Za-zÁÉÍÓÚÑáéíóúñ]{2,30}(?:\s+[A-Za-zÁÉÍÓÚÑáéíóúñ]{2,30})?)/i);
  const hasIntent = BUY_INTENT_RE.test(userText);

  if (!email && !phone && !hasIntent) return;

  let lead = db.leads.data.find((item) => item.conversationId === conversation.id);
  const now = nowIso();
  if (!lead) {
    lead = {
      id: uid('lead_'),
      conversationId: conversation.id,
      channel: conversation.channel,
      name: userName || (nameMatch ? nameMatch[1].trim() : ''),
      phone: '',
      email: '',
      interest: truncate(userText, 180),
      status: 'nuevo',
      createdAt: now,
      updatedAt: now
    };
    db.leads.data.push(lead);
    conversation.leadId = lead.id;
  }

  if (nameMatch && !lead.name) lead.name = nameMatch[1].trim();
  if (phone) lead.phone = phone;
  if (email) lead.email = email;
  if (hasIntent) lead.interest = truncate(userText, 180);
  lead.lastMessage = truncate(userText, 180);
  lead.updatedAt = now;
  db.leads.save();
  db.conversations.save();
}

function providerReady(ai) {
  const config = resolveChatConfig(ai);
  if (config.provider === 'demo') return true;
  if (config.provider === 'compatible') return Boolean(config.apiKey) || Boolean(config.baseUrl);
  return Boolean(config.apiKey);
}

function demoReply({ text, results, settings }) {
  const business = settings.business || {};
  const contact = contactLine(business);
  const lower = text.toLowerCase();
  const wantsToBuy = BUY_INTENT_RE.test(lower);

  if (wantsToBuy && business.products && business.products.length) {
    const currency = business.currency || '$';
    const items = business.products
      .slice(0, 5)
      .map((product) => `• ${product.name}${product.price ? `: ${currency}${product.price}` : ''}`)
      .join('\n');
    return `Estos son algunos de nuestros productos:\n${items}\n\nPara comprar o resolver dudas escribenos a ${contact}.\n\n_(Modo demo sin IA conectada)._`;
  }

  if (results.length) {
    const excerpts = results
      .slice(0, 2)
      .map((result) => {
        const clean = String(result.text || '').replace(/\s+/g, ' ').trim();
        return truncate(clean, 420);
      })
      .filter(Boolean);
    return `${excerpts.join('\n\n')}\n\n¿Te gustaria que te ayude con algo mas? Tambien puedes escribirnos a ${contact}.\n\n_(Respuesta de demostracion: aun no hay un proveedor de IA conectado)._`;
  }

  return `Hola, soy ${settings.ai.assistantName || 'tu asistente'}. Estoy en modo demo porque aun no se ha conectado un proveedor de IA (OpenAI, Claude o Gemini). Puedes escribirnos a ${contact}.\n\n_(Modo demo sin IA conectada)._`;
}

const FALLBACK_ERR_RE = /^Lo siento, en este momento no (puedo|pude) procesar tu (mensaje|consulta)/i;

function buildProviderMessages(conversation, maxHistory) {
  const history = conversation.messages.slice(-Math.max(2, maxHistory));
  const filtered = history
    .filter(
      (message) =>
        ['user', 'assistant'].includes(message.role) &&
        message.content &&
        !(message.role === 'assistant' && FALLBACK_ERR_RE.test(message.content))
    )
    .map((message) => ({ role: message.role, content: message.content }));

  // Fusiona turnos consecutivos del mismo rol para cumplir el formato estricto de Gemini
  const merged = [];
  for (const msg of filtered) {
    const prev = merged[merged.length - 1];
    if (prev && prev.role === msg.role) {
      prev.content = prev.content === msg.content ? msg.content : `${prev.content}\n\n${msg.content}`;
    } else {
      merged.push({ ...msg });
    }
  }
  return merged;
}

/**
 * Procesa un mensaje entrante y genera la respuesta del asistente.
 */
async function respond(options) {
  const {
    channel = 'web',
    externalId,
    userName = '',
    text,
    isAdmin = false,
    rejectIfBusy = channel === 'web' || channel === 'admin'
  } = options;

  const messageText = String(text || '').trim().slice(0, 2000);
  if (!messageText) {
    throw new Error('El mensaje esta vacio.');
  }
  if (!externalId) {
    throw new Error('Falta el identificador de la conversacion.');
  }

  const lockKey = `${channel}:${externalId}`;
  if (rejectIfBusy && locks.has(lockKey)) {
    const busyErr = new Error('Ya hay una solicitud en curso para esta sesión. Espera la respuesta antes de enviar otro mensaje.');
    busyErr.code = 'REQUEST_IN_PROGRESS';
    busyErr.status = 409;
    throw busyErr;
  }

  const settings = db.settings.data;
  const ai = settings.ai;
  const resolvedCfg = resolveChatConfig(ai);
  const useDemo = !providerReady(ai);

  return withLock(lockKey, async () => {
    const conversation = getOrCreateConversation({ channel, externalId, userName });
    const now = nowIso();
    conversation.messages.push({ role: 'user', content: messageText, ts: now });

    maybeCaptureLead(conversation, messageText, userName, settings);
    if (HANDOFF_RE.test(messageText)) conversation.needsHuman = true;

    const previousUserText = conversation.messages
      .filter((message) => message.role === 'user')
      .slice(-3, -1)
      .map((message) => message.content)
      .join(' ');
    const query = `${previousUserText} ${messageText}`.trim().slice(0, 2000);

    let retrieval = { results: [], mode: 'none', embeddingError: '' };
    try {
      retrieval = await retrieve(query, { topK: ai.topK || 6 });
    } catch (err) {
      console.warn(`[chat] Error en la busqueda de conocimiento: ${err.message}`);
    }

    const hasContext = retrieval.results.length > 0;
    const context = buildContext(retrieval.results);
    const systemPrompt = buildSystemPrompt({ settings, context, hasContext });
    const started = Date.now();

    let reply = '';
    let latencyMs = 0;
    let errorDetail = '';
    let userErrorMessage = '';
    let activeModel = useDemo ? 'demo' : resolvedCfg.model;

    if (useDemo) {
      reply = demoReply({ text: messageText, results: retrieval.results, settings });
      latencyMs = Date.now() - started;
    } else {
      try {
        const result = await chat({
          ai,
          messages: buildProviderMessages(conversation, ai.maxHistory || 12),
          system: systemPrompt,
          requestKey: lockKey
        });
        reply = result.text;
        latencyMs = result.latencyMs;
        if (result.model) activeModel = result.model;
      } catch (err) {
        userErrorMessage = err.message || 'No se pudo conectar con el servicio de IA.';
        errorDetail = err instanceof AIError ? `${err.message}${err.detail ? ` (${err.detail})` : ''}` : err.message;
        console.error(`[chat] ${channel}: ${errorDetail}`);
        const contact = contactLine(settings.business);
        reply = `Lo siento, en este momento no pude procesar tu consulta con el modelo de IA (${userErrorMessage}). Puedes intentar nuevamente o escribirnos a ${contact}.`;
      }
    }

    reply = String(reply || '').trim().slice(0, 5000);
    const sourcesAll = retrieval.results.map((result) => ({
      name: result.sourceName,
      url: result.sourceUrl,
      score: result.score
    }));
    const sourcesPublic = sourcesAll.filter((source) => source.url);
    const sources = isAdmin ? sourcesAll : sourcesPublic;

    conversation.messages.push({
      role: 'assistant',
      content: reply,
      ts: nowIso(),
      sources,
      model: activeModel,
      latencyMs,
      ...(userErrorMessage ? { isError: true } : {})
    });
    if (conversation.messages.length > 100) {
      conversation.messages = conversation.messages.slice(-100);
    }
    conversation.updatedAt = nowIso();
    conversation.messageCount = conversation.messages.length;
    db.conversations.save();

    return {
      conversationId: conversation.id,
      reply,
      sources,
      quickReplies: Array.isArray(ai.quickReplies) ? ai.quickReplies.slice(0, 5) : [],
      needsHuman: Boolean(conversation.needsHuman),
      latencyMs,
      mode: retrieval.mode,
      provider: useDemo ? 'demo' : resolvedCfg.provider,
      model: activeModel,
      providerError: Boolean(userErrorMessage),
      ...(userErrorMessage ? { errorMessage: userErrorMessage } : {}),
      ...(isAdmin
        ? {
            debug: {
              provider: useDemo ? 'demo' : resolvedCfg.provider,
              model: activeModel,
              requestedProvider: resolvedCfg.provider,
              requestedModel: resolvedCfg.model,
              retrievalMode: retrieval.mode,
              embeddingError: retrieval.embeddingError,
              results: retrieval.results.map((result) => ({
                source: result.sourceName,
                url: result.sourceUrl,
                score: result.score,
                semantic: result.semantic,
                lexical: result.lexical,
                text: truncate(result.text, 280)
              })),
              error: errorDetail
            }
          }
        : {})
    };
  });
}

function getConversationHistory(channel, externalId) {
  const conversation = findConversation(channel, externalId);
  if (!conversation || !Array.isArray(conversation.messages)) {
    return { messages: [], needsHuman: false };
  }
  return {
    conversationId: conversation.id,
    needsHuman: Boolean(conversation.needsHuman),
    messages: conversation.messages.slice(-50).map((msg) => ({
      role: msg.role,
      content: msg.content,
      ts: msg.ts,
      sources: Array.isArray(msg.sources) ? msg.sources.filter((s) => s && s.url) : [],
      isError: Boolean(msg.isError)
    }))
  };
}

function resetConversation(channel, externalId) {
  const conversation = findConversation(channel, externalId);
  if (!conversation) return false;
  conversation.messages = [];
  conversation.needsHuman = false;
  conversation.updatedAt = nowIso();
  db.conversations.save();
  return true;
}

module.exports = {
  respond,
  resetConversation,
  getConversationHistory,
  isSessionBusy,
  findConversation,
  getOrCreateConversation,
  providerReady
};
