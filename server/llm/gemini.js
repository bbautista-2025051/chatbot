'use strict';

/**
 * Servicio centralizado para la integración con Google Gemini API.
 *
 * Responsabilidades:
 * 1. Centralizar la configuración de Gemini (variables de entorno + ajustes del panel).
 * 2. Validar entradas antes de enviar solicitudes a la API.
 * 3. Gestionar tiempos de espera (timeouts), reintentos y modelos de respaldo (fallback).
 * 4. Manejar errores de red, cuotas, bloqueo de seguridad y respuestas vacías.
 * 5. Prevenir solicitudes duplicadas en curso por sesión/clave.
 * 6. Garantizar que la API Key nunca se exponga en respuestas ni registros.
 */

const { DEFAULT_MODELS, PROVIDER_LABELS, GEMINI_FALLBACK_MODELS, normalizeModel } = require('../config/defaults');
const { clamp, maskSecret } = require('../lib/util');

const DEFAULT_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';
const DEFAULT_TIMEOUT_MS = 45_000;
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);

// Registro en memoria de peticiones activas para evitar duplicados concurrentes.
const activeRequests = new Map();

class GeminiServiceError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = 'AIError';
    this.code = options.code || 'GEMINI_ERROR';
    this.status = options.status || 0;
    this.detail = options.detail || '';
    this.provider = 'gemini';
  }
}

/**
 * Limpia una API key eliminando espacios, saltos de línea, comillas o prefijos accidentales.
 */
function cleanApiKey(value) {
  return String(value == null ? '' : value)
    .replace(/^\s*(?:authorization|x-goog-api-key)\s*:\s*/i, '')
    .replace(/^bearer\s+/i, '')
    .replace(/[\s"'`]+/g, '');
}

/**
 * Resuelve la configuración efectiva de Gemini combinando variables de entorno
 * y ajustes almacenados en el servidor.
 */
function resolveGeminiConfig(ai = {}) {
  const panelKey = cleanApiKey(ai.apiKey);
  const envKey = cleanApiKey(
    process.env.GEMINI_API_KEY ||
      process.env.GOOGLE_API_KEY ||
      process.env.GOOGLE_GENERATIVE_AI_API_KEY
  );
  const apiKey = panelKey || envKey;
  const usingEnvKey = !panelKey && Boolean(envKey);

  const envModel = String(process.env.GEMINI_MODEL || '').trim();
  const aiModel = String(ai.model || '').trim();
  // Si GEMINI_MODEL está definido en .env y el ajuste guardado es vacío o el valor por defecto inicial,
  // priorizamos la variable de entorno para permitir cambiar el modelo desde .env sin tocar código.
  const effectiveRawModel =
    (envModel && (!aiModel || (aiModel === 'gemini-3.8-flash' && !ai._fromPanel)))
      ? envModel
      : (aiModel || envModel || DEFAULT_MODELS.gemini || 'gemini-3.8-flash');
  const model = normalizeModel('gemini', effectiveRawModel).replace(/^models\//, '');

  const envTemp = process.env.GEMINI_TEMPERATURE !== undefined ? Number(process.env.GEMINI_TEMPERATURE) : undefined;
  const temperature = clamp(
    Number(ai.temperature ?? (Number.isFinite(envTemp) ? envTemp : 0.4)),
    0,
    2
  );

  const envMaxTokens = process.env.GEMINI_MAX_TOKENS !== undefined ? Number(process.env.GEMINI_MAX_TOKENS) : undefined;
  const maxTokens = clamp(
    Math.round(Number(ai.maxTokens ?? (Number.isFinite(envMaxTokens) ? envMaxTokens : 900))),
    64,
    8192
  );

  const envTimeout = Number(process.env.GEMINI_TIMEOUT_MS);
  const timeoutMs = clamp(
    Number(ai.timeoutMs || (Number.isFinite(envTimeout) && envTimeout > 0 ? envTimeout : DEFAULT_TIMEOUT_MS)),
    5_000,
    120_000
  );

  const baseUrl = String(process.env.GEMINI_API_BASE_URL || DEFAULT_BASE_URL)
    .trim()
    .replace(/\/+$/, '');

  const embeddingModel = String(
    ai.embeddingModel || process.env.GEMINI_EMBEDDING_MODEL || 'text-embedding-004'
  )
    .trim()
    .replace(/^models\//, '');

  return {
    provider: 'gemini',
    label: PROVIDER_LABELS.gemini || 'Google (Gemini)',
    apiKey,
    usingEnvKey,
    configured: Boolean(apiKey),
    apiKeyMasked: apiKey ? maskSecret(apiKey) : '',
    model,
    embeddingModel,
    baseUrl,
    temperature,
    maxTokens,
    timeoutMs,
    fallbackModels: GEMINI_FALLBACK_MODELS.filter((candidate) => candidate !== model)
  };
}

/**
 * Devuelve metadatos seguros de la configuración de Gemini aptos para enviar al frontend.
 * Nunca incluye la API Key real.
 */
function getPublicGeminiStatus(ai = {}) {
  const cfg = resolveGeminiConfig(ai);
  return {
    provider: 'gemini',
    label: cfg.label,
    model: cfg.model,
    configured: cfg.configured,
    usingEnvKey: cfg.usingEnvKey
  };
}

/**
 * Valida los parámetros de entrada antes de invocar la API de Gemini.
 */
function validateGeminiInput({ config, messages, system }) {
  if (!config || !config.apiKey) {
    throw new GeminiServiceError(
      'Falta la API key de Google Gemini. Configúrala mediante la variable de entorno GEMINI_API_KEY en el archivo .env o en Ajustes > Modelo de IA.',
      { code: 'MISSING_API_KEY', status: 400 }
    );
  }

  if (!config.model || !/^[A-Za-z0-9._-]+$/.test(config.model)) {
    throw new GeminiServiceError(
      'El nombre del modelo de Gemini no es válido. Verifica GEMINI_MODEL o la configuración del panel.',
      { code: 'INVALID_MODEL', status: 400 }
    );
  }

  if (!Array.isArray(messages) || !messages.length) {
    throw new GeminiServiceError('No hay mensajes válidos para enviar a Gemini.', {
      code: 'EMPTY_MESSAGES',
      status: 400
    });
  }

  for (const msg of messages) {
    if (!msg || typeof msg.content !== 'string' || !msg.content.trim()) {
      throw new GeminiServiceError('El mensaje enviado está vacío o tiene un formato no válido.', {
        code: 'INVALID_MESSAGE_FORMAT',
        status: 400
      });
    }
  }

  if (system !== undefined && typeof system !== 'string') {
    throw new GeminiServiceError('Las instrucciones del sistema deben ser una cadena de texto.', {
      code: 'INVALID_SYSTEM_PROMPT',
      status: 400
    });
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Traduce códigos HTTP y errores de Google Generative Language API a mensajes claros y seguros.
 */
function buildGeminiError(status, detail) {
  const safeDetail = String(detail || '').replace(/(?:AIza|AQ\.)[0-9A-Za-z._-]{20,}/g, '[REDACTED]');
  let message;
  let code = 'API_ERROR';

  if (/api[_ -]?key not valid|api_key_invalid|invalid api key/i.test(safeDetail)) {
    code = 'INVALID_API_KEY';
    message =
      'Google Gemini rechazó la API key: no es válida. ' +
      'Crea o copia de nuevo tu clave desde Google AI Studio (aistudio.google.com/app/apikey), ' +
      'sin espacios ni comillas, y configúrala en GEMINI_API_KEY (.env) o en Ajustes.';
  } else if (status === 401 || status === 403) {
    code = 'UNAUTHORIZED';
    message = 'La API key de Google Gemini no es válida o no tiene permisos para este modelo.';
  } else if (status === 404) {
    code = 'MODEL_NOT_FOUND';
    message =
      'El modelo de Gemini configurado no existe o no está disponible en tu cuenta. ' +
      'Revisa la variable GEMINI_MODEL o selecciona un modelo compatible (ej. gemini-3.8-flash).';
  } else if (status === 429) {
    code = 'RATE_LIMIT_EXCEEDED';
    message = 'Se alcanzó el límite de cuota o velocidad de Google Gemini. Intenta nuevamente en unos segundos.';
  } else if (status === 400 && /credit|quota|billing|balance/i.test(safeDetail)) {
    code = 'QUOTA_EXCEEDED';
    message = 'La cuenta de Google Cloud / AI Studio asociada no tiene cuota disponible.';
  } else if (status === 503) {
    code = 'MODEL_OVERLOADED';
    message =
      'Google Gemini experimenta alta demanda en este momento. Intenta de nuevo en unos instantes o cambia a un modelo alternativo.';
  } else if (status >= 500) {
    code = 'UPSTREAM_ERROR';
    message = 'Los servidores de Google Gemini están teniendo problemas temporales. Intenta de nuevo en unos segundos.';
  } else {
    message = `Google Gemini respondió con un error${status ? ` (${status})` : ''}.`;
  }

  return new GeminiServiceError(message, { code, status, detail: safeDetail });
}

/**
 * Ejecuta una petición HTTP hacia Google Gemini con control de timeout y reintentos automáticos.
 */
async function executeGeminiRequest(url, options, { timeoutMs = DEFAULT_TIMEOUT_MS, retries = 1, retryBaseMs = 650 } = {}) {
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
          (json && (json.error?.message || json.error?.status || json.message)) ||
          raw.slice(0, 500) ||
          `HTTP ${res.status}`;

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
        throw buildGeminiError(res.status, detail);
      }

      return json;
    } catch (err) {
      if (err instanceof GeminiServiceError) throw err;
      if (err.name === 'AbortError') {
        throw new GeminiServiceError(
          'La solicitud a Google Gemini superó el tiempo máximo de espera. Verifica tu conexión o intenta de nuevo.',
          { code: 'TIMEOUT', status: 504 }
        );
      }
      throw new GeminiServiceError(`No se pudo conectar con Google Gemini: ${err.message}`, {
        code: 'NETWORK_ERROR',
        status: 502
      });
    } finally {
      clearTimeout(timer);
    }
  }
}

/**
 * Verifica si existe una solicitud en curso para la clave indicada.
 */
function isGeminiRequestInFlight(requestKey) {
  if (!requestKey) return false;
  return activeRequests.has(String(requestKey));
}

/**
 * Envía un historial de conversación a Google Gemini y devuelve la respuesta procesada.
 *
 * @param {object} params
 * @param {object} params.config Configuración resuelta o cruda de IA
 * @param {Array<{role: string, content: string}>} params.messages Historial normalizado
 * @param {string} [params.system] Prompt del sistema
 * @param {string} [params.requestKey] Identificador único de sesión para evitar peticiones duplicadas
 */
async function callGemini({ config: rawConfig, messages, system = '', requestKey = '' }) {
  const config = rawConfig && rawConfig.provider === 'gemini' && rawConfig.baseUrl && rawConfig.timeoutMs
    ? rawConfig
    : resolveGeminiConfig(rawConfig);

  validateGeminiInput({ config, messages, system });

  const lockKey = requestKey ? String(requestKey).trim() : '';
  if (lockKey) {
    if (activeRequests.has(lockKey)) {
      throw new GeminiServiceError(
        'Ya existe una solicitud en curso para esta conversación. Espera a que Gemini termine de responder.',
        { code: 'REQUEST_IN_PROGRESS', status: 409 }
      );
    }
    activeRequests.set(lockKey, Date.now());
  }

  try {
    const generateWithModel = async (modelName) => {
      const cleanModel = String(modelName || '').replace(/^models\//, '');
      const url = `${config.baseUrl}/models/${encodeURIComponent(cleanModel)}:generateContent`;
      const isThinkingModel = /^gemini-(2\.5|[3-9])/i.test(cleanModel);
      const generationConfig = {
        temperature: config.temperature,
        maxOutputTokens: isThinkingModel ? Math.max(config.maxTokens, 2048) : config.maxTokens
      };

      // Gemini 3+ soporta thinkingConfig; usar 'low' optimiza latencia en chat interactivo.
      if (/^gemini-[3-9]/.test(cleanModel)) {
        generationConfig.thinkingConfig = { thinkingLevel: 'low' };
      }

      const body = {
        ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
        contents: messages.map((message) => ({
          role: message.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: String(message.content || '').trim() }]
        })),
        generationConfig
      };

      const sendRequest = () =>
        executeGeminiRequest(
          url,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-goog-api-key': config.apiKey
            },
            body: JSON.stringify(body)
          },
          { timeoutMs: config.timeoutMs, retries: 1 }
        );

      let json;
      try {
        json = await sendRequest();
      } catch (err) {
        if (err.status === 400 && /thinking|temperature/i.test(err.detail)) {
          if (/thinking/i.test(err.detail)) delete body.generationConfig.thinkingConfig;
          if (/temperature/i.test(err.detail)) delete body.generationConfig.temperature;
          json = await sendRequest();
        } else {
          throw err;
        }
      }

      if (json && json.promptFeedback && json.promptFeedback.blockReason) {
        throw new GeminiServiceError(
          `La consulta fue bloqueada por las políticas de seguridad de Gemini (${json.promptFeedback.blockReason}). Reformula tu pregunta.`,
          { code: 'SAFETY_BLOCKED', status: 400, detail: json.promptFeedback.blockReason }
        );
      }

      const candidate = json && Array.isArray(json.candidates) ? json.candidates[0] : null;
      if (candidate && candidate.finishReason === 'SAFETY') {
        throw new GeminiServiceError(
          'La respuesta fue detenida por los filtros de seguridad de Gemini. Intenta reformular tu consulta.',
          { code: 'SAFETY_BLOCKED', status: 400 }
        );
      }

      const parts = (candidate && candidate.content && Array.isArray(candidate.content.parts) && candidate.content.parts) || [];
      const text = parts
        .filter((part) => typeof part.text === 'string' && !part.thought)
        .map((part) => part.text)
        .join('\n')
        .trim();

      return {
        text,
        usage: (json && json.usageMetadata) || null,
        model: cleanModel,
        finishReason: (candidate && candidate.finishReason) || 'STOP'
      };
    };

    const preferred = normalizeModel(
      'gemini',
      String(config.model || DEFAULT_MODELS.gemini || 'gemini-3.8-flash').replace(/^models\//, '')
    );
    const candidateModels = [preferred, ...GEMINI_FALLBACK_MODELS.filter((item) => item !== preferred)];
    let lastError = null;

    for (const modelName of candidateModels) {
      try {
        const result = await generateWithModel(modelName);
        if (result.text) return result;
        lastError = new GeminiServiceError(
          'Google Gemini devolvió una respuesta vacía. Verifica el modelo configurado o intenta reformular tu mensaje.',
          { code: 'EMPTY_RESPONSE', status: 502 }
        );
      } catch (err) {
        // Si un modelo primario devuelve 404 (ej. retirado para nuevos usuarios como gemini-2.5-flash),
        // intentamos automáticamente con gemini-3.8-flash o el siguiente candidato vigente.
        if (
          err.status === 404 &&
          /no longer available|not found|not supported/i.test(err.detail || '') &&
          modelName !== 'gemini-3.8-flash'
        ) {
          if (!candidateModels.includes('gemini-3.8-flash')) {
            candidateModels.push('gemini-3.8-flash');
          }
          if (!lastError) lastError = err;
          continue;
        }
        lastError = err;
        // Solo probamos un modelo de respaldo si el fallo es por saturación (503) o límite de cuota (429).
        if (err.status !== 503 && err.status !== 429) {
          throw err;
        }
      }
    }

    throw (
      lastError ||
      new GeminiServiceError('No se pudo obtener respuesta de Google Gemini.', {
        code: 'UNKNOWN_ERROR',
        status: 502
      })
    );
  } finally {
    if (lockKey) {
      activeRequests.delete(lockKey);
    }
  }
}

module.exports = {
  GeminiServiceError,
  cleanApiKey,
  resolveGeminiConfig,
  getPublicGeminiStatus,
  validateGeminiInput,
  isGeminiRequestInFlight,
  callGemini
};
