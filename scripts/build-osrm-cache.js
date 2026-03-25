/**
 * MICM-INTEL — Script para pre-generar cache de rutas via Mapbox Directions API
 * Ejecutar UNA VEZ: node scripts/build-osrm-cache.js
 * Después el servidor carga instantáneamente de cache/osrm_routes.json
 */
require('dotenv').config();
const https = require('https');
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const CACHE_FILE = path.join(__dirname, '../cache/osrm_routes.json');
const MAPBOX_TOKEN = process.env.MAPBOX_TOKEN;

if (!MAPBOX_TOKEN || MAPBOX_TOKEN === 'pk.tu_token_aqui') {
  console.error('ERROR: MAPBOX_TOKEN no configurado en .env');
  process.exit(1);
}

const pool = new Pool({
  host: 'localhost', port: 5433,
  database: 'Alerta_Combustible', user: 'postgres', password: 'admin',
  options: '-c search_path=micm_intel,public',
});

let cache = {};
try { if (fs.existsSync(CACHE_FILE)) cache = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8')); } catch(e) {}

function fetchMapbox(oLon, oLat, dLon, dLat) {
  return new Promise((resolve) => {
    const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${oLon},${oLat};${dLon},${dLat}?overview=full&geometries=geojson&access_token=${MAPBOX_TOKEN}`;
    const req = https.get(url, { timeout: 15000 }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.code === 'Ok' && json.routes?.[0]?.geometry?.coordinates?.length >= 2)
            return resolve({ coords: json.routes[0].geometry.coordinates, err: null });
          resolve({ coords: null, err: json.message || json.code || 'No route' });
        } catch(e) {
          resolve({ coords: null, err: 'Parse error: ' + data.substring(0, 100) });
        }
      });
    });
    req.on('error', (e) => resolve({ coords: null, err: 'Network: ' + e.message }));
    req.on('timeout', () => { req.destroy(); resolve({ coords: null, err: 'Timeout' }); });
  });
}

(async () => {
  console.log(`Cache existente: ${Object.keys(cache).length} rutas`);
  console.log(`Usando: Mapbox Directions API`);

  const { rows } = await pool.query(`
    SELECT r.origen_lat, r.origen_lon, e.lat as d_lat, e.lon as d_lon
    FROM dim_ruta_distribucion r
    JOIN dim_estacion e ON e.estacion_id = r.estacion_id
    WHERE r.activo = true AND e.activo = true
      AND r.origen_lat IS NOT NULL AND e.lat IS NOT NULL
  `);
  console.log(`Total rutas en DB: ${rows.length}`);

  const missing = [];
  for (const r of rows) {
    const oLat = parseFloat(r.origen_lat), oLon = parseFloat(r.origen_lon);
    const dLat = parseFloat(r.d_lat), dLon = parseFloat(r.d_lon);
    if (!oLat || !oLon || !dLat || !dLon) continue;
    const key = `${oLon.toFixed(3)},${oLat.toFixed(3)};${dLon.toFixed(3)},${dLat.toFixed(3)}`;
    if (!cache[key]) missing.push({ key, oLon, oLat, dLon, dLat });
  }

  console.log(`Faltan: ${missing.length} rutas por calcular`);
  if (missing.length === 0) { console.log('✓ Todo listo!'); process.exit(0); }

  let done = 0, ok = 0, errors = {};
  const BATCH = 5;  // Mapbox permite más concurrencia que OSRM público
  const start = Date.now();

  for (let i = 0; i < missing.length; i += BATCH) {
    const batch = missing.slice(i, i + BATCH);
    await Promise.all(batch.map(({ key, oLon, oLat, dLon, dLat }) =>
      fetchMapbox(oLon, oLat, dLon, dLat).then(result => {
        if (result.coords) { cache[key] = result.coords; ok++; }
        else { errors[result.err] = (errors[result.err] || 0) + 1; }
        done++;
      })
    ));

    const pct = Math.round(done / missing.length * 100);
    const elapsed = ((Date.now() - start) / 1000).toFixed(0);
    process.stdout.write(`\r[${pct}%] ${done}/${missing.length} (${ok} OK) — ${elapsed}s`);

    if (done % 50 === 0) {
      const dir = path.dirname(CACHE_FILE);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(CACHE_FILE, JSON.stringify(cache));
      console.log(`\n  Errors so far:`, errors);
    }
    await new Promise(r => setTimeout(r, 250)); // 250ms entre batches de 5
  }

  fs.writeFileSync(CACHE_FILE, JSON.stringify(cache));
  console.log(`\n✓ ${ok}/${missing.length} rutas calculadas en ${((Date.now()-start)/1000).toFixed(0)}s`);
  console.log(`Cache guardado: ${Object.keys(cache).length} rutas totales`);
  await pool.end();
  process.exit(0);
})();
