import logging
from app.domains.intel.schemas import HandlerResult, QueryEntities
from app.services import data_service

logger = logging.getLogger("handlers.border")


class BorderHandler:
    """Module 3 — Dynamic Border Risk Map."""

    def handle(self, entities: dict) -> HandlerResult:
        q = QueryEntities(**{k: v for k, v in entities.items() if k in QueryEntities.model_fields})

        records = data_service.get_riesgo_fronterizo(
            provincia=q.provincia,
            nivel_riesgo=q.severidad,
        )
        indicadores = data_service.get_indicadores_globales()

        if not records:
            return HandlerResult(
                message="No se encontraron registros de riesgo fronterizo para los filtros indicados.",
                datos=[],
                intent="RIESGO_FRONTERIZO",
            )

        lines = ["🗺️ *Módulo 3 — Riesgo de Contrabando Fronterizo*\n\n"]

        # Global economic context
        if indicadores:
            lines.append(
                f"📈 *Contexto económico — Semana {indicadores.get('semana_referencia', 'N/D')}:*\n"
                f"   • WTI actual: *US${indicadores.get('wti_actual_usd', 0):.2f}/bbl*\n"
                f"   • WTI presupuestado 2026: US${indicadores.get('wti_presupuestado_2026_usd', 0):.2f}/bbl\n"
                f"   • Subsidio semanal: *RD${indicadores.get('diferencial_subsidio_semanal_rd_mm', 0):,.1f}MM*\n"
                f"   • Brecha fiscal anual proyectada: RD${indicadores.get('brecha_fiscal_anual_rd_mm', 0):,.0f}MM\n\n"
            )

        lines.append("*Ranking de riesgo fronterizo por provincia:*\n")

        for r in records:
            nivel = r.get("nivel_riesgo", "")
            icon = {
                "CRITICO": "🚨", "ALTO": "🔴", "MEDIO": "🟠",
                "BAJO": "🟡", "NORMAL": "🟢"
            }.get(nivel, "⚪")

            excedente = r.get("excedente_inexplicado_galones", 0)
            tendencia_icon = {"ASCENDENTE": "↗️", "DESCENDENTE": "↘️", "ESTABLE": "→"}.get(
                r.get("tendencia", ""), ""
            )

            lines.append(
                f"\n{icon} *{r['provincia']}* — Índice de riesgo: *{r['indice_riesgo']}/100* {tendencia_icon}\n"
                f"   • Nivel: *{nivel}*\n"
                f"   • Despacho semana: {r['despacho_semana_galones']:,} gal\n"
                f"   • Demanda local estimada: {r['demanda_local_estimada_galones']:,} gal\n"
                f"   • Excedente inexplicado: *{excedente:,} gal*\n"
                f"   • Cruces informales conocidos: {r.get('puntos_cruce_informales_conocidos', 0)}\n"
                f"   • Recomendación: {r.get('recomendacion_operativa', 'N/D')}\n"
            )

        return HandlerResult(
            message="".join(lines),
            datos=records,
            intent="RIESGO_FRONTERIZO",
        )
