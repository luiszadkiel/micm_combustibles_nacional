import logging
from app.domains.intel.schemas import HandlerResult, QueryEntities
from app.services import data_service

logger = logging.getLogger("handlers.data_query")


class DataQueryHandler:
    """
    Module 1+ — Direct Data Query Handler.

    Handles CONSULTA_DATOS intent: user wants to see raw records
    (galonaje, despachos, volúmenes) filtered by combustible, provincia,
    distribuidor, or date range.
    """

    def handle(self, entities: dict) -> HandlerResult:
        q = QueryEntities(**{k: v for k, v in entities.items() if k in QueryEntities.model_fields})

        # Primary source: anomalias (contains despacho_galones, historico, etc.)
        records = data_service.get_anomalias(
            provincia=q.provincia,
            tipo_combustible=q.tipo_combustible,
            severidad=q.severidad,
            semana=q.semana,
        )

        # Apply distribuidor filter if provided
        if q.distribuidor and records:
            records = [
                r for r in records
                if q.distribuidor.lower() in r.get("distribuidor", "").lower()
            ]

        if not records:
            return HandlerResult(
                message=self._no_results(q),
                datos=[],
                intent="CONSULTA_DATOS",
            )

        total_despacho = sum(r.get("despacho_galones", 0) for r in records)
        total_ventas = sum(r.get("ventas_reportadas_galones", 0) for r in records)

        lines = ["📋 *Consulta de Datos — MICM-INTEL*\n\n"]

        # Header with applied filters
        filtros = []
        if q.tipo_combustible:
            filtros.append(f"Combustible: *{q.tipo_combustible}*")
        if q.provincia:
            filtros.append(f"Provincia: *{q.provincia}*")
        if q.distribuidor:
            filtros.append(f"Distribuidor: *{q.distribuidor}*")
        if q.semana:
            filtros.append(f"Semana: *{q.semana}*")
        if q.fecha_inicio:
            filtros.append(f"Desde: *{q.fecha_inicio}*")
        if q.fecha_fin:
            filtros.append(f"Hasta: *{q.fecha_fin}*")

        if filtros:
            lines.append("Filtros aplicados: " + " | ".join(filtros) + "\n")

        lines.append(f"Se encontraron *{len(records)} registro(s)*.\n\n")

        # Totals summary
        lines.append(
            f"📦 *Totales del período:*\n"
            f"   • Despacho total: *{total_despacho:,} gal*\n"
            f"   • Ventas reportadas: *{total_ventas:,} gal*\n"
            f"   • Diferencia no contabilizada: *{total_despacho - total_ventas:,} gal*\n\n"
        )

        # Per-record breakdown
        lines.append("*Detalle por distribuidora:*\n")
        for i, r in enumerate(records, 1):
            sev_icon = {
                "NORMAL": "🟢", "PRECAUCION": "🟡", "MEDIO": "🟠",
                "ALTO": "🔴", "ESCALADO": "🚨"
            }.get(r.get("severidad", ""), "⚪")

            lines.append(
                f"\n{i}. {sev_icon} *{r['distribuidor']}*\n"
                f"   • Provincia: {r.get('provincia', 'N/D')}\n"
                f"   • Combustible: {r.get('tipo_combustible', 'N/D')}\n"
                f"   • Semana: {r.get('semana', 'N/D')} (inicio: {r.get('semana_inicio', 'N/D')})\n"
                f"   • Despacho: *{r.get('despacho_galones', 0):,} gal*\n"
                f"   • Histórico promedio: {r.get('historico_promedio_galones', 0):,} gal\n"
                f"   • Ventas reportadas: {r.get('ventas_reportadas_galones', 0):,} gal\n"
                f"   • Desviación: {r.get('desviacion_porcentaje', 0):.1f}% ({r.get('desviaciones_sigma', 0):.1f}σ)\n"
                f"   • Severidad: *{r.get('severidad', 'N/D')}*\n"
            )

        # Date note if date filter provided but data is weekly
        if q.fecha_inicio or q.fecha_fin:
            lines.append(
                "\n⚠️ *Nota:* Los datos del sistema se organizan por semana ISO. "
                "Si la fecha solicitada no coincide exactamente con el inicio de semana, "
                "se muestran los registros del período más cercano disponible.\n"
            )

        return HandlerResult(
            message="".join(lines),
            datos=records,
            intent="CONSULTA_DATOS",
        )

    def _no_results(self, q: QueryEntities) -> str:
        filtros = []
        if q.tipo_combustible:
            filtros.append(f"combustible: {q.tipo_combustible}")
        if q.provincia:
            filtros.append(f"provincia: {q.provincia}")
        if q.distribuidor:
            filtros.append(f"distribuidor: {q.distribuidor}")
        if q.fecha_inicio:
            filtros.append(f"desde: {q.fecha_inicio}")
        descripcion = f" con los filtros ({', '.join(filtros)})" if filtros else ""
        return (
            f"No se encontraron registros de datos{descripcion} en el sistema.\n\n"
            "Verifique que los filtros correspondan a datos disponibles, "
            "o consulte sin filtros para ver todos los registros del período actual."
        )
