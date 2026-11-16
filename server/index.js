'use strict';

require('dotenv').config();

const path = require('path');
const express = require('express');
const cookieParser = require('cookie-parser');
const { db } = require('./lib/store');
const { publicBaseUrl } = require('./routes/admin');
const adminRoutes = require('./routes/admin').router;
const publicRoutes = require('./routes/public');
const { verifyChallenge, handleWhatsApp, handleMetaMessaging } = require('./integrations/meta');
const { handleTelegram } = require('./integrations/telegram');
const { enqueue } = require('./rag/indexer');

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const PUBLIC_DIR = path.join(__dirname, '..', 'public');

app.disable('x-powered-by');
app.set('trust proxy', 1);

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  if (req.path.startsWith('/admin')) {
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Content-Security-Policy', "frame-ancestors 'self'");
  } else if (req.path === '/embed.html') {
    res.setHeader('Content-Security-Policy', 'frame-ancestors *');
  }
  next();
});

app.use(
  express.json({
    limit: '6mb',
    verify: (req, res, buf) => {
      req.rawBody = buf;
    }
  })
);
app.use(express.urlencoded({ extended: false, limit: '1mb' }));
app.use(cookieParser());

// CORS para el chat publico (permite integrarlo desde otras webs).
app.use('/api/public', (req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Max-Age', '86400');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.use('/api/public', publicRoutes);
app.use('/api/admin', adminRoutes);

app.get('/webhooks/whatsapp', (req, res) =>
  verifyChallenge(req, res, db.settings.data.channels.whatsapp.verifyToken, 'whatsapp')
);
app.post('/webhooks/whatsapp', handleWhatsApp);

app.get('/webhooks/meta/messenger', (req, res) =>
  verifyChallenge(req, res, db.settings.data.channels.messenger.verifyToken, 'messenger')
);
app.post('/webhooks/meta/messenger', (req, res) => handleMetaMessaging(req, res, 'messenger'));

app.get('/webhooks/meta/instagram', (req, res) =>
  verifyChallenge(req, res, db.settings.data.channels.instagram.verifyToken, 'instagram')
);
app.post('/webhooks/meta/instagram', (req, res) => handleMetaMessaging(req, res, 'instagram'));

app.post('/webhooks/telegram/:secret', handleTelegram);

app.get('/admin', (req, res) => res.redirect('/admin.html'));

app.use(
  express.static(PUBLIC_DIR, {
    extensions: ['html'],
    setHeaders(res, filePath) {
      if (filePath.endsWith('widget.js')) {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Cache-Control', 'public, max-age=300');
      }
      if (filePath.endsWith('.html')) {
        res.setHeader('Cache-Control', 'no-cache');
      }
    }
  })
);

app.get('/', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'index.html')));

app.use((req, res) => {
  if (req.path.startsWith('/api/') || req.path.startsWith('/webhooks/')) {
    return res.status(404).json({ error: 'Ruta no encontrada.' });
  }
  return res.status(404).sendFile(path.join(PUBLIC_DIR, '404.html'), (err) => {
    if (err) res.status(404).send('No encontrado');
  });
});

app.use((err, req, res, next) => {
  if (err && err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'El cuerpo de la solicitud no es JSON valido.' });
  }
  if (err && err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ error: 'El archivo supera el limite permitido.' });
  }
  console.error('[server] Error no controlado:', err);
  if (res.headersSent) return next(err);
  return res.status(500).json({ error: 'Error interno del servidor.' });
});

// Las fuentes que quedaron a medias por un reinicio se marcan para reintentar.
let interrupted = 0;
for (const source of db.sources.data) {
  if (source.status === 'processing' || source.status === 'queued') {
    source.status = 'error';
    source.error = 'El servidor se reinicio durante el procesamiento. Usa "Reindexar" para continuar.';
    source.message = 'Interrumpido';
    source.progress = 0;
    interrupted += 1;
  }
}
if (interrupted) {
  db.sources.save();
  console.log(`[boot] ${interrupted} fuente(s) interrumpida(s) marcada(s) para reindexar.`);
}

if (require.main === module) {
  const server = app.listen(PORT, () => {
    const base = publicBaseUrl({ protocol: 'http', get: () => `localhost:${PORT}` });
    console.log('');
    console.log('  Colageno Chatbot');
    console.log('  ---------------------------------------------');
    console.log(`  Panel:    ${base}/admin`);
    console.log(`  Widget:   ${base}/widget.js`);
    console.log(`  Webhook:  ${base}/webhooks/whatsapp`);
    console.log('  ---------------------------------------------');
    if (db.settings.data.ai.provider === 'demo') {
      console.log('  Modo demo activo (sin proveedor de IA). Configura OpenAI, Claude o Gemini en el panel.');
    }
    console.log('');
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`El puerto ${PORT} esta ocupado. Cambia PORT en el archivo .env.`);
    } else {
      console.error('No se pudo iniciar el servidor:', err);
    }
    process.exit(1);
  });

  function shutdown(signal) {
    console.log(`\n[server] Cerrando (${signal})...`);
    server.close(() => {
      db.flushAll();
      process.exit(0);
    });
    setTimeout(() => process.exit(0), 3000).unref();
  }
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

module.exports = app;
