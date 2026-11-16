'use strict';

/**
 * Carga contenido oficial para Guatemala y entrena la base de conocimiento del asistente.
 *
 *   npm run seed
 *   npm run seed -- --force   (actualiza ajustes, catálogo en Quetzales y reindexa todas las fuentes)
 */

require('dotenv').config();

const fs = require('fs');
const { db } = require('../server/lib/store');
const { PROMPT_TEMPLATE } = require('../server/config/defaults');
const { createSource, enqueue } = require('../server/rag/indexer');

const DEMO_SOURCES = [
  {
    name: 'Catálogo y precios · Colágeno Vital',
    text: `CATÁLOGO DE PRODUCTOS Y PRECIOS EN GUATEMALA · COLÁGENO VITAL

1) Colágeno Hidrolizado 300 g
- Precio: Q245.00 (Quetzales, IVA incluido)
- Presentación: envase de 300 g, 30 porciones (una medida diaria de 10 g).
- Contenido: péptidos bioactivos de colágeno hidrolizado tipo I y III, vitamina C, ácido hialurónico y zinc.
- Sabor: natural (sin azúcar añadida), se disuelve fácilmente en agua pura, jugo natural o café.
- Para quién: personas que buscan apoyo integral para piel, cabello, uñas y articulaciones.
- Modo de uso: disolver una medida (10 g) en 200 ml de agua o jugo, una vez al día.
- Costo aproximado por día: Q8.15.
- Stock: disponible para entrega inmediata en Guatemala.

2) Colágeno Beauty con Hialurónico
- Precio: Q295.00 (Quetzales, IVA incluido)
- Presentación: caja con 30 sobres individuales portátiles.
- Contenido: colágeno hidrolizado, ácido hialurónico, biotina, zinc, vitamina E y vitamina C.
- Para quién: quienes buscan una fórmula premium enfocada en belleza (piel firme e hidratada, cabello brillante y uñas fuertes) y prefieren sobres listos para llevar.
- Modo de uso: un sobre al día disuelto en agua.
- Costo aproximado por día: Q9.85.
- Stock: disponible para entrega inmediata en Guatemala.

3) Colágeno Tipo II + Cúrcuma
- Precio: Q260.00 (Quetzales, IVA incluido)
- Presentación: frasco con 60 cápsulas (30 días, dos cápsulas diarias).
- Contenido: colágeno tipo II no desnaturalizado, extracto de cúrcuma (curcumina) y vitamina C.
- Para quién: personas activas, deportistas o adultos que buscan apoyo nutricional para la movilidad y el confort articular.
- Modo de uso: dos cápsulas al día acompañadas con una comida.
- Costo aproximado por día: Q8.65.
- Stock: disponible para entrega inmediata en Guatemala.

4) Colágeno Líquido Beauty Shot
- Precio: Q275.00 (Quetzales, IVA incluido)
- Presentación: caja con 20 viales bebibles de 25 ml, sabor frutos rojos.
- Contenido: colágeno hidrolizado líquido de rápida absorción, vitamina C, vitamina B6 y zinc.
- Para quién: quienes prefieren no preparar polvo y quieren una toma líquida lista para llevar.
- Modo de uso: agitar y tomar un vial al día, preferiblemente por la mañana.
- Costo aproximado por día: Q13.75.
- Stock: disponible para entrega inmediata en Guatemala.

Promociones vigentes en Guatemala
- Envío GRATIS a toda Guatemala en compras superiores a Q400.00.
- Combo Beauty Guatemala: Colágeno Beauty + Beauty Shot por Q515.00 (ahorras Q55.00 y tienes envío gratis).
- 10% de descuento en la segunda unidad del Colágeno Hidrolizado 300 g (la segunda unidad queda en Q220.50).

Todos los precios están expresados en Quetzales guatemaltecos (Q / GTQ) e incluyen el 12% de IVA.`
  },
  {
    name: 'Preguntas frecuentes · Envíos, pagos y garantía',
    text: `PREGUNTAS FRECUENTES EN GUATEMALA · COLÁGENO VITAL

¿Hacen envíos a todos los departamentos de Guatemala?
Sí. Enviamos a los 22 departamentos de Guatemala. En Ciudad de Guatemala y área metropolitana (Zonas 1 a 25, Mixco, Villa Nueva, Santa Catarina Pinula, San José Pinula, Fraijanes y Carretera a El Salvador) la entrega tarda entre 1 y 2 días hábiles (costo Q25.00). A los departamentos del interior (Antigua Guatemala, Quetzaltenango/Xela, Escuintla, Cobán, Mazatenango, Puerto Barrios, Petén, Chiquimula, Huehuetenango, etc.) enviamos mediante Cargo Expreso, Forza Delivery o Guatex en 2 a 4 días hábiles (costo Q35.00). El envío es GRATIS en compras superiores a Q400.00.

¿Cuáles son los métodos de pago en Guatemala?
Aceptamos tarjeta de débito y crédito Visa y Mastercard (link de pago seguro y Visacuotas / Cuotas Credomatic en compras mayores a Q500.00), transferencia o depósito bancario en Banco Industrial (BI), Banrural, BAM y Banco G&T Continental, y pago contra entrega (efectivo) en Ciudad de Guatemala, área metropolitana y cabeceras departamentales cubiertas por Cargo Expreso y Forza Delivery.

¿Puedo cambiar o devolver un producto?
Sí. Si el producto llegó sellado y con algún daño de transporte, puedes solicitar el cambio dentro de los 5 días hábiles siguientes a la entrega escribiendo a nuestro WhatsApp +502 5500 0000 con tu número de pedido o factura FEL y una foto del producto. Si el pedido llegó incompleto o equivocado, cubrimos el 100% del cambio.

¿Los productos son originales y tienen registro sanitario?
Todos nuestros productos son 100% originales, adquiridos de distribuidores autorizados y cuentan con Registro Sanitario vigente en Guatemala (MSPAS) y fecha de vencimiento visible.

¿Emiten Factura Electrónica FEL?
Sí, emitimos Factura Electrónica en Línea (FEL) autorizada por la SAT. Para generarla solo necesitamos tu nombre o razón social y tu número de NIT (o podemos emitirla como CF — Consumidor Final).

¿Dónde están ubicados en Ciudad de Guatemala y cuál es el horario?
Estamos en Diagonal 6, 12-42 Zona 10, Ciudad de Guatemala. Atendemos de lunes a sábado de 9:00 a 19:00 horas. Los pedidos por la web y el chat con IA se reciben todos los días las 24 horas.

¿Puedo recoger mi pedido en la tienda de Zona 10?
Sí. Elige "recoger en tienda" al confirmar tu pedido sin ningún costo de envío y te avisaremos por WhatsApp cuando esté listo, normalmente el mismo día.

¿Cómo hago seguimiento a mi pedido o guía de envío?
Escríbenos al WhatsApp +502 5500 0000 con tu nombre o número de pedido y te compartimos el estado y tu número de guía de Cargo Expreso, Forza Delivery o Guatex.

¿Tienen programa de fidelidad?
Sí. Por cada compra en Quetzales acumulas puntos en nuestro programa "Vital Points" que puedes canjear por descuentos en tus próximos pedidos.`
  },
  {
    name: 'Guía de uso y recomendaciones · Colágeno',
    text: `GUÍA DE USO Y RECOMENDACIONES · COLÁGENO VITAL GUATEMALA

¿Cómo se toma el colágeno hidrolizado en polvo?
Disuelve una medida dosificadora de 10 g (incluida en el envase) en 200 ml de agua pura, jugo natural o café. Remueve hasta que se disuelva por completo. Puedes tomarlo en la mañana o antes de dormir; lo más importante es la constancia diaria.

¿Con el estómago vacío o con comida?
Ambas opciones son válidas. Si sientes molestias digestivas leves, tómalo junto con el desayuno o una comida. La vitamina C incluida en la fórmula favorece la síntesis y absorción del colágeno.

¿Cuánto tiempo debo tomarlo para notar resultados?
La evidencia y la experiencia de nuestros clientes en Guatemala recomiendan valorar los cambios después de 8 a 12 semanas de uso diario constante. Los resultados varían según cada persona y se potencian con buena hidratación, alimentación balanceada y descanso.

¿Se puede mezclar con otros suplementos?
En general sí, pero si tomas medicamentos de control, tienes una condición médica o estás en tratamiento, consulta primero con tu médico o farmacéutico. No recomendamos combinar dos suplementos de colágeno distintos el mismo día sin orientación profesional.

¿Es apto para mujeres embarazadas o en lactancia?
No recomendamos iniciar suplementos durante el embarazo o la lactancia sin autorización médica expresa. Consulta siempre a tu médico ginecólogo u obstetra antes de consumir cualquier suplemento.

¿Tiene efectos secundarios?
El colágeno hidrolizado es muy bien tolerado. En casos aislados puede causar sensación de llenura leve. Si presentas alguna reacción alérgica, suspende su uso y consulta a tu médico.

¿Cómo se conserva en los distintos climas de Guatemala?
Mantén el envase bien cerrado en un lugar fresco y seco (especialmente si vives en zonas cálidas o costa), lejos de la luz solar directa y fuera del alcance de los niños.

¿Es apto para vegetarianos o veganos?
No. El colágeno es una proteína de origen animal. Revisa siempre la etiqueta de cada presentación.`
  },
  {
    name: 'Políticas, contacto y datos del negocio',
    text: `POLÍTICAS Y CONTACTO OFICIAL · COLÁGENO VITAL GUATEMALA

Datos del negocio en Guatemala
- Nombre: Colágeno Vital Guatemala
- Tipo: farmacia y tienda especializada en colágeno hidrolizado, suplementos de belleza y bienestar.
- Dirección física: Diagonal 6, 12-42 Zona 10, Ciudad de Guatemala, Guatemala.
- Horario de atención: lunes a sábado de 9:00 a 19:00 horas.
- Teléfono fijo: +502 2300 0000.
- WhatsApp: +502 5500 0000.
- Correo electrónico: hola@colagenovital.com.gt.
- Sitio web: https://colagenovital.com.gt.
- Moneda oficial: Quetzales guatemaltecos (Q / GTQ).

Política de envíos en Guatemala
- Cobertura en Ciudad de Guatemala y los 22 departamentos del país.
- Ciudad de Guatemala y área metropolitana (Mixco, Villa Nueva, Santa Catarina Pinula, San José Pinula, Fraijanes, Carretera a El Salvador): 1 a 2 días hábiles (Q25.00).
- Departamentos del interior (vía Cargo Expreso, Forza Delivery o Guatex): 2 a 4 días hábiles (Q35.00).
- Envío GRATIS en compras superiores a Q400.00.
- Los pedidos confirmados antes de las 16:00 horas (4:00 p. m.) en días hábiles se despachan el mismo día.

Métodos de pago y facturación FEL
- Tarjeta Visa y Mastercard (link de pago seguro y Visacuotas).
- Transferencia bancaria o depósito en Banco Industrial (BI), Banrural, BAM y Banco G&T Continental.
- Pago contra entrega en Ciudad de Guatemala y cabeceras departamentales.
- Emitimos Factura Electrónica en Línea (FEL - SAT) con NIT o CF.

Cambios y devoluciones
- Solicita el cambio dentro de los 5 días hábiles posteriores a la entrega.
- El producto debe conservar su sello de seguridad intacto.
- Si el pedido llegó incompleto o equivocado, cubrimos el envío de reposición sin costo.

Atención humana personalizada
Si necesitas hablar con un asesor en Guatemala, escribe "quiero hablar con un asesor" en el chat o contáctanos directamente al WhatsApp +502 5500 0000.

Aviso de salud
La información brindada es orientativa y no sustituye la consulta médica. Los suplementos nutricionales no están destinados a diagnosticar, tratar, curar ni prevenir ninguna enfermedad.`
  }
];

function mergeBusinessSettings(force = false) {
  const settings = db.settings.data;
  const business = settings.business;

  const guatemalaBusiness = {
    name: 'Colágeno Vital Guatemala',
    tagline: 'Belleza y bienestar desde adentro · Guatemala',
    description:
      'Farmacia y tienda especializada en colágeno hidrolizado, suplementos de belleza y bienestar en Guatemala. Asesoramos a cada cliente para que elija el producto ideal con envíos a Ciudad de Guatemala y los 22 departamentos.',
    address: 'Diagonal 6, 12-42 Zona 10, Ciudad de Guatemala',
    phone: '+502 2300 0000',
    whatsapp: '+502 5500 0000',
    email: 'hola@colagenovital.com.gt',
    website: 'https://colagenovital.com.gt',
    hours: 'Lunes a sábado de 9:00 a 19:00',
    shipping:
      'Envíos a toda Guatemala. Ciudad de Guatemala y área metropolitana: 1 a 2 días hábiles (Q25.00). Departamentos por Cargo Expreso / Forza Delivery: 2 a 4 días hábiles (Q35.00). Envío gratis en compras mayores a Q400.00.',
    paymentMethods:
      'Tarjeta de débito y crédito Visa/Mastercard (link de pago y Visacuotas), transferencia bancaria (Banco Industrial, Banrural, BAM, G&T Continental) y pago contra entrega.',
    currency: 'Q',
    country: 'Guatemala',
    tone: 'cálido, profesional y cercano',
    language: 'español'
  };

  for (const [key, value] of Object.entries(guatemalaBusiness)) {
    if (force || !String(business[key] || '').trim()) {
      business[key] = value;
    }
  }

  if (force || !Array.isArray(business.products) || !business.products.length) {
    business.products = [
      {
        name: 'Colágeno Hidrolizado 300 g',
        price: '245.00',
        description:
          'Péptidos bioactivos tipo I y III con vitamina C, ácido hialurónico y zinc. 30 porciones, sabor natural.'
      },
      {
        name: 'Colágeno Beauty con Hialurónico',
        price: '295.00',
        description:
          'Caja con 30 sobres individuales con biotina, ácido hialurónico, zinc y vitaminas C y E para piel, cabello y uñas.'
      },
      {
        name: 'Colágeno Tipo II + Cúrcuma',
        price: '260.00',
        description:
          'Frasco con 60 cápsulas con colágeno tipo II no desnaturalizado, cúrcuma y vitamina C para movilidad y confort articular.'
      },
      {
        name: 'Colágeno Líquido Beauty Shot',
        price: '275.00',
        description:
          'Caja con 20 viales bebibles de 25 ml listos para tomar, sabor frutos rojos con vitamina C, B6 y zinc.'
      }
    ];
  }

  const ai = settings.ai;
  if (force || !String(ai.systemPrompt || '').trim()) {
    ai.systemPrompt = PROMPT_TEMPLATE;
  }
  if (force || !String(ai.extraInstructions || '').trim()) {
    ai.extraInstructions =
      'Atendemos exclusivamente en Guatemala. Todos los precios están en Quetzales (Q) con IVA incluido y emitimos factura FEL con NIT o CF.';
  }
  if (
    force ||
    !String(ai.greeting || '').trim() ||
    ai.greeting === 'Hola, soy tu asesora virtual. En que puedo ayudarte hoy?'
  ) {
    ai.greeting =
      '¡Hola! Soy Vita, tu asesora de Colágeno Vital Guatemala 🇬🇹. Cuéntame qué objetivo buscas para tu piel, cabello o articulaciones y te ayudo a elegir el colágeno ideal.';
  }
  if (force || !Array.isArray(ai.quickReplies) || !ai.quickReplies.length) {
    ai.quickReplies = [
      'Ver catálogo y precios en Q',
      'Envíos a departamentos y capital',
      '¿Cómo tomar el colágeno?',
      'Hablar con un asesor'
    ];
  }

  settings.widget = settings.widget || {};
  if (force || !settings.widget.bubbleText || settings.widget.bubbleText === 'Estas buscando colageno? Te ayudo.') {
    settings.widget.bubbleText = '¿Buscas colágeno en Guatemala? Te asesoro.';
  }
  if (force || !settings.widget.title) settings.widget.title = 'Asesora Colágeno Vital GT';
  if (force || !settings.widget.subtitle) settings.widget.subtitle = 'En línea · Precios en Quetzales (Q)';

  db.settings.save();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForSources(ids) {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    const pending = ids
      .map((id) => db.sources.data.find((source) => source.id === id))
      .filter((source) => source && !['ready', 'error'].includes(source.status));
    if (!pending.length) return;
    await sleep(350);
  }
  console.log('  Aviso: algunas fuentes siguen procesándose. Revisa el panel de entrenamiento.');
}

async function main() {
  const force = process.argv.includes('--force');
  console.log('');
  console.log('  Colágeno Vital Guatemala · carga de contenido y entrenamiento');
  console.log('  --------------------------------------------------------------');

  const existingNames = new Set(db.sources.data.map((source) => source.name));
  if (force) {
    const demoIds = db.sources.data
      .filter((source) => DEMO_SOURCES.some((demo) => demo.name === source.name))
      .map((source) => source.id);
    if (demoIds.length) {
      db.sources.data = db.sources.data.filter((source) => !demoIds.includes(source.id));
      db.chunks.data = db.chunks.data.filter((chunk) => !demoIds.includes(chunk.sourceId));
      db.sources.save();
      db.chunks.save();
      for (const name of DEMO_SOURCES.map((demo) => demo.name)) existingNames.delete(name);
      console.log(`  ${demoIds.length} fuente(s) demo anteriores reemplazadas.`);
    }
  }

  mergeBusinessSettings(force);
  console.log('  Datos del negocio (Guatemala), prompt y catálogo en Quetzales (Q) actualizados.');

  const created = [];
  for (const demo of DEMO_SOURCES) {
    if (existingNames.has(demo.name)) {
      console.log(`  = Ya existe: ${demo.name}`);
      continue;
    }
    const source = createSource({
      type: 'text',
      name: demo.name,
      rawText: demo.text
    });
    created.push(source);
    console.log(`  + En cola: ${demo.name}`);
  }

  // Si existen fuentes de archivo en disco (como base-conocimiento-colageno-vital.txt) y se usa --force, reindexarlas también
  if (force) {
    for (const source of db.sources.data) {
      if (source.type === 'file' && source.filePath && fs.existsSync(source.filePath)) {
        source.status = 'queued';
        source.progress = 0;
        source.message = 'En cola para reindexar';
        enqueue(source.id);
        created.push(source);
        console.log(`  ↻ Reindexando archivo: ${source.name}`);
      }
    }
    db.sources.save();
  }

  if (created.length) {
    process.stdout.write('  Indexando documentos');
    const timer = setInterval(() => process.stdout.write('.'), 600);
    await waitForSources(created.map((source) => source.id));
    clearInterval(timer);
    process.stdout.write('\n');
  }

  console.log('  --------------------------------------------------------------');
  console.log(`  Fuentes listas: ${db.sources.data.filter((s) => s.status === 'ready').length}`);
  console.log(`  Fragmentos indexados: ${db.chunks.data.length}`);
  console.log('');
}

main().catch((err) => {
  console.error('Error ejecutando seed:', err);
  process.exit(1);
});
