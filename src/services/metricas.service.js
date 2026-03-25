// ============================================================================
// MICM-INTEL v1.0 — Motor de Métricas (44 de 51 calculables en PostgreSQL)
// ============================================================================
const db = require('../db');

/**
 * Calcula todas las métricas agrupadas por módulo.
 * Retorna un objeto con 8 secciones.
 */
async function calcularMetricas() {
  const [mercado, modulo1, modulo2, modulo3, modulo4, permisologia, score, fisica] =
    await Promise.all([
      calcMercado(),
      calcModulo1(),
      calcModulo2(),
      calcModulo3(),
      calcModulo4(),
      calcPermisologia(),
      calcScore(),
      calcFisica(),
    ]);

  return { mercado, modulo1, modulo2, modulo3, modulo4, permisologia, score, fisica };
}

// ── MERCADO Y SUBSIDIO (M-01 a M-08) ───────────────────────────────────────
async function calcMercado() {
  const sql = `
    SELECT
      p.anio, p.semana_iso, p.producto_id,
      p.subsidio_semanal_total_rd,
      p.subsidio_rdgal,
      p.wti_usd_bbl,
      p.precio_importacion_cif_rdgal,
      p.precio_oficial_rdgal,
      p.ircf_nacional,
      (p.wti_usd_bbl - 47.8) as brecha_wti
    FROM fact_precios_semanales p
    WHERE (p.anio, p.semana_iso) = (
      SELECT anio, semana_iso FROM fact_precios_semanales
      ORDER BY anio DESC, semana_iso DESC LIMIT 1
    )
    ORDER BY p.producto_id
  `;
  const precios = (await db.query(sql)).rows;

  // M-07: Brecha fiscal anual
  const brecha = (await db.query(`SELECT * FROM v_brecha_fiscal_anual ORDER BY anio DESC LIMIT 1`)).rows[0];

  return {
    'M-01': { nombre: 'Subsidio semanal total', valor: precios.reduce((s, p) => s + parseFloat(p.subsidio_semanal_total_rd || 0), 0), unidad: 'RD$' },
    'M-02': { nombre: 'Subsidio por producto', valor: precios.map(p => ({ producto: p.producto_id, subsidio: parseFloat(p.subsidio_semanal_total_rd || 0) })) },
    'M-03': { nombre: 'Diferencial subsidio/galón', valor: precios.map(p => ({ producto: p.producto_id, rdgal: parseFloat(p.subsidio_rdgal || 0) })) },
    'M-04': { nombre: 'Brecha WTI vs presupuesto', valor: precios[0] ? parseFloat(precios[0].brecha_wti || 0) : 0, unidad: 'USD/bbl' },
    'M-05': { nombre: 'Precio paridad CIF', valor: precios.map(p => ({ producto: p.producto_id, cif: parseFloat(p.precio_importacion_cif_rdgal || 0) })) },
    'M-07': { nombre: 'Brecha fiscal anual', valor: brecha ? parseFloat(brecha.brecha_fiscal_rd || 0) : 0, unidad: 'RD$' },
    'M-08': { nombre: 'IRCF nacional', valor: precios[0] ? parseFloat(precios[0].ircf_nacional || 0) : 0 },
  };
}

// ── ANOMALÍAS VOLUMEN — MÓDULO 1 (M-09 a M-16) ────────────────────────────
async function calcModulo1() {
  // M-09, M-10, M-12, M-15: desde fact_anomalias_volumen (última semana)
  const anomalias = (await db.query(`
    SELECT
      COUNT(*)::int as total_estaciones,
      ROUND(AVG(z_score_ajustado_fisico), 3) as z_score_promedio,
      MAX(z_score_ajustado_fisico) as z_score_max,
      ROUND(AVG(ratio_capacidad), 3) as ratio_promedio,
      COUNT(*) FILTER (WHERE ratio_capacidad > 1.0)::int as sobre_capacidad,
      ROUND(AVG(pct_variacion_sem_anterior), 3) as variacion_promedio,
      ROUND(AVG(exceso_zona_fronteriza_pct) FILTER (WHERE exceso_zona_fronteriza_pct > 0), 3) as exceso_fronterizo_promedio,
      COUNT(*) FILTER (WHERE nivel_alerta >= 2)::int as alertadas
    FROM fact_anomalias_volumen
    WHERE (anio, semana_iso) = (
      SELECT anio, semana_iso FROM fact_anomalias_volumen ORDER BY anio DESC, semana_iso DESC LIMIT 1
    )
  `)).rows[0];

  // M-13: Top 20 anomalías
  const top20 = (await db.query(`
    SELECT estacion_id, nombre_establecimiento, provincia, es_zona_fronteriza,
           producto_id, perdida_real_gal, pct_perdida_real, clasificacion
    FROM v_comparacion_perdida_real_vs_fisica
    ORDER BY pct_perdida_real DESC NULLS LAST
    LIMIT 20
  `)).rows;

  // M-14: Despachos fuera de horario
  const fuera = (await db.query(`
    SELECT COUNT(*)::int as total
    FROM fact_despacho_volumen
    WHERE fuera_horario_declarado = true
      AND (anio, semana_iso) = (
        SELECT anio, semana_iso FROM fact_despacho_volumen ORDER BY anio DESC, semana_iso DESC LIMIT 1
      )
  `)).rows[0];

  return {
    'M-09': { nombre: 'Z-score promedio', valor: parseFloat(anomalias.z_score_promedio || 0) },
    'M-10': { nombre: 'Estaciones sobre capacidad', valor: anomalias.sobre_capacidad },
    'M-12': { nombre: 'Variación sem-a-sem promedio', valor: parseFloat(anomalias.variacion_promedio || 0), unidad: '%' },
    'M-13': { nombre: 'Top 20 anomalía', valor: top20 },
    'M-14': { nombre: 'Despachos fuera horario', valor: fuera.total },
    'M-15': { nombre: 'Exceso fronterizo promedio', valor: parseFloat(anomalias.exceso_fronterizo_promedio || 0), unidad: '%' },
  };
}

// ── FISCAL Y DESVÍO — MÓDULO 2 (M-17 a M-23) ──────────────────────────────
async function calcModulo2() {
  const sql = `
    SELECT
      ROUND(AVG(ibf_pct), 3) as ibf_promedio,
      SUM(impuesto_evadido_rd) as impuesto_evadido_total,
      SUM(vol_exento_sospechoso_gal) as exento_sospechoso_total,
      ROUND(AVG(ibf_rolling_12sem), 3) as ibf_rolling,
      SUM(subsidio_glp_capturado_rd) as glp_capturado_total
    FROM fact_triangulacion_fiscal
    WHERE (anio, semana_iso) = (
      SELECT anio, semana_iso FROM fact_triangulacion_fiscal ORDER BY anio DESC, semana_iso DESC LIMIT 1
    )
  `;
  const tri = (await db.query(sql)).rows[0];

  // M-22: Top 10 empresas IBF
  const top10 = (await db.query(`
    SELECT empresa_rnc, empresa_nombre, empresa_tipo, ibf_pct, impuesto_evadido_rd
    FROM fact_triangulacion_fiscal
    WHERE (anio, semana_iso) = (
      SELECT anio, semana_iso FROM fact_triangulacion_fiscal ORDER BY anio DESC, semana_iso DESC LIMIT 1
    )
    ORDER BY ibf_pct DESC
    LIMIT 10
  `)).rows;

  return {
    'M-17': { nombre: 'IBF promedio', valor: parseFloat(tri.ibf_promedio || 0), unidad: '%' },
    'M-18': { nombre: 'Impuesto evadido', valor: parseFloat(tri.impuesto_evadido_total || 0), unidad: 'RD$' },
    'M-19': { nombre: 'Exento sospechoso', valor: parseFloat(tri.exento_sospechoso_total || 0), unidad: 'gal' },
    'M-21': { nombre: 'IBF rolling 12 sem', valor: parseFloat(tri.ibf_rolling || 0), unidad: '%' },
    'M-22': { nombre: 'Top 10 empresas IBF', valor: top10 },
    'M-23': { nombre: 'Subsidio GLP capturado', valor: parseFloat(tri.glp_capturado_total || 0), unidad: 'RD$' },
  };
}

// ── RIESGO FRONTERIZO — MÓDULO 3 (M-24 a M-28) ─────────────────────────────
async function calcModulo3() {
  const sql = `
    SELECT
      g.provincia, rf.ircf, rf.exceso_pct,
      rf.demanda_local_esperada_gal, rf.ircf_slope_12sem, rf.nivel_riesgo
    FROM fact_riesgo_fronterizo rf
    JOIN dim_geografia g ON g.geo_id = rf.geo_id
    WHERE g.es_frontera_haiti = true
      AND (rf.anio, rf.semana_iso) = (
        SELECT anio, semana_iso FROM fact_riesgo_fronterizo ORDER BY anio DESC, semana_iso DESC LIMIT 1
      )
    ORDER BY rf.ircf DESC
  `;
  const frontera = (await db.query(sql)).rows;

  return {
    'M-24': { nombre: 'IRCF por provincia', valor: frontera.map(f => ({ provincia: f.provincia, ircf: parseFloat(f.ircf) })) },
    'M-25': { nombre: 'Exceso fronterizo %', valor: frontera.map(f => ({ provincia: f.provincia, pct: parseFloat(f.exceso_pct) })) },
    'M-26': { nombre: 'Demanda local esperada', valor: frontera.map(f => ({ provincia: f.provincia, gal: parseFloat(f.demanda_local_esperada_gal) })) },
    'M-27': { nombre: 'Tendencia IRCF 12 sem', valor: frontera.map(f => ({ provincia: f.provincia, slope: parseFloat(f.ircf_slope_12sem) })) },
    'M-28': { nombre: 'Mapa calor municipio', valor: 'Disponible vía /api/frontera (GeoJSON)' },
  };
}

// ── INTELIGENCIA DE RED — MÓDULO 4 (M-31, M-33) ────────────────────────────
async function calcModulo4() {
  // M-31: Z-score compartido en red
  const redes = (await db.query(`
    SELECT * FROM v_zscore_red_simultaneo
    WHERE clasificacion_red IN ('SOSPECHOSA', 'CRITICA')
    ORDER BY z_score_promedio_red DESC
    LIMIT 10
  `)).rows;

  // M-33: Fuzzy match propietario — DESHABILITADO por rendimiento
  // v_fuzzy_propietario usa pg_trgm similarity (11-13s sin índice GIN)
  // Habilitar después de: CREATE INDEX idx_estacion_propietario_trgm ON dim_estacion USING gin(propietario_nombre gin_trgm_ops);
  const fuzzy = [];

  return {
    'M-31': { nombre: 'Redes Z-score simultáneo', valor: redes },
    'M-33': { nombre: 'Coincidencia propietario', valor: fuzzy },
  };
}

// ── PERMISOLOGÍA (M-34, M-35, M-37) ────────────────────────────────────────
async function calcPermisologia() {
  const sql = `
    SELECT
      COUNT(*)::int as total,
      COUNT(*) FILTER (WHERE estado_licencia = 'VIGENTE')::int as vigentes,
      COUNT(*) FILTER (WHERE estado_licencia != 'VIGENTE')::int as vencidos,
      ROUND(
        COUNT(*) FILTER (WHERE estado_licencia = 'VIGENTE')::numeric / NULLIF(COUNT(*), 0) * 100, 1
      ) as pct_vigente
    FROM dim_estacion
    WHERE activo = true
  `;
  const lic = (await db.query(sql)).rows[0];

  // M-37: Correlación permiso + anomalía
  const corr = (await db.query(`
    SELECT
      e.estado_licencia,
      ROUND(AVG(a.z_score_ajustado_fisico), 3) as z_score_promedio,
      COUNT(*)::int as estaciones
    FROM dim_estacion e
    JOIN fact_anomalias_volumen a ON a.estacion_id = e.estacion_id
    WHERE (a.anio, a.semana_iso) = (
      SELECT anio, semana_iso FROM fact_anomalias_volumen ORDER BY anio DESC, semana_iso DESC LIMIT 1
    )
    GROUP BY e.estado_licencia
  `)).rows;

  return {
    'M-34': { nombre: '% licencia vigente', valor: parseFloat(lic.pct_vigente || 0), unidad: '%' },
    'M-35': { nombre: 'Estaciones permiso vencido', valor: lic.vencidos },
    'M-37': { nombre: 'Correlación permiso+anomalía', valor: corr },
  };
}

// ── SCORE DE ALERTA (M-38 a M-42) ──────────────────────────────────────────
async function calcScore() {
  // M-41: Alertas por nivel/semana
  const porNivel = (await db.query(`
    SELECT nivel_alerta, COUNT(*)::int as total
    FROM fact_alertas_operativas
    WHERE estado_alerta != 'DESCARTADA'
    GROUP BY nivel_alerta
    ORDER BY nivel_alerta DESC
  `)).rows;

  // M-42: Tasa confirmación
  const tasa = (await db.query(`
    SELECT
      perfil_fraude,
      SUM(total_alertas)::int as total,
      SUM(confirmadas)::int as confirmadas,
      ROUND(SUM(confirmadas)::numeric / NULLIF(SUM(total_alertas), 0) * 100, 1) as tasa_pct
    FROM v_tasa_confirmacion_alertas
    GROUP BY perfil_fraude
  `)).rows;

  // M-38, M-39, M-40: Score promedios por perfil
  const scores = (await db.query(`
    SELECT
      perfil_fraude,
      ROUND(AVG(score_compuesto), 3) as score_promedio,
      COUNT(*)::int as total
    FROM fact_alertas_operativas
    WHERE estado_alerta != 'DESCARTADA'
    GROUP BY perfil_fraude
  `)).rows;

  return {
    'M-38': { nombre: 'Score contrabando', valor: scores.find(s => s.perfil_fraude === 'CONTRABANDO_FRON')?.score_promedio || 0 },
    'M-39': { nombre: 'Score desvío fiscal', valor: scores.find(s => s.perfil_fraude === 'DESVIO_FISCAL')?.score_promedio || 0 },
    'M-40': { nombre: 'Score adulteración', valor: scores.find(s => s.perfil_fraude === 'ADULTERACION')?.score_promedio || 0 },
    'M-41': { nombre: 'Alertas por nivel', valor: porNivel },
    'M-42': { nombre: 'Tasa confirmación', valor: tasa },
  };
}

// ── FÍSICA DEL COMBUSTIBLE (M-43 a M-51) ────────────────────────────────────
async function calcFisica() {
  const sql = `
    SELECT
      ROUND(AVG(expansion_termica_gal), 2) as expansion_promedio,
      ROUND(AVG(evap_estacion_gal), 2) as evap_estacion_promedio,
      ROUND(AVG(evap_transporte_gal), 2) as evap_transporte_promedio,
      ROUND(AVG(perdida_real_gal), 2) as perdida_real_promedio,
      ROUND(AVG(perdida_legitima_total_gal), 2) as perdida_legitima_promedio,
      ROUND(AVG(desviacion_anomala_gal), 2) as desviacion_promedio,
      ROUND(AVG(pct_shrinkage) * 100, 3) as shrinkage_promedio_pct,
      ROUND(AVG(vol_corregido_15c), 2) as vol_corregido_promedio,
      COUNT(*) FILTER (WHERE pct_shrinkage > 0.01)::int as alertas_shrinkage
    FROM fact_balance_fisico
    WHERE (anio, semana_iso) = (
      SELECT anio, semana_iso FROM fact_balance_fisico ORDER BY anio DESC, semana_iso DESC LIMIT 1
    )
  `;
  const bal = (await db.query(sql)).rows[0];

  // M-48: Despacho vs recepción
  const desp = (await db.query(`
    SELECT
      ROUND(AVG(diferencia_despacho_rec), 2) as diferencia_promedio,
      COUNT(*) FILTER (WHERE diferencia_despacho_rec > evap_transporte_gal * 2)::int as sospechosos
    FROM fact_despacho_volumen d
    LEFT JOIN fact_ruta_evaporacion re ON re.estacion_id = d.estacion_id AND re.producto_id = d.producto_id
    WHERE (d.anio, d.semana_iso) = (
      SELECT anio, semana_iso FROM fact_despacho_volumen ORDER BY anio DESC, semana_iso DESC LIMIT 1
    )
  `)).rows[0];

  return {
    'M-43': { nombre: 'Expansión térmica ΔV', valor: parseFloat(bal.expansion_promedio || 0), unidad: 'gal' },
    'M-44': { nombre: 'Evaporación estación', valor: parseFloat(bal.evap_estacion_promedio || 0), unidad: 'gal' },
    'M-45': { nombre: 'Evaporación transporte', valor: parseFloat(bal.evap_transporte_promedio || 0), unidad: 'gal' },
    'M-46': { nombre: 'Balance CORE', valor: `Pérdida real: ${bal.perdida_real_promedio} vs legítima: ${bal.perdida_legitima_promedio} gal` },
    'M-47': { nombre: '% Shrinkage', valor: parseFloat(bal.shrinkage_promedio_pct || 0), alertas: bal.alertas_shrinkage, unidad: '%' },
    'M-48': { nombre: 'Despacho vs recepción', valor: parseFloat(desp.diferencia_promedio || 0), sospechosos: desp.sospechosos, unidad: 'gal' },
    'M-49': { nombre: 'Desviación real vs esperada', valor: parseFloat(bal.desviacion_promedio || 0), unidad: 'gal' },
    'M-50': { nombre: 'Vol corregido 15°C', valor: parseFloat(bal.vol_corregido_promedio || 0), unidad: 'gal' },
    'M-51': { nombre: 'Subsidio/galón base', valor: 'Calculado en M-03' },
  };
}

module.exports = { calcularMetricas };
