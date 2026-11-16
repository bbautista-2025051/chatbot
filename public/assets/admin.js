'use strict';

/* =========================================================
   Arranque del panel
   ========================================================= */
document.addEventListener('DOMContentLoaded', async () => {
  bindGlobalEvents();

  try {
    const res = await fetch('/api/admin/auth/me', { credentials: 'same-origin' });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.authenticated) {
      if (data.baseUrl) state.baseUrl = data.baseUrl;
      await bootApp();
    } else {
      showLogin();
    }
  } catch (_) {
    showLogin();
  }
});
