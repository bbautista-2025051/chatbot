'use strict';

/* =========================================================
   Ajustes del negocio, IA (Google Gemini) y prompt
   ========================================================= */
function field(label, path, value, options = {}) {
  const {
    type = 'text',
    placeholder = '',
    hint = '',
    textarea = false,
    rows = 4,
    min,
    max,
    step,
    list,
    required = false,
    className = ''
  } = options;
  const attrs = [
    `data-path="${path}"`,
    `placeholder="${esc(placeholder)}"`,
    list ? `list="${list}"` : '',
    min !== undefined ? `min="${min}"` : '',
    max !== undefined ? `max="${max}"` : '',
    step !== undefined ? `step="${step}"` : '',
    required ? 'required' : ''
  ]
    .filter(Boolean)
    .join(' ');
  const reqMark = required ? ' <span class="req" aria-hidden="true">*</span>' : '';
  return `<div class="field ${className}">
    <label>${esc(label)}${reqMark}</label>
    ${
      textarea
        ? `<textarea ${attrs} rows="${rows}">${esc(value)}</textarea>`
        : `<input type="${type}" ${attrs} value="${esc(value)}" />`
    }
    ${hint ? `<span class="hint">${hint}</span>` : ''}
  </div>`;
}

function collectPaths(root) {
  const out = {};
  $$('[data-path]', root).forEach((el) => {
    const parts = el.dataset.path.split('.');
    let value;
    if (el.type === 'checkbox') value = el.checked;
    else if (el.type === 'number' || el.type === 'range') value = Number(el.value);
    else value = el.value;
    let target = out;
    parts.forEach((part, index) => {
      if (index === parts.length - 1) target[part] = value;
      else {
        if (!target[part] || typeof target[part] !== 'object') target[part] = {};
        target = target[part];
      }
    });
  });
  return out;
}

function readProducts() {
  return $$('#products-list .product-row').map((row) => ({
    name: $('.product-name', row)?.value.trim() || '',
    price: $('.product-price', row)?.value.trim() || '',
    description: $('.product-desc', row)?.value.trim() || ''
  }));
}

function readSettingsFromForm() {
  const data = collectPaths($('#settings-form'));
  if (data.ai && typeof data.ai.quickReplies === 'string') {
    data.ai.quickReplies = data.ai.quickReplies
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }
  data.business = data.business || {};
  data.business.products = readProducts().filter((product) => product.name);
  return data;
}

function productRow(product = {}) {
  return `<div class="product-row">
    <input class="product-name" type="text" placeholder="Colágeno hidrolizado 300 g" value="${esc(product.name || '')}" aria-label="Nombre del producto" />
    <input class="product-price" type="text" placeholder="245.00" value="${esc(product.price || '')}" aria-label="Precio del producto en Quetzales" />
    <input class="product-desc" type="text" placeholder="Sabor natural, 30 porciones" value="${esc(product.description || '')}" aria-label="Descripción del producto" />
    <button class="btn-icon remove-product" type="button" title="Quitar producto" aria-label="Quitar producto">${ICONS.trash}</button>
  </div>`;
}

function providerOptionModels(providerId) {
  const provider = PROVIDERS.find((item) => item.id === providerId);
  return provider ? provider.models : [];
}

function setDirtyState(dirty) {
  state.settingsDirty = Boolean(dirty);
  const bar = $('#unsaved-bar');
  if (bar) bar.classList.toggle('hidden', !state.settingsDirty);
}

function renderSettings() {
  if (!state.settings) {
    $('#view').innerHTML = loadingHTML();
    loadSettings()
      .then(() => renderSettings())
      .catch((err) => toast(err.message, 'error'));
    return;
  }
  const settings = state.settings;
  const business = settings.business || {};
  const ai = settings.ai || {};
  const provider = ai.provider || 'gemini';
  const isCompatible = provider === 'compatible';
  const envKeys = state.provider?.envKeys || {};
  const envModels = state.provider?.envModels || {};
  const providerDef = PROVIDERS.find((item) => item.id === provider) || PROVIDERS[0];
  const aiConnected = Boolean(state.provider?.configured) && provider !== 'demo';
  const aiBadge = aiConnected ? 'Conectado' : provider === 'demo' ? 'Modo demo' : 'Falta API Key';
  const products = Array.isArray(business.products) ? business.products : [];

  $('#topbar-actions').innerHTML = `
    <button class="btn btn-secondary btn-sm" type="button" id="top-test">${ICONS.spark} Probar conexión</button>
    <button class="btn btn-sm" type="button" id="top-save">Guardar cambios</button>`;

  const geminiEnvNote = envKeys.gemini
    ? `Clave <code>GEMINI_API_KEY</code> detectada en <code>.env</code>${
        envModels.gemini ? ` · Modelo en entorno: <code>${esc(envModels.gemini)}</code>` : ''
      }.`
    : `Configura <code>GEMINI_API_KEY</code> en tu archivo <code>.env</code> (recomendado) o ingresa la clave en el campo inferior.`;

  $('#view').innerHTML = `
    <form id="settings-form" autocomplete="off" novalidate>
      <div class="card settings-section">
        <div class="card-head">
          <div>
            <h3>Datos del negocio</h3>
            <p>Esta información contextualiza al asistente en cada conversación. Los campos con <span class="req">*</span> son obligatorios.</p>
          </div>
          <span class="badge badge-primary">Perfil</span>
        </div>
        <div class="card-body">
          <div class="grid-2">
            ${field('Nombre del negocio', 'business.name', business.name, {
              placeholder: 'Colágeno Vital Guatemala',
              required: true
            })}
            ${field('Eslogan', 'business.tagline', business.tagline, {
              placeholder: 'Belleza y bienestar desde adentro · Guatemala'
            })}
          </div>
          ${field('Descripción del negocio', 'business.description', business.description, {
            textarea: true,
            rows: 3,
            hint: 'Qué vende, a quién atiende en Guatemala y qué diferencia a tu marca.'
          })}
          <div class="grid-2">
            ${field('Dirección física', 'business.address', business.address, {
              placeholder: 'Diagonal 6, 12-42 Zona 10, Ciudad de Guatemala'
            })}
            ${field('Horario de atención', 'business.hours', business.hours, {
              placeholder: 'Lunes a sábado de 9:00 a 19:00'
            })}
          </div>
          <div class="grid-3">
            ${field('Teléfono', 'business.phone', business.phone, { placeholder: '+502 2300 0000' })}
            ${field('WhatsApp', 'business.whatsapp', business.whatsapp, { placeholder: '+502 5500 0000' })}
            ${field('Correo electrónico', 'business.email', business.email, {
              type: 'email',
              placeholder: 'hola@colagenovital.com.gt'
            })}
          </div>
          <div class="grid-2">
            ${field('Sitio web', 'business.website', business.website, {
              type: 'url',
              placeholder: 'https://colagenovital.com.gt'
            })}
            ${field('Símbolo de moneda', 'business.currency', business.currency, { placeholder: 'Q' })}
          </div>
          <div class="grid-2">
            ${field('Política de envíos', 'business.shipping', business.shipping, {
              textarea: true,
              rows: 2,
              hint: 'Cobertura en Ciudad de Guatemala y departamentos, tiempos y monto de envío gratis (ej. Q400.00).'
            })}
            ${field('Métodos de pago aceptados', 'business.paymentMethods', business.paymentMethods, {
              textarea: true,
              rows: 2,
              placeholder: 'Tarjeta Visa/Mastercard, Visacuotas, transferencia BI/Banrural/BAM/G&T, pago contra entrega'
            })}
          </div>
          <div class="grid-2">
            ${field('Tono de comunicación', 'business.tone', business.tone, {
              placeholder: 'cálido, profesional y cercano'
            })}
            ${field('Idioma de las respuestas', 'business.language', business.language, {
              placeholder: 'español'
            })}
          </div>
        </div>
      </div>

      <div class="card settings-section">
        <div class="card-head">
          <div>
            <h3>Catálogo de productos</h3>
            <p>Precios y presentaciones oficiales que el asistente puede informar. Si un precio no está aquí, no lo inventará.</p>
          </div>
          <span class="badge badge-neutral">${products.length} productos</span>
        </div>
        <div class="card-body">
          <div class="products-head"><span>Producto</span><span>Precio (Q)</span><span>Descripción</span><span></span></div>
          <div id="products-list">${products.map(productRow).join('')}</div>
          <button class="btn btn-secondary btn-sm add-product" type="button" id="add-product">${ICONS.plus} Añadir producto</button>
        </div>
      </div>

      <div class="card settings-section">
        <div class="card-head">
          <div>
            <h3>Modelo de Inteligencia Artificial (Google Gemini API)</h3>
            <p>Configuración centralizada del proveedor de IA. Las credenciales nunca se exponen en el frontend.</p>
          </div>
          <span class="badge ${aiConnected ? 'badge-ok' : 'badge-warn'} badge-dot">${aiBadge}</span>
        </div>
        <div class="card-body">
          <div class="gemini-banner">
            <div class="gemini-banner-main">
              <div class="gemini-banner-icon">${ICONS.spark}</div>
              <div>
                <h4>Integración preparada para Google Gemini API</h4>
                <p>${geminiEnvNote}</p>
              </div>
            </div>
            ${
              provider !== 'gemini'
                ? `<button class="btn btn-secondary btn-sm" type="button" id="select-gemini-btn">Usar Google Gemini</button>`
                : `<span class="badge badge-primary">Gemini seleccionado</span>`
            }
          </div>

          <div class="grid-2">
            <div class="field">
              <label for="provider-select">Proveedor de IA <span class="req" aria-hidden="true">*</span></label>
              <select data-path="ai.provider" id="provider-select" required>
                ${PROVIDERS.map(
                  (item) =>
                    `<option value="${item.id}" ${item.id === provider ? 'selected' : ''}>${esc(item.label)}</option>`
                ).join('')}
              </select>
              <span class="hint" id="provider-hint">${esc(providerDef.hint)}</span>
            </div>
            <div class="field">
              <label for="model-input">Modelo <span class="req" aria-hidden="true">*</span></label>
              <input id="model-input" list="model-options" data-path="ai.model" value="${esc(ai.model || '')}"
                placeholder="${esc(providerDef.models[0] || 'gemini-3.8-flash')}" required />
              <datalist id="model-options">
                ${providerOptionModels(provider)
                  .map((model) => `<option value="${esc(model)}"></option>`)
                  .join('')}
              </datalist>
              <div class="model-pills" id="model-pills">
                ${providerOptionModels(provider)
                  .map(
                    (model) =>
                      `<button type="button" class="model-pill ${model === ai.model ? 'active' : ''}" data-model-pill="${esc(
                        model
                      )}">${esc(model)}</button>`
                  )
                  .join('')}
              </div>
            </div>
          </div>

          <div class="field">
            <label for="api-key">API Key del proveedor</label>
            <div class="input-group">
              <input id="api-key" type="password" data-path="ai.apiKey" value="${esc(ai.apiKey || '')}" placeholder="AIzaSy... (o configúrala en .env como GEMINI_API_KEY)" autocomplete="off" />
              <button class="btn btn-secondary btn-sm" type="button" data-toggle-secret="ai.apiKey">Ver</button>
            </div>
            <span class="hint">
              ${
                envKeys[provider]
                  ? `✓ Se detectó una clave configurada en el archivo <code>.env</code> para este proveedor.`
                  : `Recomendado: define <code>GEMINI_API_KEY</code> en el archivo <code>.env</code> del servidor.`
              }
              Deja los puntos suspensivos (<code>••••</code>) para conservar la clave guardada. Si no hay clave configurada, el asistente opera de forma controlada con la base de conocimiento local.
            </span>
          </div>

          <div class="field ${isCompatible ? '' : 'hidden'}" id="baseurl-wrap">
            <label for="base-url">URL base compatible <span class="req" aria-hidden="true">*</span></label>
            <input id="base-url" type="url" data-path="ai.baseUrl" value="${esc(ai.baseUrl || '')}" placeholder="https://api.groq.com/openai/v1" />
            <span class="hint">Ejemplos: Groq, OpenRouter, Together, LM Studio u Ollama. Debe aceptar <code>/chat/completions</code>.</span>
          </div>

          <div class="grid-3">
            <div class="field">
              <label for="temp-range">Creatividad (temperatura)</label>
              <div class="inline-field">
                <input id="temp-range" type="range" min="0" max="1.5" step="0.1" data-path="ai.temperature" value="${Number(ai.temperature ?? 0.4)}" style="padding:0" />
                <output id="temp-value" class="badge badge-neutral">${Number(ai.temperature ?? 0.4).toFixed(1)}</output>
              </div>
              <span class="hint">Baja (0.2–0.5) = respuestas más precisas y fieles al catálogo.</span>
            </div>
            ${field('Máximo de tokens', 'ai.maxTokens', ai.maxTokens, {
              type: 'number',
              min: 64,
              max: 8192,
              hint: 'Longitud máxima de cada respuesta generada.'
            })}
            ${field('Fragmentos de contexto (RAG)', 'ai.topK', ai.topK, {
              type: 'number',
              min: 1,
              max: 12,
              hint: 'Cantidad de fragmentos relevantes enviados a Gemini.'
            })}
          </div>

          <div class="section-actions">
            <button class="btn btn-secondary btn-sm" type="button" id="test-provider">${ICONS.spark} Probar conexión con el modelo</button>
            <span class="small faint">Verifica en tiempo real la comunicación con la API configurada.</span>
          </div>
          <div id="provider-test-result"></div>

          <div class="divider"></div>
          <div class="grid-2">
            <div class="field">
              <label for="embedding-provider">Embeddings (búsqueda semántica)</label>
              <select data-path="ai.embeddingProvider" id="embedding-provider">
                <option value="local" ${ai.embeddingProvider === 'local' ? 'selected' : ''}>Local · sin costo ni clave externa (recomendado)</option>
                <option value="gemini" ${ai.embeddingProvider === 'gemini' ? 'selected' : ''}>Google Gemini · text-embedding-004</option>
                <option value="openai" ${ai.embeddingProvider === 'openai' ? 'selected' : ''}>OpenAI · text-embedding-3-small</option>
              </select>
              <span class="hint">Si cambias el proveedor de embeddings, usa "Reindexar todo" en Entrenamiento.</span>
            </div>
            ${field('Modelo de embeddings (opcional)', 'ai.embeddingModel', ai.embeddingModel, {
              placeholder: ai.embeddingProvider === 'openai' ? 'text-embedding-3-small' : 'text-embedding-004'
            })}
          </div>
          <div class="field">
            <label for="embedding-key">API key para embeddings (opcional)</label>
            <div class="input-group">
              <input id="embedding-key" type="password" data-path="ai.embeddingApiKey" value="${esc(ai.embeddingApiKey || '')}" placeholder="Se reutiliza automáticamente la clave del proveedor principal" autocomplete="off" />
              <button class="btn btn-secondary btn-sm" type="button" data-toggle-secret="ai.embeddingApiKey">Ver</button>
            </div>
          </div>
        </div>
      </div>

      <div class="card settings-section">
        <div class="card-head">
          <div>
            <h3>Comportamiento del chatbot</h3>
            <p>Saludo inicial, sugerencias rápidas y captura de leads en la conversación.</p>
          </div>
        </div>
        <div class="card-body">
          ${field('Nombre del asistente', 'ai.assistantName', ai.assistantName, {
            placeholder: 'Clara',
            required: true
          })}
          ${field('Mensaje de bienvenida', 'ai.greeting', ai.greeting, {
            textarea: true,
            rows: 2,
            required: true,
            hint: 'Primer mensaje que muestra el chatbot al iniciar una conversación.'
          })}
          <div class="field">
            <label>Sugerencias rápidas (botones de inicio)</label>
            <input type="text" data-path="ai.quickReplies" value="${esc((ai.quickReplies || []).join(', '))}" placeholder="Ver productos, Precios y envíos, Hablar con un asesor" />
            <span class="hint">Sepáralas con comas. Se muestran como chips interactivos al abrir el chat.</span>
          </div>
          <div class="grid-2">
            <label class="inline-field" style="cursor:pointer;margin-bottom:14px">
              <span class="switch"><input type="checkbox" data-path="ai.captureLeads" ${ai.captureLeads !== false ? 'checked' : ''} /></span>
              <span><strong style="font-size:13px">Capturar leads automáticamente</strong><br /><span class="small muted">Detecta y guarda teléfonos y correos que compartan los clientes.</span></span>
            </label>
            <label class="inline-field" style="cursor:pointer;margin-bottom:14px">
              <span class="switch"><input type="checkbox" data-path="ai.handoffEnabled" ${ai.handoffEnabled !== false ? 'checked' : ''} /></span>
              <span><strong style="font-size:13px">Permitir derivación a asesor humano</strong><br /><span class="small muted">Marca la conversación cuando el usuario solicita hablar con una persona.</span></span>
            </label>
          </div>
        </div>
      </div>

      <div class="card settings-section">
        <div class="card-head">
          <div>
            <h3>Instrucciones del asistente</h3>
            <p>Reglas de negocio y personalidad. El prompt soporta variables dinámicas.</p>
          </div>
          <span class="badge badge-primary">Prompt</span>
        </div>
        <div class="card-body">
          ${field('Instrucciones adicionales', 'ai.extraInstructions', ai.extraInstructions, {
            textarea: true,
            rows: 4,
            hint: 'Ejemplo: "Nunca ofrezcas descuentos no autorizados. Si preguntan por embarazo, recomienda consultar a su médico."'
          })}
          <details class="advanced" id="prompt-details">
            <summary>Editor avanzado del prompt del sistema</summary>
            <div class="advanced-body">
              <div class="field">
                <label for="system-prompt">Plantilla del prompt</label>
                <textarea id="system-prompt" class="prompt-area" data-path="ai.systemPrompt" rows="18">${esc(
                  ai.systemPrompt || state.defaultPrompt || ''
                )}</textarea>
                <div class="var-chips">
                  ${[
                    'asistente',
                    'negocio_nombre',
                    'negocio',
                    'productos',
                    'conocimiento',
                    'instrucciones',
                    'tono',
                    'idioma',
                    'contacto',
                    'fecha'
                  ]
                    .map(
                      (variable) =>
                        `<button type="button" class="var-chip" data-var="{{${variable}}}" title="Insertar variable">{{${variable}}}</button>`
                    )
                    .join('')}
                </div>
                <span class="hint">
                  El contenido de la base de conocimiento, los datos del negocio y el catálogo se insertan automáticamente
                  en las variables.
                </span>
              </div>
              <div class="section-actions">
                <button class="btn btn-secondary btn-sm" type="button" id="preview-prompt">${ICONS.eye} Vista previa del prompt</button>
                <button class="btn btn-ghost btn-sm" type="button" id="reset-prompt">Restaurar plantilla recomendada</button>
              </div>
            </div>
          </details>
        </div>
      </div>

      <div id="unsaved-bar" class="unsaved-bar hidden" role="status" aria-live="polite">
        <span>Tienes cambios sin guardar en esta sección.</span>
        <div class="flex">
          <button class="btn btn-secondary btn-sm" type="button" id="discard-settings">Descartar</button>
          <button class="btn btn-sm" type="submit" id="bar-save-settings">Guardar cambios</button>
        </div>
      </div>

      <div class="flex" style="justify-content:flex-end;gap:10px;margin-bottom:18px">
        <button class="btn btn-secondary" type="button" id="bottom-test">${ICONS.spark} Probar conexión</button>
        <button class="btn" type="submit" id="save-settings">Guardar cambios</button>
      </div>
    </form>

    <div class="card">
      <div class="card-head">
        <div>
          <h3>Seguridad del panel</h3>
          <p>Actualiza la contraseña de acceso administrativo.</p>
        </div>
        <span class="badge ${state.overview?.usingDefaultPassword ? 'badge-warn' : 'badge-ok'}">${
          state.overview?.usingDefaultPassword ? 'Contraseña por defecto' : 'Protegido'
        }</span>
      </div>
      <div class="card-body">
        <form id="password-form" autocomplete="off" novalidate>
          <div class="password-grid">
            <div class="field">
              <label for="pwd-current">Contraseña actual <span class="req" aria-hidden="true">*</span></label>
              <input id="pwd-current" type="password" autocomplete="current-password" required />
            </div>
            <div></div>
            <div class="field">
              <label for="pwd-next">Nueva contraseña (mín. 8 caracteres) <span class="req" aria-hidden="true">*</span></label>
              <input id="pwd-next" type="password" autocomplete="new-password" required />
            </div>
            <div class="field">
              <label for="pwd-confirm">Confirmar nueva contraseña <span class="req" aria-hidden="true">*</span></label>
              <input id="pwd-confirm" type="password" autocomplete="new-password" required />
            </div>
          </div>
          <button class="btn btn-secondary btn-sm" type="submit" id="change-password">Actualizar contraseña</button>
        </form>
      </div>
    </div>`;

  bindSettingsEvents();
}

function renderModelPills(providerId, activeModel) {
  const pillsBox = $('#model-pills');
  if (!pillsBox) return;
  const models = providerOptionModels(providerId);
  pillsBox.innerHTML = models
    .map(
      (model) =>
        `<button type="button" class="model-pill ${model === activeModel ? 'active' : ''}" data-model-pill="${esc(
          model
        )}">${esc(model)}</button>`
    )
    .join('');
}

function bindSettingsEvents() {
  const form = $('#settings-form');

  form.addEventListener('input', (event) => {
    setDirtyState(true);
    if (event.target.matches('input, textarea, select')) {
      clearFieldError(event.target);
    }
  });
  form.addEventListener('change', () => {
    setDirtyState(true);
  });

  const temp = $('#temp-range');
  const tempValue = $('#temp-value');
  temp?.addEventListener('input', () => {
    tempValue.textContent = Number(temp.value).toFixed(1);
  });

  const providerSelect = $('#provider-select');
  const modelInput = $('#model-input');

  function applyProviderSelection(provider) {
    if (providerSelect) providerSelect.value = provider;
    const def = PROVIDERS.find((item) => item.id === provider) || PROVIDERS[0];
    const datalist = $('#model-options');
    if (datalist) {
      datalist.innerHTML = def.models.map((model) => `<option value="${esc(model)}"></option>`).join('');
    }
    const hint = $('#provider-hint');
    if (hint) hint.textContent = def.hint;
    if (modelInput) modelInput.placeholder = def.models[0] || 'nombre-del-modelo';
    const currentModel = modelInput?.value.trim() || '';
    const isKnown = PROVIDERS.some((item) => item.models.includes(currentModel));
    if (!currentModel || isKnown) {
      if (modelInput) modelInput.value = def.models[0] || '';
    }
    renderModelPills(provider, modelInput?.value.trim() || '');
    $('#baseurl-wrap')?.classList.toggle('hidden', provider !== 'compatible');
    setDirtyState(true);
  }

  providerSelect?.addEventListener('change', () => {
    applyProviderSelection(providerSelect.value);
  });

  $('#select-gemini-btn')?.addEventListener('click', () => {
    applyProviderSelection('gemini');
    toast('Proveedor cambiado a Google Gemini. Guarda los cambios para aplicar.', 'info');
  });

  $('#model-pills')?.addEventListener('click', (event) => {
    const pill = event.target.closest('[data-model-pill]');
    if (!pill || !modelInput) return;
    modelInput.value = pill.dataset.modelPill;
    clearFieldError(modelInput);
    $$('#model-pills .model-pill').forEach((el) =>
      el.classList.toggle('active', el.dataset.modelPill === modelInput.value)
    );
    setDirtyState(true);
  });

  modelInput?.addEventListener('input', () => {
    $$('#model-pills .model-pill').forEach((el) =>
      el.classList.toggle('active', el.dataset.modelPill === modelInput.value.trim())
    );
  });

  $$('[data-toggle-secret]').forEach((button) => {
    button.addEventListener('click', () => {
      const input = $(`[data-path="${button.dataset.toggleSecret}"]`);
      if (!input) return;
      input.type = input.type === 'password' ? 'text' : 'password';
      button.textContent = input.type === 'password' ? 'Ver' : 'Ocultar';
    });
  });

  $('#add-product')?.addEventListener('click', () => {
    $('#products-list')?.insertAdjacentHTML('beforeend', productRow());
    setDirtyState(true);
    const rows = $$('#products-list .product-row');
    rows[rows.length - 1]?.querySelector('.product-name')?.focus();
  });

  $('#products-list')?.addEventListener('click', (event) => {
    const button = event.target.closest('.remove-product');
    if (!button) return;
    button.closest('.product-row')?.remove();
    setDirtyState(true);
  });

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    saveBusinessSettings($('#save-settings'));
  });
  $('#top-save')?.addEventListener('click', () => saveBusinessSettings($('#top-save')));
  $('#discard-settings')?.addEventListener('click', () => {
    setDirtyState(false);
    renderSettings();
    toast('Cambios descartados', 'info');
  });

  $('#test-provider')?.addEventListener('click', () => testProviderConnection($('#test-provider')));
  $('#top-test')?.addEventListener('click', () => testProviderConnection($('#top-test')));
  $('#bottom-test')?.addEventListener('click', () => testProviderConnection($('#bottom-test')));

  $('#preview-prompt')?.addEventListener('click', previewPromptModal);
  $('#reset-prompt')?.addEventListener('click', () => {
    const textarea = $('#system-prompt');
    if (textarea) {
      textarea.value = state.defaultPrompt || '';
      setDirtyState(true);
      toast('Plantilla recomendada restaurada. Guarda los cambios para aplicarla.', 'info');
    }
  });

  $$('.var-chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      const textarea = $('#system-prompt');
      if (!textarea) return;
      const start = textarea.selectionStart || 0;
      const end = textarea.selectionEnd || 0;
      const value = chip.dataset.var;
      textarea.value = textarea.value.slice(0, start) + value + textarea.value.slice(end);
      textarea.selectionStart = textarea.selectionEnd = start + value.length;
      textarea.focus();
      setDirtyState(true);
    });
  });

  const pwdForm = $('#password-form');
  const pwdCurrent = $('#pwd-current');
  const pwdNext = $('#pwd-next');
  const pwdConfirm = $('#pwd-confirm');
  [pwdCurrent, pwdNext, pwdConfirm].forEach((el) => {
    el?.addEventListener('input', () => clearFieldError(el));
  });

  pwdForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const current = pwdCurrent?.value || '';
    const next = pwdNext?.value || '';
    const confirm = pwdConfirm?.value || '';
    let hasError = false;
    if (!current) {
      setFieldError(pwdCurrent, 'Ingresa tu contraseña actual.');
      hasError = true;
    }
    if (!next || next.length < 8) {
      setFieldError(pwdNext, 'La nueva contraseña debe tener al menos 8 caracteres.');
      hasError = true;
    }
    if (!confirm || next !== confirm) {
      setFieldError(pwdConfirm, 'La confirmación no coincide con la nueva contraseña.');
      hasError = true;
    }
    if (hasError) return;

    const btn = $('#change-password');
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<span class="spinner"></span> Actualizando...';
    }
    try {
      await api('/auth/password', {
        method: 'POST',
        body: JSON.stringify({ current, next })
      });
      if (pwdCurrent) pwdCurrent.value = '';
      if (pwdNext) pwdNext.value = '';
      if (pwdConfirm) pwdConfirm.value = '';
      toast('Contraseña actualizada correctamente');
      if (state.overview) state.overview.usingDefaultPassword = false;
      renderSettings();
    } catch (err) {
      setFieldError(pwdCurrent, err.message);
      toast(err.message, 'error');
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = 'Actualizar contraseña';
      }
    }
  });
}

function validateSettingsForm() {
  const nameInput = $('[data-path="business.name"]');
  const modelInput = $('[data-path="ai.model"]');
  const assistantInput = $('[data-path="ai.assistantName"]');
  const greetingInput = $('[data-path="ai.greeting"]');
  const providerSelect = $('[data-path="ai.provider"]');
  const baseUrlInput = $('[data-path="ai.baseUrl"]');

  let firstInvalid = null;
  if (nameInput && !nameInput.value.trim()) {
    setFieldError(nameInput, 'El nombre del negocio es obligatorio.');
    firstInvalid = firstInvalid || nameInput;
  }
  if (modelInput && !modelInput.value.trim() && providerSelect?.value !== 'demo') {
    setFieldError(modelInput, 'Especifica el modelo de IA a utilizar.');
    firstInvalid = firstInvalid || modelInput;
  }
  if (providerSelect?.value === 'compatible' && baseUrlInput && !baseUrlInput.value.trim()) {
    setFieldError(baseUrlInput, 'La URL base es obligatoria para proveedores compatibles.');
    firstInvalid = firstInvalid || baseUrlInput;
  }
  if (assistantInput && !assistantInput.value.trim()) {
    setFieldError(assistantInput, 'Ingresa el nombre del asistente.');
    firstInvalid = firstInvalid || assistantInput;
  }
  if (greetingInput && !greetingInput.value.trim()) {
    setFieldError(greetingInput, 'El mensaje de bienvenida es obligatorio.');
    firstInvalid = firstInvalid || greetingInput;
  }

  if (firstInvalid) {
    firstInvalid.focus();
    toast('Revisa los campos obligatorios marcados en el formulario.', 'error');
    return false;
  }
  return true;
}

async function saveBusinessSettings(button) {
  if (!button) return;
  if (!validateSettingsForm()) return;

  const original = button.textContent;
  button.disabled = true;
  button.innerHTML = '<span class="spinner"></span> Guardando...';
  try {
    const payload = readSettingsFromForm();
    const data = await api('/settings', { method: 'PUT', body: JSON.stringify(payload) });
    state.settings = data.settings;
    state.provider = data.provider;
    setDirtyState(false);
    updateBrand();
    updateSideStatus();
    await loadOverview();
    toast('Ajustes guardados correctamente');
    renderSettings();
  } catch (err) {
    toast(err.message, 'error');
    button.disabled = false;
    button.textContent = original;
  }
}

function aiFieldsFromForm() {
  const data = collectPaths($('#settings-form'));
  return data.ai || {};
}

async function testProviderConnection(button) {
  const resultBox = $('#provider-test-result');
  if (button) {
    button.disabled = true;
    button.dataset.original = button.innerHTML;
    button.innerHTML = '<span class="spinner"></span> Probando...';
  }
  try {
    const ai = aiFieldsFromForm();
    const data = await api('/provider/test', {
      method: 'POST',
      body: JSON.stringify({
        provider: ai.provider,
        model: ai.model,
        apiKey: ai.apiKey,
        baseUrl: ai.baseUrl,
        temperature: ai.temperature,
        maxTokens: ai.maxTokens
      })
    });
    if (resultBox) {
      resultBox.innerHTML = `<div class="test-result ok">
        <strong>✓ Conexión verificada.</strong> Proveedor: <code>${esc(data.provider)}</code> · Modelo: <code>${esc(
          data.model
        )}</code> · Latencia: ${fmtNumber(data.latencyMs)} ms
        <div class="small" style="margin-top:3px">Respuesta recibida: "${esc(data.text)}"</div>
      </div>`;
    }
    toast('Conexión con el proveedor verificada');
  } catch (err) {
    if (resultBox) {
      resultBox.innerHTML = `<div class="test-result err"><strong>✕ No se pudo conectar con el proveedor.</strong> ${esc(
        err.message
      )}${err.detail ? `<div class="small" style="margin-top:3px">${esc(err.detail)}</div>` : ''}</div>`;
    }
    toast('Error al probar la conexión con el proveedor', 'error');
  } finally {
    if (button) {
      button.disabled = false;
      button.innerHTML = button.dataset.original || `${ICONS.spark} Probar conexión`;
    }
  }
}

async function previewPromptModal() {
  const template = $('#system-prompt')?.value || '';
  const extra = $('[data-path="ai.extraInstructions"]')?.value || '';
  try {
    const data = await api('/prompt/preview', {
      method: 'POST',
      body: JSON.stringify({ template, extraInstructions: extra })
    });
    openModal({
      title: 'Vista previa del prompt del sistema',
      body: `<p class="small muted" style="margin-bottom:12px">Así se enviará el prompt al modelo Gemini/IA, con el contexto de ejemplo y los datos actuales del negocio.</p>
        <pre style="max-height:56vh">${esc(data.prompt)}</pre>`,
      wide: true,
      footer: '<button class="btn btn-secondary" data-close>Cerrar</button>'
    });
  } catch (err) {
    toast(err.message, 'error');
  }
}

/* =========================================================
   Chat de prueba (Consola de pruebas con Gemini AI)
   ========================================================= */
function ensureChatSession() {
  if (state.chat.sessionId) return;
  let id = sessionStorage.getItem('admin_chat_session');
  if (!id) {
    id = `admin_${Math.random().toString(36).slice(2, 10)}`;
    sessionStorage.setItem('admin_chat_session', id);
  }
  state.chat.sessionId = id;
}

function renderChat() {
  ensureChatSession();
  const ai = state.settings?.ai || {};
  const readySources = (state.sources || []).filter((source) => source.status === 'ready').length;
  const demo = ai.provider === 'demo' || !state.provider?.configured;
  const activeProviderLabel =
    (PROVIDERS.find((p) => p.id === (ai.provider || 'gemini')) || {}).short || 'Gemini';

  $('#topbar-actions').innerHTML = `
    <button class="btn btn-secondary btn-sm" type="button" id="reset-chat">${ICONS.refresh} Nueva conversación</button>
    <button class="btn btn-sm" type="button" id="chat-to-settings">${ICONS.spark} Configurar modelo IA</button>`;

  $('#view').innerHTML = `
    <div class="chat-layout">
      <div class="chat-panel">
        <div class="chat-panel-head">
          <div class="bot-avatar">${ICONS.spark}</div>
          <div class="meta">
            <strong>${esc(ai.assistantName || 'Asistente')} · ${esc(activeProviderLabel)}</strong>
            <span><span class="dot"></span> ${
              demo
                ? `Modo respaldo local · ${fmtNumber(readySources)} fuentes`
                : `Conectado a ${esc(ai.model || activeProviderLabel)} · ${fmtNumber(readySources)} fuentes`
            }</span>
          </div>
          ${
            demo
              ? '<span class="badge badge-warn" title="Configura GEMINI_API_KEY para activar respuestas generativas">Modo demo</span>'
              : '<span class="badge badge-ok badge-dot">IA Activa</span>'
          }
        </div>
        <div class="chat-messages" id="chat-messages" role="log" aria-live="polite"></div>
        <div class="quick-row" id="quick-row"></div>
        <form class="chat-composer" id="admin-chat-form" novalidate>
          <textarea id="chat-input" rows="1" maxlength="2000" placeholder="Escribe una pregunta para probar el asistente (Enter para enviar)..."></textarea>
          <button class="send-btn" id="chat-send" type="submit" aria-label="Enviar mensaje" title="Enviar mensaje (Enter)">${ICONS.send}</button>
        </form>
      </div>

      <div class="stack">
        <div class="card debug-card">
          <div class="card-head" style="padding:14px 16px">
            <div><h3>Diagnóstico de la respuesta</h3><p>Proveedor, modelo y fragmentos utilizados</p></div>
          </div>
          <div class="card-body" style="padding:12px 16px" id="chat-debug"></div>
        </div>
        <div class="card">
          <div class="card-body" style="display:flex;gap:11px;align-items:flex-start">
            <div class="stat-icon" style="flex:none">${ICONS.info}</div>
            <div>
              <div style="font-weight:700;font-size:13px;margin-bottom:3px">Prueba controlada del servicio</div>
              <p class="small muted" style="line-height:1.55">
                El panel derecho muestra el proveedor activo (ej. <strong>Google Gemini</strong>), el modo de recuperación semántica y los fragmentos de conocimiento consultados.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>`;

  bindChatEvents();
  renderChatMessages();
}

function chatBubble(message) {
  const isUser = message.role === 'user';
  const sources = Array.isArray(message.sources) ? message.sources : [];
  const sourceChips = sources.length
    ? `<div class="source-chips">${sources
        .slice(0, 4)
        .map(
          (source) =>
            `<span class="source-chip" title="${esc(source.url || 'Documento interno')}">${ICONS.text} ${esc(
              truncateText(source.name, 34)
            )}</span>`
        )
        .join('')}</div>`
    : '';
  const bodyHtml = isUser
    ? `<p style="margin:0">${esc(message.content).replace(/\r?\n/g, '<br />')}</p>`
    : renderMarkdown(message.content);
  return `<div class="msg ${isUser ? 'user' : 'assistant'}">
    <div style="max-width:100%">
      <div class="bubble ${isUser ? '' : 'md-content'}">${bodyHtml}</div>
      ${sourceChips}
      <div class="msg-meta">${isUser ? 'Tú' : esc(state.settings?.ai?.assistantName || 'Asistente')} · ${
        message.ts ? new Date(message.ts).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }) : ''
      }</div>
    </div>
  </div>`;
}

function renderChatMessages() {
  const box = $('#chat-messages');
  if (!box) return;
  const messages = state.chat.messages;
  if (!messages.length) {
    const greeting =
      state.settings?.ai?.greeting || 'Hola, ¿en qué puedo ayudarte hoy?';
    box.innerHTML = chatBubble({ role: 'assistant', content: greeting, ts: new Date().toISOString() });
  } else {
    box.innerHTML = messages.map(chatBubble).join('');
  }
  if (state.chat.busy) {
    box.insertAdjacentHTML(
      'beforeend',
      `<div class="msg assistant">
        <div class="typing-row">
          <div class="typing"><span></span><span></span><span></span></div>
          <span class="typing-text">Procesando respuesta con IA...</span>
        </div>
      </div>`
    );
  }
  const sendBtn = $('#chat-send');
  const resetBtn = $('#reset-chat');
  if (sendBtn) sendBtn.disabled = state.chat.busy;
  if (resetBtn) resetBtn.disabled = state.chat.busy;
  box.scrollTop = box.scrollHeight;
  renderQuickReplies();
  renderChatDebug();
}

function renderQuickReplies() {
  const row = $('#quick-row');
  if (!row) return;
  const replies = state.settings?.ai?.quickReplies || [];
  if (state.chat.busy || !replies.length) {
    row.innerHTML = '';
    return;
  }
  row.innerHTML = replies
    .map((reply) => `<button class="quick-chip" type="button">${esc(reply)}</button>`)
    .join('');
  $$('.quick-chip', row).forEach((chip) => {
    chip.addEventListener('click', () => sendChatMessage(chip.textContent));
  });
}

function renderChatDebug() {
  const box = $('#chat-debug');
  if (!box) return;
  const debug = state.chat.lastDebug;
  if (!debug) {
    box.innerHTML = `<p class="small muted" style="line-height:1.55">
      Envía un mensaje de prueba para inspeccionar el proveedor utilizado, el modelo, el modo de búsqueda y los fragmentos recuperados.
    </p>`;
    return;
  }
  const results = debug.results || [];
  box.innerHTML = `
    <div class="debug-row"><span>Proveedor</span><strong>${esc(debug.provider || '—')}</strong></div>
    <div class="debug-row"><span>Modelo</span><strong>${esc(debug.model || '—')}</strong></div>
    <div class="debug-row"><span>Búsqueda</span><strong>${esc(debug.retrievalMode || '—')}</strong></div>
    <div class="debug-row"><span>Fragmentos</span><strong>${results.length}</strong></div>
    ${debug.error ? `<div class="alert alert-danger" style="margin:12px 0 0;padding:9px 11px;font-size:11.5px">${ICONS.warning}<div><strong>Aviso del proveedor IA:</strong> ${esc(debug.error)}</div></div>` : ''}
    ${debug.embeddingError ? `<div class="alert alert-warn" style="margin:12px 0 0;padding:9px 11px;font-size:11.5px">${esc(debug.embeddingError)}</div>` : ''}
    <div style="margin-top:10px">
      ${
        results.length
          ? results
              .map(
                (result) => `<div class="debug-source">
                  <div class="ds-top"><span>${esc(truncateText(result.source, 28))}</span><span class="faint">${Number(result.score || 0).toFixed(2)}</span></div>
                  <div class="ds-text">${esc(result.text || '')}</div>
                </div>`
              )
              .join('')
          : '<p class="small muted">No se recuperaron fragmentos para esta consulta.</p>'
      }
    </div>`;
}

function bindChatEvents() {
  const form = $('#admin-chat-form');
  const input = $('#chat-input');

  const resize = () => {
    if (!input) return;
    input.style.height = 'auto';
    input.style.height = `${Math.min(input.scrollHeight, 120)}px`;
  };
  input?.addEventListener('input', resize);
  input?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      sendChatMessage(input.value);
    }
  });
  form?.addEventListener('submit', (event) => {
    event.preventDefault();
    sendChatMessage(input?.value || '');
  });

  $('#reset-chat')?.addEventListener('click', async () => {
    if (state.chat.busy) return;
    try {
      await api('/chat/test', {
        method: 'POST',
        body: JSON.stringify({ sessionId: state.chat.sessionId, reset: true })
      });
      state.chat.messages = [];
      state.chat.lastDebug = null;
      renderChatMessages();
      toast('Nueva conversación iniciada');
    } catch (err) {
      toast(err.message, 'error');
    }
  });

  $('#chat-to-settings')?.addEventListener('click', () => navigate('settings'));
}

async function sendChatMessage(rawText) {
  const text = String(rawText || '').trim();
  if (!text || state.chat.busy) return;
  const input = $('#chat-input');
  if (input) {
    input.value = '';
    input.style.height = 'auto';
  }
  state.chat.messages.push({ role: 'user', content: text, ts: new Date().toISOString() });
  state.chat.busy = true;
  renderChatMessages();

  try {
    const data = await api('/chat/test', {
      method: 'POST',
      body: JSON.stringify({ sessionId: state.chat.sessionId, message: text })
    });
    state.chat.messages.push({
      role: 'assistant',
      content: data.reply,
      sources: data.sources || [],
      ts: new Date().toISOString()
    });
    state.chat.lastDebug = data.debug || null;
    if (data.providerError && data.errorMessage) {
      toast(`Aviso del proveedor IA: ${data.errorMessage}`, 'info');
    }
  } catch (err) {
    state.chat.messages.push({
      role: 'assistant',
      content: `No se pudo completar la consulta: **${err.message}**`,
      ts: new Date().toISOString()
    });
    toast(err.message, 'error');
  } finally {
    state.chat.busy = false;
    renderChatMessages();
    input?.focus();
  }
}
