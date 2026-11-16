'use strict';

/* =========================================================
   Conversaciones y leads
   ========================================================= */
const LEAD_STATUSES = [
  { id: 'nuevo', label: 'Nuevo' },
  { id: 'contactado', label: 'Contactado' },
  { id: 'cliente', label: 'Cliente' },
  { id: 'descartado', label: 'Descartado' }
];

function leadStatusBadge(status) {
  const label = (LEAD_STATUSES.find((item) => item.id === status) || LEAD_STATUSES[0]).label;
  const cls =
    status === 'cliente'
      ? 'badge-ok'
      : status === 'contactado'
        ? 'badge-warn'
        : status === 'descartado'
          ? 'badge-neutral'
          : 'badge-info';
  return `<span class="badge ${cls}">${esc(label)}</span>`;
}

function leadStatusOptions(current) {
  return LEAD_STATUSES.map(
    (item) => `<option value="${item.id}" ${item.id === current ? 'selected' : ''}>${esc(item.label)}</option>`
  ).join('');
}

function renderConversations() {
  $('#topbar-actions').innerHTML = `
    <a class="btn btn-secondary btn-sm" href="/api/admin/leads/export.csv" download>${ICONS.download} Exportar leads</a>
    <button class="btn btn-sm" type="button" id="refresh-conv">${ICONS.refresh} Actualizar</button>`;

  const chatsActive = state.convView !== 'leads';
  const newLeads = state.leads.filter((lead) => lead.status === 'nuevo').length;

  $('#view').innerHTML = `
    <div class="flex" style="justify-content:space-between;align-items:center;gap:10px;margin-bottom:16px;flex-wrap:wrap">
      <div class="flex" style="gap:6px">
        <button class="btn btn-sm ${chatsActive ? '' : 'btn-secondary'}" type="button" data-convview="chats">
          ${ICONS.chat} Conversaciones
        </button>
        <button class="btn btn-sm ${chatsActive ? 'btn-secondary' : ''}" type="button" data-convview="leads">
          ${ICONS.users} Leads
          ${newLeads ? `<span class="badge badge-primary" style="margin-left:6px">${newLeads}</span>` : ''}
        </button>
      </div>
      <span class="small faint" id="conv-summary"></span>
    </div>
    <div id="conv-body"></div>`;

  $$('[data-convview]').forEach((button) => {
    button.addEventListener('click', () => {
      if (state.convView === button.dataset.convview) return;
      state.convView = button.dataset.convview;
      renderConversations();
    });
  });

  $('#refresh-conv')?.addEventListener('click', async () => {
    try {
      await Promise.all([loadOverview(), loadLeads()]);
      updateNavBadges();
      await refreshConversationsView();
      toast('Información actualizada');
    } catch (err) {
      toast(err.message, 'error');
    }
  });

  $('#conv-body').innerHTML = loadingHTML();
  refreshConversationsView();
}

async function refreshConversationsView() {
  const body = $('#conv-body');
  if (!body) return;
  try {
    if (state.tab !== 'conversations') return;
    if (state.convView === 'leads') {
      await loadLeads();
      if (!$('#conv-body') || state.tab !== 'conversations') return;
      paintLeads();
      return;
    }
    await loadConversations();
    if (!$('#conv-body') || state.tab !== 'conversations') return;
    paintConversations();
    const visible = filteredConversations();
    const stillVisible = visible.some((conversation) => conversation.id === state.activeConversation);
    if (!stillVisible) {
      state.activeConversation = visible.length ? visible[0].id : null;
      state.activeConvData = null;
      if (state.activeConversation) openConversation(state.activeConversation);
      else paintConvDetail();
    } else {
      paintConvDetail();
    }
  } catch (err) {
    const box = $('#conv-body');
    if (box) {
      box.innerHTML = `<div class="alert alert-danger">${ICONS.warning}<div>${esc(err.message)}</div></div>`;
    }
  }
}

async function loadConversations() {
  const data = await api('/conversations');
  state.conversations = data.conversations || [];
  return data;
}

async function loadLeads() {
  const data = await api('/leads');
  state.leads = data.leads || [];
  return data;
}

function filteredConversations() {
  const query = String(state.convQuery || '').trim().toLowerCase();
  return (state.conversations || []).filter((conversation) => {
    if (state.convChannel && conversation.channel !== state.convChannel) return false;
    if (!query) return true;
    const haystack = [
      conversation.userName,
      conversation.externalId,
      conversation.lastMessage,
      CHANNEL_LABELS[conversation.channel] || conversation.channel
    ]
      .join(' ')
      .toLowerCase();
    return haystack.includes(query);
  });
}

function paintConversations() {
  const body = $('#conv-body');
  if (!body) return;
  const visible = filteredConversations();
  const channels = Array.from(
    new Set(['web', 'whatsapp', 'messenger', 'instagram', 'telegram', ...(state.conversations || []).map((item) => item.channel)])
  ).filter(Boolean);

  const summary = $('#conv-summary');
  if (summary) {
    summary.textContent = `${fmtNumber(state.conversations.length)} conversaciones · ${fmtNumber(state.leads.length)} leads`;
  }

  body.innerHTML = `
    <div class="conv-layout">
      <div class="conv-list-card">
        <div class="conv-tools">
          <div class="search">
            ${ICONS.search}
            <input id="conv-search" type="search" placeholder="Buscar por nombre o mensaje..." value="${esc(state.convQuery || '')}" />
          </div>
          <select id="conv-channel">
            <option value="">Todos los canales</option>
            ${channels
              .map(
                (channel) =>
                  `<option value="${esc(channel)}" ${state.convChannel === channel ? 'selected' : ''}>${esc(
                    CHANNEL_LABELS[channel] || channel
                  )}</option>`
              )
              .join('')}
          </select>
        </div>
        <div class="conv-list" id="conv-list">${conversationItems(visible)}</div>
      </div>
      <div class="conv-detail" id="conv-detail"></div>
    </div>`;

  bindConversationFilters();
  bindConvListEvents();
}

function conversationItems(list) {
  if (!list.length) {
    const empty = state.conversations.length
      ? `<div class="empty" style="padding:36px 18px">
          <div class="empty-icon">${ICONS.search}</div>
          <h4>Sin resultados</h4>
          <p>Prueba con otro nombre o cambia el filtro de canal.</p>
        </div>`
      : `<div class="empty" style="padding:36px 18px">
          <div class="empty-icon">${ICONS.chat}</div>
          <h4>Aún no hay conversaciones</h4>
          <p>Cuando un cliente escriba por el widget, WhatsApp, Instagram, Messenger o Telegram aparecerá aquí.</p>
        </div>`;
    return empty;
  }
  return list
    .map(
      (conversation) => `
      <div class="conv-item ${conversation.id === state.activeConversation ? 'active' : ''}" data-conv-id="${esc(
        conversation.id
      )}">
        <div class="avatar ${avatarTone(conversation.userName)}">${esc(initials(conversation.userName))}</div>
        <div class="conv-item-main">
          <div class="conv-item-top">
            <span class="conv-item-name">${esc(conversation.userName || 'Visitante')}</span>
            <span class="conv-item-time">${fmtRelative(conversation.updatedAt)}</span>
          </div>
          <div class="conv-item-msg">${esc(truncateText(conversation.lastMessage || 'Sin mensajes', 64))}</div>
          <div class="conv-item-tags">
            ${channelBadge(conversation.channel)}
            ${
              conversation.needsHuman
                ? '<span class="badge badge-warn">Requiere asesor</span>'
                : `<span class="badge badge-neutral">${fmtNumber(conversation.messageCount)} msj</span>`
            }
            ${conversation.leadStatus ? leadStatusBadge(conversation.leadStatus) : ''}
          </div>
        </div>
      </div>`
    )
    .join('');
}

function paintConvList() {
  const list = $('#conv-list');
  if (!list) return;
  list.innerHTML = conversationItems(filteredConversations());
}

function bindConversationFilters() {
  const search = $('#conv-search');
  const onSearch = debounce(() => {
    state.convQuery = search ? search.value : '';
    const list = $('#conv-list');
    if (list) list.innerHTML = conversationItems(filteredConversations());
    bindConvListEvents();
  }, 180);
  search?.addEventListener('input', onSearch);
  search?.addEventListener('search', onSearch);
  $('#conv-channel')?.addEventListener('change', (event) => {
    state.convChannel = event.target.value;
    const list = $('#conv-list');
    if (list) list.innerHTML = conversationItems(filteredConversations());
    bindConvListEvents();
  });
}

function bindConvListEvents() {
  $$('#conv-list .conv-item').forEach((item) => {
    item.addEventListener('click', () => openConversation(item.dataset.convId));
  });
}

async function openConversation(id) {
  if (!id) return;
  state.activeConversation = id;
  $$('#conv-list .conv-item').forEach((item) => {
    item.classList.toggle('active', item.dataset.convId === id);
  });
  const detail = $('#conv-detail');
  if (detail && !state.activeConvData) {
    detail.innerHTML = `<div class="transcript-empty"><span class="spinner dark" style="margin-bottom:10px"></span><div>Cargando conversación...</div></div>`;
  }
  try {
    const data = await api(`/conversations/${id}`);
    if (state.activeConversation !== id) return;
    state.activeConvData = data;
    paintConvDetail();
  } catch (err) {
    if (detail) {
      detail.innerHTML = `<div class="alert alert-danger" style="margin:16px">${ICONS.warning}<div>${esc(err.message)}</div></div>`;
    }
  }
}

function transcriptMessage(message) {
  const isUser = message.role === 'user';
  const sources = Array.isArray(message.sources) ? message.sources : [];
  const chips = sources.length
    ? `<div class="source-chips">${sources
        .slice(0, 4)
        .map(
          (source) =>
            `<span class="source-chip" title="${esc(source.url || 'Documento interno')}">${ICONS.text} ${esc(
              truncateText(source.name || 'Fuente', 34)
            )}</span>`
        )
        .join('')}</div>`
    : '';
  const meta = [
    isUser ? 'Cliente' : esc(state.settings?.ai?.assistantName || 'Asistente'),
    message.ts
      ? new Date(message.ts).toLocaleString('es-ES', {
          day: '2-digit',
          month: 'short',
          hour: '2-digit',
          minute: '2-digit'
        })
      : '',
    message.model ? esc(message.model) : ''
  ]
    .filter(Boolean)
    .join(' · ');
  const bodyHtml = isUser
    ? `<p style="margin:0">${esc(message.content || '').replace(/\r?\n/g, '<br />')}</p>`
    : renderMarkdown(message.content || '');
  return `<div class="msg ${isUser ? 'user' : 'assistant'}">
    <div style="max-width:100%">
      <div class="bubble ${isUser ? '' : 'md-content'}">${bodyHtml}</div>
      ${chips}
      <div class="msg-meta">${meta}</div>
    </div>
  </div>`;
}

function leadStrip(lead) {
  if (!lead) {
    return `<div class="lead-strip"><span class="small muted">Aún no hay datos de contacto de este cliente.</span></div>`;
  }
  return `<div class="lead-strip">
    <strong>${esc(lead.name || 'Lead sin nombre')}</strong>
    ${lead.phone ? `<span>${esc(lead.phone)}</span>` : ''}
    ${lead.email ? `<span>${esc(lead.email)}</span>` : ''}
    <span class="sep">•</span>
    <span class="small muted">Estado del lead</span>
    <select data-lead-status="${esc(lead.id)}">${leadStatusOptions(lead.status)}</select>
    <button class="btn btn-ghost btn-sm" type="button" data-edit-lead="${esc(lead.id)}">Editar datos</button>
  </div>`;
}

function paintConvDetail() {
  const box = $('#conv-detail');
  if (!box) return;
  const data = state.activeConvData;
  if (!data || !data.conversation) {
    box.innerHTML = `<div class="transcript-empty">
      <div class="empty-icon" style="margin-bottom:10px">${ICONS.chat}</div>
      <div><strong>Selecciona una conversación</strong><br /><span class="small">Elige un chat de la lista para ver el historial completo.</span></div>
    </div>`;
    return;
  }
  const conversation = data.conversation;
  const lead = data.lead;
  const messages = Array.isArray(conversation.messages) ? conversation.messages : [];

  box.innerHTML = `
    <div class="conv-detail-head">
      <div class="avatar ${avatarTone(conversation.userName)}">${esc(initials(conversation.userName))}</div>
      <div class="info">
        <strong>${esc(conversation.userName || 'Visitante')}</strong>
        <span>${esc(CHANNEL_LABELS[conversation.channel] || conversation.channel)} · ${fmtNumber(
          messages.length
        )} mensajes · ${fmtRelative(conversation.updatedAt)}</span>
      </div>
      <button class="btn btn-secondary btn-sm" type="button" data-toggle-human>
        ${conversation.needsHuman ? `${ICONS.check} Marcar atendida` : `${ICONS.users} Requiere asesor`}
      </button>
      <button class="btn-icon" type="button" data-delete-conv title="Eliminar conversación">${ICONS.trash}</button>
    </div>
    ${leadStrip(lead)}
    <div class="transcript" id="transcript">
      ${
        messages.length
          ? messages.map(transcriptMessage).join('')
          : `<div class="transcript-empty">Esta conversación todavía no tiene mensajes.</div>`
      }
    </div>`;

  bindConvDetailEvents(conversation, lead);
  const transcript = $('#transcript');
  if (transcript) transcript.scrollTop = transcript.scrollHeight;
}

function bindConvDetailEvents(conversation, lead) {
  $('[data-toggle-human]')?.addEventListener('click', async (event) => {
    const button = event.currentTarget;
    button.disabled = true;
    try {
      await api(`/conversations/${conversation.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ needsHuman: !conversation.needsHuman })
      });
      conversation.needsHuman = !conversation.needsHuman;
      const item = state.conversations.find((entry) => entry.id === conversation.id);
      if (item) item.needsHuman = conversation.needsHuman;
      paintConvList();
      bindConvListEvents();
      paintConvDetail();
      loadOverview().catch(() => {});
      toast(conversation.needsHuman ? 'Marcada como pendiente de asesor' : 'Conversación marcada como atendida');
    } catch (err) {
      toast(err.message, 'error');
      button.disabled = false;
    }
  });

  $('[data-delete-conv]')?.addEventListener('click', async () => {
    const ok = await confirmDialog(
      'Eliminar conversación',
      'Se eliminará el historial de esta conversación y su lead asociado. Esta acción no se puede deshacer.',
      'Eliminar'
    );
    if (!ok) return;
    try {
      await api(`/conversations/${conversation.id}`, { method: 'DELETE' });
      state.conversations = state.conversations.filter((entry) => entry.id !== conversation.id);
      state.activeConversation = null;
      state.activeConvData = null;
      toast('Conversación eliminada');
      await loadOverview().catch(() => {});
      updateNavBadges();
      await refreshConversationsView();
    } catch (err) {
      toast(err.message, 'error');
    }
  });

  $('[data-lead-status]')?.addEventListener('change', async (event) => {
    const select = event.currentTarget;
    try {
      const data = await api(`/leads/${select.dataset.leadStatus}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: select.value })
      });
      if (state.activeConvData) state.activeConvData.lead = data.lead;
      const existing = state.leads.find((entry) => entry.id === data.lead.id);
      if (existing) Object.assign(existing, data.lead);
      paintConvDetail();
      toast('Estado del lead actualizado');
    } catch (err) {
      toast(err.message, 'error');
    }
  });

  $('[data-edit-lead]')?.addEventListener('click', () => {
    const id = lead?.id;
    if (id) openLeadModal(id);
  });
}

/* ---------- Leads ---------- */
function paintLeads() {
  const body = $('#conv-body');
  if (!body) return;
  const listeners = state.leads;
  const rows = listeners.length
    ? listeners
        .map(
          (lead) => `<tr data-lead-row="${esc(lead.id)}">
            <td>
              <div class="source-name">
                <div class="avatar ${avatarTone(lead.name)}" style="width:32px;height:32px;font-size:11px">${esc(
                  initials(lead.name)
                )}</div>
                <div style="min-width:0">
                  <div class="s-name">${esc(lead.name || 'Sin nombre')}</div>
                  <div class="s-sub">${esc(lead.phone || lead.email || 'Sin contacto')}</div>
                </div>
              </div>
            </td>
            <td>${channelBadge(lead.channel)}</td>
            <td class="small muted" style="max-width:260px">${esc(truncateText(lead.interest || lead.lastMessage || '—', 90))}</td>
            <td>
              <select data-lead-row-status="${esc(lead.id)}" style="width:auto;font-size:11.5px;padding:4px 26px 4px 8px">
                ${leadStatusOptions(lead.status)}
              </select>
            </td>
            <td class="nowrap faint small">${fmtRelative(lead.updatedAt)}</td>
            <td>
              <div class="row-actions">
                <button class="btn-icon" type="button" data-lead-edit="${esc(lead.id)}" title="Editar">${ICONS.eye}</button>
                <button class="btn-icon" type="button" data-lead-delete="${esc(lead.id)}" title="Eliminar">${ICONS.trash}</button>
              </div>
            </td>
          </tr>`
        )
        .join('')
    : `<tr><td colspan="6">
        <div class="empty">
          <div class="empty-icon">${ICONS.users}</div>
          <h4>Todavía no hay leads</h4>
          <p>El asistente guarda aquí los contactos e intereses que los clientes comparten en la conversación.</p>
        </div>
      </td></tr>`;

  const summary = $('#conv-summary');
  if (summary) {
    summary.textContent = `${fmtNumber(state.leads.length)} leads capturados`;
  }

  body.innerHTML = `
    <div class="card">
      <div class="card-head">
        <div><h3>Leads capturados</h3><p>Personas interesadas en tus productos. Actualiza el estado para dar seguimiento.</p></div>
        <div class="flex">
          <a class="btn btn-ghost btn-sm" href="/api/admin/leads/export.csv" download>${ICONS.download} Exportar CSV</a>
        </div>
      </div>
      <div class="table-wrap">
        <table class="table">
          <thead>
            <tr>
              <th>Contacto</th>
              <th>Canal</th>
              <th>Interés</th>
              <th>Estado</th>
              <th>Actualizado</th>
              <th style="text-align:right">Acciones</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>`;

  $$('[data-lead-row-status]').forEach((select) => {
    select.addEventListener('change', async () => {
      try {
        await api(`/leads/${select.dataset.leadRowStatus}`, {
          method: 'PATCH',
          body: JSON.stringify({ status: select.value })
        });
        const lead = state.leads.find((entry) => entry.id === select.dataset.leadRowStatus);
        if (lead) lead.status = select.value;
        toast('Estado del lead actualizado');
      } catch (err) {
        toast(err.message, 'error');
      }
    });
  });

  $$('[data-lead-edit]').forEach((button) => {
    button.addEventListener('click', () => openLeadModal(button.dataset.leadEdit));
  });

  $$('[data-lead-delete]').forEach((button) => {
    button.addEventListener('click', async () => {
      const lead = state.leads.find((entry) => entry.id === button.dataset.leadDelete);
      const ok = await confirmDialog(
        'Eliminar lead',
        `Se eliminará el lead${lead?.name ? ` de "${lead.name}"` : ''} de la lista. La conversación se conserva.`,
        'Eliminar'
      );
      if (!ok) return;
      try {
        await api(`/leads/${button.dataset.leadDelete}`, { method: 'DELETE' });
        state.leads = state.leads.filter((entry) => entry.id !== button.dataset.leadDelete);
        toast('Lead eliminado');
        await loadOverview().catch(() => {});
        updateNavBadges();
        paintLeads();
      } catch (err) {
        toast(err.message, 'error');
      }
    });
  });
}

function openLeadModal(id) {
  const lead = state.leads.find((entry) => entry.id === id) || state.activeConvData?.lead;
  if (!lead) {
    toast('No se encontró el lead', 'error');
    return;
  }
  openModal({
    title: 'Editar lead',
    body: `
      <div class="grid-2">
        <div class="field"><label for="lead-name">Nombre <span class="req" aria-hidden="true">*</span></label><input id="lead-name" type="text" value="${esc(
          lead.name || ''
        )}" placeholder="Nombre del cliente" required /></div>
        <div class="field"><label for="lead-status">Estado</label><select id="lead-status">${leadStatusOptions(
          lead.status
        )}</select></div>
      </div>
      <div class="grid-2">
        <div class="field"><label for="lead-phone">Teléfono</label><input id="lead-phone" type="tel" value="${esc(
          lead.phone || ''
        )}" placeholder="+502 5500 0000" /></div>
        <div class="field"><label for="lead-email">Correo electrónico</label><input id="lead-email" type="email" value="${esc(
          lead.email || ''
        )}" placeholder="cliente@correo.com" /></div>
      </div>
      <div class="field"><label for="lead-notes">Notas de seguimiento</label><textarea id="lead-notes" rows="4" placeholder="Qué producto le interesa, cuándo volver a contactarlo...">${esc(
        lead.notes || ''
      )}</textarea></div>
      <div class="field"><label>Interés detectado</label><p class="small muted" style="line-height:1.55">${esc(
        lead.interest || 'Sin interés registrado'
      )}</p></div>`,
    footer: `
      <button class="btn btn-secondary" type="button" data-close>Cancelar</button>
      <button class="btn" type="button" id="lead-save">Guardar lead</button>`,
    onMount(el, close) {
      const nameInput = $('#lead-name', el);
      const emailInput = $('#lead-email', el);
      nameInput.addEventListener('input', () => clearFieldError(nameInput));
      emailInput.addEventListener('input', () => clearFieldError(emailInput));

      $('#lead-save', el).addEventListener('click', async (event) => {
        const nameVal = nameInput.value.trim();
        const emailVal = emailInput.value.trim();
        if (!nameVal) {
          setFieldError(nameInput, 'Ingresa el nombre del contacto.');
          nameInput.focus();
          return;
        }
        if (emailVal && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailVal)) {
          setFieldError(emailInput, 'Ingresa un correo electrónico válido.');
          emailInput.focus();
          return;
        }
        const button = event.currentTarget;
        button.disabled = true;
        button.innerHTML = '<span class="spinner"></span> Guardando...';
        try {
          const data = await api(`/leads/${lead.id}`, {
            method: 'PATCH',
            body: JSON.stringify({
              name: nameVal,
              phone: $('#lead-phone', el).value.trim(),
              email: emailVal,
              status: $('#lead-status', el).value,
              notes: $('#lead-notes', el).value.trim()
            })
          });
          const existing = state.leads.find((entry) => entry.id === lead.id);
          if (existing) Object.assign(existing, data.lead);
          if (state.activeConvData && state.activeConvData.lead && state.activeConvData.lead.id === lead.id) {
            state.activeConvData.lead = data.lead;
          }
          close();
          toast('Lead actualizado');
          if (state.convView === 'leads') paintLeads();
          else paintConvDetail();
        } catch (err) {
          toast(err.message, 'error');
          button.disabled = false;
          button.textContent = 'Guardar lead';
        }
      });
    }
  });
}

/* =========================================================
   Conexiones con redes sociales
   ========================================================= */
const CHANNEL_DEFS = {
  whatsapp: {
    label: 'WhatsApp Business',
    description: 'Responde automáticamente en tu número de WhatsApp.',
    icon: ICONS.wa,
    cls: 'wa',
    fields: [
      {
        key: 'phoneNumberId',
        label: 'Phone Number ID',
        required: true,
        placeholder: '123456789012345',
        hint: 'Lo encuentras en Meta for Developers → WhatsApp → Configuración de la API.'
      },
      {
        key: 'displayNumber',
        label: 'Número visible (opcional)',
        placeholder: '+502 5500 0000'
      },
      {
        key: 'accessToken',
        label: 'Token de acceso',
        required: true,
        secret: true,
        placeholder: 'EAAG...'
      },
      {
        key: 'verifyToken',
        label: 'Verify token',
        required: true,
        placeholder: 'Una palabra secreta que tú eliges',
        hint: 'Debe coincidir con el valor que configures en el webhook de Meta.'
      },
      {
        key: 'appSecret',
        label: 'App secret (recomendado)',
        secret: true,
        placeholder: 'Se usa para verificar la firma de Meta',
        hint: 'Sin App secret no se valida la firma de los mensajes entrantes.'
      }
    ],
    steps: [
      'Crea una app en <code>developers.facebook.com</code> y añade el producto WhatsApp.',
      'Copia el Phone Number ID y genera un token permanente de WhatsApp Business.',
      'En Webhooks, usa la URL de arriba y tu Verify token. Suscríbete a <code>messages</code>.',
      'Guarda los cambios aquí y activa el canal.'
    ]
  },
  messenger: {
    label: 'Facebook Messenger',
    description: 'Atiende los mensajes de tu página de Facebook.',
    icon: ICONS.ms,
    cls: 'ms',
    fields: [
      { key: 'pageId', label: 'Page ID', required: true, placeholder: '123456789012345' },
      {
        key: 'pageAccessToken',
        label: 'Page access token',
        required: true,
        secret: true,
        placeholder: 'EAAG...'
      },
      {
        key: 'verifyToken',
        label: 'Verify token',
        required: true,
        placeholder: 'Una palabra secreta que tú eliges',
        hint: 'Se usa al configurar el webhook en Meta.'
      },
      {
        key: 'appSecret',
        label: 'App secret (recomendado)',
        secret: true,
        placeholder: 'Verifica la firma de Meta'
      }
    ],
    steps: [
      'En Meta for Developers añade el producto Messenger a tu app.',
      'Genera un Page access token con permisos de mensajería.',
      'Configura el webhook con la URL de arriba y suscríbete a <code>messages</code> y <code>messaging_postbacks</code>.',
      'Guarda y activa el canal.'
    ]
  },
  instagram: {
    label: 'Instagram',
    description: 'Contesta los mensajes directos de tu cuenta profesional.',
    icon: ICONS.ig,
    cls: 'ig',
    fields: [
      {
        key: 'igUserId',
        label: 'Instagram user ID',
        required: true,
        placeholder: '17841400000000000',
        hint: 'ID de la cuenta profesional de Instagram vinculada a la página.'
      },
      {
        key: 'accessToken',
        label: 'Token de acceso',
        required: true,
        secret: true,
        placeholder: 'EAAG...'
      },
      {
        key: 'verifyToken',
        label: 'Verify token',
        required: true,
        placeholder: 'Una palabra secreta que tú eliges'
      },
      {
        key: 'appSecret',
        label: 'App secret (recomendado)',
        secret: true,
        placeholder: 'Verifica la firma de Meta'
      }
    ],
    steps: [
      'Convierte la cuenta a profesional y vincúlala a una página de Facebook.',
      'Añade el producto Instagram a tu app de Meta y genera un token con <code>instagram_manage_messages</code>.',
      'Configura el webhook con la URL de arriba y suscríbete a <code>messages</code>.',
      'Guarda y activa el canal.'
    ]
  },
  telegram: {
    label: 'Telegram',
    description: 'Conecta un bot de Telegram en minutos.',
    icon: ICONS.tg,
    cls: 'tg',
    fields: [
      {
        key: 'botToken',
        label: 'Token del bot',
        required: true,
        secret: true,
        placeholder: '123456:ABC-DEF...',
        hint: 'Te lo entrega @BotFather al crear el bot.'
      },
      {
        key: 'secret',
        label: 'Secreto del webhook',
        placeholder: 'Se genera automáticamente al guardar',
        hint: 'Forma parte de la URL del webhook. Puedes cambiarlo si lo necesitas.'
      }
    ],
    steps: [
      'Abre Telegram y escribe a <code>@BotFather</code>. Crea un bot con <code>/newbot</code>.',
      'Copia el token, pégalo arriba y guarda los cambios.',
      'Pulsa "Registrar webhook" para que Telegram envíe los mensajes a tu asistente.',
      'Activa el canal y escribe a tu bot para probarlo.'
    ]
  }
};

async function loadChannels() {
  const data = await api('/channels');
  state.channelStatus = data.status || null;
  return data;
}

function channelInput(channel, def, config) {
  const value = config[def.key] == null ? '' : config[def.key];
  const reqMark = def.required ? ' <span class="req" aria-hidden="true">*</span>' : '';
  return `<div class="field">
    <label>${esc(def.label)}${reqMark}</label>
    ${
      def.secret
        ? `<div class="input-group">
            <input type="password" data-ch-key="${esc(def.key)}" ${def.required ? 'data-ch-req="1"' : ''} value="${esc(
              value
            )}" placeholder="${esc(def.placeholder || '')}" autocomplete="off" />
            <button class="btn btn-secondary btn-sm" type="button" data-ch-toggle="${esc(def.key)}">Ver</button>
          </div>`
        : `<input type="text" data-ch-key="${esc(def.key)}" ${def.required ? 'data-ch-req="1"' : ''} value="${esc(
            value
          )}" placeholder="${esc(def.placeholder || '')}" autocomplete="off" />`
    }
    ${def.hint ? `<span class="hint">${def.hint}</span>` : ''}
  </div>`;
}

function channelCard(key) {
  const def = CHANNEL_DEFS[key];
  if (!def) return '';
  const config = (state.settings?.channels || {})[key] || {};
  const status = (state.channelStatus || {})[key] || {};
  const ready = Boolean(status.ready);
  const missing = Array.isArray(status.missing) ? status.missing.filter(Boolean) : [];

  return `<div class="channel-card" data-channel="${key}">
    <div class="channel-head">
      <div class="channel-logo ${def.cls}">${def.icon}</div>
      <div class="ch-meta">
        <strong>${esc(def.label)}</strong>
        <span>${esc(def.description)}</span>
      </div>
      <span class="badge ${ready ? 'badge-ok' : 'badge-neutral'} badge-dot">${ready ? 'Activo' : 'Inactivo'}</span>
    </div>
    <div class="channel-body">
      <div class="webhook-box">
        <code>${esc(status.webhookUrl || `${state.channelStatus?.baseUrl || state.baseUrl}/webhooks/${key}`)}</code>
        <button class="btn-icon" type="button" data-copy-webhook title="Copiar URL del webhook">${ICONS.copy}</button>
      </div>
      <label class="inline-field" style="cursor:pointer;margin-bottom:14px">
        <span class="switch"><input type="checkbox" data-ch-enabled ${config.enabled ? 'checked' : ''} /></span>
        <span class="small"><strong>Canal activo</strong></span>
      </label>
      ${def.fields.map((item) => channelInput(key, item, config)).join('')}
      ${
        missing.length
          ? `<div class="alert alert-warn" style="margin-top:6px;padding:9px 11px;font-size:11.5px">${ICONS.warning}<div>Falta configurar: ${missing
              .map((item) => esc(item))
              .join(', ')}.</div></div>`
          : ''
      }
      ${
        key === 'telegram'
          ? `<div class="section-actions">
              <button class="btn btn-secondary btn-sm" type="button" data-telegram-register>${ICONS.refresh} Registrar webhook</button>
              <button class="btn btn-ghost btn-sm" type="button" data-telegram-info>${ICONS.info} Estado del bot</button>
            </div>`
          : ''
      }
      <details class="channel-steps">
        <summary>¿Cómo conectarlo?</summary>
        <ol>${def.steps.map((step) => `<li>${step}</li>`).join('')}</ol>
      </details>
    </div>
    <div class="channel-foot">
      <span class="small muted">${ready ? 'Listo para recibir mensajes' : 'Aún no recibe mensajes'}</span>
      <button class="btn btn-sm" type="button" data-save-channel="${key}">Guardar ${esc(
        key === 'whatsapp' ? 'WhatsApp' : def.label.split(' ')[0]
      )}</button>
    </div>
  </div>`;
}

async function renderConnections() {
  const view = $('#view');
  if (!state.settings) {
    view.innerHTML = loadingHTML();
    try {
      await loadSettings();
    } catch (err) {
      view.innerHTML = `<div class="alert alert-danger">${ICONS.warning}<div>${esc(err.message)}</div></div>`;
      return;
    }
    if (state.tab !== 'connections') return;
  }
  try {
    await loadChannels();
  } catch (err) {
    toast(err.message, 'error');
  }
  if (state.tab !== 'connections') return;

  const base = state.channelStatus?.baseUrl || state.baseUrl || location.origin;
  view.innerHTML = `
    <div class="alert alert-info">${ICONS.info}<div>
      Los canales de Meta (WhatsApp, Messenger e Instagram) necesitan una dirección pública <strong>HTTPS</strong>.
      En producción usa tu dominio; para probar en tu computador puedes exponer el puerto con una herramienta como ngrok y
      actualizar <code>PUBLIC_BASE_URL</code>. Telegram sí funciona con ngrok sin problema.
    </div>
    <div class="alert alert-info" style="margin-top:12px">${ICONS.globe}<div>
      URL base actual: <code>${esc(base)}</code>. Los webhooks de abajo se calculan con esta dirección.
      <a href="#widget" data-goto="widget">El widget de la web se configura en su propia sección</a>.
    </div></div>
    <div class="channel-grid" id="channel-grid" style="margin-top:16px">
      ${Object.keys(CHANNEL_DEFS).map(channelCard).join('')}
    </div>`;

  $$('[data-goto]', view).forEach((el) => el.addEventListener('click', () => navigate(el.dataset.goto)));

  $('#channel-grid')?.addEventListener('click', (event) => {
    const copy = event.target.closest('[data-copy-webhook]');
    if (copy) {
      const code = copy.closest('.webhook-box')?.querySelector('code');
      if (code) {
        copyText(code.textContent).then((ok) => toast(ok ? 'URL copiada al portapapeles' : 'No se pudo copiar', ok ? 'ok' : 'error'));
      }
      return;
    }

    const toggle = event.target.closest('[data-ch-toggle]');
    if (toggle) {
      const input = toggle.closest('.input-group')?.querySelector('input');
      if (input) {
        input.type = input.type === 'password' ? 'text' : 'password';
        toggle.textContent = input.type === 'password' ? 'Ver' : 'Ocultar';
      }
      return;
    }

    const save = event.target.closest('[data-save-channel]');
    if (save) {
      saveChannel(save.dataset.saveChannel, save);
      return;
    }

    if (event.target.closest('[data-telegram-register]')) {
      registerTelegramWebhook(event.target.closest('[data-telegram-register]'));
      return;
    }

    if (event.target.closest('[data-telegram-info]')) {
      showTelegramInfo(event.target.closest('[data-telegram-info]'));
    }
  });

  $('#channel-grid')?.addEventListener('input', (event) => {
    if (event.target.matches('input')) {
      clearFieldError(event.target);
    }
  });
}

async function saveChannel(key, button) {
  const card = button.closest('.channel-card');
  if (!card) return;
  const isEnabled = Boolean($('[data-ch-enabled]', card)?.checked);
  const payload = { [key]: { enabled: isEnabled } };
  let firstInvalid = null;

  $$('[data-ch-key]', card).forEach((input) => {
    const val = input.value;
    payload[key][input.dataset.chKey] = val;
    if (isEnabled && input.dataset.chReq === '1' && !val.trim()) {
      setFieldError(input, 'Este campo es obligatorio para activar el canal.');
      firstInvalid = firstInvalid || input;
    } else {
      clearFieldError(input);
    }
  });

  if (firstInvalid) {
    firstInvalid.focus();
    toast('Completa los campos obligatorios marcados con * antes de activar el canal.', 'error');
    return;
  }

  const original = button.textContent;
  button.disabled = true;
  button.innerHTML = '<span class="spinner"></span> Guardando...';
  try {
    const data = await api('/channels', { method: 'PUT', body: JSON.stringify(payload) });
    state.channelStatus = data.status || state.channelStatus;
    if (state.settings && data.channels && data.channels[key]) {
      state.settings.channels[key] = data.channels[key];
    }
    await loadOverview().catch(() => {});
    toast('Canal guardado correctamente');
    renderConnections();
  } catch (err) {
    toast(err.message, 'error');
    button.disabled = false;
    button.textContent = original;
  }
}

async function registerTelegramWebhook(button) {
  const original = button.textContent;
  button.disabled = true;
  button.innerHTML = '<span class="spinner"></span> Registrando...';
  try {
    const data = await api('/channels/telegram/register', { method: 'POST' });
    state.channelStatus = data.status || state.channelStatus;
    await loadOverview().catch(() => {});
    toast('Webhook de Telegram registrado correctamente');
    renderConnections();
  } catch (err) {
    toast(err.message, 'error');
    button.disabled = false;
    button.innerHTML = original;
  }
}

async function showTelegramInfo(button) {
  const original = button.textContent;
  button.disabled = true;
  try {
    const data = await api('/channels/telegram/info');
    const me = data.me || {};
    const hook = data.webhook || {};
    openModal({
      title: 'Estado del bot de Telegram',
      body: `
        <div class="stack">
          <div class="card" style="box-shadow:none">
            <div class="card-body">
              <div class="debug-row"><span>Bot</span><strong>@${esc(me.username || '—')}</strong></div>
              <div class="debug-row"><span>Nombre</span><strong>${esc(me.first_name || '—')}</strong></div>
              <div class="debug-row"><span>Webhook</span><strong style="word-break:break-all">${esc(hook.url || 'Sin registrar')}</strong></div>
              <div class="debug-row"><span>Pendientes</span><strong>${fmtNumber(hook.pending_update_count || 0)}</strong></div>
              <div class="debug-row"><span>Último error</span><strong>${esc(hook.last_error_message || 'Ninguno')}</strong></div>
            </div>
          </div>
        </div>`,
      footer: '<button class="btn btn-secondary" data-close>Cerrar</button>'
    });
  } catch (err) {
    toast(err.message, 'error');
  } finally {
    button.disabled = false;
    button.innerHTML = original;
  }
}

/* =========================================================
   Widget web
   ========================================================= */
function renderWidget() {
  const view = $('#view');
  if (!state.settings) {
    view.innerHTML = loadingHTML();
    loadSettings()
      .then(() => {
        if (state.tab === 'widget') renderWidget();
      })
      .catch((err) => toast(err.message, 'error'));
    return;
  }

  const widget = state.settings.widget || {};
  const base = state.baseUrl || state.channelStatus?.baseUrl || location.origin;
  const snippet = `<script src="${base}/widget.js" defer></script>`;
  const previewUrl = `/embed.html?preview=1&t=${Date.now()}`;
  const enabled = widget.enabled !== false;

  $('#topbar-actions').innerHTML = `
    <a class="btn btn-secondary btn-sm" href="/embed.html" target="_blank" rel="noopener">${ICONS.external} Abrir widget</a>`;

  view.innerHTML = `
    <div class="widget-layout">
      <div class="stack">
        <form id="widget-form" autocomplete="off">
          <div class="card">
            <div class="card-head">
              <div><h3>Apariencia del widget</h3><p>Colores, textos y posición del botón flotante en tu web.</p></div>
              <span class="badge ${enabled ? 'badge-ok' : 'badge-neutral'} badge-dot">${enabled ? 'Activo' : 'Desactivado'}</span>
            </div>
            <div class="card-body">
              <label class="inline-field" style="cursor:pointer;margin-bottom:16px">
                <span class="switch"><input type="checkbox" data-path="widget.enabled" ${enabled ? 'checked' : ''} /></span>
                <span><strong style="font-size:13px">Mostrar el widget en la web</strong><br />
                <span class="small muted">Si lo desactivas, el chat embebido deja de responder.</span></span>
              </label>
              <div class="grid-2">
                <div class="field"><label>Título <span class="req" aria-hidden="true">*</span></label><input type="text" data-path="widget.title" value="${esc(
                  widget.title || ''
                )}" placeholder="Asistente virtual" required /></div>
                <div class="field"><label>Subtítulo <span class="req" aria-hidden="true">*</span></label><input type="text" data-path="widget.subtitle" value="${esc(
                  widget.subtitle || ''
                )}" placeholder="Respondemos en segundos" required /></div>
              </div>
              <div class="field"><label>Texto de la burbuja</label><input type="text" data-path="widget.bubbleText" value="${esc(
                widget.bubbleText || ''
              )}" placeholder="¿Buscas colágeno? Te ayudo." />
                <span class="hint">Se muestra junto al botón flotante la primera vez.</span>
              </div>
              <div class="grid-2">
                <div class="field"><label>Color principal</label><input type="color" data-path="widget.primaryColor" value="${esc(
                  widget.primaryColor || '#0e7a6a'
                )}" style="padding:4px;height:44px" /></div>
                <div class="field"><label>Color de acento</label><input type="color" data-path="widget.accentColor" value="${esc(
                  widget.accentColor || '#e0654d'
                )}" style="padding:4px;height:44px" /></div>
              </div>
              <div class="field">
                <label>Posición</label>
                <select data-path="widget.position">
                  <option value="right" ${widget.position !== 'left' ? 'selected' : ''}>Abajo a la derecha</option>
                  <option value="left" ${widget.position === 'left' ? 'selected' : ''}>Abajo a la izquierda</option>
                </select>
              </div>
              <div class="section-actions">
                <button class="btn" type="submit" id="save-widget">Guardar widget</button>
                <button class="btn btn-secondary btn-sm" type="button" id="reload-preview">${ICONS.refresh} Actualizar vista previa</button>
              </div>
            </div>
          </div>
        </form>

        <div class="card">
          <div class="card-head">
            <div><h3>Instalación en tu web</h3><p>Copia este código y pégalo antes de cerrar la etiqueta <code>&lt;/body&gt;</code>.</p></div>
            <span class="badge badge-primary">1 línea</span>
          </div>
          <div class="card-body">
            <div class="embed-code">
              <pre id="embed-snippet">${esc(snippet)}</pre>
              <button class="btn btn-secondary btn-sm copy-float" type="button" id="copy-embed">${ICONS.copy} Copiar</button>
            </div>
            <p class="small muted" style="margin-top:10px;line-height:1.6">
              Funciona en cualquier web (WordPress, Shopify, Wix, HTML propio). El script crea el botón flotante y carga el
              asistente en un iframe seguro. No necesitas instalar nada más.
            </p>
            <div class="divider"></div>
            <div class="grid-2">
              <div>
                <div class="small" style="font-weight:700;margin-bottom:4px">Enlace directo al chat</div>
                <div class="webhook-box" style="margin-bottom:0">
                  <code>${esc(base)}/embed.html</code>
                  <button class="btn-icon" type="button" data-copy-link title="Copiar enlace">${ICONS.copy}</button>
                </div>
              </div>
              <div>
                <div class="small" style="font-weight:700;margin-bottom:4px">Script del widget</div>
                <div class="webhook-box" style="margin-bottom:0">
                  <code>${esc(base)}/widget.js</code>
                  <button class="btn-icon" type="button" data-copy-script title="Copiar enlace">${ICONS.copy}</button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="card">
          <div class="card-body" style="display:flex;gap:12px;align-items:flex-start">
            <div class="stat-icon blue" style="flex:none">${ICONS.info}</div>
            <div>
              <div style="font-weight:700;font-size:13.5px;margin-bottom:3px">Consejo para publicarlo</div>
              <p class="small muted" style="line-height:1.6">
                El widget usa el dominio público del servidor donde está alojado este panel. Si cambias de dominio,
                actualiza <code>PUBLIC_BASE_URL</code> y vuelve a copiar el código. También puedes compartir el enlace directo
                por redes o incluirlo en un código QR.
              </p>
            </div>
          </div>
        </div>
      </div>

      <div class="widget-preview-wrap">
        <div class="widget-preview">
          <iframe id="widget-frame" src="${previewUrl}" title="Vista previa del widget"></iframe>
        </div>
        <p class="preview-note">Vista previa real del asistente. Los cambios se aplican al guardar.</p>
      </div>
    </div>`;

  bindWidgetEvents();
}

function bindWidgetEvents() {
  const form = $('#widget-form');
  form?.addEventListener('input', (event) => {
    if (event.target.matches('input')) clearFieldError(event.target);
  });
  form?.addEventListener('submit', (event) => {
    event.preventDefault();
    saveWidgetSettings($('#save-widget'));
  });

  $('#reload-preview')?.addEventListener('click', () => reloadWidgetPreview());
  $('#copy-embed')?.addEventListener('click', async () => {
    const text = $('#embed-snippet')?.textContent || '';
    const ok = await copyText(text);
    toast(ok ? 'Código copiado al portapapeles' : 'No se pudo copiar el código', ok ? 'ok' : 'error');
  });

  $('[data-copy-link]')?.addEventListener('click', async (event) => {
    const code = event.currentTarget.closest('.webhook-box')?.querySelector('code');
    if (!code) return;
    const ok = await copyText(code.textContent);
    toast(ok ? 'Enlace copiado' : 'No se pudo copiar', ok ? 'ok' : 'error');
  });

  $('[data-copy-script]')?.addEventListener('click', async (event) => {
    const code = event.currentTarget.closest('.webhook-box')?.querySelector('code');
    if (!code) return;
    const ok = await copyText(code.textContent);
    toast(ok ? 'Enlace copiado' : 'No se pudo copiar', ok ? 'ok' : 'error');
  });
}

function reloadWidgetPreview() {
  const frame = $('#widget-frame');
  if (frame) frame.src = `/embed.html?preview=1&t=${Date.now()}`;
}

async function saveWidgetSettings(button) {
  const form = $('#widget-form');
  if (!form) return;
  const titleInput = $('[data-path="widget.title"]', form);
  const subtitleInput = $('[data-path="widget.subtitle"]', form);
  let hasErr = false;
  if (titleInput && !titleInput.value.trim()) {
    setFieldError(titleInput, 'El título del widget es obligatorio.');
    hasErr = true;
  }
  if (subtitleInput && !subtitleInput.value.trim()) {
    setFieldError(subtitleInput, 'El subtítulo es obligatorio.');
    hasErr = true;
  }
  if (hasErr) {
    toast('Revisa los campos obligatorios del widget.', 'error');
    return;
  }

  const widget = collectPaths(form).widget || {};
  const original = button.textContent;
  button.disabled = true;
  button.innerHTML = '<span class="spinner"></span> Guardando...';
  try {
    const data = await api('/settings', { method: 'PUT', body: JSON.stringify({ widget }) });
    if (data.settings && data.settings.widget) {
      state.settings.widget = data.settings.widget;
    }
    reloadWidgetPreview();
    toast('Widget actualizado correctamente');
    renderWidget();
  } catch (err) {
    toast(err.message, 'error');
    button.disabled = false;
    button.textContent = original;
  }
}
