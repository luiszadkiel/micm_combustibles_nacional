// ============================================================================
// MICM-INTEL v1.0 — WebSocket Server
// ============================================================================
const { WebSocketServer } = require('ws');
const config = require('../config');
const { handleMessage } = require('./ws.handlers');

let wss = null;

/**
 * Inicializa el WebSocket server sobre un servidor HTTP existente.
 * @param {import('http').Server} server
 */
function init(server) {
  wss = new WebSocketServer({ 
    server,
    perMessageDeflate: {
      zlibDeflateOptions: {
        chunkSize: 1024,
        memLevel: 7,
        level: 3 
      },
      zlibInflateOptions: {
        chunkSize: 10 * 1024
      },
      clientNoContextTakeover: true,
      serverNoContextTakeover: true,
      serverMaxWindowBits: 10,
      concurrencyLimit: 10,
      threshold: 1024
    }
  });

  wss.on('connection', (ws, req) => {
    const ip = req.socket.remoteAddress;
    console.log(`[WS] Cliente conectado (${clientCount()} activos) desde ${ip}`);

    // Ping/pong para detectar conexiones muertas
    ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });

    // Enviar INITIAL_STATE al conectar
    sendInitialState(ws);

    // Procesar mensajes del cliente
    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());
        handleMessage(ws, msg);
      } catch (err) {
        console.error('[WS] Error parsing mensaje:', err.message);
        ws.send(JSON.stringify({ type: 'ERROR', error: 'Mensaje inválido' }));
      }
    });

    ws.on('close', () => {
      console.log(`[WS] Cliente desconectado (${clientCount()} activos)`);
    });

    ws.on('error', (err) => {
      console.error('[WS] Error en conexión:', err.message);
    });
  });

  // Heartbeat cada 30s para detectar conexiones muertas
  const heartbeat = setInterval(() => {
    wss.clients.forEach((ws) => {
      if (!ws.isAlive) {
        console.log('[WS] Terminando conexión muerta');
        return ws.terminate();
      }
      ws.isAlive = false;
      ws.ping();
    });
  }, 30000);

  wss.on('close', () => clearInterval(heartbeat));

  console.log('[WS] WebSocket server inicializado');
  return wss;
}

/**
 * Envía el estado inicial con todas las capas al cliente recién conectado.
 */
async function sendInitialState(ws) {
  try {
    const estacionesService = require('../services/estaciones.service');
    const alertasService = require('../services/alertas.service');
    const gpsService = require('../services/gps.service');
    const rutasService = require('../services/rutas.service');
    const fronteraService = require('../services/frontera.service');
    const metricasService = require('../services/metricas.service');

    // 1. Fase Ultra-rápida (Lo mínimo para que la UI principal pinte)
    const [estaciones, metricas] = await Promise.all([
      estacionesService.getAll(),
      metricasService.calcularMetricas()
    ]);

    if (ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify({
        type: config.wsTypes.INITIAL_STATE,
        data: { estaciones, metricas },
        timestamp: new Date().toISOString(),
      }));
      console.log('[WS] ✓ INITIAL_STATE (Fase 1: Estaciones+Métricas) enviado');
    }

    // 2. Fase Rápida (Cisternas y Alertas)
    setTimeout(async () => {
      try {
        if (ws.readyState !== ws.OPEN) return;
        const [alertasRaw, cisternas] = await Promise.all([
          alertasService.getAlertas({ nivel: 1 }),
          gpsService.getCisternas()
        ]);
        ws.send(JSON.stringify({
          type: 'UPDATE_ALERTAS',
          data: { alertas: alertasService.toGeoJSON(alertasRaw) }
        }));
        ws.send(JSON.stringify({
          type: 'UPDATE_GPS',
          data: gpsService.toGeoJSON(cisternas)
        }));
        console.log('[WS] ✓ INITIAL_STATE (Fase 2: Alertas+GPS) enviado');
      } catch(e) { console.error('[WS] Error fase 2:', e.message); }
    }, 150);

    // 3. Fase Media (Rutas)
    setTimeout(async () => {
      try {
        if (ws.readyState !== ws.OPEN) return;
        const rutasRaw = await rutasService.getRutas();
        ws.send(JSON.stringify({
          type: 'UPDATE_RUTAS',
          data: { rutas: rutasService.toGeoJSON(rutasRaw) }
        }));
        console.log('[WS] ✓ INITIAL_STATE (Fase 3: Rutas) enviado');
      } catch(e) { console.error('[WS] Error fase 3:', e.message); }
    }, 350);

    // 4. Fase Lenta (Frontera y Mapa Calor)
    setTimeout(async () => {
      try {
        if (ws.readyState !== ws.OPEN) return;
        const [fronteraRaw, mapaCalor] = await Promise.all([
          fronteraService.getFrontera(),
          fronteraService.getMapaCalor(),
        ]);
        ws.send(JSON.stringify({
          type: 'UPDATE_FRONTERA',
          data: {
            frontera: fronteraService.toGeoJSON(fronteraRaw),
            mapaCalor: fronteraService.mapaCalorGeoJSON(mapaCalor),
          },
          timestamp: new Date().toISOString(),
        }));
        console.log('[WS] ✓ INITIAL_STATE (Fase 4: Frontera) enviado');
      } catch(e) { console.error('[WS] Error fase 4:', e.message); }
    }, 700);

  } catch (err) {
    console.error('[WS] Error enviando INITIAL_STATE escalonado:', err.message);
  }
}

/**
 * Broadcast a todos los clientes conectados.
 */
function broadcast(type, data) {
  if (!wss) return;
  const msg = JSON.stringify({ type, data, timestamp: new Date().toISOString() });
  let sent = 0;
  wss.clients.forEach((client) => {
    if (client.readyState === client.OPEN) {
      client.send(msg);
      sent++;
    }
  });
  if (sent > 0) console.log(`[WS] Broadcast ${type} → ${sent} clientes`);
}

/**
 * Cantidad de clientes activos.
 */
function clientCount() {
  return wss ? wss.clients.size : 0;
}

module.exports = { init, broadcast, clientCount };
