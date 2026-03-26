const { Pool } = require('pg');
const p = new Pool({
  host: 'localhost', port: 5433, database: 'Alerta_Combustible',
  user: 'postgres', password: 'admin',
  options: '-c search_path=micm_intel,public'
});

(async () => {
  try {
    // Fact tables counts
    const facts = [
      'fact_precios_semanales', 'fact_anomalias_volumen',
      'fact_balance_fisico', 'fact_despacho_volumen',
      'fact_alertas_operativas', 'fact_riesgo_fronterizo',
      'fact_triangulacion_fiscal', 'fact_ruta_evaporacion'
    ];
    console.log('=== FACT TABLE COUNTS ===');
    for (const t of facts) {
      const r = await p.query(`SELECT COUNT(*) as c FROM ${t}`);
      console.log(`  ${t}: ${r.rows[0].c}`);
    }
    
    // dim_red_vial
    const rv = await p.query('SELECT COUNT(*) as c FROM dim_red_vial');
    console.log(`  dim_red_vial: ${rv.rows[0].c}`);

    // Sample products
    console.log('\n=== PRODUCTOS ===');
    const prods = await p.query('SELECT producto_id, nombre_corto, categoria FROM dim_producto');
    prods.rows.forEach(r => console.log(`  ${r.producto_id} | ${r.nombre_corto} | ${r.categoria}`));

    // Frontera provinces
    console.log('\n=== PROVINCIAS FRONTERIZAS ===');
    const front = await p.query("SELECT DISTINCT provincia FROM dim_estacion WHERE es_zona_fronteriza = true ORDER BY provincia");
    front.rows.forEach(r => console.log(`  ${r.provincia}`));

    // All provinces
    console.log('\n=== TODAS PROVINCIAS ===');
    const provs = await p.query("SELECT provincia, COUNT(*) as n FROM dim_estacion WHERE activo=true GROUP BY provincia ORDER BY n DESC");
    provs.rows.forEach(r => console.log(`  ${r.provincia}: ${r.n}`));

    // Sample estacion with licencia
    console.log('\n=== LICENCIAS ===');
    const lic = await p.query("SELECT estado_licencia, COUNT(*) as n FROM dim_estacion GROUP BY estado_licencia");
    lic.rows.forEach(r => console.log(`  ${r.estado_licencia}: ${r.n}`));

    await p.end();
  } catch (e) {
    console.error('FATAL:', e.message);
    await p.end();
  }
})();
