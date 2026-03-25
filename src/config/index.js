// ============================================================================
// MICM-INTEL v1.0 — Configuración centralizada
// ============================================================================
require('dotenv').config();

module.exports = {
  // ── PostgreSQL ────────────────────────────────────────────────────────────
  pg: {
    host:     process.env.PGHOST     || 'localhost',
    port:     parseInt(process.env.PGPORT || '5432'),
    database: process.env.PGDATABASE || 'micm_intel',
    user:     process.env.PGUSER     || 'postgres',
    password: process.env.PGPASSWORD || '',
    max:      20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
    options:  '-c search_path=micm_intel,public',
  },

  // ── Servidor Express ──────────────────────────────────────────────────────
  server: {
    port: parseInt(process.env.PORT || '3001'),
  },

  // ── Mapbox ────────────────────────────────────────────────────────────────
  mapbox: {
    token: process.env.MAPBOX_TOKEN || '',
    style: 'mapbox://styles/mapbox/light-v11',
  },

  // ── Intervalos de polling (ms) ────────────────────────────────────────────
  polling: {
    gps:       60000,   // 60s  (was 15s)
    alertas:  120000,   // 2min (was 30s)
    metricas: 300000,   // 5min (was 60s)
    frontera: 600000,   // 10min (was 5min)
  },

  // ── Canales PostgreSQL LISTEN/NOTIFY ──────────────────────────────────────
  pgChannels: [
    'micm_alertas',
    'micm_despachos',
    'micm_anomalias',
    'micm_precios',
  ],

  // ── Tipos de mensaje WebSocket ────────────────────────────────────────────
  wsTypes: {
    // Cliente → Servidor
    FILTER_ALERTAS:      'FILTER_ALERTAS',
    FILTER_TIMELINE:     'FILTER_TIMELINE',
    GET_ESTACION_DETAIL: 'GET_ESTACION_DETAIL',
    GET_TRIANGULACION:   'GET_TRIANGULACION',
    // Servidor → Cliente
    INITIAL_STATE:       'INITIAL_STATE',
    UPDATE_ALERTAS:      'UPDATE_ALERTAS',
    UPDATE_GPS:          'UPDATE_GPS',
    UPDATE_METRICAS:     'UPDATE_METRICAS',
    UPDATE_FRONTERA:     'UPDATE_FRONTERA',
    UPDATE_RUTAS:        'UPDATE_RUTAS',
    FILTERED_ALERTAS:    'FILTERED_ALERTAS',
    FILTERED_TIMELINE:   'FILTERED_TIMELINE',
    ESTACION_DETAIL:     'ESTACION_DETAIL',
    TRIANGULACION_DATA:  'TRIANGULACION_DATA',
  },
};
