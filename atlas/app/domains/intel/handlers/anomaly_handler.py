import logging
from app.domains.intel.schemas import HandlerResult, QueryEntities
from app.services import data_service

logger = logging.getLogger("handlers.anomaly")


class AnomalyHandler:
    """Module 1 — Volume Anomaly Monitor."""

    def handle(self, entities: dict) -> HandlerResult:
        q = QueryEntities(**{k: v for k, v in entities.items() if k in QueryEntities.model_fields})

        # Fetch filtered records
        records = data_service.get_anomalias(
            provincia=q.provincia,
            tipo_combustible=q.tipo_combustible,
            severidad=q.severidad,
            semana=q.semana,
        )

        if not records:
            msg = self._no_results(q)
            return HandlerResult(message=msg, datos=[], intent="ANOMALIA_VOLUMEN")

        # Build a concise narrative summary of top results
        total = len(records)
        altos = [r for r in records if r.get("severidad") in ("ALTO", "ESCALADO")]
        top = records[:5]

        lines = [f"📊 *Módulo 1 — Anomalías de Volumen*\n"]
        lines.append(f"Se encontraron *{total}* registros")
        if q.provincia:
            lines.append(f" en la provincia de *{q.provincia}*")
        lines.append(".\n")

        if altos:
            lines.append(f"⚠️ *{len(altos)} alerta(s) de severidad ALTA o ESCALADA.*\n\n")

        lines.append("*Principales anomalías (por porcentaje de desviación):*\n")
        for i, r in enumerate(top, 1):
            sev_icon = {
                "NORMAL": "🟢", "PRECAUCION": "🟡", "MEDIO": "🟠",
                "ALTO": "🔴", "ESCALADO": "🚨"
            }.get(r.get("severidad", ""), "⚪")

            lines.append(
                f"\n{i}. {sev_icon} *{r['distribuidor']}*\n"
                f"   • Provincia: {r['provincia']}\n"
                f"   • Combustible: {r['tipo_combustible']}\n"
                f"   • Despacho: {r['despacho_galones']:,} gal | Histórico: {r['historico_promedio_galones']:,} gal\n"
                f"   • Desviación: *+{r['desviacion_porcentaje']:.1f}%* ({r['desviaciones_sigma']:.1f}σ)\n"
                f"   • Zona fronteriza: {'Sí' if r.get('zona_fronteriza') else 'No'}\n"
                f"   • Muestra laboratorio: {r.get('ultima_muestra_laboratorio', 'N/D')}\n"
                f"   • Severidad: *{r['severidad']}*\n"
                f"   • Acción: {r.get('accion_recomendada', 'N/D')}\n"
            )

        return HandlerResult(
            message="".join(lines),
            datos=records,
            intent="ANOMALIA_VOLUMEN",
        )

    def _no_results(self, q: QueryEntities) -> str:
        filtros = []
        if q.provincia:
            filtros.append(f"provincia: {q.provincia}")
        if q.tipo_combustible:
            filtros.append(f"combustible: {q.tipo_combustible}")
        if q.severidad:
            filtros.append(f"severidad: {q.severidad}")
        descripcion = f" con filtros ({', '.join(filtros)})" if filtros else ""
        return (
            f"No se encontraron anomalías registradas{descripcion} en el período actual.\n\n"
            "Verifique que los filtros correspondan a datos disponibles en el sistema o consulte sin filtros para ver el panorama completo."
        )
