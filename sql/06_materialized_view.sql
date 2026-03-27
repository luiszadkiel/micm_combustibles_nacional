-- Renombrar la vista vieja
ALTER VIEW v_mapa_calor_municipio RENAME TO v_mapa_calor_municipio_old;

-- Crear la vista materializada basada en la vieja
CREATE MATERIALIZED VIEW mv_mapa_calor_municipio AS 
SELECT * FROM v_mapa_calor_municipio_old;

-- Crear un índice único para permitir REFRESH CONCURRENTLY
CREATE UNIQUE INDEX idx_mv_mapa_calor_municipio_unique 
ON mv_mapa_calor_municipio (geo_id);

-- Opcional: Eliminar la vista vieja si ya no se usa
-- DROP VIEW v_mapa_calor_municipio_old;
