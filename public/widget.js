'use strict';

/* =========================================================
   Widget flotante embebible · Colágeno Vital (Gemini AI)
   Uso: <script src="https://tu-dominio.com/widget.js" defer></script>
   ========================================================= */
(function () {
  if (window.__colagenoWidgetLoaded) return;
  window.__colagenoWidgetLoaded = true;

  const script = document.currentScript;
  const scriptUrl = script && script.src ? script.src : window.location.href;
  let origin = window.location.origin;
  try {
    origin = new URL(scriptUrl).origin;
  } catch (_) {
    /* usa el origen actual */
  }

  const STORAGE_KEY = 'colageno_widget_seen';
  const MOBILE_BREAKPOINT = 560;

  let config = null;
  let root = null;
  let panel = null;
  let fab = null;
  let bubble = null;
  let iframe = null;
  let isOpen = false;
  let pendingPrefill = '';
  let iframeReady = false;
  let lastFocused = null;

  const ICON_CHAT =
    '<svg class="cgw-icon-chat" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 9.6 9.6 0 0 1-3.8-.8L3 21l1.9-4.6a8.4 8.4 0 1 1 16.1-4.9z"/><path d="M8 11h.01M12 11h.01M16 11h.01"/></svg>';
  const ICON_CLOSE =
    '<svg class="cgw-icon-close" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';

  const CSS = `
    .cgw-root {
      position: fixed;
      z-index: 2147483000;
      right: 22px;
      bottom: 22px;
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      gap: 12px;
      pointer-events: none;
      font-family: ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    }
    .cgw-root.cgw-left {
      right: auto;
      left: 22px;
      align-items: flex-start;
    }
    .cgw-panel {
      width: 396px;
      height: min(630px, calc(100vh - 118px));
      min-height: 420px;
      background: #fff;
      border-radius: 20px;
      border: 1px solid rgba(13, 122, 104, 0.16);
      box-shadow: 0 32px 80px -20px rgba(8, 45, 38, 0.42), 0 8px 24px -10px rgba(8, 45, 38, 0.22);
      overflow: hidden;
      position: relative;
      opacity: 0;
      visibility: hidden;
      transform: translateY(14px) scale(0.97);
      transform-origin: bottom right;
      pointer-events: none;
      transition: opacity 0.22s ease, transform 0.24s cubic-bezier(0.22, 1, 0.36, 1), visibility 0.22s;
    }
    .cgw-root.cgw-left .cgw-panel {
      transform-origin: bottom left;
    }
    .cgw-panel.cgw-open {
      opacity: 1;
      visibility: visible;
      transform: translateY(0) scale(1);
      pointer-events: auto;
    }
    .cgw-panel iframe {
      width: 100%;
      height: 100%;
      border: 0;
      display: block;
      background: #fff;
    }
    .cgw-close {
      position: absolute;
      top: 17px;
      right: 12px;
      width: 30px;
      height: 30px;
      border-radius: 8px;
      border: 1px solid rgba(255, 255, 255, 0.28);
      background: rgba(255, 255, 255, 0.14);
      color: #fff;
      display: grid;
      place-items: center;
      cursor: pointer;
      z-index: 3;
      padding: 0;
      transition: background 0.15s ease, border-color 0.15s ease, transform 0.12s ease;
      backdrop-filter: blur(4px);
    }
    .cgw-close:hover {
      background: rgba(255, 255, 255, 0.28);
      border-color: rgba(255, 255, 255, 0.45);
    }
    .cgw-close:active {
      transform: scale(0.94);
    }
    .cgw-close:focus-visible {
      outline: 2px solid #fff;
      outline-offset: 2px;
    }
    .cgw-close svg {
      width: 15px;
      height: 15px;
    }
    .cgw-fab {
      position: relative;
      width: 60px;
      height: 60px;
      border-radius: 50%;
      border: 0;
      cursor: pointer;
      display: grid;
      place-items: center;
      color: #fff;
      background: linear-gradient(135deg, #0d7a68 0%, #09594c 100%);
      box-shadow: 0 16px 34px -10px rgba(8, 60, 50, 0.55), 0 4px 12px rgba(8, 60, 50, 0.22);
      transition: transform 0.18s cubic-bezier(0.22, 1, 0.36, 1), box-shadow 0.18s ease, background 0.18s ease;
      padding: 0;
      pointer-events: auto;
    }
    .cgw-fab:hover {
      transform: translateY(-2px) scale(1.03);
      box-shadow: 0 20px 42px -12px rgba(8, 60, 50, 0.65), 0 6px 14px rgba(8, 60, 50, 0.28);
    }
    .cgw-fab:active {
      transform: translateY(0) scale(0.95);
    }
    .cgw-fab:focus-visible {
      outline: 3px solid rgba(13, 122, 104, 0.45);
      outline-offset: 3px;
    }
    .cgw-fab svg {
      width: 26px;
      height: 26px;
      transition: transform 0.2s ease, opacity 0.18s ease;
    }
    .cgw-fab .cgw-icon-close {
      position: absolute;
      opacity: 0;
      transform: rotate(-45deg) scale(0.7);
    }
    .cgw-fab.cgw-fab-open .cgw-icon-chat {
      opacity: 0;
      transform: rotate(45deg) scale(0.7);
    }
    .cgw-fab.cgw-fab-open .cgw-icon-close {
      opacity: 1;
      transform: rotate(0deg) scale(1);
    }
    .cgw-fab::after {
      content: '';
      position: absolute;
      width: 60px;
      height: 60px;
      border-radius: 50%;
      border: 2px solid currentColor;
      opacity: 0;
      pointer-events: none;
      animation: cgw-pulse 3.2s ease-out infinite;
    }
    .cgw-fab.cgw-fab-open::after {
      animation: none;
      opacity: 0;
    }
    @keyframes cgw-pulse {
      0% { transform: scale(1); opacity: 0.35; }
      55% { transform: scale(1.52); opacity: 0; }
      100% { transform: scale(1.52); opacity: 0; }
    }
    .cgw-note {
      position: relative;
      background: #fff;
      color: #142a24;
      font-size: 12.5px;
      line-height: 1.45;
      padding: 11px 14px;
      border-radius: 14px;
      border: 1px solid #dce6e1;
      box-shadow: 0 14px 32px -14px rgba(8, 60, 50, 0.38);
      max-width: 245px;
      cursor: pointer;
      opacity: 0;
      visibility: hidden;
      transform: translateY(6px);
      pointer-events: none;
      transition: opacity 0.2s ease, transform 0.2s ease, border-color 0.15s ease, visibility 0.2s;
    }
    .cgw-note:hover {
      border-color: #9fd0c4;
      transform: translateY(-1px);
    }
    .cgw-note:focus-visible {
      outline: 2px solid #0d7a68;
      outline-offset: 2px;
    }
    .cgw-note.cgw-show {
      opacity: 1;
      visibility: visible;
      transform: translateY(0);
      pointer-events: auto;
    }
    .cgw-note strong {
      display: block;
      font-size: 12.5px;
      color: #0d7a68;
      margin-bottom: 2px;
    }
    .cgw-note span {
      color: #556b64;
    }
    .cgw-note::after {
      content: '';
      position: absolute;
      bottom: -6px;
      right: 24px;
      width: 11px;
      height: 11px;
      background: #fff;
      border-right: 1px solid #dce6e1;
      border-bottom: 1px solid #dce6e1;
      transform: rotate(45deg);
    }
    .cgw-root.cgw-left .cgw-note::after {
      right: auto;
      left: 24px;
    }
    .cgw-badge {
      position: absolute;
      top: 1px;
      right: 1px;
      width: 13px;
      height: 13px;
      border-radius: 50%;
      background: #d97736;
      border: 2px solid #fff;
      opacity: 0;
      transition: opacity 0.2s;
    }
    .cgw-badge.cgw-show {
      opacity: 1;
    }
    @media (max-width: ${MOBILE_BREAKPOINT}px) {
      .cgw-root,
      .cgw-root.cgw-left {
        right: 0;
        left: 0;
        bottom: 0;
        gap: 0;
        align-items: stretch;
      }
      .cgw-panel {
        width: 100%;
        height: 100dvh;
        min-height: 100dvh;
        border-radius: 0;
        border: 0;
        transform: translateY(20px);
      }
      .cgw-root.cgw-left .cgw-panel {
        transform: translateY(20px);
      }
      .cgw-panel.cgw-open {
        transform: translateY(0);
      }
      .cgw-fab {
        position: fixed;
        right: 18px;
        bottom: 18px;
        width: 56px;
        height: 56px;
      }
      .cgw-fab.cgw-fab-open {
        opacity: 0;
        pointer-events: none;
        transform: scale(0.8);
      }
      .cgw-root.cgw-left .cgw-fab {
        left: 18px;
        right: auto;
      }
      .cgw-note {
        position: fixed;
        right: 18px;
        bottom: 84px;
        max-width: calc(100% - 36px);
      }
      .cgw-root.cgw-left .cgw-note {
        left: 18px;
        right: auto;
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .cgw-panel,
      .cgw-fab,
      .cgw-note {
        transition: none;
      }
      .cgw-fab::after {
        animation: none;
      }
    }
  `;

  function injectStyles() {
    if (document.getElementById('cgw-styles')) return;
    const style = document.createElement('style');
    style.id = 'cgw-styles';
    style.textContent = CSS;
    document.head.appendChild(style);
  }

  function build() {
    root = document.createElement('div');
    root.className = 'cgw-root';
    root.setAttribute('data-colageno-widget', 'true');

    panel = document.createElement('div');
    panel.className = 'cgw-panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', 'Ventana de conversación del asistente con IA');
    panel.setAttribute('aria-hidden', 'true');

    iframe = document.createElement('iframe');
    iframe.src = `${origin}/embed.html?widget=1`;
    iframe.title = 'Asistente virtual con Google Gemini AI';
    iframe.setAttribute('allow', 'clipboard-write');
    iframe.addEventListener('load', () => {
      if (pendingPrefill) {
        postPrefill(pendingPrefill);
        pendingPrefill = '';
      }
    });

    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'cgw-close';
    close.setAttribute('aria-label', 'Cerrar ventana del asistente');
    close.setAttribute('title', 'Cerrar chat (Esc)');
    close.innerHTML = ICON_CLOSE;
    close.addEventListener('click', () => closeWidget());

    panel.appendChild(iframe);
    panel.appendChild(close);

    bubble = document.createElement('div');
    bubble.className = 'cgw-note';
    bubble.setAttribute('role', 'button');
    bubble.tabIndex = 0;
    bubble.innerHTML =
      '<strong>¿Necesitas ayuda?</strong><span>Consulta a nuestro asistente con IA en segundos.</span>';

    fab = document.createElement('button');
    fab.type = 'button';
    fab.className = 'cgw-fab';
    fab.setAttribute('aria-label', 'Abrir el chat del asistente con IA');
    fab.setAttribute('title', 'Abrir o cerrar asistente con IA');
    fab.setAttribute('aria-expanded', 'false');
    fab.innerHTML = `${ICON_CHAT}${ICON_CLOSE}<span class="cgw-badge"></span>`;
    fab.addEventListener('click', () => (isOpen ? closeWidget() : openWidget()));

    bubble.addEventListener('click', () => openWidget());
    bubble.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        openWidget();
      }
    });

    root.appendChild(panel);
    root.appendChild(bubble);
    root.appendChild(fab);
    document.body.appendChild(root);

    window.addEventListener('message', (event) => {
      if (!iframe || event.source !== iframe.contentWindow) return;
      const data = event.data;
      if (!data || typeof data !== 'object') return;
      if (data.type === 'colageno:ready') {
        iframeReady = true;
        if (pendingPrefill) {
          postPrefill(pendingPrefill);
          pendingPrefill = '';
        }
      } else if (data.type === 'colageno:close') {
        closeWidget();
      }
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && isOpen) closeWidget();
    });

    maybeShowNote();
  }

  function applyConfig(widget) {
    const settings = widget || {};
    if (settings.primaryColor) {
      fab.style.background = settings.primaryColor;
      fab.style.color = '#fff';
    }
    if (settings.accentColor) {
      const badge = fab.querySelector('.cgw-badge');
      if (badge) badge.style.background = settings.accentColor;
    }
    if (settings.position === 'left') root.classList.add('cgw-left');
    if (settings.bubbleText) {
      bubble.innerHTML = `<strong>${escapeHtml(settings.bubbleText)}</strong><span>Pregúntale a nuestro asistente con IA.</span>`;
    }
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function postPrefill(text) {
    if (!iframe || !iframe.contentWindow) return;
    try {
      iframe.contentWindow.postMessage({ type: 'colageno:prefill', text }, origin);
    } catch (_) {
      /* ignore */
    }
  }

  function maybeShowNote() {
    let seen = false;
    try {
      seen = window.localStorage.getItem(STORAGE_KEY) === '1';
    } catch (_) {
      seen = false;
    }
    if (seen) return;
    setTimeout(() => {
      if (isOpen || !bubble) return;
      bubble.classList.add('cgw-show');
      const badge = fab.querySelector('.cgw-badge');
      if (badge) badge.classList.add('cgw-show');
    }, 2800);
  }

  function dismissNote() {
    if (!bubble) return;
    bubble.classList.remove('cgw-show');
    const badge = fab.querySelector('.cgw-badge');
    if (badge) badge.classList.remove('cgw-show');
    try {
      window.localStorage.setItem(STORAGE_KEY, '1');
    } catch (_) {
      /* ignore */
    }
  }

  function openWidget(prefill) {
    if (!root) return;
    lastFocused = document.activeElement;
    isOpen = true;
    dismissNote();
    panel.classList.add('cgw-open');
    panel.setAttribute('aria-hidden', 'false');
    fab.classList.add('cgw-fab-open');
    fab.setAttribute('aria-expanded', 'true');
    fab.setAttribute('aria-label', 'Cerrar el chat del asistente con IA');
    if (window.innerWidth <= MOBILE_BREAKPOINT) {
      document.body.style.overflow = 'hidden';
    }
    const text = typeof prefill === 'string' ? prefill.trim() : '';
    if (text) {
      if (iframeReady) postPrefill(text);
      else pendingPrefill = text;
    }
    setTimeout(() => {
      try {
        iframe.focus();
      } catch (_) {
        /* ignore */
      }
    }, 120);
  }

  function closeWidget() {
    if (!root) return;
    isOpen = false;
    panel.classList.remove('cgw-open');
    panel.setAttribute('aria-hidden', 'true');
    fab.classList.remove('cgw-fab-open');
    fab.setAttribute('aria-expanded', 'false');
    fab.setAttribute('aria-label', 'Abrir el chat del asistente con IA');
    document.body.style.overflow = '';
    if (lastFocused && typeof lastFocused.focus === 'function') {
      lastFocused.focus();
    }
    lastFocused = null;
  }

  function toggle(prefill) {
    if (isOpen) closeWidget();
    else openWidget(prefill);
  }

  function start() {
    if (!document.body) return;
    injectStyles();
    build();

    window.ColagenoWidget = {
      open: (prefill) => openWidget(prefill),
      close: () => closeWidget(),
      toggle: (prefill) => toggle(prefill),
      isOpen: () => isOpen
    };

    fetch(`${origin}/api/public/config`, { headers: { Accept: 'application/json' } })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        config = data;
        if (!data || !data.widget) return;
        if (data.widget.enabled === false) {
          root.style.display = 'none';
          return;
        }
        applyConfig(data.widget);
      })
      .catch(() => {
        /* el widget funciona con la configuración por defecto */
      });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
