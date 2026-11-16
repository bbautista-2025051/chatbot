'use strict';

/**
 * Divide un texto largo en fragmentos con solapamiento, respetando
 * parrafos y oraciones para no cortar ideas a la mitad.
 */
function chunkText(rawText, options = {}) {
  const size = Math.max(400, Number(options.size) || 1200);
  const overlap = Math.min(Math.max(0, Number(options.overlap ?? 180)), Math.floor(size / 2));
  const maxChunks = Math.max(1, Number(options.maxChunks) || 900);

  const text = clean(rawText);
  if (!text) return [];

  const units = [];
  for (const paragraph of text.split(/\n{2,}/)) {
    const trimmed = paragraph.trim();
    if (!trimmed) continue;
    if (trimmed.length <= size) {
      units.push(trimmed);
      continue;
    }
    for (const sentence of splitSentences(trimmed)) {
      if (sentence.length <= size) {
        units.push(sentence);
      } else {
        for (let i = 0; i < sentence.length; i += size) {
          units.push(sentence.slice(i, i + size));
        }
      }
    }
  }

  const chunks = [];
  let current = '';

  const pushCurrent = () => {
    const value = current.trim();
    if (value.length >= 20) chunks.push(value);
  };

  for (const unit of units) {
    if (!current) {
      current = unit;
      continue;
    }
    if (current.length + 2 + unit.length <= size) {
      current += `\n\n${unit}`;
      continue;
    }
    pushCurrent();
    let tail = '';
    if (overlap > 0) {
      tail = current.slice(-overlap);
      const lastBreak = Math.max(tail.lastIndexOf('. '), tail.lastIndexOf('\n'), tail.lastIndexOf('? '), tail.lastIndexOf('! '));
      if (lastBreak > overlap * 0.3) tail = tail.slice(lastBreak + 1);
      tail = tail.trim();
    }
    if (tail && tail.length + 2 + unit.length <= size) {
      current = `${tail}\n\n${unit}`;
    } else if (tail && unit.length < size - 80) {
      // El solapamiento no cabe completo: recortarlo.
      const room = Math.max(0, size - unit.length - 2);
      const cut = tail.slice(-room);
      const space = cut.indexOf(' ');
      current = `${space > 0 ? cut.slice(space + 1) : cut}\n\n${unit}`.trim();
    } else {
      current = unit;
    }
  }
  pushCurrent();

  const seen = new Set();
  const unique = [];
  for (const chunk of chunks) {
    const key = chunk.slice(0, 180);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(chunk);
    if (unique.length >= maxChunks) break;
  }
  return unique;
}

function clean(rawText) {
  return String(rawText || '')
    .replace(/\u0000/g, '')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t\f\v]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function splitSentences(text) {
  const parts = String(text).split(/(?<=[.!?;:])\s+/);
  return parts.map((part) => part.trim()).filter(Boolean);
}

module.exports = { chunkText, splitSentences };
