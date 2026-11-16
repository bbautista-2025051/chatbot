'use strict';

const { PROMPT_TEMPLATE } = require('../config/defaults');

function contactLine(business = {}) {
  const parts = [];
  if (business.whatsapp) parts.push(`WhatsApp: ${business.whatsapp}`);
  if (business.phone) parts.push(`Telefono: ${business.phone}`);
  if (business.email) parts.push(`Correo: ${business.email}`);
  if (business.website) parts.push(`Web: ${business.website}`);
  return parts.length ? parts.join(' | ') : 'los canales de atencion del negocio';
}

function formatBusiness(business = {}) {
  const lines = [];
  lines.push(`Nombre: ${business.name || 'Colágeno Vital Guatemala'}`);
  if (business.country) lines.push(`País de operación: ${business.country}`);
  lines.push(`Moneda oficial: ${business.currency || 'Q'} (Quetzales · GTQ)`);
  if (business.tagline) lines.push(`Eslogan: ${business.tagline}`);
  if (business.description) lines.push(`Descripción: ${business.description}`);
  if (business.address) lines.push(`Dirección física: ${business.address}`);
  if (business.hours) lines.push(`Horario: ${business.hours}`);
  if (business.shipping) lines.push(`Política de envíos: ${business.shipping}`);
  if (business.paymentMethods) lines.push(`Métodos de pago: ${business.paymentMethods}`);
  const contact = contactLine(business);
  if (contact) lines.push(`Contacto: ${contact}`);
  if (business.website) lines.push(`Sitio web: ${business.website}`);
  return lines.join('\n');
}

function formatProducts(products = [], currency = 'Q') {
  if (!Array.isArray(products) || !products.length) {
    return 'El catálogo detallado aún no está cargado. No inventes productos, precios ni promociones; ofrece consultar con un asesor.';
  }
  return products
    .filter((product) => product && product.name)
    .map((product) => {
      const price = product.price ? ` - Precio: ${currency}${product.price}` : ' - Precio: consultar';
      const description = product.description ? ` - ${product.description}` : '';
      return `- ${product.name}${price}${description}`;
    })
    .join('\n');
}

function replaceAll(text, values) {
  let out = String(text);
  for (const [key, value] of Object.entries(values)) {
    out = out.split(`{{${key}}}`).join(String(value == null ? '' : value));
  }
  return out.replace(/\{\{[a-z_]+\}\}/gi, '').trim();
}

/**
 * Construye el prompt del sistema a partir de la plantilla editable por el
 * personal. Si la plantilla no incluye los bloques de negocio o conocimiento,
 * se agregan automaticamente para que el bot nunca responda a ciegas.
 */
function buildSystemPrompt({ settings, context = '', hasContext = false }) {
  const ai = settings.ai || {};
  const business = settings.business || {};
  const template = String(ai.systemPrompt || '').trim() || PROMPT_TEMPLATE;

  const knowledge = hasContext
    ? context
    : 'No se encontro informacion relevante en la base de conocimiento para esta consulta. Si el dato no esta en los datos del negocio, dilo con honestidad y ofrece contacto humano. No inventes.';

  const values = {
    asistente: ai.assistantName || 'el asistente virtual',
    negocio_nombre: business.name || 'el negocio',
    negocio: formatBusiness(business),
    productos: formatProducts(business.products, business.currency),
    conocimiento: knowledge,
    instrucciones: ai.extraInstructions || '(Sin instrucciones adicionales)',
    tono: business.tone || 'calido y profesional',
    idioma: business.language || 'espanol',
    contacto: contactLine(business),
    fecha: new Date().toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' })
  };

  let prompt = template;
  const missing = [];
  if (!template.includes('{{negocio}}')) missing.push(`## Datos del negocio\n${values.negocio}`);
  if (!template.includes('{{productos}}')) missing.push(`## Catalogo de productos\n${values.productos}`);
  if (!template.includes('{{conocimiento}}')) {
    missing.push(`## Base de conocimiento oficial\n${knowledge}`);
  }
  if (!template.includes('{{instrucciones}}') && ai.extraInstructions) {
    missing.push(`## Instrucciones adicionales del negocio\n${ai.extraInstructions}`);
  }

  prompt = replaceAll(prompt, values);
  if (missing.length) {
    prompt += `\n\n${missing.join('\n\n')}`;
  }

  prompt += `\n\n## Recordatorio final\nResponde solo con informacion respaldada por el contexto anterior. Si no tienes el dato, dilo y ofrece ${values.contacto}. No inventes precios, stock, ingredientes ni resultados.`;
  return prompt.trim();
}

function previewPrompt({ settings, context }) {
  return buildSystemPrompt({
    settings,
    context:
      context ||
      '[1] Fuente: Preguntas frecuentes Guatemala\nEl Colágeno Hidrolizado 300 g tiene un precio de Q245.00 con IVA incluido. Realizamos envíos a Ciudad de Guatemala en 1 a 2 días hábiles y a los 22 departamentos por Cargo Expreso o Forza Delivery en 2 a 4 días hábiles (envío gratis en compras mayores a Q400.00). Emitimos factura FEL con NIT o CF.',
    hasContext: true
  });
}

module.exports = {
  PROMPT_TEMPLATE,
  contactLine,
  formatBusiness,
  formatProducts,
  buildSystemPrompt,
  previewPrompt
};
