const db = require('./src/db');
const fs = require('fs');

async function fix() {
  const sql = `
-- Drop the slow view
DROP VIEW IF EXISTS v_mapa_calor_municipio;

-- Recreate properly by pre-aggregating the facts
CREATE OR REPLACE VIEW v_mapa_calor_municipio AS
WITH 
  anomalias_agg AS (
    SELECT e.geo_id, 
           COUNT(a.anomalia_id) FILTER (WHERE a.nivel_alerta >= 2) as alertas_activas,
           AVG(a.z_score_ajustado_fisico) as z_score_promedio
    FROM fact_anomalias_volumen a
    JOIN dim_estacion e ON e.estacion_id = a.estacion_id
    GROUP BY e.geo_id
  ),
  evap_agg AS (
    SELECT e.geo_id,
           AVG(re.pct_perdida_esperada) as pct_evap_promedio,
           AVG(re.temperatura_media_c) as temp_media_c
    FROM fact_ruta_evaporacion re
    JOIN dim_estacion e ON e.estacion_id = re.estacion_id
    GROUP BY e.geo_id
  ),
  est_count AS (
    SELECT geo_id, COUNT(estacion_id) as estaciones
    FROM dim_estacion
    GROUP BY geo_id
  ),
  riesgo_fronterizo AS (
    SELECT geo_id, 
           SUM(vol_despachado_gal) as vol_total_frontera_gal,
           AVG(ircf) as ircf_promedio
    FROM fact_riesgo_fronterizo
    GROUP BY geo_id
  )
SELECT 
    g.municipio,
    g.provincia,
    g.geo_id,
    g.lat,
    g.lon,
    g.es_frontera_haiti,
    COALESCE(ec.estaciones, 0) AS estaciones,
    ROUND(ea.pct_evap_promedio, 4) AS pct_evap_promedio,
    ROUND(ea.temp_media_c, 1) AS temp_media_c,
    ROUND(aa.z_score_promedio, 4) AS z_score_promedio,
    COALESCE(aa.alertas_activas, 0) AS alertas_activas,
    ROUND(rf.vol_total_frontera_gal, 0) AS vol_total_frontera_gal,
    ROUND(rf.ircf_promedio, 4) AS ircf_promedio,
    CASE
        WHEN aa.z_score_promedio > 3 OR rf.ircf_promedio > 0.45 THEN 5
        WHEN aa.z_score_promedio > 2 OR rf.ircf_promedio > 0.35 THEN 4
        WHEN aa.z_score_promedio > 1.5 THEN 3
        WHEN aa.z_score_promedio > 1 THEN 2
        ELSE 1
    END AS escala_riesgo_1a5
FROM dim_geografia g
LEFT JOIN est_count ec ON ec.geo_id = g.geo_id
LEFT JOIN evap_agg ea ON ea.geo_id = g.geo_id
LEFT JOIN anomalias_agg aa ON aa.geo_id = g.geo_id
LEFT JOIN riesgo_fronterizo rf ON rf.geo_id = g.geo_id
WHERE g.nivel = 'Municipio';

-- Add indexes for fact_despacho_volumen, fact_ruta_evaporacion, fact_balance_fisico
CREATE INDEX IF NOT EXISTS idx_despacho_estacion_prod ON fact_despacho_volumen(estacion_id, producto_id, fecha_despacho);
CREATE INDEX IF NOT EXISTS idx_ruta_evap_estacion ON fact_ruta_evaporacion(estacion_id, producto_id, mes);
CREATE INDEX IF NOT EXISTS idx_balance_estacion_prod ON fact_balance_fisico(estacion_id, producto_id, periodo_inicio);
CREATE INDEX IF NOT EXISTS idx_anomalias_estacion ON fact_anomalias_volumen(estacion_id);
`;

  try {
    console.log('Applying DB fixes...');
    await db.query(sql);
    console.log('DB Fixes applied successfully.');

    // Re-verify the speed
    const qMap = `EXPLAIN ANALYZE SELECT
      municipio, provincia, geo_id, lat, lon,
      es_frontera_haiti, estaciones,
      z_score_promedio, alertas_activas,
      ircf_promedio, escala_riesgo_1a5,
      pct_evap_promedio, temp_media_c
    FROM v_mapa_calor_municipio
    WHERE lat IS NOT NULL AND lon IS NOT NULL
    ORDER BY escala_riesgo_1a5 DESC`;
    
    const rMap = await db.query(qMap);
    console.log('--- NEW EXPLAIN v_mapa_calor_municipio ---');
    rMap.rows.forEach(r => console.log(r['QUERY PLAN']));

  } catch (err) {
    console.error(err);
  } finally {
    process.exit();
  }
}

fix();
