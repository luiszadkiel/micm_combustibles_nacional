-- ============================================================================
-- MICM-INTEL v1.0 — Triggers para pg_notify (tiempo real)
-- Ejecutar en tu base de datos PostgreSQL para activar streaming
-- Sin estos triggers, el sistema usa polling automático (funciona igual)
-- ============================================================================

-- ── Trigger: fact_alertas_operativas → canal micm_alertas ───────────────────
CREATE OR REPLACE FUNCTION trg_notify_alertas()
RETURNS trigger AS $$
BEGIN
  PERFORM pg_notify('micm_alertas', json_build_object(
    'operation', TG_OP,
    'alerta_id', COALESCE(NEW.alerta_id, OLD.alerta_id),
    'nivel_alerta', NEW.nivel_alerta,
    'perfil_fraude', NEW.perfil_fraude,
    'estacion_id', NEW.estacion_id,
    'timestamp', NOW()
  )::text);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_alertas_notify ON fact_alertas_operativas;
CREATE TRIGGER trg_alertas_notify
  AFTER INSERT OR UPDATE ON fact_alertas_operativas
  FOR EACH ROW EXECUTE FUNCTION trg_notify_alertas();

-- ── Trigger: fact_despacho_volumen → canal micm_despachos ───────────────────
CREATE OR REPLACE FUNCTION trg_notify_despachos()
RETURNS trigger AS $$
BEGIN
  PERFORM pg_notify('micm_despachos', json_build_object(
    'operation', TG_OP,
    'despacho_id', COALESCE(NEW.despacho_id, OLD.despacho_id),
    'estacion_id', NEW.estacion_id,
    'producto_id', NEW.producto_id,
    'volumen', NEW.volumen_despachado_gal,
    'timestamp', NOW()
  )::text);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_despachos_notify ON fact_despacho_volumen;
CREATE TRIGGER trg_despachos_notify
  AFTER INSERT ON fact_despacho_volumen
  FOR EACH ROW EXECUTE FUNCTION trg_notify_despachos();

-- ── Trigger: fact_anomalias_volumen → canal micm_anomalias ──────────────────
CREATE OR REPLACE FUNCTION trg_notify_anomalias()
RETURNS trigger AS $$
BEGIN
  PERFORM pg_notify('micm_anomalias', json_build_object(
    'operation', TG_OP,
    'anomalia_id', COALESCE(NEW.anomalia_id, OLD.anomalia_id),
    'estacion_id', NEW.estacion_id,
    'nivel_alerta', NEW.nivel_alerta,
    'z_score', NEW.z_score_ajustado_fisico,
    'timestamp', NOW()
  )::text);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_anomalias_notify ON fact_anomalias_volumen;
CREATE TRIGGER trg_anomalias_notify
  AFTER INSERT OR UPDATE ON fact_anomalias_volumen
  FOR EACH ROW EXECUTE FUNCTION trg_notify_anomalias();

-- ── Trigger: fact_precios_semanales → canal micm_precios ────────────────────
CREATE OR REPLACE FUNCTION trg_notify_precios()
RETURNS trigger AS $$
BEGIN
  PERFORM pg_notify('micm_precios', json_build_object(
    'operation', TG_OP,
    'precio_id', COALESCE(NEW.precio_id, OLD.precio_id),
    'producto_id', NEW.producto_id,
    'semana_iso', NEW.semana_iso,
    'wti', NEW.wti_usd_bbl,
    'timestamp', NOW()
  )::text);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_precios_notify ON fact_precios_semanales;
CREATE TRIGGER trg_precios_notify
  AFTER INSERT OR UPDATE ON fact_precios_semanales
  FOR EACH ROW EXECUTE FUNCTION trg_notify_precios();

-- ============================================================================
-- Verificación: SELECT * FROM pg_trigger WHERE tgname LIKE 'trg_%_notify';
-- ============================================================================
