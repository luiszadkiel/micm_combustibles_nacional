const { Pool } = require('pg');
const p = new Pool({
  host: 'localhost', port: 5433, database: 'Alerta_Combustible',
  user: 'postgres', password: 'admin',
  options: '-c search_path=micm_intel,public'
});

(async () => {
  try {
    const tables = [
      'dim_estacion', 'dim_geografia', 'dim_producto', 'dim_clima',
      'dim_tiempo', 'dim_parametros_fisicos', 'dim_ruta_distribucion',
      'dim_politico', 'dim_noticia_fraude', 'dim_red_vial',
      'fact_precios_semanales', 'fact_anomalias_volumen',
      'fact_balance_fisico', 'fact_despacho_volumen',
      'fact_alertas_operativas', 'fact_riesgo_fronterizo',
      'fact_triangulacion_fiscal', 'fact_ruta_evaporacion'
    ];
    for (const t of tables) {
      try {
        const r = await p.query(`SELECT COUNT(*) as c FROM ${t}`);
        console.log(`${t}: ${r.rows[0].c} rows`);
      } catch (e) {
        console.log(`${t}: ERROR - ${e.message.split('\n')[0]}`);
      }
    }
    // Check some sample data
    const sampleEst = await p.query('SELECT estacion_id, provincia, es_zona_fronteriza FROM dim_estacion LIMIT 3');
    console.log('\nSample dim_estacion:', JSON.stringify(sampleEst.rows));
    const sampleProd = await p.query('SELECT producto_id, nombre_corto FROM dim_producto LIMIT 10');
    console.log('Sample dim_producto:', JSON.stringify(sampleProd.rows));
    const sampleGeo = await p.query('SELECT geo_id, provincia, municipio, es_frontera_haiti FROM dim_geografia WHERE es_frontera_haiti = true LIMIT 5');
    console.log('Sample frontera:', JSON.stringify(sampleGeo.rows));
    const sampleClima = await p.query('SELECT clima_id, mes, temperatura_media_c, zona_climatica FROM dim_clima LIMIT 3');
    console.log('Sample dim_clima:', JSON.stringify(sampleClima.rows));
    await p.end();
  } catch (e) {
    console.error('FATAL:', e.message);
    await p.end();
  }
})();
