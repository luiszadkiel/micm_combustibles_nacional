const db = require('./src/db');
const fs = require('fs');
const path = require('path');

(async () => {
  // 1. Check station coordinates completeness
  const total = await db.query(`SELECT COUNT(*) as cnt FROM dim_estacion WHERE activo = true`);
  const withCoords = await db.query(`SELECT COUNT(*) as cnt FROM dim_estacion WHERE activo = true AND lat IS NOT NULL AND lon IS NOT NULL`);
  const withoutCoords = await db.query(`SELECT COUNT(*) as cnt FROM dim_estacion WHERE activo = true AND (lat IS NULL OR lon IS NULL)`);
  
  console.log('=== ESTADO DE COORDENADAS ===');
  console.log(`Total estaciones activas: ${total.rows[0].cnt}`);
  console.log(`Con coordenadas: ${withCoords.rows[0].cnt}`);
  console.log(`SIN coordenadas: ${withoutCoords.rows[0].cnt}`);
  
  if (parseInt(withoutCoords.rows[0].cnt) > 0) {
    const missing = await db.query(`SELECT estacion_id, nombre FROM dim_estacion WHERE activo = true AND (lat IS NULL OR lon IS NULL) LIMIT 10`);
    console.log('Ejemplos sin coordenadas:', missing.rows);
  }

  // 2. Check OSRM cache status
  const CACHE_FILE = path.join(__dirname, 'cache/osrm_routes.json');
  console.log('\n=== ESTADO DEL CACHE OSRM ===');
  console.log(`Archivo: ${CACHE_FILE}`);
  console.log(`Existe: ${fs.existsSync(CACHE_FILE)}`);
  
  if (fs.existsSync(CACHE_FILE)) {
    const stats = fs.statSync(CACHE_FILE);
    console.log(`Tamaño: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
    console.log(`Última modificación: ${stats.mtime}`);
    const cache = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
    console.log(`Rutas en cache: ${Object.keys(cache).length}`);
    
    // Sample a key
    const keys = Object.keys(cache);
    if (keys.length > 0) {
      const sampleKey = keys[0];
      const coords = cache[sampleKey];
      console.log(`Ejemplo llave: ${sampleKey}`);
      console.log(`Puntos en esa ruta: ${coords.length}`);
    }
  }

  // 3. Check total routes in DB
  const routes = await db.query(`SELECT COUNT(*) as cnt FROM dim_ruta_distribucion WHERE activo = true`);
  console.log(`\nTotal rutas activas en DB: ${routes.rows[0].cnt}`);

  process.exit(0);
})();
