// ============================================================================
// MICM-INTEL v1.0 — Servicio de Políticos / Líderes Territoriales
// ============================================================================
const db = require('../db');

const SQL_POLITICOS = `
  SELECT 
    p.politico_id, p.tipo_cargo, p.nombre_completo,
    p.partido_politico, p.provincia, p.municipio,
    p.circunscripcion, p.periodo_inicio, p.periodo_fin,
    g.lat::float, g.lon::float,
    g.region_fedomu,
    g.nivel as geo_nivel
  FROM dim_politico p
  LEFT JOIN dim_geografia g ON p.geo_id = g.geo_id
  WHERE p.activo = true
  ORDER BY 
    CASE p.tipo_cargo 
      WHEN 'SENADOR' THEN 1 
      WHEN 'DIPUTADO' THEN 2 
      WHEN 'ALCALDE' THEN 3 
      ELSE 4 
    END,
    p.provincia, p.municipio
`;

// Cache
let _cache = { data: null, ts: 0 };
const CACHE_TTL = 10 * 60 * 1000; // 10 min

async function getPoliticos() {
  if (_cache.data && (Date.now() - _cache.ts) < CACHE_TTL) return _cache.data;

  const { rows } = await db.query(SQL_POLITICOS);
  const politicos = rows.map(r => ({
    id: r.politico_id,
    cargo: r.tipo_cargo,
    nombre: r.nombre_completo,
    partido: r.partido_politico,
    provincia: r.provincia,
    municipio: r.municipio,
    circunscripcion: r.circunscripcion,
    region: r.region_fedomu,
    lat: r.lat,
    lon: r.lon,
    periodoInicio: r.periodo_inicio,
    periodoFin: r.periodo_fin,
  }));

  _cache = { data: politicos, ts: Date.now() };
  console.log(`[POLITICOS] ✓ ${politicos.length} políticos cargados`);
  return politicos;
}

module.exports = { getPoliticos };
