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
  wss = new WebSocketServer({ server });

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

    const [estaciones, alertasRaw, cisternas, rutasRaw, metricas] =
      await Promise.all([
        estacionesService.getAll(),
        alertasService.getAlertas({ nivel: 1 }),
        gpsService.getCisternas(),
        rutasService.getRutas(),
        metricasService.calcularMetricas(),
      ]);

    const fastPayload = {
      type: config.wsTypes.INITIAL_STATE,
      data: {
        estaciones,
        alertas: alertasService.toGeoJSON(alertasRaw),
        gps: gpsService.toGeoJSON(cisternas),
        rutas: rutasService.toGeoJSON(rutasRaw),
        metricas,
      },
      timestamp: new Date().toISOString(),
    };

    if (ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify(fastPayload));
      console.log('[WS] ✓ INITIAL_STATE (Fast layer) enviado');
    }

    // Lazy load slow layers (Frontera & Mapa Calor)
    const [fronteraRaw, mapaCalor] = await Promise.all([
      fronteraService.getFrontera(),
      fronteraService.getMapaCalor(),
    ]);

    const slowPayload = {
      type: 'UPDATE_FRONTERA', // Or a more generic type
      data: {
        frontera: fronteraService.toGeoJSON(fronteraRaw),
        mapaCalor: fronteraService.mapaCalorGeoJSON(mapaCalor),
      },
      timestamp: new Date().toISOString(),
    };

    if (ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify(slowPayload));
      console.log('[WS] ✓ INITIAL_STATE (Slow layer) enviado');
    }
  } catch (err) {
    console.error('[WS] Error enviando INITIAL_STATE:', err.message);
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
