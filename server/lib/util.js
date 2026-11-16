'use strict';

const crypto = require('crypto');

const STOPWORDS = new Set(
  `a al algo algun alguna algunas alguno algunos ante antes aquel aquella aquellas aquello aquellos aqui asi aun cada casi como con contra cual cuales cuando de del desde donde dos el ella ellas ello ellos en entre era eran es esa esas ese eso esos esta estaba estado estan estar estas este esto estos estoy fue fueron ha hace hacer hacia han hasta hay la las le les lo los mas me mi mis mucho muy nada ni no nos nosotros nuestra nuestro o os otra otras otro otros para pero poco por porque que quien quienes se sea segun ser si sin sobre sola solo son soy su sus tambien tan tanto te tengo tiene tienen todo todos tu tus un una unas uno unos usted ustedes y ya yo`.split(
    /\s+/
  )
);

function uid(prefix = '') {
  return `${prefix}${crypto.randomUUID()}`;
}

function nowIso() {
  return new Date().toISOString();
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function truncate(text, max = 220) {
  const value = String(text || '').replace(/\s+/g, ' ').trim();
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1).trimEnd()}...`;
}

function stripAccents(text) {
  return String(text || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function normalizeForSearch(text) {
  return stripAccents(String(text || '').toLowerCase())
    .replace(/[^a-z0-9ñu\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenize(text, { removeStopwords = true } = {}) {
  const words = normalizeForSearch(text).split(' ').filter(Boolean);
  const out = [];
  for (const word of words) {
    if (word.length < 2 && !/^\d+$/.test(word)) continue;
    if (removeStopwords && STOPWORDS.has(word)) continue;
    out.push(stem(word));
  }
  return out;
}

function stem(word) {
  if (/^\d+$/.test(word)) return word;
  if (word.length > 5 && word.endsWith('es')) return word.slice(0, -2);
  if (word.length > 4 && word.endsWith('s')) return word.slice(0, -1);
  return word;
}

function fnv1a(str) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

function escapeHtml(text) {
  return String(text == null ? '' : text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function safeEqual(a, b) {
  const left = crypto.createHash('sha256').update(String(a)).digest();
  const right = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(left, right);
}

function maskSecret(value) {
  if (!value) return '';
  const str = String(value);
  if (str.length <= 8) return '********';
  return `${str.slice(0, 4)}${'*'.repeat(Math.min(16, str.length - 8))}${str.slice(-4)}`;
}

const MASK = '••••••••';

/** Devuelve el valor nuevo, o el anterior si el cliente envio la mascara. */
function unmaskSecret(nextValue, previousValue) {
  if (nextValue === undefined) return previousValue || '';
  if (nextValue === null) return '';
  const str = String(nextValue);
  if (str === MASK || str === '********' || /^\*+$/.test(str)) {
    return previousValue || '';
  }
  return str;
}

function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch (_) {
    return null;
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toNumber(value, fallback, min, max) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  if (min !== undefined && max !== undefined) return clamp(num, min, max);
  return num;
}

function normalizePhone(raw) {
  const digits = String(raw || '').replace(/[^\d+]/g, '');
  if (!digits) return '';
  return digits.startsWith('+') ? digits : digits;
}

function extractEmail(text) {
  const match = String(text || '').match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i);
  return match ? match[0] : '';
}

function extractPhone(text) {
  const matches = String(text || '').match(/(\+?\d[\d\s().-]{6,18}\d)/g);
  if (!matches) return '';
  for (const candidate of matches) {
    const digits = candidate.replace(/\D/g, '');
    if (digits.length >= 7 && digits.length <= 15) return candidate.trim();
  }
  return '';
}

module.exports = {
  STOPWORDS,
  uid,
  nowIso,
  clamp,
  truncate,
  stripAccents,
  normalizeForSearch,
  tokenize,
  stem,
  fnv1a,
  escapeHtml,
  safeEqual,
  maskSecret,
  unmaskSecret,
  MASK,
  parseJson,
  sleep,
  toNumber,
  normalizePhone,
  extractEmail,
  extractPhone
};
