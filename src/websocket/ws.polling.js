// ============================================================================
// MICM-INTEL v1.0 — Polling Fallback (sin triggers funciona igual)
// ============================================================================
const config = require('../config');
const { broadcast } = require('./ws.server');

const alertasService  = require('../services/alertas.service');
const gpsService      = require('../services/gps.service');
const metricasService = require('../services/metricas.service');
const fronteraService = require('../services/frontera.service');

const timers = [];

/**
 * Inicia los 4 timers de polling automático.
 */
function startPolling() {
  console.log('[POLLING] Iniciando timers de refresco automático...');

  // GPS cisternas — cada 15s
  timers.push(setInterval(async () => {
    try {
      const cisternas = await gpsService.getCisternas();
      broadcast(config.wsTypes.UPDATE_GPS, gpsService.toGeoJSON(cisternas));
    } catch (err) {
      console.error('[POLLING] Error GPS:', err.message);
    }
  }, config.polling.gps));
  console.log(`[POLLING] GPS: cada ${config.polling.gps / 1000}s`);

  // Alertas — cada 30s
  timers.push(setInterval(async () => {
    try {
      const alertas = await alertasService.getAlertas({ nivel: 1 });
      broadcast(config.wsTypes.UPDATE_ALERTAS, {
        alertas: alertasService.toGeoJSON(alertas),
        summary: await alertasService.getAlertasSummary(),
      });
    } catch (err) {
      console.error('[POLLING] Error alertas:', err.message);
    }
  }, config.polling.alertas));
  console.log(`[POLLING] Alertas: cada ${config.polling.alertas / 1000}s`);

  // Métricas nacionales — cada 60s
  timers.push(setInterval(async () => {
    try {
      const metricas = await metricasService.calcularMetricas();
      broadcast(config.wsTypes.UPDATE_METRICAS, metricas);
    } catch (err) {
      console.error('[POLLING] Error métricas:', err.message);
    }
  }, config.polling.metricas));
  console.log(`[POLLING] Métricas: cada ${config.polling.metricas / 1000}s`);

  // Riesgo fronterizo — cada 5min
  timers.push(setInterval(async () => {
    try {
      const [frontera, mapaCalor] = await Promise.all([
        fronteraService.getFrontera(),
        fronteraService.getMapaCalor(),
      ]);
      broadcast(config.wsTypes.UPDATE_FRONTERA, {
        frontera: fronteraService.toGeoJSON(frontera),
        mapaCalor: fronteraService.mapaCalorGeoJSON(mapaCalor),
      });
    } catch (err) {
      console.error('[POLLING] Error frontera:', err.message);
    }
  }, config.polling.frontera));
  console.log(`[POLLING] Frontera: cada ${config.polling.frontera / 1000}s`);
}

/**
 * Detiene todos los timers.
 */
function stopPolling() {
  timers.forEach(t => clearInterval(t));
  timers.length = 0;
  console.log('[POLLING] Timers detenidos');
}

module.exports = { startPolling, stopPolling };
