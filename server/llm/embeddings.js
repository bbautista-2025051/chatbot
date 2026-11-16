'use strict';

const { tokenize, fnv1a, clamp } = require('../lib/util');

const LOCAL_DIM = 512;
const BATCH_SIZE = 64;

class EmbeddingError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = 'EmbeddingError';
    this.status = options.status || 0;
    this.detail = options.detail || '';
  }
}

function resolveEmbeddingConfig(ai = {}) {
  let provider = ai.embeddingProvider || 'local';
  if (!['local', 'openai', 'gemini'].includes(provider)) provider = 'local';

  let apiKey = ai.embeddingApiKey || '';
  if (!apiKey) {
    if (provider === 'openai') {
      apiKey = process.env.OPENAI_API_KEY || (ai.provider === 'openai' ? ai.apiKey : '') || '';
    } else if (provider === 'gemini') {
      apiKey =
        process.env.GEMINI_API_KEY ||
        process.env.GOOGLE_API_KEY ||
        process.env.GOOGLE_GENERATIVE_AI_API_KEY ||
        (ai.provider === 'gemini' ? ai.apiKey : '') ||
        '';
    }
  }

  let model = ai.embeddingModel || '';
  let dim = LOCAL_DIM;
  if (provider === 'openai') {
    if (!model) model = 'text-embedding-3-small';
    if (/large/.test(model)) dim = 3072;
    else if (/3-small/.test(model)) dim = 1536;
  } else if (provider === 'gemini') {
    if (!model) model = process.env.GEMINI_EMBEDDING_MODEL || 'text-embedding-004';
    dim = 0; // se detecta al responder
  } else {
    model = 'local-hash-512';
    dim = LOCAL_DIM;
  }

  return { provider, apiKey, model, dim };
}

function l2Normalize(vector) {
  let sum = 0;
  for (let i = 0; i < vector.length; i++) sum += vector[i] * vector[i];
  if (sum === 0) return vector;
  const norm = Math.sqrt(sum);
  for (let i = 0; i < vector.length; i++) vector[i] /= norm;
  return vector;
}

/**
 * Embedding local determinista basado en hashing de palabras y bigramas.
 * No requiere API y permite que el entrenamiento funcione desde el primer dia.
 * Se combina con BM25 en la busqueda para compensar sus limitaciones.
 */
function localEmbed(text) {
  const tokens = tokenize(text);
  const counts = new Map();
  for (const token of tokens) {
    const key = `w:${token}`;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  for (let i = 0; i < tokens.length - 1; i++) {
    const key = `b:${tokens[i]}_${tokens[i + 1]}`;
    counts.set(key, (counts.get(key) || 0) + 0.4);
  }

  const vec = new Array(LOCAL_DIM).fill(0);
  for (const [term, count] of counts) {
    const hash = fnv1a(term);
    const index = hash % LOCAL_DIM;
    const sign = (hash >>> 31) & 1 ? 1 : -1;
    vec[index] += sign * (1 + Math.log(1 + count));
  }
  return l2Normalize(vec);
}

function cosineSimilarity(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return clamp(dot / (Math.sqrt(normA) * Math.sqrt(normB)), 0, 1);
}

async function fetchJson(url, options = {}, timeoutMs = 60_000) {
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
        raw.slice(0, 400) ||
        `HTTP ${res.status}`;
      let message = `El proveedor de embeddings respondio con error (${res.status}).`;
      if (res.status === 401 || res.status === 403) {
        message = 'La API key de embeddings no es valida o no tiene permisos.';
      } else if (res.status === 429) {
        message = 'Se alcanzo el limite de uso de embeddings del proveedor.';
      } else if (res.status === 404) {
        message = 'El modelo de embeddings configurado no existe o no esta disponible.';
      }
      throw new EmbeddingError(message, { status: res.status, detail });
    }
    return json;
  } catch (err) {
    if (err instanceof EmbeddingError) throw err;
    if (err.name === 'AbortError') {
      throw new EmbeddingError('El proveedor de embeddings tardo demasiado en responder.');
    }
    throw new EmbeddingError(`No se pudo conectar con el proveedor de embeddings: ${err.message}`);
  } finally {
    clearTimeout(timer);
  }
}

async function embedOpenAI(texts, config) {
  if (!config.apiKey) {
    throw new EmbeddingError('Falta la API key para los embeddings de OpenAI. Configurala en Ajustes > Modelo de IA o usa embeddings locales.');
  }
  const out = [];
  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE);
    const json = await fetchJson('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`
      },
      body: JSON.stringify({ model: config.model, input: batch })
    });
    const rows = (json && json.data) || [];
    if (rows.length !== batch.length) {
      throw new EmbeddingError('Respuesta inesperada del servicio de embeddings de OpenAI.');
    }
    rows.sort((a, b) => (a.index || 0) - (b.index || 0));
    for (const row of rows) out.push(l2Normalize(Array.from(row.embedding || [])));
  }
  return out;
}

async function embedGemini(texts, config) {
  if (!config.apiKey) {
    throw new EmbeddingError('Falta la API key para los embeddings de Gemini. Configurala en Ajustes > Modelo de IA o usa embeddings locales.');
  }
  const model = String(config.model || 'text-embedding-004').replace(/^models\//, '');
  const out = [];
  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE);
    const baseUrl = String(process.env.GEMINI_API_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta')
      .trim()
      .replace(/\/+$/, '');
    const json = await fetchJson(
      `${baseUrl}/models/${encodeURIComponent(model)}:batchEmbedContents`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': config.apiKey
        },
        body: JSON.stringify({
          requests: batch.map((text) => ({
            model: `models/${model}`,
            content: { parts: [{ text: String(text).slice(0, 8000) }] },
            taskType: 'RETRIEVAL_DOCUMENT'
          }))
        })
      }
    );
    const rows = (json && json.embeddings) || [];
    if (rows.length !== batch.length) {
      throw new EmbeddingError('Respuesta inesperada del servicio de embeddings de Gemini.');
    }
    for (const row of rows) out.push(l2Normalize(Array.from(row.values || [])));
  }
  return out;
}

async function embedTexts(texts, ai = {}) {
  const clean = texts.map((t) => String(t || '').trim());
  if (!clean.length) return { vectors: [], provider: 'local', model: 'local-hash-512', dim: LOCAL_DIM };

  const config = resolveEmbeddingConfig(ai);
  if (config.provider === 'local') {
    return {
      vectors: clean.map((text) => localEmbed(text)),
      provider: 'local',
      model: 'local-hash-512',
      dim: LOCAL_DIM
    };
  }
  if (config.provider === 'openai') {
    const vectors = await embedOpenAI(clean, config);
    return { vectors, provider: 'openai', model: config.model, dim: vectors[0] ? vectors[0].length : config.dim };
  }
  if (config.provider === 'gemini') {
    const vectors = await embedGemini(clean, config);
    return { vectors, provider: 'gemini', model: config.model, dim: vectors[0] ? vectors[0].length : 0 };
  }
  throw new EmbeddingError('Proveedor de embeddings no soportado.');
}

async function embedQuery(text, ai = {}) {
  const result = await embedTexts([text], ai);
  return {
    vector: result.vectors[0] || null,
    provider: result.provider,
    model: result.model,
    dim: result.dim
  };
}

module.exports = {
  LOCAL_DIM,
  EmbeddingError,
  resolveEmbeddingConfig,
  localEmbed,
  cosineSimilarity,
  embedTexts,
  embedQuery,
  l2Normalize
};
