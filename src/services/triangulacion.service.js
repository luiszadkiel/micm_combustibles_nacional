// ============================================================================
// MICM-INTEL v1.0 — Servicio de Triangulación Fiscal
// ============================================================================
const db = require('../db');

/**
 * Datos de triangulación fiscal con filtros opcionales.
 */
async function getTriangulacion({ empresa, producto, anio } = {}) {
  const conditions = [];
  const params = [];
  let idx = 1;

  if (empresa) {
    conditions.push(`(empresa_rnc = $${idx} OR empresa_nombre ILIKE '%' || $${idx} || '%')`);
    params.push(empresa);
    idx++;
  }
  if (producto) {
    conditions.push(`producto_id = $${idx++}`);
    params.push(producto);
  }
  if (anio) {
    conditions.push(`anio = $${idx++}`);
    params.push(parseInt(anio));
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const sql = `
    SELECT
      triangulacion_id, periodo_inicio, periodo_fin, anio, semana_iso,
      empresa_rnc, empresa_nombre, empresa_tipo, producto_id,
      vol_importado_dga_gal, vol_declarado_dgii_gal,
      vol_perdida_tecnica_gal, vol_brecha_gal,
      ibf_pct, ibf_rolling_12sem,
      impuesto_evadido_rd,
      tipo_exencion, es_uso_exento,
      vol_exento_declarado_gal, vol_exento_verificable_gal,
      vol_exento_sospechoso_gal,
      subsidio_glp_capturado_rd,
      nivel_alerta
    FROM fact_triangulacion_fiscal
    ${where}
    ORDER BY ibf_pct DESC NULLS LAST
    LIMIT 200
  `;
  return (await db.query(sql, params)).rows;
}

/**
 * Top 10 empresas por IBF (última semana).
 */
async function getTop10IBF() {
  const sql = `
    SELECT empresa_rnc, empresa_nombre, empresa_tipo,
           ibf_pct, impuesto_evadido_rd, vol_brecha_gal
    FROM fact_triangulacion_fiscal
    WHERE (anio, semana_iso) = (
      SELECT anio, semana_iso FROM fact_triangulacion_fiscal ORDER BY anio DESC, semana_iso DESC LIMIT 1
    )
    ORDER BY ibf_pct DESC
    LIMIT 10
  `;
  return (await db.query(sql)).rows;
}

module.exports = { getTriangulacion, getTop10IBF };
