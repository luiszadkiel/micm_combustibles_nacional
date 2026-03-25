// ============================================================================
// MICM-INTEL v1.0 — Servicio de Timeline / Navegación Histórica
// ============================================================================
const db = require('../db');

/**
 * Timeline de eventos y precios por año.
 */
async function getTimeline(anio) {
  const sql = `
    SELECT
      fecha, anio, mes_nombre, dia_mes, dia_semana_nombre,
      tipo_fecha_clave, descripcion_fecha_clave,
      precio_gasoil_semana, wti_semana, subsidio_rd_semana
    FROM v_timeline_eventos
    WHERE anio = $1
    ORDER BY fecha
  `;
  return (await db.query(sql, [parseInt(anio)])).rows;
}

/**
 * Navegador semanal con métricas y eventos.
 */
async function getNavegadorSemanal({ anio, semana } = {}) {
  const conditions = [];
  const params = [];
  let idx = 1;

  if (anio) {
    conditions.push(`anio = $${idx++}`);
    params.push(parseInt(anio));
  }
  if (semana) {
    conditions.push(`semana = $${idx++}`);
    params.push(parseInt(semana));
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const sql = `
    SELECT
      anio, semana, semana_inicio, semana_fin, semana_label,
      precio_gasoil, precio_glp, wti, subsidio_gasoil_gal, ircf,
      estaciones_alertadas, alertas_nivel3,
      galones_despachados, estaciones_abastecidas,
      evento_semana
    FROM v_navegador_semanal
    ${where}
    ORDER BY anio DESC, semana DESC
    LIMIT 104
  `;
  return (await db.query(sql, params)).rows;
}

/**
 * Resumen anual.
 */
async function getResumenAnual() {
  const sql = `SELECT * FROM v_resumen_anual ORDER BY anio DESC`;
  return (await db.query(sql)).rows;
}

/**
 * Períodos históricos disponibles.
 */
async function getPeriodos() {
  const sql = `SELECT * FROM v_periodos_historico ORDER BY anio DESC, mes DESC`;
  return (await db.query(sql)).rows;
}

module.exports = { getTimeline, getNavegadorSemanal, getResumenAnual, getPeriodos };
