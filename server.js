// ============================================================================
// MICM-INTEL v1.0 — Punto de Entrada (server.js)
// Sistema Nacional de Inteligencia de Combustibles
// ============================================================================
const express = require('express');
const http    = require('http');
const cors    = require('cors');
const path    = require('path');

const config       = require('./src/config');
const db           = require('./src/db');
const apiRoutes    = require('./src/routes/api.routes');
const chatRoute    = require('./src/routes/chat.route');
const wsServer     = require('./src/websocket/ws.server');
const wsPolling    = require('./src/websocket/ws.polling');
const alertasService  = require('./src/services/alertas.service');
const gpsService      = require('./src/services/gps.service');
const metricasService = require('./src/services/metricas.service');
const fronteraService = require('./src/services/frontera.service');

// ── Express app ─────────────────────────────────────────────────────────────
const app = express();
app.use(cors());
app.use(express.json());

// Servir frontend
app.use(express.static(path.join(__dirname, 'public')));

// Inyectar config de Mapbox al cliente
app.get('/api/config', (req, res) => {
  res.json({
    mapboxToken: config.mapbox.token,
    mapboxStyle: config.mapbox.style,
    wsUrl: `ws://localhost:${config.server.port}`,
    polling: config.polling,
  });
});

// Montar rutas API
app.use('/api', apiRoutes);
app.use('/api', chatRoute);

// Exponer wsClientCount para /api/health
app.locals.wsClientCount = 0;

// ── HTTP + WebSocket server ─────────────────────────────────────────────────
const server = http.createServer(app);
const wss = wsServer.init(server);

// Actualizar contador para health endpoint
setInterval(() => {
  app.locals.wsClientCount = wsServer.clientCount();
}, 5000);

// Refrescar Vista Materializada cada 10 minutos
const mvRefreshTimer = setInterval(async () => {
  try {
    await db.query(`REFRESH MATERIALIZED VIEW CONCURRENTLY micm_intel.mv_mapa_calor_municipio;`);
    console.log('[DB] Vista de Mapa Calor refrescada concurrentemente.');
    // Trigger update for clients
    const fronteraService = require('./src/services/frontera.service');
    const config = require('./src/config');
    const [fronteraRaw, mapaCalor] = await Promise.all([
      fronteraService.getFrontera(),
      fronteraService.getMapaCalor()
    ]);
    wsServer.broadcast(config.wsTypes.UPDATE_FRONTERA, {
      frontera: fronteraService.toGeoJSON(fronteraRaw),
      mapaCalor: fronteraService.mapaCalorGeoJSON(mapaCalor),
    });
  } catch(e) {
    console.error('[DB] Error refrescando mapa de calor:', e.message);
  }
}, config.polling.frontera);

// ── LISTEN/NOTIFY handler ───────────────────────────────────────────────────
async function onDBNotification(channel, payload) {
  console.log(`[NOTIFY] Canal: ${channel}`);
  try {
    switch (channel) {
      case 'micm_alertas': {
        const alertas = await alertasService.getAlertas({ nivel: 1 });
        wsServer.broadcast(config.wsTypes.UPDATE_ALERTAS, {
          alertas: alertasService.toGeoJSON(alertas),
          summary: await alertasService.getAlertasSummary(),
        });
        break;
      }
      case 'micm_despachos':
      case 'micm_anomalias': {
        const cisternas = await gpsService.getCisternas();
        wsServer.broadcast(config.wsTypes.UPDATE_GPS, gpsService.toGeoJSON(cisternas));
        break;
      }
      case 'micm_precios': {
        const metricas = await metricasService.calcularMetricas();
        wsServer.broadcast(config.wsTypes.UPDATE_METRICAS, metricas);
        break;
      }
    }
  } catch (err) {
    console.error(`[NOTIFY] Error procesando ${channel}:`, err.message);
  }
}

// ── Arranque ────────────────────────────────────────────────────────────────
async function start() {
  console.log('');
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║  MICM-INTEL v1.0 — Sistema Nacional de Inteligencia        ║');
  console.log('║  de Combustibles · República Dominicana                    ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log('');

  // Verificar DB
  const dbHealth = await db.healthCheck();
  if (dbHealth.connected) {
    console.log(`[DB] ✓ Conectado a ${dbHealth.db} @ ${config.pg.host}:${config.pg.port}`);
  } else {
    console.error(`[DB] ✗ No se pudo conectar: ${dbHealth.error}`);
    console.error('[DB] Verifica las credenciales en .env');
  }

  // Iniciar LISTEN/NOTIFY
  try {
    await db.startListening(onDBNotification);
  } catch (err) {
    console.warn('[DB-LISTEN] No se pudo iniciar LISTEN (triggers opcionales):', err.message);
  }

  // Iniciar polling fallback (siempre activo)
  wsPolling.startPolling();

  // Levantar servidor HTTP
  server.listen(config.server.port, () => {
    console.log('');
    console.log(`[SERVER] ✓ Servidor activo en http://localhost:${config.server.port}`);
    console.log(`[SERVER]   API REST:    http://localhost:${config.server.port}/api/health`);
    console.log(`[SERVER]   WebSocket:   ws://localhost:${config.server.port}`);
    console.log(`[SERVER]   Frontend:    http://localhost:${config.server.port}`);
    console.log(`[SERVER]   Mapbox:      ${config.mapbox.token ? '✓ Token configurado' : '✗ Sin token — configura MAPBOX_TOKEN en .env'}`);
    console.log('');
  });
}

// ── Graceful shutdown ───────────────────────────────────────────────────────
process.on('SIGINT', async () => {
  console.log('\n[SERVER] Cerrando...');
  clearInterval(mvRefreshTimer);
  wsPolling.stopPolling();
  server.close();
  await db.shutdown();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  clearInterval(mvRefreshTimer);
  wsPolling.stopPolling();
  server.close();
  await db.shutdown();
  process.exit(0);
});

// ── GO ──────────────────────────────────────────────────────────────────────
start().catch(err => {
  console.error('[FATAL]', err);
  process.exit(1);
});
