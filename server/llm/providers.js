'use strict';

const { DEFAULT_MODELS, PROVIDER_LABELS, normalizeModel } = require('../config/defaults');
const { clamp } = require('../lib/util');
const {
  GeminiServiceError,
  cleanApiKey,
  resolveGeminiConfig,
  getPublicGeminiStatus,
  isGeminiRequestInFlight,
  callGemini: callGeminiService
} = require('./gemini');

class AIError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = 'AIError';
    this.code = options.code || 'AI_ERROR';
    this.status = options.status || 0;
    this.detail = options.detail || '';
    this.provider = options.provider || '';
  }
}

function resolveChatConfig(ai = {}) {
  let provider = ai.provider || process.env.AI_PROVIDER || 'gemini';
  if (!['openai', 'anthropic', 'gemini', 'compatible', 'demo'].includes(provider)) {
    provider = 'gemini';
  }

  if (provider === 'gemini') {
    const geminiCfg = resolveGeminiConfig(ai);
    return {
      provider: 'gemini',
      apiKey: geminiCfg.apiKey,
      model: geminiCfg.model,
      baseUrl: geminiCfg.baseUrl,
      temperature: geminiCfg.temperature,
      maxTokens: geminiCfg.maxTokens,
      timeoutMs: geminiCfg.timeoutMs,
      usingEnvKey: geminiCfg.usingEnvKey,
      label: geminiCfg.label
    };
  }

  let apiKey = cleanApiKey(ai.apiKey);
  if (!apiKey) {
    if (provider === 'openai') apiKey = cleanApiKey(process.env.OPENAI_API_KEY);
    if (provider === 'anthropic') apiKey = cleanApiKey(process.env.ANTHROPIC_API_KEY);
  }

  const model = normalizeModel(provider, ai.model || DEFAULT_MODELS[provider] || '');
  const temperature = clamp(Number(ai.temperature ?? 0.4), 0, 2);
  const maxTokens = clamp(Number(ai.maxTokens ?? 900), 64, 8192);

  return {
    provider,
    apiKey,
    model,
    baseUrl: (ai.baseUrl || '').trim(),
    temperature,
    maxTokens,
    label: PROVIDER_LABELS[provider] || provider
  };
}

function normalizeMessages(messages) {
  const out = [];
  for (const message of messages || []) {
    const role = message && message.role === 'assistant' ? 'assistant' : 'user';
    const content = String((message && message.content) || '').trim();
    if (!content) continue;
    if (out.length && out[out.length - 1].role === role) {
      out[out.length - 1].content += `\n\n${content}`;
    } else {
      out.push({ role, content });
    }
  }
  while (out.length && out[0].role === 'assistant') out.shift();
  return out;
}

function normalizeBaseUrl(baseUrl) {
  if (!baseUrl) return 'https://api.openai.com/v1';
  let base = baseUrl.replace(/\/+$/, '');
  if (base.endsWith('/chat/completions')) base = base.slice(0, -'/chat/completions'.length);
  if (!/\/v\d+$/.test(base) && !/\/openai$/i.test(base)) base += '/v1';
  return base;
}

// Estados que suelen ser transitorios y merecen un reintento.
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function friendlyError(status, detail, provider) {
  const name = PROVIDER_LABELS[provider] || provider;
  let message;
  if (/api[_ -]?key not valid|api_key_invalid|invalid api key/i.test(detail)) {
    message = `${name} rechazo la API key: no es valida.`;
    if (provider === 'gemini') {
      message +=
        ' Copia de nuevo la clave completa desde Google AI Studio (empieza por "AQ." o "AIza"),' +
        ' sin espacios ni comillas, y verifica que no la hayas revocado o borrado.';
    } else {
      message += ' Revisa que la copiaste completa y que no fue revocada.';
    }
  } else if (status === 401 || status === 403) {
    message = `La API key de ${name} no es valida o no tiene permisos suficientes.`;
  } else if (status === 404) {
    message = `El modelo configurado no existe o no esta disponible en ${name}.`;
  } else if (status === 429) {
    message = `Se alcanzo el limite de uso de ${name}. Intenta de nuevo en unos minutos.`;
  } else if (status === 400 && /credit|quota|billing|balance/i.test(detail)) {
    message = `La cuenta de ${name} no tiene saldo o cuota disponible.`;
  } else if (status === 503) {
    message =
      provider === 'gemini'
        ? 'Google (Gemini) no tiene capacidad disponible para ese modelo en este momento (alta demanda). ' +
          'Prueba otro modelo en Ajustes, por ejemplo gemini-3.8-flash o gemini-3.6-flash, o intenta de nuevo en unos minutos.'
        : `${name} no tiene capacidad disponible en este momento. Intenta de nuevo en unos minutos.`;
  } else if (status >= 500) {
    message = `${name} esta teniendo problemas temporales. Intenta de nuevo en unos segundos.`;
  } else {
    message = `El proveedor de IA (${name}) respondio con un error${status ? ` ${status}` : ''}.`;
  }
  return new AIError(message, { status, detail, provider });
}

async function request(url, options, { provider, timeoutMs = 90_000, retries = 1, retryBaseMs = 600 } = {}) {
  let attempt = 0;
  for (;;) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { ...options, signal: controller.signal });
      const raw = await res.text();
      let json = null;
      try {
        json = raw ? JSON.parse(raw) : null;
      } catch (_) {
        json = null;
      }
      if (!res.ok) {
        const detail =
          (json && (json.error?.message || json.error?.type || json.message)) ||
          raw.slice(0, 500) ||
          `HTTP ${res.status}`;
        // 429 y 5xx (incluido el 503 por alta demanda) suelen ser pasajeros:
        // se reintenta con espera creciente antes de fallar.
        if (RETRYABLE_STATUS.has(res.status) && attempt < retries) {
          attempt += 1;
          const retryAfter = Number(res.headers && res.headers.get && res.headers.get('retry-after'));
          const wait =
            Number.isFinite(retryAfter) && retryAfter > 0
              ? Math.min(retryAfter * 1000, 8000)
              : retryBaseMs * attempt + Math.floor(Math.random() * 250);
          await sleep(wait);
          continue;
        }
        throw friendlyError(res.status, String(detail), provider);
      }
      return json;
    } catch (err) {
      if (err instanceof AIError) throw err;
      if (err.name === 'AbortError') {
        throw new AIError('El proveedor de IA tardo demasiado en responder. Intenta de nuevo.', {
          provider
        });
      }
      throw new AIError(`No se pudo conectar con el proveedor de IA: ${err.message}`, { provider });
    } finally {
      clearTimeout(timer);
    }
  }
}

async function callOpenAICompatible(config, messages, system) {
  if (!config.apiKey && config.provider !== 'compatible') {
    throw new AIError('Falta la API key de OpenAI. Configurala en Ajustes > Modelo de IA.', {
      provider: 'openai'
    });
  }
  const base = normalizeBaseUrl(config.baseUrl);
  const url = `${base}/chat/completions`;
  const body = {
    model: config.model || 'gpt-4o-mini',
    messages: [{ role: 'system', content: system }, ...messages],
    temperature: config.temperature,
    max_tokens: config.maxTokens,
    stream: false
  };
  const headers = { 'Content-Type': 'application/json' };
  if (config.apiKey) headers.Authorization = `Bearer ${config.apiKey}`;

  let json;
  try {
    json = await request(url, { method: 'POST', headers, body: JSON.stringify(body) }, config);
  } catch (err) {
    // Algunos modelos nuevos no aceptan temperature o max_tokens.
    if (err.status === 400 && /temperature|max_tokens|max_completion_tokens/i.test(err.detail)) {
      const retryBody = { ...body };
      if (/temperature/i.test(err.detail)) delete retryBody.temperature;
      if (/max_tokens/i.test(err.detail)) {
        delete retryBody.max_tokens;
        retryBody.max_completion_tokens = config.maxTokens;
      }
      json = await request(url, { method: 'POST', headers, body: JSON.stringify(retryBody) }, config);
    } else {
      throw err;
    }
  }

  const text =
    (json && json.choices && json.choices[0] && json.choices[0].message && json.choices[0].message.content) ||
    '';
  return {
    text: typeof text === 'string' ? text.trim() : '',
    usage: (json && json.usage) || null,
    model: (json && json.model) || config.model
  };
}

async function callAnthropic(config, messages, system) {
  if (!config.apiKey) {
    throw new AIError('Falta la API key de Anthropic (Claude). Configurala en Ajustes > Modelo de IA.', {
      provider: 'anthropic'
    });
  }
  const url = 'https://api.anthropic.com/v1/messages';
  const body = {
    model: config.model || 'claude-3-5-haiku-latest',
    max_tokens: config.maxTokens,
    temperature: config.temperature,
    system,
    messages
  };
  const json = await request(
    url,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': config.apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify(body)
    },
    config
  );
  const text = ((json && json.content) || [])
    .filter((part) => part.type === 'text')
    .map((part) => part.text)
    .join('\n')
    .trim();
  return {
    text,
    usage: (json && json.usage) || null,
    model: (json && json.model) || config.model
  };
}

async function callGemini(config, messages, system, requestKey = '') {
  try {
    return await callGeminiService({ config, messages, system, requestKey });
  } catch (err) {
    if (err instanceof AIError) throw err;
    if (err instanceof GeminiServiceError) {
      throw new AIError(err.message, {
        code: err.code,
        status: err.status,
        detail: err.detail,
        provider: 'gemini'
      });
    }
    throw new AIError(err.message || 'Error al comunicarse con Google Gemini.', {
      provider: 'gemini'
    });
  }
}

/**
 * Ejecuta una conversacion completa (sin streaming) contra el proveedor configurado.
 * @param {object} options
 * @param {object} options.ai configuracion de IA (settings.ai)
 * @param {Array<{role:string, content:string}>} options.messages historial
 * @param {string} options.system prompt del sistema
 * @param {string} [options.requestKey] clave unica para evitar peticiones duplicadas en curso
 */
async function chat({ ai, messages, system, requestKey = '' }) {
  const config = resolveChatConfig(ai);
  const started = Date.now();
  const normalized = normalizeMessages(messages);

  if (config.provider === 'demo') {
    throw new AIError(
      'El proveedor "demo" se resuelve dentro del motor de chat. No se puede llamar directamente.',
      { provider: 'demo' }
    );
  }

  if (!normalized.length) {
    throw new AIError('No hay mensajes para procesar.', { code: 'EMPTY_MESSAGES', status: 400 });
  }

  let result;
  if (config.provider === 'anthropic') {
    result = await callAnthropic(config, normalized, system);
  } else if (config.provider === 'gemini') {
    result = await callGemini(config, normalized, system, requestKey);
  } else {
    result = await callOpenAICompatible(config, normalized, system);
  }

  if (!result.text) {
    throw new AIError(
      'El proveedor de IA devolvio una respuesta vacia. Revisa el modelo configurado o intenta de nuevo.',
      { code: 'EMPTY_RESPONSE', status: 502, provider: config.provider }
    );
  }

  return {
    ...result,
    provider: config.provider,
    latencyMs: Date.now() - started
  };
}

async function testProvider(ai) {
  const config = resolveChatConfig(ai);
  if (config.provider === 'demo') {
    return { ok: true, provider: 'demo', model: 'demo', latencyMs: 0, text: 'OK (modo demo)' };
  }
  const started = Date.now();
  const result = await chat({
    ai: { ...ai, provider: config.provider, apiKey: config.apiKey, model: config.model, maxTokens: 512, temperature: 0 },
    messages: [{ role: 'user', content: 'Responde unicamente: OK' }],
    system: 'Eres un verificador de conexion. Responde solo con la palabra OK.'
  });
  return {
    ok: true,
    provider: result.provider,
    model: result.model,
    latencyMs: Date.now() - started,
    text: result.text.slice(0, 120)
  };
}

module.exports = {
  AIError,
  resolveChatConfig,
  resolveGeminiConfig,
  getPublicGeminiStatus,
  isGeminiRequestInFlight,
  normalizeMessages,
  chat,
  testProvider,
  cleanApiKey,
  PROVIDER_LABELS
};
