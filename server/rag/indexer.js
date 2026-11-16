'use strict';

const fs = require('fs');
const path = require('path');
const { db } = require('../lib/store');
const { uid, nowIso, truncate } = require('../lib/util');
const { chunkText } = require('./chunk');
const { extractFile, extractUrl, ExtractError } = require('./extract');
const { embedTexts } = require('../llm/embeddings');

const queue = [];
const queued = new Set();
const processing = new Set();
let workerRunning = false;

function getSource(sourceId) {
  return db.sources.data.find((source) => source.id === sourceId) || null;
}

function publicSource(source) {
  if (!source) return null;
  return {
    id: source.id,
    type: source.type,
    name: source.name,
    url: source.url || '',
    crawl: Boolean(source.crawl),
    mime: source.mime || '',
    size: source.size || 0,
    status: source.status,
    progress: source.progress || 0,
    message: source.message || '',
    error: source.error || '',
    chars: source.chars || 0,
    chunkCount: source.chunkCount || 0,
    embeddingProvider: source.embeddingProvider || '',
    embeddingModel: source.embeddingModel || '',
    preview: source.preview || '',
    createdAt: source.createdAt,
    updatedAt: source.updatedAt
  };
}

function createSource(data) {
  const now = nowIso();
  const source = {
    id: uid('src_'),
    type: data.type,
    name: data.name || 'Sin titulo',
    url: data.url || '',
    crawl: Boolean(data.crawl),
    mime: data.mime || '',
    size: data.size || 0,
    filePath: data.filePath || '',
    rawText: data.rawText || '',
    status: 'queued',
    progress: 0,
    message: 'En cola...',
    error: '',
    chars: 0,
    chunkCount: 0,
    preview: truncate(data.rawText || '', 220),
    createdAt: now,
    updatedAt: now
  };
  db.sources.data.push(source);
  db.sources.save();
  enqueue(source.id);
  return source;
}

function enqueue(sourceId) {
  if (queued.has(sourceId) || processing.has(sourceId)) return;
  queued.add(sourceId);
  queue.push(sourceId);
  setImmediate(runWorker);
}

function enqueueAll() {
  for (const source of db.sources.data) enqueue(source.id);
}

async function runWorker() {
  if (workerRunning) return;
  workerRunning = true;
  try {
    while (queue.length) {
      const id = queue.shift();
      queued.delete(id);
      if (!getSource(id)) continue;
      processing.add(id);
      try {
        await processSource(id);
      } catch (err) {
        console.error(`[indexer] Error procesando ${id}:`, err);
        const source = getSource(id);
        if (source) {
          source.status = 'error';
          source.progress = 0;
          source.error = err.message || 'Error inesperado al procesar la fuente.';
          source.message = 'Error';
          source.updatedAt = nowIso();
          db.sources.save();
        }
      } finally {
        processing.delete(id);
      }
    }
  } finally {
    workerRunning = false;
  }
}

function saveProgress(source, progress, message) {
  source.progress = Math.max(0, Math.min(100, Math.round(progress)));
  source.message = message;
  source.updatedAt = nowIso();
  db.sources.save();
}

async function extractSourceText(source) {
  if (source.type === 'text') {
    return {
      text: String(source.rawText || ''),
      title: source.name,
      pages: []
    };
  }
  if (source.type === 'url') {
    const result = await extractUrl(source.url, { crawl: source.crawl });
    return result;
  }
  if (source.type === 'file') {
    if (!source.filePath || !fs.existsSync(source.filePath)) {
      throw new ExtractError('No se encontro el archivo guardado. Vuelve a subirlo.');
    }
    const buffer = fs.readFileSync(source.filePath);
    const result = await extractFile(buffer, source.name, source.mime);
    return { text: result.text, title: result.title, pages: [] };
  }
  throw new ExtractError('Tipo de fuente no soportado.');
}

async function processSource(sourceId) {
  const source = getSource(sourceId);
  if (!source) return;

  source.status = 'processing';
  source.progress = 0;
  source.error = '';
  source.message = 'Extrayendo texto...';
  source.updatedAt = nowIso();
  db.sources.save();

  try {
    const extracted = await extractSourceText(source);
    if (!getSource(sourceId)) return;
    const text = String(extracted.text || '').trim();
    if (text.length < 20) {
      throw new ExtractError(
        'No se encontro texto suficiente. Si es un PDF escaneado, sube una version con texto o pega el contenido manualmente.'
      );
    }

    source.chars = text.length;
    source.preview = truncate(text, 220);
    if (!source.name || source.name === 'Sin titulo') {
      source.name = extracted.title || source.name;
    }
    saveProgress(source, 12, 'Dividiendo en fragmentos...');

    const chunks = chunkText(text, { size: 1200, overlap: 180, maxChunks: 900 });
    if (!chunks.length) {
      throw new ExtractError('El contenido no genero fragmentos utiles para entrenar al asistente.');
    }

    saveProgress(source, 20, `Generando embeddings para ${chunks.length} fragmentos...`);

    const ai = db.settings.data.ai;
    let embedded;
    let warning = '';
    try {
      embedded = await embedInBatches(chunks, ai, (done, total) => {
        saveProgress(source, 20 + (done / total) * 70, `Vectorizando ${done}/${total} fragmentos...`);
      });
    } catch (err) {
      const configured = (ai.embeddingProvider || 'local').toLowerCase();
      if (configured === 'local') throw err;
      saveProgress(source, 25, 'Embeddings externos no disponibles, usando busqueda local...');
      embedded = await embedInBatches(chunks, { ...ai, embeddingProvider: 'local' }, (done, total) => {
        saveProgress(source, 25 + (done / total) * 60, `Vectorizando ${done}/${total} fragmentos...`);
      });
      warning = `${err.message} Se indexo con embeddings locales (busqueda por palabras clave).`;
    }

    if (!getSource(sourceId)) return;

    const now = nowIso();
    const newChunks = chunks.map((textChunk, index) => ({
      id: uid('chk_'),
      sourceId,
      index,
      text: textChunk,
      embedding: embedded.vectors[index] || null,
      dim: embedded.dim || 0,
      createdAt: now
    }));

    // Reemplazar solo cuando el nuevo contenido esta listo.
    db.chunks.data = db.chunks.data.filter((chunk) => chunk.sourceId !== sourceId).concat(newChunks);
    db.chunks.save();

    source.status = 'ready';
    source.progress = 100;
    source.message = warning || 'Listo';
    source.error = warning || '';
    source.chunkCount = newChunks.length;
    source.embeddingProvider = embedded.provider;
    source.embeddingModel = embedded.model;
    source.dim = embedded.dim || 0;
    source.updatedAt = nowIso();
    db.sources.save();
  } catch (err) {
    if (!getSource(sourceId)) return;
    source.status = 'error';
    source.progress = 0;
    source.message = 'Error';
    source.error = err.message || 'Error inesperado al procesar la fuente.';
    source.updatedAt = nowIso();
    db.sources.save();
    console.warn(`[indexer] ${source.name}: ${source.error}`);
  }
}

async function embedInBatches(chunks, ai, onProgress) {
  const groupSize = 48;
  const vectors = [];
  let provider = 'local';
  let model = 'local-hash-512';
  let dim = 0;

  for (let i = 0; i < chunks.length; i += groupSize) {
    const group = chunks.slice(i, i + groupSize);
    let result;
    try {
      result = await embedTexts(group, ai);
    } catch (err) {
      if (i === 0) throw err;
      // Reintento unico por si fue un error transitorio de red.
      await new Promise((resolve) => setTimeout(resolve, 1200));
      result = await embedTexts(group, ai);
    }
    vectors.push(...result.vectors);
    provider = result.provider;
    model = result.model;
    dim = result.dim || (result.vectors[0] ? result.vectors[0].length : dim);
    if (onProgress) onProgress(Math.min(chunks.length, i + group.length), chunks.length);
  }

  return { vectors, provider, model, dim };
}

async function reindexSource(sourceId) {
  const source = getSource(sourceId);
  if (!source) return false;
  source.status = 'queued';
  source.progress = 0;
  source.message = 'En cola para reindexar...';
  source.error = '';
  source.updatedAt = nowIso();
  db.sources.save();
  enqueue(sourceId);
  return true;
}

function deleteSource(sourceId) {
  const source = getSource(sourceId);
  if (!source) return false;
  if (source.filePath) {
    try {
      if (source.filePath.startsWith(db.uploadDir) && fs.existsSync(source.filePath)) {
        fs.unlinkSync(source.filePath);
      }
    } catch (err) {
      console.warn(`[indexer] No se pudo borrar el archivo: ${err.message}`);
    }
  }
  db.sources.data = db.sources.data.filter((item) => item.id !== sourceId);
  db.sources.save();
  db.chunks.data = db.chunks.data.filter((chunk) => chunk.sourceId !== sourceId);
  db.chunks.save();
  return true;
}

function queueStatus() {
  return {
    pending: queue.length,
    processing: processing.size,
    running: workerRunning
  };
}

module.exports = {
  publicSource,
  createSource,
  enqueue,
  enqueueAll,
  reindexSource,
  deleteSource,
  queueStatus,
  processSource,
  getSource
};
