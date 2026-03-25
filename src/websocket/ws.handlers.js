// ============================================================================
// MICM-INTEL v1.0 — WebSocket Message Handlers (Filter Layer)
// ============================================================================
const config = require('../config');
const alertasService    = require('../services/alertas.service');
const timelineService   = require('../services/timeline.service');
const estacionesService = require('../services/estaciones.service');
const triangulacionService = require('../services/triangulacion.service');

/**
 * Procesa un mensaje entrante del cliente WebSocket.
 * Cada tipo se delega al servicio correspondiente.
 */
async function handleMessage(ws, msg) {
  const { type, filters = {} } = msg;
  console.log(`[WS-Handler] ← ${type}`, JSON.stringify(filters).substring(0, 100));

  try {
    switch (type) {
      // ── FILTER_ALERTAS ──────────────────────────────────────────────────
      case config.wsTypes.FILTER_ALERTAS: {
        const alertas = await alertasService.getAlertas({
          nivel:     filters.nivel,
          perfil:    filters.perfil,
          provincia: filters.provincia,
          producto:  filters.producto,
          estado:    filters.estado,
          frontera:  filters.frontera,
        });
        send(ws, config.wsTypes.FILTERED_ALERTAS, {
          alertas: alertasService.toGeoJSON(alertas),
          total: alertas.length,
        });
        break;
      }

      // ── FILTER_TIMELINE ─────────────────────────────────────────────────
      case config.wsTypes.FILTER_TIMELINE: {
        const { anio, semana } = filters;
        if (anio) {
          const timeline = await timelineService.getTimeline(anio);
          const navegador = await timelineService.getNavegadorSemanal({ anio, semana });
          send(ws, config.wsTypes.FILTERED_TIMELINE, { timeline, navegador });
        } else {
          const navegador = await timelineService.getNavegadorSemanal();
          send(ws, config.wsTypes.FILTERED_TIMELINE, { navegador });
        }
        break;
      }

      // ── GET_ESTACION_DETAIL ─────────────────────────────────────────────
      case config.wsTypes.GET_ESTACION_DETAIL: {
        const { estacion_id } = filters;
        if (!estacion_id) {
          send(ws, 'ERROR', { error: 'estacion_id requerido' });
          break;
        }
        const detalle = await estacionesService.getById(estacion_id);
        if (detalle) {
          send(ws, config.wsTypes.ESTACION_DETAIL, detalle);
        } else {
          send(ws, 'ERROR', { error: `Estación ${estacion_id} no encontrada` });
        }
        break;
      }

      // ── GET_TRIANGULACION ───────────────────────────────────────────────
      case config.wsTypes.GET_TRIANGULACION: {
        const datos = await triangulacionService.getTriangulacion({
          empresa:  filters.empresa,
          producto: filters.producto,
          anio:     filters.anio,
        });
        send(ws, config.wsTypes.TRIANGULACION_DATA, { total: datos.length, datos });
        break;
      }

      default:
        console.warn(`[WS-Handler] Tipo desconocido: ${type}`);
        send(ws, 'ERROR', { error: `Tipo de mensaje desconocido: ${type}` });
    }
  } catch (err) {
    console.error(`[WS-Handler] Error procesando ${type}:`, err.message);
    send(ws, 'ERROR', { error: err.message });
  }
}

/**
 * Helper para enviar mensaje a un cliente.
 */
function send(ws, type, data) {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify({ type, data, timestamp: new Date().toISOString() }));
  }
}

module.exports = { handleMessage };
