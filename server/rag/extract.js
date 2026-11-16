'use strict';

const path = require('path');
const cheerio = require('cheerio');

class ExtractError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = 'ExtractError';
    this.status = options.status || 0;
  }
}

const MAX_TEXT_CHARS = 600_000;
const MAX_CRAWL_PAGES = 8;
const FETCH_TIMEOUT_MS = 25_000;

function cleanWhitespace(text) {
  return String(text || '')
    .replace(/\u0000/g, '')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t\f\v]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function htmlToText(html, baseUrl) {
  const $ = cheerio.load(String(html || ''));
  const title =
    ($('meta[property="og:title"]').attr('content') || $('title').first().text() || '').trim() ||
    (baseUrl ? new URL(baseUrl).hostname : 'Pagina web');
  const description = ($('meta[name="description"]').attr('content') || '').trim();

  $('script, style, noscript, svg, iframe, canvas, form, nav, header, footer, aside, .cookie, .cookies, #cookie-banner').remove();
  $('br').replaceWith('\n');

  const main = $('main, article, [role="main"]').first();
  const root = main.length ? main : $('body');
  root.find('p, h1, h2, h3, h4, h5, h6, li, tr, div, section, blockquote, pre').each((_, el) => {
    $(el).append('\n');
  });
  root.find('td, th').each((_, el) => {
    $(el).append(' | ');
  });

  let text = cleanWhitespace(root.text());
  if (description && !text.includes(description)) {
    text = `${description}\n\n${text}`;
  }

  const links = [];
  $('a[href]').each((_, el) => {
    const href = $(el).attr('href');
    if (!href) return;
    try {
      const url = new URL(href, baseUrl);
      if (url.protocol !== 'http:' && url.protocol !== 'https:') return;
      if (!baseUrl || url.origin !== new URL(baseUrl).origin) return;
      url.hash = '';
      if (/\.(jpg|jpeg|png|gif|webp|svg|pdf|zip|mp4|mp3|css|js|ico|woff2?)$/i.test(url.pathname)) return;
      links.push(url.toString());
    } catch (_) {
      /* ignorar enlaces invalidos */
    }
  });

  return { title, text, links: Array.from(new Set(links)) };
}

function isPrivateHost(hostname) {
  const host = String(hostname || '').toLowerCase();
  if (!host) return true;
  if (host === 'localhost' || host === '0.0.0.0' || host.endsWith('.local') || host.endsWith('.internal')) {
    return true;
  }
  if (host === '::1' || host === '[::1]') return true;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) {
    const parts = host.split('.').map(Number);
    if (parts.some((part) => part > 255)) return true;
    if (parts[0] === 10) return true;
    if (parts[0] === 127) return true;
    if (parts[0] === 0) return true;
    if (parts[0] === 169 && parts[1] === 254) return true;
    if (parts[0] === 192 && parts[1] === 168) return true;
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
  }
  return false;
}

function assertSafeUrl(rawUrl) {
  let url;
  try {
    url = new URL(String(rawUrl || '').trim());
  } catch (_) {
    throw new ExtractError('La URL no es valida. Debe comenzar por http:// o https://');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new ExtractError('Solo se permiten URLs con http:// o https://');
  }
  if (isPrivateHost(url.hostname)) {
    throw new ExtractError('Por seguridad no se permiten URLs internas o locales.');
  }
  return url;
}

async function fetchUrl(url, accept = 'text/html,application/xhtml+xml,application/pdf,text/plain;q=0.9,*/*;q=0.5') {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (compatible; ColagenoBot/1.0; +https://example.com/bot) AppleWebKit/537.36 Chrome/124 Safari/537.36',
        Accept: accept,
        'Accept-Language': 'es-ES,es;q=0.9,en;q=0.6'
      }
    });
    if (!res.ok) {
      throw new ExtractError(`La pagina respondio con el estado ${res.status}. Verifica que sea publica.`, {
        status: res.status
      });
    }
    const contentType = String(res.headers.get('content-type') || '').toLowerCase();
    const buffer = Buffer.from(await res.arrayBuffer());
    return { contentType, buffer, finalUrl: res.url || url };
  } catch (err) {
    if (err instanceof ExtractError) throw err;
    if (err.name === 'AbortError') {
      throw new ExtractError('La pagina tardo demasiado en responder. Intenta de nuevo.');
    }
    throw new ExtractError(`No se pudo descargar la pagina: ${err.message}`);
  } finally {
    clearTimeout(timer);
  }
}

async function extractUrl(rawUrl, { crawl = false, maxPages = MAX_CRAWL_PAGES } = {}) {
  const safeUrl = assertSafeUrl(rawUrl);
  const first = await fetchUrl(safeUrl.toString());
  const firstUrl = first.finalUrl;

  if (first.contentType.includes('application/pdf')) {
    const text = await extractPdf(first.buffer);
    return {
      title: path.basename(new URL(firstUrl).pathname) || 'Documento PDF',
      text: cleanWhitespace(text),
      pages: [{ url: firstUrl, title: 'Documento PDF', chars: text.length }]
    };
  }

  if (
    first.contentType.includes('text/plain') ||
    first.contentType.includes('application/json') ||
    first.contentType.includes('text/markdown')
  ) {
    const text = cleanWhitespace(first.buffer.toString('utf8'));
    if (!text) throw new ExtractError('La URL no contiene texto visible.');
    return {
      title: new URL(firstUrl).hostname,
      text,
      pages: [{ url: firstUrl, title: new URL(firstUrl).hostname, chars: text.length }]
    };
  }

  const firstPage = htmlToText(first.buffer.toString('utf8'), firstUrl);
  if (!firstPage.text || firstPage.text.length < 30) {
    throw new ExtractError(
      'No se encontro texto en la pagina. Puede requerir JavaScript o estar protegida. Prueba con otra URL o sube un documento.'
    );
  }

  const pages = [{ url: firstUrl, title: firstPage.title, chars: firstPage.text.length }];
  const segments = [`# ${firstPage.title}\nURL: ${firstUrl}\n\n${firstPage.text}`];

  if (crawl) {
    const targets = firstPage.links.filter((link) => link !== firstUrl).slice(0, Math.max(0, maxPages - 1));
    for (const target of targets) {
      try {
        const pageRes = await fetchUrl(target);
        if (!pageRes.contentType.includes('text/html')) continue;
        const page = htmlToText(pageRes.buffer.toString('utf8'), pageRes.finalUrl);
        if (!page.text || page.text.length < 30) continue;
        segments.push(`\n\n# ${page.title}\nURL: ${pageRes.finalUrl}\n\n${page.text}`);
        pages.push({ url: pageRes.finalUrl, title: page.title, chars: page.text.length });
      } catch (err) {
        console.warn(`[extract] No se pudo leer ${target}: ${err.message}`);
      }
    }
  }

  return {
    title: firstPage.title,
    text: cleanWhitespace(segments.join('\n')),
    pages
  };
}

async function extractPdf(buffer) {
  let pdfParse;
  try {
    pdfParse = require('pdf-parse');
  } catch (_) {
    throw new ExtractError('El lector de PDF no esta disponible en el servidor.');
  }
  let data;
  try {
    data = await pdfParse(buffer, { max: 0 });
  } catch (err) {
    throw new ExtractError(`No se pudo leer el PDF: ${err.message}`);
  }
  const text = cleanWhitespace(data && data.text);
  if (!text || text.length < 20) {
    throw new ExtractError(
      'El PDF no contiene texto seleccionable (probablemente es un escaneo). Sube un PDF con texto o pega el contenido como texto.'
    );
  }
  return text;
}

async function extractDocx(buffer) {
  const mammoth = require('mammoth');
  try {
    const result = await mammoth.extractRawText({ buffer });
    return cleanWhitespace(result.value);
  } catch (err) {
    throw new ExtractError(`No se pudo leer el documento Word: ${err.message}`);
  }
}

async function extractXlsx(buffer) {
  const ExcelJS = require('exceljs');
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buffer);
  } catch (err) {
    throw new ExtractError(`No se pudo leer el archivo Excel: ${err.message}`);
  }
  const parts = [];
  workbook.eachSheet((sheet) => {
    parts.push(`# Hoja: ${sheet.name}`);
    sheet.eachRow((row) => {
      const values = Array.isArray(row.values) ? row.values.slice(1) : [];
      const cells = values.map((value) => {
        if (value == null) return '';
        if (value instanceof Date) return value.toISOString().slice(0, 10);
        if (typeof value === 'object') {
          if (value.text) return String(value.text);
          if (value.result != null) return String(value.result);
          if (value.richText) return value.richText.map((part) => part.text).join('');
          return '';
        }
        return String(value);
      });
      const line = cells.join(' | ').replace(/\s+/g, ' ').trim();
      if (line.replace(/\|/g, '').trim()) parts.push(line);
    });
    parts.push('');
  });
  const text = cleanWhitespace(parts.join('\n'));
  if (!text) throw new ExtractError('El archivo Excel no contiene datos legibles.');
  return text;
}

function csvToText(buffer) {
  const text = buffer.toString('utf8').replace(/^\uFEFF/, '');
  const lines = text.split(/\r?\n/).filter((line) => line.trim());
  return cleanWhitespace(lines.join('\n'));
}

function detectKind(filename, mimetype) {
  const ext = path.extname(String(filename || '')).toLowerCase();
  if (ext) return ext;
  const mime = String(mimetype || '').toLowerCase();
  if (mime.includes('pdf')) return '.pdf';
  if (mime.includes('wordprocessingml')) return '.docx';
  if (mime.includes('spreadsheetml')) return '.xlsx';
  if (mime.includes('html')) return '.html';
  if (mime.includes('json')) return '.json';
  if (mime.includes('csv')) return '.csv';
  return '.txt';
}

async function extractFile(buffer, filename, mimetype) {
  if (!buffer || !buffer.length) throw new ExtractError('El archivo esta vacio.');
  const kind = detectKind(filename, mimetype);
  let text = '';

  if (kind === '.pdf') {
    text = await extractPdf(buffer);
  } else if (kind === '.docx') {
    text = await extractDocx(buffer);
  } else if (kind === '.doc') {
    throw new ExtractError('El formato .doc antiguo no es compatible. Guarda el archivo como .docx o PDF.');
  } else if (kind === '.xlsx' || kind === '.xlsm') {
    text = await extractXlsx(buffer);
  } else if (kind === '.xls') {
    throw new ExtractError('El formato .xls antiguo no es compatible. Guarda el archivo como .xlsx o CSV.');
  } else if (kind === '.csv' || kind === '.tsv') {
    text = csvToText(buffer);
  } else if (kind === '.html' || kind === '.htm') {
    const page = htmlToText(buffer.toString('utf8'), 'https://archivo.local');
    text = page.text;
  } else if (['.txt', '.md', '.markdown', '.json', '.xml', '.yml', '.yaml', '.rtf'].includes(kind)) {
    text = cleanWhitespace(buffer.toString('utf8'));
  } else if (['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp'].includes(kind)) {
    throw new ExtractError(
      'Las imagenes no se pueden procesar directamente. Describe el contenido como texto o sube un PDF con texto.'
    );
  } else {
    text = cleanWhitespace(buffer.toString('utf8'));
  }

  text = String(text || '').trim();
  if (!text || text.length < 15) {
    throw new ExtractError('No se pudo extraer texto suficiente del archivo.');
  }
  if (text.length > MAX_TEXT_CHARS) {
    text = text.slice(0, MAX_TEXT_CHARS);
  }
  return { text, title: path.basename(String(filename || 'documento')) };
}

module.exports = {
  ExtractError,
  cleanWhitespace,
  htmlToText,
  assertSafeUrl,
  extractUrl,
  extractFile,
  extractPdf,
  MAX_TEXT_CHARS
};
