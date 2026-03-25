// ============================================================================
// MICM-INTEL v1.0 — Mapbox Directions Route Cache Service
// Pre-computes road-following routes from Mapbox and caches to disk.
// ============================================================================
const fs = require('fs');
const path = require('path');
const https = require('https');
const config = require('../config');

const MAPBOX_TOKEN = config.mapbox.token;

const CACHE_FILE = path.join(__dirname, '../../cache/osrm_routes.json');
let cache = {};

/** Load cache from disk */
function loadCache() {
  try {
    if (fs.existsSync(CACHE_FILE)) {
      cache = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
      console.log(`[OSRM] ✓ Cache cargado: ${Object.keys(cache).length} rutas`);
    }
  } catch (e) {
    console.warn('[OSRM] Cache load error:', e.message);
    cache = {};
  }
}

/** Save cache to disk */
function saveCache() {
  try {
    const dir = path.dirname(CACHE_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(CACHE_FILE, JSON.stringify(cache));
    console.log(`[OSRM] ✓ Cache guardado: ${Object.keys(cache).length} rutas`);
  } catch (e) {
    console.warn('[OSRM] Cache save error:', e.message);
  }
}

/** Fetch route from Mapbox Directions API with retries */
function fetchRoute(originLon, originLat, destLon, destLat) {
  return new Promise((resolve) => {
    const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${originLon},${originLat};${destLon},${destLat}?overview=full&geometries=geojson&access_token=${MAPBOX_TOKEN}`;

    const attempt = (tries) => {
      https.get(url, (res) => {
        let data = '';
        res.on('data', c => data += c);
        res.on('end', () => {
          try {
            const json = JSON.parse(data);
            if (json.code === 'Ok' && json.routes?.[0]?.geometry?.coordinates?.length >= 2) {
              resolve(json.routes[0].geometry.coordinates); // [lon,lat] pairs
            } else {
              resolve(null);
            }
          } catch { resolve(null); }
        });
      }).on('error', () => {
        if (tries > 0) setTimeout(() => attempt(tries - 1), 500);
        else resolve(null);
      });
    };
    attempt(2);
  });
}

/** Get cached route coords (GeoJSON [lon,lat] format) */
function getRoute(originLat, originLon, destLat, destLon) {
  const key = `${originLon.toFixed(3)},${originLat.toFixed(3)};${destLon.toFixed(3)},${destLat.toFixed(3)}`;
  return cache[key] || null;
}

/**
 * Pre-compute OSRM routes for all rutas.
 * All callers share the same promise — if computation is in progress,
 * subsequent callers wait for it to finish instead of returning early.
 */
let computePromise = null;

async function precomputeRoutes(rutas, onProgress) {
  // If already computing, wait for the existing computation to finish
  if (computePromise) {
    await computePromise;
    return;
  }

  const missing = [];
  for (const r of rutas) {
    const oLat = parseFloat(r.origen_lat);
    const oLon = parseFloat(r.origen_lon);
    const dLat = parseFloat(r.destino_lat || r.lat);
    const dLon = parseFloat(r.destino_lon || r.lon);
    if (!oLat || !oLon || !dLat || !dLon) continue;

    const key = `${oLon.toFixed(3)},${oLat.toFixed(3)};${dLon.toFixed(3)},${dLat.toFixed(3)}`;
    if (!cache[key]) missing.push({ key, oLon, oLat, dLon, dLat });
  }

  if (missing.length === 0) {
    console.log('[OSRM] ✓ Todas las rutas ya en cache');
    return;
  }

  // Start computation and share the promise
  computePromise = doCompute(missing, onProgress);
  await computePromise;
  computePromise = null;
}

async function doCompute(missing, onProgress) {
  console.log(`[OSRM] Calculando ${missing.length} rutas...`);
  let done = 0, ok = 0;
  let batchResults = [];
  const BATCH = 40; // Máxima velocidad segura

  for (let i = 0; i < missing.length; i += BATCH) {
    const batch = missing.slice(i, i + BATCH);
    const results = await Promise.all(
      batch.map(({ key, oLon, oLat, dLon, dLat }) =>
        fetchRoute(oLon, oLat, dLon, dLat).then(coords => {
          if (coords) { cache[key] = coords; ok++; }
          done++;
          return coords ? { key, coords } : null;
        })
      )
    );

    batchResults.push(...results.filter(Boolean));

    if (onProgress && (done % 75 === 0 || done === missing.length)) {
      onProgress(done, missing.length, ok, batchResults);
      batchResults = []; // Limpiar tras enviar
    }

    if (done % 75 === 0 || done === missing.length) {
      console.log(`[OSRM] Progreso: ${done}/${missing.length} (${ok} OK)`);
      saveCache();
    }

    await new Promise(r => setTimeout(r, 50)); // Delay reducido para fluidez
  }

  saveCache();
  console.log(`[OSRM] ✓ ${ok}/${missing.length} rutas calculadas`);
}

// Load cache on module init
loadCache();

module.exports = { getRoute, precomputeRoutes, loadCache };
