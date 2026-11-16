'use strict';

const { db } = require('../lib/store');
const { tokenize, truncate } = require('../lib/util');
const { embedQuery, cosineSimilarity } = require('../llm/embeddings');

const K1 = 1.2;
const B = 0.75;
const CACHE_TTL_MS = 10 * 60 * 1000;

let indexCache = null;

function buildLexicalIndex() {
  const chunks = db.chunks.data;
  const signature = `${chunks.length}:${chunks[0] ? chunks[0].id : ''}:${chunks[chunks.length - 1] ? chunks[chunks.length - 1].id : ''}`;
  if (
    indexCache &&
    indexCache.signature === signature &&
    Date.now() - indexCache.createdAt < CACHE_TTL_MS
  ) {
    return indexCache;
  }

  const df = new Map();
  const entries = [];
  let totalLength = 0;

  for (const chunk of chunks) {
    const tokens = tokenize(chunk.text);
    const tf = new Map();
    for (const token of tokens) tf.set(token, (tf.get(token) || 0) + 1);
    for (const token of tf.keys()) df.set(token, (df.get(token) || 0) + 1);
    entries.push({ chunk, tf, length: tokens.length });
    totalLength += tokens.length;
  }

  const avgdl = entries.length ? totalLength / entries.length : 1;
  indexCache = {
    signature,
    createdAt: Date.now(),
    entries,
    df,
    avgdl,
    count: entries.length
  };
  return indexCache;
}

function invalidateCache() {
  indexCache = null;
}

function bm25Scores(queryTokens, index) {
  const unique = Array.from(new Set(queryTokens));
  const scores = new Float64Array(index.entries.length);
  if (!unique.length) return scores;

  const idfs = new Map();
  for (const token of unique) {
    const df = index.df.get(token) || 0;
    if (df === 0) continue;
    idfs.set(token, Math.log(1 + (index.count - df + 0.5) / (df + 0.5)));
  }
  if (!idfs.size) return scores;

  for (let i = 0; i < index.entries.length; i++) {
    const entry = index.entries[i];
    let score = 0;
    for (const [token, idf] of idfs) {
      const tf = entry.tf.get(token);
      if (!tf) continue;
      const denom = tf + K1 * (1 - B + (B * entry.length) / (index.avgdl || 1));
      score += idf * ((tf * (K1 + 1)) / (denom || 1));
    }
    scores[i] = score;
  }
  return scores;
}

function normalizeScores(scores) {
  let max = 0;
  for (let i = 0; i < scores.length; i++) {
    if (scores[i] > max) max = scores[i];
  }
  if (max <= 0) return Array.from(scores);
  const out = new Array(scores.length);
  for (let i = 0; i < scores.length; i++) out[i] = scores[i] / max;
  return out;
}

function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} agoto el tiempo de espera`)), ms);
    if (timer.unref) timer.unref();
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/**
 * Busqueda hibrida: similitud semantica (embeddings) + BM25 (palabras clave).
 * Si el proveedor de embeddings falla, continua en modo lexical.
 */
async function retrieve(query, options = {}) {
  const topK = Math.max(1, Math.min(12, Number(options.topK) || db.settings.data.ai.topK || 6));
  const queryText = String(query || '').trim().slice(0, 2000);
  if (!queryText) return { results: [], mode: 'none', embeddingError: '' };

  const chunks = db.chunks.data;
  if (!chunks.length) return { results: [], mode: 'empty', embeddingError: '' };

  const index = buildLexicalIndex();
  const queryTokens = tokenize(queryText);
  const bm25 = normalizeScores(bm25Scores(queryTokens, index));

  let queryVector = null;
  let embeddingError = '';
  try {
    const embed = await withTimeout(embedQuery(queryText, db.settings.data.ai), 12_000, 'Embeddings');
    queryVector = embed.vector;
  } catch (err) {
    embeddingError = err.message || 'No se pudo calcular el embedding de la consulta.';
  }

  const scored = [];
  let vectorHits = 0;
  for (let i = 0; i < index.entries.length; i++) {
    const entry = index.entries[i];
    const lexical = bm25[i] || 0;
    let semantic = 0;
    let hasVector = false;
    if (
      queryVector &&
      Array.isArray(entry.chunk.embedding) &&
      entry.chunk.embedding.length === queryVector.length
    ) {
      semantic = cosineSimilarity(queryVector, entry.chunk.embedding);
      hasVector = true;
      if (semantic > 0) vectorHits += 1;
    }
    let score;
    if (hasVector) {
      score = 0.62 * semantic + 0.38 * lexical;
    } else if (queryVector) {
      // Fragmento indexado con otro modelo de embeddings: usar solo palabras clave.
      score = lexical * 0.9;
    } else {
      score = lexical;
    }
    if (score > 0.001) {
      scored.push({
        chunk: entry.chunk,
        score,
        semantic,
        lexical,
        hasVector
      });
    }
  }

  scored.sort((a, b) => b.score - a.score);

  const threshold = queryVector && vectorHits ? 0.1 : 0.04;
  const perSource = new Map();
  const results = [];
  for (const item of scored) {
    if (results.length >= topK) break;
    if (item.score < threshold && results.length > 0) break;
    const sourceId = item.chunk.sourceId;
    const count = perSource.get(sourceId) || 0;
    if (count >= 3) continue;
    perSource.set(sourceId, count + 1);
    const source = db.sources.data.find((entry) => entry.id === sourceId);
    results.push({
      chunkId: item.chunk.id,
      sourceId,
      sourceName: source ? source.name : 'Documento',
      sourceUrl: source ? source.url : '',
      sourceType: source ? source.type : '',
      text: item.chunk.text,
      score: Number(item.score.toFixed(4)),
      semantic: Number(item.semantic.toFixed(4)),
      lexical: Number(item.lexical.toFixed(4)),
      hasVector: item.hasVector
    });
  }

  let mode = 'lexical';
  if (queryVector && vectorHits) mode = 'hybrid';
  else if (queryVector) mode = 'vector';

  return { results, mode, embeddingError };
}

function buildContext(results, maxChars = 7200) {
  if (!results || !results.length) return '';
  const parts = [];
  let used = 0;
  let index = 1;
  for (const result of results) {
    const label = result.sourceUrl
      ? `${result.sourceName} - ${result.sourceUrl}`
      : result.sourceName;
    const body = String(result.text || '').trim().slice(0, 1400);
    const block = `[${index}] Fuente: ${label}\n${body}`;
    if (used + block.length > maxChars && parts.length) break;
    parts.push(block);
    used += block.length + 2;
    index += 1;
  }
  return parts.join('\n\n');
}

module.exports = { retrieve, buildContext, invalidateCache, buildLexicalIndex };
