// ============================================================================
// MICM-INTEL v1.0 — Simple Memory Cache
// ============================================================================

const cache = new Map();

/**
 * Obtiene un valor de la caché si existe y no ha expirado.
 * @param {string} key 
 */
function get(key) {
  const item = cache.get(key);
  if (!item) return null;

  if (Date.now() > item.expiry) {
    cache.delete(key);
    return null;
  }
  return item.value;
}

/**
 * Guarda un valor en la caché.
 * @param {string} key 
 * @param {any} value 
 * @param {number} ttlSegundos Tiempo de vida en segundos
 */
function set(key, value, ttlSegundos = 60) {
  cache.set(key, {
    value,
    expiry: Date.now() + ttlSegundos * 1000,
  });
}

/**
 * Limpia toda la caché.
 */
function clear() {
  cache.clear();
}

module.exports = { get, set, clear };
