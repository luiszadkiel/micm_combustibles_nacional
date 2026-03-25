const db = require('./src/db');
const fs = require('fs');

async function analyze() {
  try {
    let out = '';
    const views = ['v_mapa_calor_municipio', 'v_gps_temperatura_evaporacion'];
    for (const v of views) {
      const res = await db.query(`SELECT pg_get_viewdef('${v}', true)`);
      out += `--- ${v} ---\n`;
      out += res.rows[0].pg_get_viewdef + '\n';
    }

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
    out += '--- EXPLAIN v_mapa_calor_municipio ---\n';
    rMap.rows.forEach(r => out += r['QUERY PLAN'] + '\n');

    const qGps = `EXPLAIN ANALYZE SELECT
      g.despacho_id,
      g.numero_cisterna,
      g.estacion_id,
      g.nombre_establecimiento,
      g.provincia,
      g.es_zona_fronteriza
    FROM v_gps_temperatura_evaporacion g
    JOIN dim_estacion e ON e.estacion_id = g.estacion_id
    LEFT JOIN dim_ruta_distribucion r ON r.estacion_id = g.estacion_id
    ORDER BY g.fecha_despacho DESC, g.hora_despacho DESC
    LIMIT 200`;

    const rGps = await db.query(qGps);
    out += '--- EXPLAIN v_gps... ---\n';
    rGps.rows.forEach(r => out += r['QUERY PLAN'] + '\n');

    fs.writeFileSync('analyze.txt', out);
    console.log('Done!');
  } catch (err) {
    console.error(err);
  } finally {
    process.exit();
  }
}
analyze();
