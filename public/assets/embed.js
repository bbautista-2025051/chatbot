'use strict';

/* =========================================================
   Chat embebible · Interfaz e integración con Google Gemini AI
   ========================================================= */
(function () {
  const params = new URLSearchParams(window.location.search);
  const isPreview = params.get('preview') === '1';
  const isWidget = params.get('widget') === '1';
  const standalone = !isPreview && !isWidget;

  if (standalone) document.body.classList.add('standalone');
  if (isWidget) document.body.classList.add('is-widget');
  if (isPreview) document.body.classList.add('is-preview');

  const shellEl = document.getElementById('chat-shell');
  const nameEl = document.getElementById('assistant-name');
  const providerPillEl = document.getElementById('ai-provider-pill');
  const statusDotEl = document.getElementById('status-dot');
  const subtitleEl = document.getElementById('assistant-subtitle');
  const newChatBtn = document.getElementById('chat-new');
  const messagesEl = document.getElementById('messages');
  const quickRow = document.getElementById('quick-row');
  const chatForm = document.getElementById('chat-form');
  const input = document.getElementById('chat-input');
  const charCounterEl = document.getElementById('char-counter');
  const sendBtn = document.getElementById('chat-send');
  const sendIcon = sendBtn ? sendBtn.querySelector('.send-icon') : null;
  const sendSpinner = sendBtn ? sendBtn.querySelector('.send-spinner') : null;
  const errorBox = document.getElementById('chat-error');
  const errorTextEl = document.getElementById('chat-error-text');
  const errorRetryBtn = document.getElementById('chat-retry');
  const errorCloseBtn = document.getElementById('chat-error-close');

  const MAX_CHARS = 2000;

  const state = {
    config: null,
    sessionId: '',
    busy: false,
    greeted: false,
    quickReplies: [],
    handoffShown: false,
    lastFailedMessage: '',
    assistantName: 'Asistente virtual',
    providerLabel: 'Gemini AI'
  };

  /* ---------- Utilidades ---------- */
  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function timeLabel(date) {
    try {
      return new Date(date || Date.now()).toLocaleTimeString('es-ES', {
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch (_) {
      return '';
    }
  }

  function sanitizeUrl(rawUrl) {
    const clean = String(rawUrl || '').trim();
    if (/^https?:\/\/[^\s<>"']+$/i.test(clean)) return clean;
    if (/^mailto:[^\s<>"']+$/i.test(clean)) return clean;
    return '';
  }

  /* ---------- Renderizador Markdown seguro ---------- */
  function formatInlineMarkdown(rawText) {
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
    safe = safe.replace(/~~([^~]+)~~/g, '<del>$1</del>');

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
      const langAttr = lang ? ` data-lang="${esc(lang)}"` : '';
      const idx = codeBlocks.push(`<pre${langAttr}><code>${esc(code.replace(/\n$/, ''))}</code></pre>`) - 1;
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
      blocks.push(`<p>${paragraphLines.map(formatInlineMarkdown).join('<br />')}</p>`);
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
      blocks.push(`<blockquote>${quoteLines.map(formatInlineMarkdown).join('<br />')}</blockquote>`);
      quoteLines = [];
    }

    function flushAll() {
      flushParagraph();
      flushList();
      flushQuote();
    }

    for (let i = 0; i < lines.length; i++) {
      const rawLine = lines[i];
      const trimmed = rawLine.trim();

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

      if (/^([-*_])\1{2,}$/.test(trimmed)) {
        flushAll();
        blocks.push('<hr />');
        continue;
      }

      const headingMatch = trimmed.match(/^(#{1,4})\s+(.+)$/);
      if (headingMatch) {
        flushAll();
        const level = Math.min(4, headingMatch[1].length);
        blocks.push(`<h${level}>${formatInlineMarkdown(headingMatch[2])}</h${level}>`);
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
        listItems.push(formatInlineMarkdown(ulMatch[1]));
        continue;
      }

      const olMatch = trimmed.match(/^\d+[.)]\s+(.+)$/);
      if (olMatch) {
        flushParagraph();
        if (listType && listType !== 'ol') flushList();
        listType = 'ol';
        listItems.push(formatInlineMarkdown(olMatch[1]));
        continue;
      }

      if (listType) flushList();
      paragraphLines.push(trimmed);
    }

    flushAll();
    return blocks.join('');
  }

  function shade(hex, factor) {
    const value = String(hex || '').replace('#', '');
    if (!/^[0-9a-f]{6}$/i.test(value)) return hex;
    const num = parseInt(value, 16);
    const r = Math.max(0, Math.min(255, Math.round(((num >> 16) & 255) * factor)));
    const g = Math.max(0, Math.min(255, Math.round(((num >> 8) & 255) * factor)));
    const b = Math.max(0, Math.min(255, Math.round((num & 255) * factor)));
    return `#${[r, g, b].map((part) => part.toString(16).padStart(2, '0')).join('')}`;
  }

  function makeSessionId() {
    const bytes = new Uint8Array(12);
    if (window.crypto && window.crypto.getRandomValues) {
      window.crypto.getRandomValues(bytes);
    } else {
      for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
    }
    const token = Array.from(bytes, (byte) => byte.toString(36).padStart(2, '0')).join('');
    return `web_${token.slice(0, 24)}`;
  }

  function saveSessionId(id) {
    state.sessionId = id;
    try {
      window.sessionStorage.setItem('colageno_session', id);
    } catch (_) {
      /* ignore */
    }
  }

  function ensureSession() {
    if (state.sessionId) return;
    try {
      const stored = window.sessionStorage.getItem('colageno_session');
      if (stored && /^[A-Za-z0-9_-]{8,80}$/.test(stored)) {
        state.sessionId = stored;
        return;
      }
    } catch (_) {
      /* almacenamiento no disponible */
    }
    saveSessionId(makeSessionId());
  }

  /* ---------- Renderizado de mensajes ---------- */
  function scrollToBottom() {
    window.requestAnimationFrame(() => {
      if (messagesEl) messagesEl.scrollTop = messagesEl.scrollHeight;
    });
  }

  function createAssistantAvatar() {
    const avatar = document.createElement('div');
    avatar.className = 'msg-avatar';
    avatar.setAttribute('aria-hidden', 'true');
    avatar.innerHTML =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
      '<path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z" />' +
      '</svg>';
    return avatar;
  }

  function appendMessage(role, content, options = {}) {
    if (!messagesEl) return null;
    const isUser = role === 'user';
    const wrap = document.createElement('div');
    wrap.className = `msg ${isUser ? 'user' : 'assistant'}`;

    if (!isUser) {
      wrap.appendChild(createAssistantAvatar());
    }

    const body = document.createElement('div');
    body.className = 'msg-body';

    if (!isUser) {
      const sender = document.createElement('div');
      sender.className = 'msg-sender';
      sender.innerHTML = `<span>${esc(state.assistantName)}</span> · <span>${esc(state.providerLabel)}</span>`;
      body.appendChild(sender);
    }

    const bubble = document.createElement('div');
    bubble.className = isUser ? 'bubble' : 'bubble md-content';
    if (options.isError) bubble.classList.add('error-bubble');

    if (isUser) {
      bubble.innerHTML = `<p>${esc(content).replace(/\r?\n/g, '<br />')}</p>`;
    } else {
      bubble.innerHTML = renderMarkdown(content);
    }
    body.appendChild(bubble);

    if (!isUser && Array.isArray(options.sources) && options.sources.length) {
      const sourcesWrap = document.createElement('div');
      sourcesWrap.className = 'msg-sources';
      options.sources.slice(0, 3).forEach((src) => {
        if (!src || !src.title) return;
        const safeUrl = sanitizeUrl(src.url);
        if (safeUrl) {
          const link = document.createElement('a');
          link.className = 'source-pill';
          link.href = safeUrl;
          link.target = '_blank';
          link.rel = 'noopener noreferrer';
          link.textContent = `Fuente: ${src.title}`;
          sourcesWrap.appendChild(link);
        } else {
          const span = document.createElement('span');
          span.className = 'source-pill';
          span.textContent = `Fuente: ${src.title}`;
          sourcesWrap.appendChild(span);
        }
      });
      if (sourcesWrap.childNodes.length) {
        body.appendChild(sourcesWrap);
      }
    }

    const meta = document.createElement('div');
    meta.className = 'msg-meta';

    const time = document.createElement('span');
    time.className = 'msg-time';
    time.textContent = timeLabel(options.createdAt);
    meta.appendChild(time);

    if (!isUser && content) {
      const copyBtn = document.createElement('button');
      copyBtn.type = 'button';
      copyBtn.className = 'msg-copy-btn';
      copyBtn.textContent = 'Copiar';
      copyBtn.title = 'Copiar respuesta';
      copyBtn.addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(String(content));
          copyBtn.textContent = 'Copiado';
          setTimeout(() => {
            copyBtn.textContent = 'Copiar';
          }, 1600);
        } catch (_) {
          copyBtn.textContent = 'Listo';
        }
      });
      meta.appendChild(copyBtn);
    }

    body.appendChild(meta);
    wrap.appendChild(body);
    messagesEl.appendChild(wrap);
    scrollToBottom();
    return wrap;
  }

  function showNotice(text) {
    if (!messagesEl) return;
    const notice = document.createElement('div');
    notice.className = 'chat-notice';
    notice.textContent = text;
    messagesEl.appendChild(notice);
    scrollToBottom();
  }

  function showTyping() {
    hideTyping();
    if (!messagesEl) return null;
    const wrap = document.createElement('div');
    wrap.className = 'msg assistant';
    wrap.id = 'typing-indicator';
    wrap.setAttribute('role', 'status');
    wrap.setAttribute('aria-live', 'polite');

    wrap.appendChild(createAssistantAvatar());

    const body = document.createElement('div');
    body.className = 'msg-body';

    const box = document.createElement('div');
    box.className = 'typing-box';
    box.innerHTML =
      '<div class="typing-dots" aria-hidden="true"><span></span><span></span><span></span></div>' +
      `<span class="typing-label">${esc(state.providerLabel)} está procesando tu consulta...</span>`;

    body.appendChild(box);
    wrap.appendChild(body);
    messagesEl.appendChild(wrap);
    scrollToBottom();
    return wrap;
  }

  function hideTyping() {
    document.getElementById('typing-indicator')?.remove();
  }

  function setBusyState(busy) {
    state.busy = Boolean(busy);
    if (shellEl) shellEl.setAttribute('aria-busy', state.busy ? 'true' : 'false');
    if (sendBtn) sendBtn.disabled = state.busy;
    if (newChatBtn) newChatBtn.disabled = state.busy;
    if (errorRetryBtn) errorRetryBtn.disabled = state.busy;
    if (sendIcon) sendIcon.classList.toggle('hidden', state.busy);
    if (sendSpinner) sendSpinner.classList.toggle('hidden', !state.busy);
    if (statusDotEl) statusDotEl.classList.toggle('busy', state.busy);
    if (subtitleEl) {
      if (state.busy) {
        subtitleEl.textContent = `${state.providerLabel} está escribiendo...`;
      } else {
        const widget = state.config?.widget || {};
        subtitleEl.textContent =
          widget.subtitle || state.config?.business?.hours || 'Respondemos en segundos';
      }
    }
    renderQuickReplies();
  }

  function renderQuickReplies() {
    if (!quickRow) return;
    if (state.busy || !state.quickReplies.length) {
      quickRow.innerHTML = '';
      return;
    }
    quickRow.innerHTML = state.quickReplies
      .map((reply) => `<button class="quick-chip" type="button">${esc(reply)}</button>`)
      .join('');
    Array.from(quickRow.querySelectorAll('.quick-chip')).forEach((chip) => {
      chip.addEventListener('click', () => {
        if (state.busy) return;
        sendMessage(chip.textContent || '');
      });
    });
  }

  function showError(message, failedUserText = '') {
    if (!errorBox) return;
    if (errorTextEl) {
      errorTextEl.textContent = message || 'Ocurrió un problema de conexión con el asistente.';
    }
    if (failedUserText) {
      state.lastFailedMessage = failedUserText;
    }
    if (errorRetryBtn) {
      errorRetryBtn.classList.toggle('hidden', !state.lastFailedMessage);
    }
    errorBox.classList.remove('hidden');
  }

  function clearError() {
    if (!errorBox) return;
    errorBox.classList.add('hidden');
    if (errorTextEl) errorTextEl.textContent = '';
    if (errorRetryBtn) errorRetryBtn.classList.add('hidden');
  }

  /* ---------- Envío de mensajes ---------- */
  async function sendMessage(rawText, options = {}) {
    const text = String(rawText || '').trim();
    if (!text) return;
    if (state.busy) return;

    if (text.length > MAX_CHARS) {
      showError(`El mensaje supera el límite permitido de ${MAX_CHARS} caracteres.`);
      return;
    }

    ensureSession();
    clearError();

    if (!options.isRetry) {
      appendMessage('user', text);
      if (input) {
        input.value = '';
        resizeInput();
      }
    }

    state.lastFailedMessage = text;
    state.quickReplies = [];
    setBusyState(true);
    showTyping();

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 32000);

    try {
      const res = await fetch('/api/public/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ sessionId: state.sessionId, message: text }),
        signal: controller.signal
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        const errMessage =
          data.error ||
          (res.status === 409
            ? 'Ya hay una consulta en proceso. Espera unos segundos.'
            : res.status === 429
            ? 'Has enviado demasiados mensajes seguidos. Espera un momento e intenta de nuevo.'
            : 'No se pudo completar la consulta con el asistente.');
        throw new Error(errMessage);
      }

      if (data.sessionId) {
        saveSessionId(data.sessionId);
      }

      hideTyping();
      state.lastFailedMessage = '';
      appendMessage('assistant', data.reply || 'No obtuve una respuesta. Por favor intenta de nuevo.', {
        sources: data.sources
      });

      if (data.providerError && data.errorMessage) {
        showError(
          `Nota: El proveedor IA reportó un inconveniente (${data.errorMessage}). Se mostró una respuesta de respaldo.`,
          text
        );
      }

      if (data.needsHuman && !state.handoffShown) {
        state.handoffShown = true;
        showNotice(
          'Un asesor humano puede continuar atendiendo tu consulta. También puedes contactarnos por WhatsApp.'
        );
      }
    } catch (err) {
      hideTyping();
      const friendlyMsg =
        err.name === 'AbortError'
          ? 'La solicitud tardó demasiado tiempo en responder. Comprueba tu conexión o intenta de nuevo.'
          : err.message || 'Ocurrió un error al comunicarse con el asistente.';
      showError(friendlyMsg, text);
      appendMessage(
        'assistant',
        'Lo siento, ocurrió un problema al procesar tu mensaje en este momento. Puedes pulsar **Reintentar** o volver a intentarlo en unos segundos.',
        { isError: true }
      );
    } finally {
      clearTimeout(timeoutId);
      setBusyState(false);
      if (!isPreview && input) input.focus();
    }
  }

  /* ---------- Reiniciar / Nueva conversación ---------- */
  async function startNewConversation(showConfirmation = true) {
    if (state.busy) return;
    clearError();
    state.lastFailedMessage = '';
    state.handoffShown = false;

    const previousSessionId = state.sessionId;
    try {
      const res = await fetch('/api/public/chat/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ sessionId: previousSessionId })
      });
      const data = await res.json().catch(() => ({}));
      if (data.sessionId) {
        saveSessionId(data.sessionId);
      } else {
        saveSessionId(makeSessionId());
      }
    } catch (_) {
      saveSessionId(makeSessionId());
    }

    if (messagesEl) messagesEl.innerHTML = '';
    const assistant = state.config?.assistant || {};
    const greeting =
      assistant.greeting || 'Hola, soy tu asesora virtual. ¿En qué puedo ayudarte hoy?';
    if (showConfirmation) {
      showNotice('Nueva conversación iniciada');
    }
    appendMessage('assistant', greeting);
    state.quickReplies = Array.isArray(assistant.quickReplies)
      ? assistant.quickReplies.slice(0, 6)
      : [];
    renderQuickReplies();
    if (input) {
      input.value = '';
      resizeInput();
      if (!isPreview) input.focus();
    }
  }

  /* ---------- Restaurar historial de sesión ---------- */
  async function loadSessionHistory() {
    if (!state.sessionId || isPreview) return false;
    try {
      const res = await fetch(
        `/api/public/chat/history?sessionId=${encodeURIComponent(state.sessionId)}`,
        { headers: { Accept: 'application/json' } }
      );
      if (!res.ok) return false;
      const data = await res.json();
      const history = Array.isArray(data.messages) ? data.messages : [];
      if (!history.length) return false;

      if (messagesEl) messagesEl.innerHTML = '';
      history.forEach((msg) => {
        if (msg.role === 'user' || msg.role === 'assistant') {
          appendMessage(msg.role, msg.content, { createdAt: msg.createdAt });
        }
      });
      state.greeted = true;
      return true;
    } catch (_) {
      return false;
    }
  }

  /* ---------- Entrada y controles ---------- */
  function updateCharCounter() {
    if (!charCounterEl || !input) return;
    const len = input.value.length;
    if (len === 0) {
      charCounterEl.classList.add('hidden');
      charCounterEl.classList.remove('warn');
      return;
    }
    charCounterEl.textContent = `${len}/${MAX_CHARS}`;
    charCounterEl.classList.toggle('hidden', len < 120);
    charCounterEl.classList.toggle('warn', len >= MAX_CHARS - 200);
  }

  function resizeInput() {
    if (!input) return;
    input.style.height = 'auto';
    input.style.height = `${Math.min(input.scrollHeight, 110)}px`;
    updateCharCounter();
  }

  function setPrefill(text) {
    if (!text || !input) return;
    input.value = String(text).slice(0, MAX_CHARS);
    resizeInput();
    input.focus();
  }

  function bindEvents() {
    if (input) {
      input.addEventListener('input', resizeInput);
      input.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' && !event.shiftKey) {
          event.preventDefault();
          sendMessage(input.value);
        }
      });
    }

    if (chatForm) {
      chatForm.addEventListener('submit', (event) => {
        event.preventDefault();
        if (input) sendMessage(input.value);
      });
    } else if (sendBtn) {
      sendBtn.addEventListener('click', () => {
        if (input) sendMessage(input.value);
      });
    }

    if (newChatBtn) {
      newChatBtn.addEventListener('click', () => startNewConversation(true));
    }

    if (errorRetryBtn) {
      errorRetryBtn.addEventListener('click', () => {
        if (!state.lastFailedMessage || state.busy) return;
        sendMessage(state.lastFailedMessage, { isRetry: true });
      });
    }

    if (errorCloseBtn) {
      errorCloseBtn.addEventListener('click', clearError);
    }
  }

  /* ---------- Tema y configuración ---------- */
  function applyTheme(config) {
    const widget = config.widget || {};
    const style = document.documentElement.style;
    if (widget.primaryColor) {
      style.setProperty('--chat-primary', widget.primaryColor);
      style.setProperty('--chat-primary-dark', shade(widget.primaryColor, 0.76));
    }
    if (widget.accentColor) style.setProperty('--chat-accent', widget.accentColor);
    if (subtitleEl) {
      if (widget.subtitle) subtitleEl.textContent = widget.subtitle;
      else if (config.business && config.business.hours) subtitleEl.textContent = config.business.hours;
    }

    const aiInfo = config.ai || {};
    if (aiInfo.provider === 'gemini') {
      state.providerLabel = 'Gemini AI';
    } else if (aiInfo.provider && aiInfo.provider !== 'demo') {
      state.providerLabel = aiInfo.provider.toUpperCase();
    } else {
      state.providerLabel = 'Gemini AI';
    }

    if (providerPillEl) {
      providerPillEl.textContent = state.providerLabel;
      providerPillEl.title = aiInfo.model
        ? `Motor IA: ${state.providerLabel} (${aiInfo.model})`
        : `Motor IA: ${state.providerLabel}`;
    }
  }

  async function boot() {
    ensureSession();
    bindEvents();
    resizeInput();

    const prefill = params.get('prefill') || '';
    if (prefill) setPrefill(prefill);

    window.addEventListener('message', (event) => {
      const data = event.data;
      if (!data || typeof data !== 'object') return;
      if (data.type === 'colageno:prefill' && data.text) setPrefill(data.text);
      if (data.type === 'colageno:reset') startNewConversation(true);
    });

    try {
      const res = await fetch('/api/public/config', { headers: { Accept: 'application/json' } });
      if (!res.ok) throw new Error('No se pudo cargar la configuración del asistente.');
      state.config = await res.json();
    } catch (err) {
      if (messagesEl) {
        messagesEl.innerHTML = `<div class="chat-loading">${esc(
          err.message || 'No se pudo iniciar el asistente.'
        )}</div>`;
      }
      if (input) input.disabled = true;
      if (sendBtn) sendBtn.disabled = true;
      return;
    }

    const config = state.config;
    applyTheme(config);
    const assistant = config.assistant || {};
    state.assistantName = assistant.name || 'Asistente virtual';
    if (nameEl) nameEl.textContent = state.assistantName;
    document.title = `${state.assistantName} · ${config.business?.name || 'Colágeno Vital'}`;

    if (config.widget && config.widget.enabled === false && !isPreview) {
      if (messagesEl) {
        messagesEl.innerHTML =
          '<div class="chat-loading">El asistente no está disponible en este momento.</div>';
      }
      if (input) input.disabled = true;
      if (sendBtn) sendBtn.disabled = true;
      return;
    }

    const restored = await loadSessionHistory();
    if (!restored) {
      const greeting =
        assistant.greeting || 'Hola, soy tu asesora virtual. ¿En qué puedo ayudarte hoy?';
      appendMessage('assistant', greeting);
      state.greeted = true;
      state.quickReplies = Array.isArray(assistant.quickReplies)
        ? assistant.quickReplies.slice(0, 6)
        : [];
      renderQuickReplies();
    }

    try {
      window.parent.postMessage({ type: 'colageno:ready' }, '*');
    } catch (_) {
      /* ignore */
    }

    if (!isPreview && input) input.focus();
  }

  boot();
})();
