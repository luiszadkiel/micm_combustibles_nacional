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
const noticiasService   = require('../services/noticias.service');
const politicosService  = require('../services/politicos.service');
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

// ── GET /api/noticias ───────────────────────────────────────────────────────
router.get('/noticias', async (req, res) => {
  try {
    const noticias = await noticiasService.getNoticias();
    res.json({ status: 'ok', total: noticias.length, noticias });
  } catch (err) {
    console.error('[API] Error en /noticias:', err.message);
    res.status(500).json({ status: 'error', error: err.message });
  }
});

// ── GET /api/politicos ──────────────────────────────────────────────────────
router.get('/politicos', async (req, res) => {
  try {
    const politicos = await politicosService.getPoliticos();
    res.json({ status: 'ok', total: politicos.length, politicos });
  } catch (err) {
    console.error('[API] Error en /politicos:', err.message);
    res.status(500).json({ status: 'error', error: err.message });
  }
});

// ── GET /api/metricas-regional ──────────────────────────────────────────────
router.get('/metricas-regional', async (req, res) => {
  try {
    const { provincias, region } = req.query;
    let provArray = [];

    if (region) {
      // Expand region name to province list using MACRO_REGION_MAP
      const { MACRO_REGION_MAP } = geografiaService;
      const regionUpper = region.toUpperCase();
      provArray = [...new Set(
        Object.entries(MACRO_REGION_MAP)
          .filter(([, r]) => r.toUpperCase() === regionUpper)
          .map(([prov]) => prov)
      )];
    } else if (provincias) {
      provArray = provincias.split(',').map(p => p.trim()).filter(Boolean);
    }

    const metricas = await metricasService.calcularMetricasRegional(provArray);
    res.json({ status: 'ok', metricas, timestamp: new Date().toISOString() });
  } catch (err) {
    console.error('[API] Error en /metricas-regional:', err.message);
    res.status(500).json({ status: 'error', error: err.message });
  }
});

// ── GET /api/timeline-hours — Hourly alert histogram (last 48h) ─────────────
router.get('/timeline-hours', async (req, res) => {
  try {
    const hours = parseInt(req.query.hours) || 48;
    const sql = `
      SELECT 
        date_trunc('hour', a.timestamp_generacion) AS hora,
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE a.nivel_alerta = 3) AS n3,
        COUNT(*) FILTER (WHERE a.nivel_alerta = 2) AS n2,
        ROUND(AVG(a.score_compuesto)::numeric, 2) AS score_avg
      FROM micm_intel.fact_alertas_operativas a
      WHERE a.timestamp_generacion >= NOW() - INTERVAL '${hours} hours'
        AND a.estado_alerta != 'DESCARTADA'
      GROUP BY date_trunc('hour', a.timestamp_generacion)
      ORDER BY hora ASC
    `;
    const { rows } = await db.query(sql);
    
    // Fill gaps (hours with 0 alerts)
    const filled = [];
    const now = new Date();
    const start = new Date(now.getTime() - hours * 3600000);
    for (let h = new Date(start); h <= now; h = new Date(h.getTime() + 3600000)) {
      const key = h.toISOString().substring(0, 13);
      const match = rows.find(r => new Date(r.hora).toISOString().substring(0, 13) === key);
      filled.push({
        hora: h.toISOString(),
        total: match ? parseInt(match.total) : 0,
        n3: match ? parseInt(match.n3) : 0,
        n2: match ? parseInt(match.n2) : 0,
        score_avg: match ? parseFloat(match.score_avg) : 0
      });
    }
    res.json({ status: 'ok', count: filled.length, hours: filled });
  } catch (err) {
    console.error('[API] Error en /timeline-hours:', err.message);
    res.status(500).json({ status: 'error', error: err.message });
  }
});

// ── GET /api/alertas-hora?desde=ISO&hasta=ISO — Alerts for specific time range
router.get('/alertas-hora', async (req, res) => {
  try {
    const { desde, hasta } = req.query;
    if (!desde || !hasta) return res.status(400).json({ status: 'error', error: 'desde/hasta requeridos' });
    const sql = `
      SELECT a.alerta_id, a.timestamp_generacion, a.nivel_alerta, a.perfil_fraude,
             a.estacion_id, a.score_compuesto, a.estado_alerta, a.descripcion_alerta, a.destinatario,
             e.nombre_establecimiento, e.lat, e.lon, e.provincia, e.municipio, e.es_zona_fronteriza
      FROM micm_intel.fact_alertas_operativas a
      JOIN micm_intel.dim_estacion e ON e.estacion_id = a.estacion_id
      WHERE a.timestamp_generacion >= $1 AND a.timestamp_generacion < $2
        AND a.estado_alerta != 'DESCARTADA'
      ORDER BY a.nivel_alerta DESC, a.score_compuesto DESC
      LIMIT 500
    `;
    const rows = (await db.query(sql, [desde, hasta])).rows;
    const geojson = alertasService.toGeoJSON(rows);
    res.json({ status: 'ok', total: rows.length, alertas: geojson });
  } catch (err) {
    console.error('[API] Error en /alertas-hora:', err.message);
    res.status(500).json({ status: 'error', error: err.message });
  }
});

module.exports = router;
