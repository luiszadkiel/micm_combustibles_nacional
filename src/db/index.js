// ============================================================================
// MICM-INTEL v1.0 — Capa de Base de Datos (Pool + LISTEN/NOTIFY)
// ============================================================================
const { Pool, Client } = require('pg');
const config = require('../config');

// ── Pool para queries ───────────────────────────────────────────────────────
const pool = new Pool(config.pg);

pool.on('error', (err) => {
  console.error('[DB] Error inesperado en pool:', err.message);
});

/**
 * Ejecuta un query parametrizado.
 * @param {string} text  - SQL con $1, $2...
 * @param {Array}  params
 * @returns {Promise<import('pg').QueryResult>}
 */
let _poolEnded = false;

async function query(text, params = []) {
  if (_poolEnded) return { rows: [], rowCount: 0 };
  const start = Date.now();
  try {
    const result = await pool.query(text, params);
    const ms = Date.now() - start;
    if (ms > 500) console.warn(`[DB] Query lento (${ms}ms): ${text.substring(0, 100)}`);
    return result;
  } catch (err) {
    console.error('[DB] Error en query:', err.message, '\nSQL:', text.substring(0, 200));
    throw err;
  }
}

// ── Cliente dedicado para LISTEN/NOTIFY ─────────────────────────────────────
let listenClient = null;
let reconnectTimer = null;

/**
 * Conecta un pg Client dedicado y suscribe a canales LISTEN.
 * @param {Function} onNotification - callback(channel, payload)
 */
async function startListening(onNotification) {
  if (reconnectTimer) clearTimeout(reconnectTimer);

  try {
    listenClient = new Client(config.pg);

    listenClient.on('error', (err) => {
      console.error('[DB-LISTEN] Error:', err.message);
      reconnectTimer = setTimeout(() => startListening(onNotification), 5000);
    });

    listenClient.on('end', () => {
      console.warn('[DB-LISTEN] Conexión cerrada, reconectando en 5s...');
      reconnectTimer = setTimeout(() => startListening(onNotification), 5000);
    });

    await listenClient.connect();
    console.log('[DB-LISTEN] Conectado para LISTEN/NOTIFY');

    for (const channel of config.pgChannels) {
      await listenClient.query(`LISTEN ${channel}`);
      console.log(`[DB-LISTEN] Suscrito a: ${channel}`);
    }

    listenClient.on('notification', (msg) => {
      console.log(`[DB-LISTEN] Notificación → ${msg.channel}`);
      onNotification(msg.channel, msg.payload);
    });
  } catch (err) {
    console.error('[DB-LISTEN] Error al conectar:', err.message);
    reconnectTimer = setTimeout(() => startListening(onNotification), 5000);
  }
}

/**
 * Verifica conectividad con la DB.
 */
async function healthCheck() {
  try {
    const result = await pool.query('SELECT NOW() as now, current_database() as db');
    return { connected: true, ...result.rows[0] };
  } catch (err) {
    return { connected: false, error: err.message };
  }
}

/**
 * Cierra pool y listener.
 */
async function shutdown() {
  if (_poolEnded) return;
  _poolEnded = true;
  if (reconnectTimer) clearTimeout(reconnectTimer);
  if (listenClient) {
    try { await listenClient.end(); } catch (e) { /* ignore */ }
    console.log('[DB-LISTEN] Desconectado');
  }
  try { await pool.end(); } catch (e) { /* ignore */ }
  console.log('[DB] Pool cerrado');
}

module.exports = { pool, query, startListening, healthCheck, shutdown };
