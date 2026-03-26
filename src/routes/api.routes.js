// ============================================================================
// MICM-INTEL v1.0 — Rutas REST API
// ============================================================================
const { Router } = require('express');
const fs = require('fs');
const path = require('path');

const alertasService    = require('../services/alertas.service');
const metricasService   = require('../services/metricas.service');
const gpsService        = require('../services/gps.service');
const estacionesService = require('../services/estaciones.service');
const fronteraService   = require('../services/frontera.service');
const timelineService   = require('../services/timeline.service');
const triangulacionService = require('../services/triangulacion.service');
const rutasService      = require('../services/rutas.service');
const geografiaService  = require('../services/geografia.service');
const db                = require('../db');

const router = Router();

// ── GET /api/health ─────────────────────────────────────────────────────────
router.get('/health', async (req, res) => {
  try {
    const dbStatus = await db.healthCheck();
    res.json({
      status: 'ok',
      uptime: Math.floor(process.uptime()),
      wsClients: req.app.locals.wsClientCount || 0,
      db: dbStatus,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    res.status(500).json({ status: 'error', error: err.message });
  }
});

// ── GET /api/metricas ───────────────────────────────────────────────────────
router.get('/metricas', async (req, res) => {
  try {
    const metricas = await metricasService.calcularMetricas();
    res.json({ status: 'ok', metricas, timestamp: new Date().toISOString() });
  } catch (err) {
    console.error('[API] Error en /metricas:', err.message);
    res.status(500).json({ status: 'error', error: err.message });
  }
});

// ── GET /api/alertas ────────────────────────────────────────────────────────
router.get('/alertas', async (req, res) => {
  try {
    const { nivel, perfil, provincia, producto, estado, frontera, formato } = req.query;
    const alertas = await alertasService.getAlertas({ nivel, perfil, provincia, producto, estado, frontera });

    if (formato === 'geojson') {
      res.json(alertasService.toGeoJSON(alertas));
    } else {
      res.json({ status: 'ok', total: alertas.length, alertas });
    }
  } catch (err) {
    console.error('[API] Error en /alertas:', err.message);
    res.status(500).json({ status: 'error', error: err.message });
  }
});

// ── GET /api/gps ────────────────────────────────────────────────────────────
router.get('/gps', async (req, res) => {
  try {
    const cisternas = await gpsService.getCisternas();
    const geojson = gpsService.toGeoJSON(cisternas);
    res.json({ status: 'ok', total: cisternas.length, geojson, cisternas });
  } catch (err) {
    console.error('[API] Error en /gps:', err.message);
    res.status(500).json({ status: 'error', error: err.message });
  }
});

// ── GET /api/rutas ──────────────────────────────────────────────────────────
router.get('/rutas', async (req, res) => {
  try {
    const rutas = await rutasService.getRutas();
    const geojson = rutasService.toGeoJSON(rutas);
    res.json({ status: 'ok', total: rutas.length, geojson });
  } catch (err) {
    console.error('[API] Error en /rutas:', err.message);
    res.status(500).json({ status: 'error', error: err.message });
  }
});

// ── GET /api/frontera ───────────────────────────────────────────────────────
router.get('/frontera', async (req, res) => {
  try {
    const [frontera, mapaCalor] = await Promise.all([
      fronteraService.getFrontera(),
      fronteraService.getMapaCalor(),
    ]);
    res.json({
      status: 'ok',
      frontera: fronteraService.toGeoJSON(frontera),
      mapaCalor: fronteraService.mapaCalorGeoJSON(mapaCalor),
      datos: frontera,
    });
  } catch (err) {
    console.error('[API] Error en /frontera:', err.message);
    res.status(500).json({ status: 'error', error: err.message });
  }
});

// ── GET /api/estacion/:id ───────────────────────────────────────────────────
router.get('/estacion/:id', async (req, res) => {
  try {
    const detalle = await estacionesService.getById(req.params.id);
    if (!detalle) {
      return res.status(404).json({ status: 'error', error: 'Estación no encontrada' });
    }
    res.json({ status: 'ok', ...detalle });
  } catch (err) {
    console.error('[API] Error en /estacion:', err.message);
    res.status(500).json({ status: 'error', error: err.message });
  }
});

// ── GET /api/timeline/:anio ─────────────────────────────────────────────────
router.get('/timeline/:anio', async (req, res) => {
  try {
    const timeline = await timelineService.getTimeline(req.params.anio);
    res.json({ status: 'ok', anio: req.params.anio, total: timeline.length, timeline });
  } catch (err) {
    console.error('[API] Error en /timeline:', err.message);
    res.status(500).json({ status: 'error', error: err.message });
  }
});

// ── GET /api/setup-triggers ─────────────────────────────────────────────────
router.get('/setup-triggers', (req, res) => {
  try {
    const sqlPath = path.join(__dirname, '..', '..', 'sql', '05_triggers.sql');
    if (fs.existsSync(sqlPath)) {
      const sql = fs.readFileSync(sqlPath, 'utf-8');
      res.type('text/plain').send(sql);
    } else {
      res.status(404).json({ status: 'error', error: 'Archivo 05_triggers.sql no encontrado' });
    }
  } catch (err) {
    res.status(500).json({ status: 'error', error: err.message });
  }
});

// ── GET /api/productos ──────────────────────────────────────────────────────
router.get('/productos', async (req, res) => {
  try {
    const result = await db.query(`SELECT producto_id, nombre_producto, nombre_corto, categoria FROM dim_producto WHERE activo = true ORDER BY nombre_producto`);
    res.json({ status: 'ok', productos: result.rows });
  } catch (err) {
    res.status(500).json({ status: 'error', error: err.message });
  }
});

// ── GET /api/provincias ─────────────────────────────────────────────────────
router.get('/provincias', async (req, res) => {
  try {
    const result = await db.query(`SELECT DISTINCT provincia FROM dim_estacion WHERE activo = true AND provincia IS NOT NULL ORDER BY provincia`);
    res.json({ status: 'ok', provincias: result.rows.map(r => r.provincia) });
  } catch (err) {
    res.status(500).json({ status: 'error', error: err.message });
  }
});

// ── GET /api/provincia-boundaries ───────────────────────────────────────────
router.get('/provincia-boundaries', async (req, res) => {
  try {
    const result = await db.query(`
      SELECT provincia,
        AVG(lat::numeric)::float as center_lat,
        AVG(lon::numeric)::float as center_lon,
        MIN(lat::numeric)::float as min_lat, MAX(lat::numeric)::float as max_lat,
        MIN(lon::numeric)::float as min_lon, MAX(lon::numeric)::float as max_lon,
        COUNT(*)::int as estaciones
      FROM dim_estacion
      WHERE activo = true AND lat IS NOT NULL AND lon IS NOT NULL
      GROUP BY provincia
      ORDER BY provincia
    `);
    res.json({ status: 'ok', provincias: result.rows });
  } catch (err) {
    res.status(500).json({ status: 'error', error: err.message });
  }
});

// ── GET /api/geografia ─────────────────────────────────────────────────────
router.get('/geografia', async (req, res) => {
  try {
    const geo = await geografiaService.getGeografia();
    res.json({ status: 'ok', ...geo });
  } catch (err) {
    console.error('[API] Error en /geografia:', err.message);
    res.status(500).json({ status: 'error', error: err.message });
  }
});
// ── GET /api/rutas-nombres ──────────────────────────────────────────────────
router.get('/rutas-nombres', async (req, res) => {
  try {
    const nombres = await rutasService.getDistinctRutas();
    res.json({ status: 'ok', rutas: nombres });
  } catch (err) {
    console.error('[API] Error en /rutas-nombres:', err.message);
    res.status(500).json({ status: 'error', error: err.message });
  }
});

// ── GET /api/ruta-evaporacion?ruta=NOMBRE ───────────────────────────────────
router.get('/ruta-evaporacion', async (req, res) => {
  try {
    const { ruta } = req.query;
    if (!ruta) return res.status(400).json({ status: 'error', error: 'Parámetro ruta requerido' });
    const data = await rutasService.getEvaporacionByRuta(ruta);
    res.json({ status: 'ok', data });
  } catch (err) {
    console.error('[API] Error en /ruta-evaporacion:', err.message);
    res.status(500).json({ status: 'error', error: err.message });
  }
});

module.exports = router;
