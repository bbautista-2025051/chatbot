'use strict';

/* =========================================================
   Utilidades generales
   ========================================================= */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

const ICONS = {
  check:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
  x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
  info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><line x1="12" y1="11" x2="12" y2="16"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>',
  warning:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
  upload:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>',
  link: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/></svg>',
  text: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5V5a2 2 0 0 1 2-2h13v18H6.5A2.5 2.5 0 0 1 4 18.5z"/><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H19"/><path d="M8 7h7M8 11h5"/></svg>',
  trash:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>',
  refresh:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.5 9a9 9 0 0 1 14.9-3.4L23 10M1 14l4.6 4.4A9 9 0 0 0 20.5 15"/></svg>',
  eye: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z"/><circle cx="12" cy="12" r="3"/></svg>',
  copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',
  send: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>',
  search:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.7" y2="16.7"/></svg>',
  external:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>',
  spark:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/></svg>',
  users:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
  chat: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 9.6 9.6 0 0 1-3.8-.8L3 21l1.9-4.6a8.4 8.4 0 1 1 16.1-4.9z"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>',
  phone:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 2 .7 2.9a2 2 0 0 1-.5 2.1L8 10a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.5c.9.3 1.9.6 2.9.7a2 2 0 0 1 1.7 2z"/></svg>',
  mail: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><polyline points="22 6 12 13 2 6"/></svg>',
  clock:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15.5 14"/></svg>',
  download:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>',
  globe:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><line x1="3" y1="12" x2="21" y2="12"/><path d="M12 3a15 15 0 0 1 0 18 15 15 0 0 1 0-18z"/></svg>',
  wa: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.5 8.5 0 0 1-12.3 7.6L3 21l1.9-5.6A8.5 8.5 0 1 1 21 11.5z"/><path d="M8.6 7.6c.2-.4.4-.4.7-.4h.5c.2 0 .4.1.5.4l.7 1.6c.1.3 0 .5-.1.7l-.5.6c-.1.2-.2.4 0 .7.5.9 1.2 1.6 2.1 2.1.3.2.5.1.7 0l.6-.6c.2-.2.4-.2.7-.1l1.6.7c.3.1.4.3.4.5v.5c0 .3 0 .5-.4.7-.5.3-1.2.5-1.9.3-1.2-.3-2.3-.9-3.3-1.8-.9-.9-1.5-2-1.8-3.2-.2-.7 0-1.4.3-1.9z"/></svg>',
  ms: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.5 8.5 0 0 1-12.3 7.6L3 21l1.9-5.6A8.5 8.5 0 1 1 21 11.5z"/><path d="M12.5 7l-3 5h3l-1 4 4-5.5h-3z"/></svg>',
  ig: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><line x1="17.2" y1="6.8" x2="17.21" y2="6.8"/></svg>',
  tg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M21 3 3 10.5l6 2.2L11 20l3.2-4.2L19 18z"/><path d="M9 12.7 21 3"/></svg>',
  web: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a15 15 0 0 1 0 18 15 15 0 0 1 0-18z"/></svg>',
  logout:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>'
};

const PROVIDERS = [
  {
    id: 'gemini',
    label: 'Google Gemini AI (Recomendado)',
    short: 'Gemini',
    models: ['gemini-3.8-flash', 'gemini-3.6-flash', 'gemini-3.5-flash-lite', 'gemini-3.1-pro-preview'],
    hint: 'Integración principal preparada para Google Gemini API. Rápida, precisa y con amplio contexto.'
  },
  {
    id: 'openai',
    label: 'OpenAI (GPT)',
    short: 'GPT',
    models: ['gpt-4o-mini', 'gpt-4.1-mini', 'gpt-4o', 'gpt-4.1'],
    hint: 'Modelos versátiles y rápidos de OpenAI.'
  },
  {
    id: 'anthropic',
    label: 'Anthropic (Claude)',
    short: 'Claude',
    models: ['claude-3-5-haiku-latest', 'claude-3-5-sonnet-latest', 'claude-3-7-sonnet-latest'],
    hint: 'Excelente redacción y conversaciones largas.'
  },
  {
    id: 'compatible',
    label: 'Compatible con OpenAI (Groq, OpenRouter, Ollama...)',
    short: 'API',
    models: [],
    hint: 'Usa cualquier API compatible con /chat/completions. Configura la URL base.'
  },
  {
    id: 'demo',
    label: 'Demo local (sin IA, solo pruebas)',
    short: 'Demo',
    models: ['demo'],
    hint: 'Responde con la base de conocimiento sin conectar un proveedor. Útil para probar el flujo.'
  }
];

const CHANNEL_LABELS = {
  web: 'Web',
  whatsapp: 'WhatsApp',
  messenger: 'Messenger',
  instagram: 'Instagram',
  telegram: 'Telegram',
  admin: 'Prueba interna'
};

const TAB_META = {
  overview: { title: 'Panel', subtitle: 'Resumen del asistente, el entrenamiento y las conversaciones' },
  training: { title: 'Entrenamiento', subtitle: 'Documentos, páginas web y notas que alimentan a tu asistente' },
  settings: { title: 'Ajustes', subtitle: 'Datos del negocio, modelo de IA e instrucciones del asistente' },
  chat: { title: 'Probar asistente', subtitle: 'Conversa con tu asistente usando la base de conocimiento real' },
  conversations: { title: 'Conversaciones', subtitle: 'Historial de chats y leads capturados' },
  connections: { title: 'Conexiones', subtitle: 'WhatsApp, Messenger, Instagram y Telegram' },
  widget: { title: 'Widget web', subtitle: 'Instala el asistente en el sitio web del negocio' }
};

const state = {
  loggedIn: false,
  tab: 'overview',
  settings: null,
  provider: null,
  overview: null,
  sources: [],
  queue: null,
  baseUrl: '',
  defaultPrompt: '',
  promptTemplate: '',
  settingsDirty: false,
  pollTimer: null,
  chat: { sessionId: '', messages: [], lastDebug: null, busy: false },
  conversations: [],
  activeConversation: null,
  activeConvData: null,
  convView: 'chats',
  leads: [],
  channels: null,
  channelStatus: null
};

/* =========================================================
   Formato
   ========================================================= */
function esc(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function fmtNumber(value) {
  return Number(value || 0).toLocaleString('es-ES');
}

function fmtDate(iso) {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('es-ES', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function fmtRelative(iso) {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  const diff = Date.now() - date.getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'ahora';
  if (min < 60) return `hace ${min} min`;
  const hours = Math.floor(min / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `hace ${days} d`;
  return date.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' });
}

function truncateText(text, max = 140) {
  const value = String(text || '').replace(/\s+/g, ' ').trim();
  return value.length > max ? `${value.slice(0, max - 1).trimEnd()}…` : value;
}

function sanitizeUrl(rawUrl) {
  const clean = String(rawUrl || '').trim();
  if (/^https?:\/\/[^\s<>"']+$/i.test(clean)) return clean;
  if (/^mailto:[^\s<>"']+$/i.test(clean)) return clean;
  return '';
}

function formatInlineMd(rawText) {
  const codeTokens = [];
  const linkTokens = [];

  let text = String(rawText || '').replace(/`([^`\n]+)`/g, (_, code) => {
    const idx = codeTokens.push(`<code>${esc(code)}</code>`) - 1;
    return `\u0000CODE_${idx}\u0000`;
  });

  text = text.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+|mailto:[^\s)]+)\)/gi, (_, label, url) => {
    const safeUrl = sanitizeUrl(url);
    if (!safeUrl) return esc(label);
    const idx =
      linkTokens.push(
        `<a href="${esc(safeUrl)}" target="_blank" rel="noopener noreferrer">${esc(label)}</a>`
      ) - 1;
    return `\u0000LINK_${idx}\u0000`;
  });

  let safe = esc(text);
  safe = safe.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  safe = safe.replace(/__([^_]+)__/g, '<strong>$1</strong>');
  safe = safe.replace(/(^|[\s(])\*([^*\n]+)\*(?=[\s).,!?:;]|$)/g, '$1<em>$2</em>');
  safe = safe.replace(/(^|[\s(])(https?:\/\/[^\s<)"']+)/gi, (match, prefix, url) => {
    const safeUrl = sanitizeUrl(url);
    if (!safeUrl) return match;
    return `${prefix}<a href="${esc(safeUrl)}" target="_blank" rel="noopener noreferrer">${esc(safeUrl)}</a>`;
  });

  safe = safe.replace(/\u0000LINK_(\d+)\u0000/g, (_, idx) => linkTokens[Number(idx)] || '');
  safe = safe.replace(/\u0000CODE_(\d+)\u0000/g, (_, idx) => codeTokens[Number(idx)] || '');
  return safe;
}

function renderMarkdown(rawText) {
  const source = String(rawText || '').replace(/\r\n/g, '\n').trim();
  if (!source) return '<p></p>';

  const codeBlocks = [];
  const withoutFences = source.replace(/```([a-zA-Z0-9_-]*)\n?([\s\S]*?)```/g, (_, lang, code) => {
    const idx = codeBlocks.push(`<pre><code>${esc(code.replace(/\n$/, ''))}</code></pre>`) - 1;
    return `\n@@CODEBLOCK_${idx}@@\n`;
  });

  const lines = withoutFences.split('\n');
  const blocks = [];
  let listType = null;
  let listItems = [];
  let paragraphLines = [];
  let quoteLines = [];

  function flushParagraph() {
    if (!paragraphLines.length) return;
    blocks.push(`<p>${paragraphLines.map(formatInlineMd).join('<br />')}</p>`);
    paragraphLines = [];
  }
  function flushList() {
    if (!listItems.length || !listType) return;
    blocks.push(`<${listType}>${listItems.map((item) => `<li>${item}</li>`).join('')}</${listType}>`);
    listItems = [];
    listType = null;
  }
  function flushQuote() {
    if (!quoteLines.length) return;
    blocks.push(`<blockquote>${quoteLines.map(formatInlineMd).join('<br />')}</blockquote>`);
    quoteLines = [];
  }
  function flushAll() {
    flushParagraph();
    flushList();
    flushQuote();
  }

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (!trimmed) {
      flushAll();
      continue;
    }
    const codeMatch = trimmed.match(/^@@CODEBLOCK_(\d+)@@$/);
    if (codeMatch) {
      flushAll();
      blocks.push(codeBlocks[Number(codeMatch[1])] || '');
      continue;
    }
    const headingMatch = trimmed.match(/^(#{1,4})\s+(.+)$/);
    if (headingMatch) {
      flushAll();
      const level = Math.min(4, headingMatch[1].length);
      blocks.push(`<h${level}>${formatInlineMd(headingMatch[2])}</h${level}>`);
      continue;
    }
    const quoteMatch = trimmed.match(/^>\s?(.*)$/);
    if (quoteMatch) {
      flushParagraph();
      flushList();
      quoteLines.push(quoteMatch[1]);
      continue;
    } else if (quoteLines.length) {
      flushQuote();
    }
    const ulMatch = trimmed.match(/^[-*•]\s+(.+)$/);
    if (ulMatch) {
      flushParagraph();
      if (listType && listType !== 'ul') flushList();
      listType = 'ul';
      listItems.push(formatInlineMd(ulMatch[1]));
      continue;
    }
    const olMatch = trimmed.match(/^\d+[.)]\s+(.+)$/);
    if (olMatch) {
      flushParagraph();
      if (listType && listType !== 'ol') flushList();
      listType = 'ol';
      listItems.push(formatInlineMd(olMatch[1]));
      continue;
    }
    if (listType) flushList();
    paragraphLines.push(trimmed);
  }
  flushAll();
  return blocks.join('');
}

function mdLite(text) {
  return renderMarkdown(text);
}

function setFieldError(inputEl, message) {
  if (!inputEl) return;
  const fieldEl = inputEl.closest('.field');
  if (!fieldEl) return;
  fieldEl.classList.add('has-error');
  let errEl = fieldEl.querySelector('.field-error');
  if (!errEl) {
    errEl = document.createElement('span');
    errEl.className = 'field-error';
    fieldEl.appendChild(errEl);
  }
  errEl.textContent = message;
  errEl.classList.remove('hidden');
}

function clearFieldError(inputEl) {
  if (!inputEl) return;
  const fieldEl = inputEl.closest('.field');
  if (!fieldEl) return;
  fieldEl.classList.remove('has-error');
  const errEl = fieldEl.querySelector('.field-error');
  if (errEl) errEl.classList.add('hidden');
}

function initials(name) {
  const value = String(name || '').trim();
  if (!value) return '?';
  const parts = value.split(/\s+/).slice(0, 2);
  return parts.map((part) => part[0]).join('').toUpperCase();
}

function avatarTone(seed) {
  const tones = ['', 'coral', 'blue', 'gold'];
  const value = String(seed || 'x');
  let sum = 0;
  for (let i = 0; i < value.length; i++) sum += value.charCodeAt(i);
  return tones[sum % tones.length];
}

function channelBadge(channel) {
  const label = CHANNEL_LABELS[channel] || channel || 'Web';
  return `<span class="badge badge-neutral">${esc(label)}</span>`;
}

function debounce(fn, ms = 280) {
  let timer;
  return function debounced(...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), ms);
  };
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (_) {
    const area = document.createElement('textarea');
    area.value = text;
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    try {
      document.execCommand('copy');
      return true;
    } catch (err) {
      return false;
    } finally {
      area.remove();
    }
  }
}

/* =========================================================
   API y sesión
   ========================================================= */
async function api(path, options = {}) {
  const opts = { credentials: 'same-origin', ...options };
  opts.headers = { ...(options.headers || {}) };
  if (opts.body && !(opts.body instanceof FormData)) {
    opts.headers['Content-Type'] = 'application/json';
  }
  const res = await fetch(`/api/admin${path}`, opts);
  if (res.status === 401) {
    showLogin();
    const error = new Error('Tu sesión expiró. Inicia sesión de nuevo.');
    error.status = 401;
    throw error;
  }
  let data = {};
  try {
    data = await res.json();
  } catch (_) {
    data = {};
  }
  if (!res.ok) {
    const error = new Error(data.error || `Error ${res.status}`);
    error.status = res.status;
    error.detail = data.detail || '';
    throw error;
  }
  return data;
}

function showLogin() {
  state.loggedIn = false;
  $('#app').classList.add('hidden');
  $('#login-view').classList.remove('hidden');
  const error = $('#login-error');
  if (error) error.classList.add('hidden');
  const password = $('#login-password');
  if (password) {
    password.value = '';
    setTimeout(() => password.focus(), 50);
  }
}

async function bootApp() {
  state.loggedIn = true;
  $('#login-view').classList.add('hidden');
  $('#app').classList.remove('hidden');
  await loadAll();
  const hash = location.hash.replace('#', '');
  state.tab = TAB_META[hash] ? hash : 'overview';
  render();
}

async function loadAll() {
  const results = await Promise.allSettled([loadSettings(), loadOverview(), loadSources(), loadPrompt()]);
  const failed = results.find((result) => result.status === 'rejected');
  if (failed && failed.reason && failed.reason.status !== 401) {
    toast(failed.reason.message, 'error');
  }
  updateBrand();
  updateSideStatus();
  updateNavBadges();
}

async function loadSettings() {
  const data = await api('/settings');
  state.settings = data.settings;
  state.provider = data.provider;
  state.baseUrl = data.baseUrl || '';
  state.defaultPrompt = data.defaultPrompt || '';
  updateBrand();
  updateSideStatus();
  return data;
}

async function loadOverview() {
  const data = await api('/overview');
  state.overview = data;
  if (data.provider) state.provider = data.provider;
  if (data.channels) state.channelStatus = data.channels;
  if (data.baseUrl) state.baseUrl = data.baseUrl;
  updateSideStatus();
  updateNavBadges();
  return data;
}

async function loadSources() {
  const data = await api('/sources');
  state.sources = data.sources || [];
  state.queue = data.queue || null;
  return data;
}

async function loadPrompt() {
  const data = await api('/prompt');
  state.promptTemplate = data.template || '';
  state.defaultPrompt = data.defaultPrompt || state.defaultPrompt;
  return data;
}

function updateBrand() {
  const name = state.settings?.business?.name || 'Colágeno Vital';
  const brand = $('#brand-name');
  if (brand) brand.textContent = name;
  document.title = `${name} · Panel del asistente`;
}

function updateSideStatus() {
  const provider = state.provider || state.overview?.provider;
  const box = $('#side-status');
  const text = $('#side-status-text');
  if (!box || !text) return;
  const dot = box.querySelector('.dot');
  if (!provider) {
    text.textContent = 'Cargando estado...';
    return;
  }
  if (provider.provider === 'demo' || !provider.configured) {
    dot?.classList.add('off');
    text.innerHTML = '<strong>Modo demo</strong> · sin IA';
    return;
  }
  if (provider.configured) {
    dot?.classList.remove('off');
    const label = (PROVIDERS.find((item) => item.id === provider.provider) || {}).short || provider.provider;
    text.innerHTML = `<strong>${esc(label)}</strong> · ${esc(provider.model || '')}`;
  } else {
    dot?.classList.add('off');
    text.innerHTML = '<strong>Modo demo</strong> · sin IA';
  }
}

function updateNavBadges() {
  const badge = $('#nav-conv-badge');
  if (!badge) return;
  const count = state.overview?.stats?.needsHuman || 0;
  badge.textContent = String(count);
  badge.classList.toggle('hidden', !count);
}

/* =========================================================
   Navegación
   ========================================================= */
function bindGlobalEvents() {
  const nav = $('#nav');
  if (nav) {
    nav.addEventListener('click', (event) => {
      const button = event.target.closest('.nav-item');
      if (button) navigate(button.dataset.tab);
    });
  }

  window.addEventListener('hashchange', () => {
    const hash = location.hash.replace('#', '');
    if (TAB_META[hash] && hash !== state.tab) navigate(hash, true);
  });

  const logout = $('#logout-btn');
  if (logout) {
    logout.addEventListener('click', async () => {
      try {
        await fetch('/api/admin/auth/logout', { method: 'POST', credentials: 'same-origin' });
      } catch (_) {
        /* ignore */
      }
      showLogin();
    });
  }

  const toggleLoginPwd = $('#toggle-login-pwd');
  if (toggleLoginPwd) {
    toggleLoginPwd.addEventListener('click', () => {
      const pwdInput = $('#login-password');
      if (!pwdInput) return;
      pwdInput.type = pwdInput.type === 'password' ? 'text' : 'password';
      toggleLoginPwd.textContent = pwdInput.type === 'password' ? 'Ver' : 'Ocultar';
    });
  }

  const loginForm = $('#login-form');
  if (loginForm) {
    const pwdInput = $('#login-password');
    pwdInput?.addEventListener('input', () => clearFieldError(pwdInput));

    loginForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const button = $('#login-submit');
      const errorBox = $('#login-error');
      const password = pwdInput ? pwdInput.value : '';
      if (!password.trim()) {
        setFieldError(pwdInput, 'Ingresa la contraseña de administrador.');
        pwdInput?.focus();
        return;
      }
      clearFieldError(pwdInput);
      button.disabled = true;
      button.innerHTML = '<span class="spinner"></span> Entrando...';
      errorBox.classList.add('hidden');
      try {
        const res = await fetch('/api/admin/auth/login', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password })
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || 'No se pudo iniciar sesión.');
        await bootApp();
      } catch (err) {
        errorBox.textContent = err.message;
        errorBox.classList.remove('hidden');
      } finally {
        button.disabled = false;
        button.innerHTML = 'Entrar al panel';
      }
    });
  }
}

function navigate(tab, fromHash = false) {
  if (!TAB_META[tab]) return;
  if (state.tab === 'settings' && state.settingsDirty && tab !== 'settings') {
    if (!window.confirm('Tienes cambios sin guardar en Ajustes. ¿Salir de todos modos?')) {
      if (fromHash) location.hash = state.tab;
      return;
    }
    state.settingsDirty = false;
  }
  state.tab = tab;
  clearTimeout(state.pollTimer);
  if (!fromHash) location.hash = tab;
  render();
}

function render() {
  const meta = TAB_META[state.tab] || TAB_META.overview;
  $('#page-title').textContent = meta.title;
  $('#page-subtitle').textContent = meta.subtitle;
  $('#topbar-actions').innerHTML = '';
  $$('#nav .nav-item').forEach((button) => {
    button.classList.toggle('active', button.dataset.tab === state.tab);
  });
  const view = $('#view');
  view.innerHTML = '';
  switch (state.tab) {
    case 'overview':
      renderOverview();
      break;
    case 'training':
      renderTraining();
      break;
    case 'settings':
      renderSettings();
      break;
    case 'chat':
      renderChat();
      break;
    case 'conversations':
      renderConversations();
      break;
    case 'connections':
      renderConnections();
      break;
    case 'widget':
      renderWidget();
      break;
    default:
      renderOverview();
  }
}

/* =========================================================
   Avisos y modales
   ========================================================= */
function toast(message, type = 'ok') {
  const root = $('#toast-root');
  if (!root) return;
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  const icon = type === 'error' ? ICONS.x : type === 'info' ? ICONS.info : ICONS.check;
  el.innerHTML = `${icon}<span>${esc(message)}</span>`;
  root.appendChild(el);
  setTimeout(() => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(6px)';
    setTimeout(() => el.remove(), 180);
  }, 3800);
}

function openModal({ title, body, footer = '', wide = false, onMount = null }) {
  const root = $('#modal-root');
  root.innerHTML = `
    <div class="modal-overlay">
      <div class="modal ${wide ? 'modal-wide' : ''}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
        <div class="modal-head">
          <h3>${esc(title)}</h3>
          <button class="btn-icon" type="button" data-close aria-label="Cerrar">${ICONS.x}</button>
        </div>
        <div class="modal-body">${body}</div>
        ${footer ? `<div class="modal-foot">${footer}</div>` : ''}
      </div>
    </div>`;
  const overlay = root.firstElementChild;
  const onKey = (event) => {
    if (event.key === 'Escape') close();
  };
  const close = () => {
    root.innerHTML = '';
    document.removeEventListener('keydown', onKey);
  };
  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) close();
  });
  $$('[data-close]', overlay).forEach((button) => button.addEventListener('click', close));
  document.addEventListener('keydown', onKey);
  if (onMount) onMount(overlay, close);
  return { el: overlay, close };
}

function confirmDialog(title, message, confirmLabel = 'Confirmar') {
  return new Promise((resolve) => {
    const modal = openModal({
      title,
      body: `<p style="font-size:13.5px;color:var(--muted);line-height:1.6">${esc(message)}</p>`,
      footer: `
        <button class="btn btn-secondary" type="button" data-close>Cancelar</button>
        <button class="btn btn-danger" type="button" id="confirm-yes">${esc(confirmLabel)}</button>`,
      onMount(el, close) {
        $('#confirm-yes', el).addEventListener('click', () => {
          close();
          resolve(true);
        });
        el.addEventListener('click', (event) => {
          if (event.target === el || event.target.closest('[data-close]')) resolve(false);
        });
      }
    });
    void modal;
  });
}

function loadingHTML() {
  return `<div class="card"><div class="empty"><div class="spinner dark" style="width:26px;height:26px;margin:0 auto 12px"></div><p>Cargando información...</p></div></div>`;
}

/* =========================================================
   Panel general
   ========================================================= */
async function renderOverview() {
  const view = $('#view');
  if (!state.overview) {
    view.innerHTML = loadingHTML();
    try {
      await loadOverview();
    } catch (err) {
      view.innerHTML = `<div class="alert alert-danger">${ICONS.warning}<div>${esc(err.message)}</div></div>`;
      return;
    }
  }
  if (state.tab !== 'overview') return;

  const overview = state.overview;
  const stats = overview.stats || {};
  const provider = overview.provider || state.provider || {};
  const channels = overview.channels || {};
  const checklist = [
    {
      done: Boolean(provider.configured),
      title: 'Conecta tu proveedor de IA',
      text: 'OpenAI, Claude o Gemini para generar las respuestas.',
      tab: 'settings'
    },
    {
      done: (stats.readySources || 0) > 0,
      title: 'Entrena con la información del negocio',
      text: 'Sube precios, preguntas frecuentes, guías y políticas.',
      tab: 'training'
    },
    {
      done: (stats.messages || 0) > 0,
      title: 'Prueba una conversación',
      text: 'Verifica que responde con datos reales y sin inventar.',
      tab: 'chat'
    },
    {
      done: Boolean(channels.whatsapp?.ready || channels.messenger?.ready || channels.instagram?.ready || channels.telegram?.ready || channels.widget?.ready),
      title: 'Publica el asistente en tus canales',
      text: 'WhatsApp, Instagram, Messenger, Telegram o tu web.',
      tab: 'connections'
    }
  ];
  const completed = checklist.filter((item) => item.done).length;

  const alerts = [];
  if (overview.usingDefaultPassword) {
    alerts.push(`<div class="alert alert-warn">${ICONS.warning}<div>
      Estás usando la contraseña por defecto. <a href="#settings" data-goto="settings">Cámbiala en Ajustes → Seguridad</a>.
    </div></div>`);
  }
  if (provider.provider === 'demo' || !provider.configured) {
    alerts.push(`<div class="alert alert-info">${ICONS.info}<div>
      El asistente está en <strong>modo demo</strong>: responde con tu base de conocimiento pero sin IA generativa.
      <a href="#settings" data-goto="settings">Conecta OpenAI, Claude o Gemini</a> para activarlo por completo.
    </div></div>`);
  }

  const recentRows = (overview.recentConversations || []).length
    ? overview.recentConversations
        .map(
          (conversation) => `
          <div class="recent-item" data-conv="${esc(conversation.id)}">
            <div class="avatar ${avatarTone(conversation.userName)}">${esc(initials(conversation.userName))}</div>
            <div class="recent-main">
              <div class="recent-name">
                ${esc(conversation.userName || 'Visitante')}
                ${conversation.needsHuman ? '<span class="badge badge-warn">Requiere asesor</span>' : ''}
              </div>
              <div class="recent-msg">${esc(conversation.lastMessage || 'Sin mensajes')}</div>
            </div>
            <div style="text-align:right">
              <div class="recent-time">${fmtRelative(conversation.updatedAt)}</div>
              <div class="mt-8" style="margin-top:4px">${channelBadge(conversation.channel)}</div>
            </div>
          </div>`
        )
        .join('')
    : `<div class="empty" style="padding:28px 16px">
        <div class="empty-icon">${ICONS.chat}</div>
        <h4>Aún no hay conversaciones</h4>
        <p>Prueba el asistente o conecta un canal para empezar a recibir mensajes.</p>
      </div>`;

  const channelItems = [
    { key: 'whatsapp', label: 'WhatsApp', icon: ICONS.wa, cls: 'wa' },
    { key: 'instagram', label: 'Instagram', icon: ICONS.ig, cls: 'ig' },
    { key: 'messenger', label: 'Messenger', icon: ICONS.ms, cls: 'ms' },
    { key: 'telegram', label: 'Telegram', icon: ICONS.tg, cls: 'tg' },
    { key: 'widget', label: 'Web', icon: ICONS.web, cls: 'web' }
  ]
    .map((channel) => {
      const info = channels[channel.key] || {};
      const ready = Boolean(info.ready);
      return `<div class="flex" style="justify-content:space-between;padding:9px 2px;border-bottom:1px solid var(--border)">
        <div class="flex"><span class="channel-logo ${channel.cls}" style="width:28px;height:28px;border-radius:8px">${channel.icon}</span>
        <span style="font-size:12.5px;font-weight:600">${channel.label}</span></div>
        <span class="badge ${ready ? 'badge-ok' : 'badge-neutral'} badge-dot">${ready ? 'Activo' : 'Inactivo'}</span>
      </div>`;
    })
    .join('');

  view.innerHTML = `
    ${alerts.join('')}
    <div class="welcome-banner">
      <div>
        <h2>Hola, tu asistente está listo para ayudar</h2>
        <p>Entrena con la información real de la farmacia, revisa las conversaciones y atiende a tus clientes en todos los canales.</p>
      </div>
      <button class="btn btn-secondary" data-goto="chat">Probar asistente ${ICONS.spark}</button>
    </div>

    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-icon">${ICONS.chat}</div>
        <div><div class="stat-value">${fmtNumber(stats.conversations)}</div><div class="stat-label">Conversaciones</div></div>
      </div>
      <div class="stat-card">
        <div class="stat-icon blue">${ICONS.send}</div>
        <div><div class="stat-value">${fmtNumber(stats.messages)}</div><div class="stat-label">Mensajes</div></div>
      </div>
      <div class="stat-card">
        <div class="stat-icon coral">${ICONS.users}</div>
        <div><div class="stat-value">${fmtNumber(stats.leads)}</div><div class="stat-label">Leads capturados</div></div>
      </div>
      <div class="stat-card">
        <div class="stat-icon gold">${ICONS.text}</div>
        <div><div class="stat-value">${fmtNumber(stats.chunks)}</div><div class="stat-label">Fragmentos entrenados</div></div>
      </div>
    </div>

    <div class="cols">
      <div class="stack">
        <div class="card">
          <div class="card-head">
            <div><h3>Conversaciones recientes</h3><p>Últimos chats recibidos en todos los canales</p></div>
            <button class="btn btn-ghost btn-sm" data-goto="conversations">Ver todas</button>
          </div>
          <div class="card-body" style="padding-top:6px;padding-bottom:6px">${recentRows}</div>
        </div>
        <div class="card">
          <div class="card-head">
            <div><h3>Canales</h3><p>Estado de las conexiones del asistente</p></div>
            <button class="btn btn-ghost btn-sm" data-goto="connections">Configurar</button>
          </div>
          <div class="card-body" style="padding-top:6px;padding-bottom:6px">${channelItems}</div>
        </div>
      </div>

      <div class="stack">
        <div class="card">
          <div class="card-head">
            <div><h3>Primeros pasos</h3><p>${completed} de ${checklist.length} completados</p></div>
            <span class="badge ${completed === checklist.length ? 'badge-ok' : 'badge-primary'}">${completed}/${checklist.length}</span>
          </div>
          <div class="card-body checklist" style="padding-top:8px;padding-bottom:8px">
            ${checklist
              .map(
                (item) => `
              <div class="check-item ${item.done ? 'done' : ''}" data-goto="${item.tab}">
                <span class="check-box">${ICONS.check}</span>
                <div><strong>${esc(item.title)}</strong><span>${esc(item.text)}</span></div>
                <span class="chev">${ICONS.external}</span>
              </div>`
              )
              .join('')}
          </div>
        </div>

        <div class="card">
          <div class="card-head">
            <div><h3>Proveedor de IA</h3><p>Modelo que genera las respuestas</p></div>
            <span class="badge ${provider.configured ? 'badge-ok' : 'badge-warn'} badge-dot">${provider.configured ? 'Conectado' : 'Pendiente'}</span>
          </div>
          <div class="card-body provider-card">
            <div class="provider-head">
              <div class="provider-logo">${esc((PROVIDERS.find((item) => item.id === provider.provider) || {}).short || 'IA')}</div>
              <div style="min-width:0">
                <div style="font-weight:700;font-size:13.5px">${esc(provider.label || provider.provider || 'Sin configurar')}</div>
                <div class="small muted" style="margin-top:2px">${esc(provider.model || '—')}</div>
              </div>
            </div>
            <dl class="provider-meta">
              <dt>Embeddings</dt><dd>${esc(provider.embeddingProvider || 'local')} · ${esc(provider.embeddingModel || '')}</dd>
              <dt>Clave API</dt><dd>${provider.apiKeyMasked ? esc(provider.apiKeyMasked) : provider.usingEnvKey ? 'Desde .env' : 'No configurada'}</dd>
              <dt>Base de conocimiento</dt><dd>${fmtNumber(stats.readySources)} fuentes · ${fmtNumber(stats.chunks)} fragmentos</dd>
            </dl>
            <button class="btn btn-secondary btn-sm" data-goto="settings">Configurar modelo</button>
          </div>
        </div>
      </div>
    </div>`;

  $$('[data-goto]', view).forEach((el) => {
    el.addEventListener('click', () => navigate(el.dataset.goto));
  });
  $$('[data-conv]', view).forEach((el) => {
    el.addEventListener('click', () => {
      navigate('conversations');
      setTimeout(() => {
        if (typeof openConversation === 'function') openConversation(el.dataset.conv);
      }, 250);
    });
  });
}

/* =========================================================
   Entrenamiento
   ========================================================= */
function sourceBadge(source) {
  if (source.status === 'processing') {
    return { cls: 'badge-primary', label: `Procesando ${source.progress || 0}%` };
  }
  if (source.status === 'queued') return { cls: 'badge-info', label: 'En cola' };
  if (source.status === 'error') return { cls: 'badge-danger', label: 'Error' };
  if (source.error) return { cls: 'badge-warn', label: 'Listo con aviso' };
  return { cls: 'badge-ok', label: 'Listo' };
}

function sourceIcon(source) {
  if (source.type === 'url') {
    return `<div class="file-icon url">${ICONS.link}</div>`;
  }
  if (source.type === 'text') {
    return `<div class="file-icon text">${ICONS.text}</div>`;
  }
  const ext = (source.name.split('.').pop() || 'DOC').toUpperCase().slice(0, 4);
  return `<div class="file-icon">${esc(ext)}</div>`;
}

function renderTraining() {
  const view = $('#view');
  const sources = state.sources || [];
  const ready = sources.filter((source) => source.status === 'ready').length;
  const chunks = sources.reduce((total, source) => total + (source.chunkCount || 0), 0);
  const active = sources.filter((source) => ['queued', 'processing'].includes(source.status)).length;

  const rows = sources.length
    ? sources
        .map((source) => {
          const badge = sourceBadge(source);
          const note =
            source.status === 'processing'
              ? source.message || 'Procesando...'
              : source.error || source.message || '';
          return `
          <tr data-id="${esc(source.id)}">
            <td>
              <div class="source-name">
                ${sourceIcon(source)}
                <div style="min-width:0">
                  <div class="s-name" title="${esc(source.name)}">${esc(source.name)}</div>
                  <div class="s-sub">${
                    source.type === 'url'
                      ? esc(source.url || '')
                      : `${fmtNumber(source.chars)} caracteres`
                  }${source.crawl ? ' · con enlaces' : ''}</div>
                </div>
              </div>
            </td>
            <td>
              <div class="status-cell">
                <div class="status-top"><span class="badge ${badge.cls} badge-dot">${badge.label}</span></div>
                ${
                  source.status === 'processing'
                    ? `<div class="progress"><span style="width:${source.progress || 0}%"></span></div>`
                    : note
                      ? `<div class="status-note" title="${esc(note)}">${esc(note)}</div>`
                      : ''
                }
              </div>
            </td>
            <td class="num">${fmtNumber(source.chunkCount)}</td>
            <td class="nowrap faint">${fmtRelative(source.updatedAt)}</td>
            <td>
              <div class="row-actions">
                <button class="btn-icon" data-action="preview" data-id="${esc(source.id)}" title="Ver fragmentos">${ICONS.eye}</button>
                <button class="btn-icon" data-action="reindex" data-id="${esc(source.id)}" title="Reindexar">${ICONS.refresh}</button>
                <button class="btn-icon" data-action="delete" data-id="${esc(source.id)}" title="Eliminar">${ICONS.trash}</button>
              </div>
            </td>
          </tr>`;
        })
        .join('')
    : `<tr><td colspan="5">
        <div class="empty">
          <div class="empty-icon">${ICONS.text}</div>
          <h4>Tu base de conocimiento está vacía</h4>
          <p>Sube el catálogo, las preguntas frecuentes y las políticas del negocio para que el asistente responda con datos reales.</p>
        </div>
      </td></tr>`;

  view.innerHTML = `
    <div class="action-grid">
      <button class="action-card" id="act-upload" type="button">
        <div class="action-icon">${ICONS.upload}</div>
        <h4>Subir documento</h4>
        <p>PDF, Word, Excel, CSV, TXT o Markdown con la información del negocio.</p>
        <span class="action-cta">Elegir archivo ${ICONS.external}</span>
      </button>
      <button class="action-card" id="act-url" type="button">
        <div class="action-icon coral">${ICONS.link}</div>
        <h4>Añadir página web</h4>
        <p>Importa una URL o rastrea los enlaces internos de tu sitio.</p>
        <span class="action-cta">Agregar URL ${ICONS.external}</span>
      </button>
      <button class="action-card" id="act-text" type="button">
        <div class="action-icon gold">${ICONS.text}</div>
        <h4>Añadir texto o nota</h4>
        <p>Pega precios, indicaciones, políticas o preguntas frecuentes.</p>
        <span class="action-cta">Escribir contenido ${ICONS.external}</span>
      </button>
    </div>

    <input type="file" id="file-input" multiple class="hidden"
      accept=".pdf,.docx,.xlsx,.xlsm,.csv,.tsv,.txt,.md,.markdown,.json,.html,.htm,.xml" />

    <div class="dropzone" id="dropzone">
      ${ICONS.upload}
      <strong>Arrastra tus archivos aquí</strong>
      <p>o haz clic para seleccionarlos · máximo 25 MB por archivo</p>
    </div>

    <div class="card">
      <div class="card-head">
        <div>
          <h3>Base de conocimiento</h3>
          <p>${fmtNumber(sources.length)} fuentes · ${fmtNumber(ready)} listas · ${fmtNumber(chunks)} fragmentos${
            active ? ` · ${active} en proceso` : ''
          }</p>
        </div>
        <div class="flex">
          <button class="btn btn-ghost btn-sm" id="refresh-sources" title="Actualizar">${ICONS.refresh} Actualizar</button>
          <button class="btn btn-secondary btn-sm" id="reindex-all">Reindexar todo</button>
        </div>
      </div>
      <div class="table-wrap">
        <table class="table" id="sources-table">
          <thead>
            <tr>
              <th>Fuente</th>
              <th>Estado</th>
              <th>Fragmentos</th>
              <th>Actualizado</th>
              <th style="text-align:right">Acciones</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>

    <div class="card mt-16">
      <div class="card-body" style="display:flex;gap:12px;align-items:flex-start">
        <div class="stat-icon gold" style="flex:none">${ICONS.spark}</div>
        <div>
          <div style="font-weight:700;font-size:13.5px;margin-bottom:3px">Cómo entrena tu asistente</div>
          <p class="small muted" style="line-height:1.6">
            Cada documento se divide en fragmentos y se vectoriza. Cuando un cliente pregunta, el asistente busca los fragmentos
            más relevantes y responde <strong>solo con esa información</strong>. Si cambias el modelo de embeddings, usa
            "Reindexar todo" para recalcular la base.
          </p>
        </div>
      </div>
    </div>`;

  const fileInput = $('#file-input');
  $('#act-upload')?.addEventListener('click', () => fileInput.click());
  const dropzone = $('#dropzone');
  dropzone?.addEventListener('click', () => fileInput.click());
  dropzone?.addEventListener('dragover', (event) => {
    event.preventDefault();
    dropzone.classList.add('drag');
  });
  dropzone?.addEventListener('dragleave', () => dropzone.classList.remove('drag'));
  dropzone?.addEventListener('drop', (event) => {
    event.preventDefault();
    dropzone.classList.remove('drag');
    uploadFiles(event.dataTransfer.files);
  });
  fileInput?.addEventListener('change', () => {
    uploadFiles(fileInput.files);
    fileInput.value = '';
  });

  $('#act-url')?.addEventListener('click', openUrlModal);
  $('#act-text')?.addEventListener('click', openTextModal);
  $('#refresh-sources')?.addEventListener('click', async () => {
    try {
      await loadSources();
      renderTraining();
      toast('Lista actualizada');
    } catch (err) {
      toast(err.message, 'error');
    }
  });
  $('#reindex-all')?.addEventListener('click', async () => {
    const ok = await confirmDialog(
      'Reindexar toda la base',
      'Se volverán a procesar todas las fuentes y se recalcularán los embeddings. Puede tardar unos minutos y consumir cuota del proveedor.',
      'Reindexar todo'
    );
    if (!ok) return;
    try {
      await api('/sources/reindex-all', { method: 'POST' });
      toast('Reindexación iniciada');
      await loadSources();
      renderTraining();
    } catch (err) {
      toast(err.message, 'error');
    }
  });

  $('#sources-table')?.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-action]');
    if (!button) return;
    const id = button.dataset.id;
    const source = sources.find((item) => item.id === id);
    if (!source) return;

    if (button.dataset.action === 'preview') {
      try {
        const data = await api(`/sources/${id}/chunks`);
        const chunksHtml = data.chunks.length
          ? data.chunks
              .map(
                (chunk) => `<div style="margin-bottom:12px">
                  <div class="small faint" style="margin-bottom:4px">Fragmento #${chunk.index + 1}</div>
                  <pre style="max-height:220px">${esc(chunk.text)}</pre>
                </div>`
              )
              .join('')
          : '<p class="muted">Esta fuente todavía no tiene fragmentos procesados.</p>';
        openModal({
          title: `Fragmentos · ${source.name}`,
          body: `<div class="alert alert-info" style="margin-bottom:14px">${ICONS.info}<div>
            El asistente usa estos fragmentos para responder. Mostrando ${Math.min(data.chunks.length, 40)} de ${fmtNumber(data.total)}.
          </div></div>${chunksHtml}`,
          wide: true,
          footer: '<button class="btn btn-secondary" data-close>Cerrar</button>'
        });
      } catch (err) {
        toast(err.message, 'error');
      }
    }

    if (button.dataset.action === 'reindex') {
      try {
        await api(`/sources/${id}/reindex`, { method: 'POST' });
        toast('Fuente en cola para reindexar');
        await loadSources();
        renderTraining();
      } catch (err) {
        toast(err.message, 'error');
      }
    }

    if (button.dataset.action === 'delete') {
      const ok = await confirmDialog(
        'Eliminar fuente',
        `Se eliminará "${source.name}" y todos sus fragmentos de la base de conocimiento. Esta acción no se puede deshacer.`,
        'Eliminar'
      );
      if (!ok) return;
      try {
        await api(`/sources/${id}`, { method: 'DELETE' });
        toast('Fuente eliminada');
        await loadSources();
        renderTraining();
      } catch (err) {
        toast(err.message, 'error');
      }
    }
  });

  scheduleTrainingPoll();
}

function scheduleTrainingPoll() {
  clearTimeout(state.pollTimer);
  const hasActive =
    state.sources.some((source) => ['queued', 'processing'].includes(source.status)) ||
    (state.queue && state.queue.pending > 0);
  if (!hasActive) return;
  state.pollTimer = setTimeout(async () => {
    if (state.tab !== 'training') return;
    try {
      await loadSources();
      if (state.tab === 'training') renderTraining();
    } catch (_) {
      /* silencioso */
    }
  }, 2600);
}

async function uploadFiles(fileList) {
  const files = Array.from(fileList || []);
  if (!files.length) return;
  for (const file of files) {
    const form = new FormData();
    form.append('file', file);
    toast(`Subiendo ${file.name}...`, 'info');
    try {
      const res = await fetch('/api/admin/sources/upload', {
        method: 'POST',
        body: form,
        credentials: 'same-origin'
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 401) {
        showLogin();
        return;
      }
      if (!res.ok) throw new Error(data.error || 'No se pudo subir el archivo.');
      toast(`${file.name} añadido. Procesando...`, 'ok');
    } catch (err) {
      toast(err.message, 'error');
    }
  }
  try {
    await loadSources();
    if (state.tab === 'training') renderTraining();
  } catch (_) {
    /* ignore */
  }
}

function openUrlModal() {
  const modal = openModal({
    title: 'Añadir página web',
    body: `
      <div class="field">
        <label for="url-input">URL de la página <span class="req" aria-hidden="true">*</span></label>
        <input id="url-input" type="url" placeholder="https://tu-farmacia.com/preguntas-frecuentes" required />
        <span class="hint">Se extraerá el texto visible. Debe iniciar con <code>http://</code> o <code>https://</code>.</span>
      </div>
      <div class="field">
        <label for="url-name">Nombre descriptivo (opcional)</label>
        <input id="url-name" type="text" placeholder="Preguntas frecuentes" />
      </div>
      <label class="inline-field" style="cursor:pointer">
        <span class="switch"><input type="checkbox" id="url-crawl" /></span>
        <span class="small">Rastrear también los enlaces internos de la página (hasta 8 páginas)</span>
      </label>`,
    footer: `
      <button class="btn btn-secondary" type="button" data-close>Cancelar</button>
      <button class="btn" type="button" id="url-submit">Añadir URL</button>`,
    onMount(el, close) {
      const input = $('#url-input', el);
      input.addEventListener('input', () => clearFieldError(input));
      input.focus();
      const submit = $('#url-submit', el);
      const send = async () => {
        const url = input.value.trim();
        if (!url) {
          setFieldError(input, 'Ingresa la URL de la página web.');
          input.focus();
          return;
        }
        if (!/^https?:\/\/.+/i.test(url)) {
          setFieldError(input, 'La URL debe comenzar con http:// o https://');
          input.focus();
          return;
        }
        clearFieldError(input);
        submit.disabled = true;
        submit.innerHTML = '<span class="spinner"></span> Añadiendo...';
        try {
          await api('/sources/url', {
            method: 'POST',
            body: JSON.stringify({
              url,
              name: $('#url-name', el).value.trim(),
              crawl: $('#url-crawl', el).checked
            })
          });
          close();
          toast('Página añadida. Procesando...');
          await loadSources();
          if (state.tab === 'training') renderTraining();
        } catch (err) {
          setFieldError(input, err.message);
          toast(err.message, 'error');
          submit.disabled = false;
          submit.textContent = 'Añadir URL';
        }
      };
      submit.addEventListener('click', send);
      input.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') send();
      });
    }
  });
  void modal;
}

function openTextModal() {
  openModal({
    title: 'Añadir texto o nota',
    body: `
      <div class="field">
        <label for="text-name">Título de la nota <span class="req" aria-hidden="true">*</span></label>
        <input id="text-name" type="text" placeholder="Precios de colágeno 2026" required />
      </div>
      <div class="field">
        <label for="text-content">Contenido <span class="req" aria-hidden="true">*</span></label>
        <textarea id="text-content" style="min-height:220px" placeholder="Pega aquí la información: precios, indicaciones, políticas, preguntas frecuentes..." required></textarea>
        <span class="hint"><span id="text-count">0</span> caracteres · mínimo 20 obligatorios</span>
      </div>`,
    footer: `
      <button class="btn btn-secondary" type="button" data-close>Cancelar</button>
      <button class="btn" type="button" id="text-submit">Guardar y entrenar</button>`,
    onMount(el, close) {
      const nameInput = $('#text-name', el);
      const content = $('#text-content', el);
      const count = $('#text-count', el);
      nameInput.addEventListener('input', () => clearFieldError(nameInput));
      content.addEventListener('input', () => {
        count.textContent = fmtNumber(content.value.length);
        if (content.value.trim().length >= 20) clearFieldError(content);
      });
      nameInput.focus();
      const submit = $('#text-submit', el);
      submit.addEventListener('click', async () => {
        const title = nameInput.value.trim();
        const text = content.value.trim();
        let hasErr = false;
        if (!title) {
          setFieldError(nameInput, 'Ingresa un título para identificar esta nota.');
          nameInput.focus();
          hasErr = true;
        }
        if (text.length < 20) {
          setFieldError(content, 'El contenido debe tener al menos 20 caracteres.');
          if (!hasErr) content.focus();
          hasErr = true;
        }
        if (hasErr) return;

        submit.disabled = true;
        submit.innerHTML = '<span class="spinner"></span> Guardando...';
        try {
          await api('/sources/text', {
            method: 'POST',
            body: JSON.stringify({ name: title, text })
          });
          close();
          toast('Contenido añadido. Procesando...');
          await loadSources();
          if (state.tab === 'training') renderTraining();
        } catch (err) {
          toast(err.message, 'error');
          submit.disabled = false;
          submit.textContent = 'Guardar y entrenar';
        }
      });
    }
  });
}
