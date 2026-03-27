import logging
from app.domains.intel.schemas import HandlerResult, QueryEntities
from app.services import data_service

logger = logging.getLogger("handlers.network")


class NetworkHandler:
    """Module 4 — Entity Network Intelligence (fraud ring detection)."""

    def handle(self, entities: dict) -> HandlerResult:
        q = QueryEntities(**{k: v for k, v in entities.items() if k in QueryEntities.model_fields})

        records = data_service.get_redes(
            nivel_riesgo=q.severidad,
            provincia=q.provincia,
        )

        if not records:
            return HandlerResult(
                message="No se encontraron redes de entidades para los filtros indicados.",
                datos=[],
                intent="RED_ENTIDADES",
            )

        activas = [r for r in records if r.get("estado") == "ACTIVA"]
        total_perdida = sum(r.get("perdida_fiscal_estimada_rd", 0) for r in records)

        lines = ["🕸️ *Módulo 4 — Inteligencia de Red (Patrones Organizados)*\n\n"]
        lines.append(
            f"Redes identificadas: *{len(records)}* | "
            f"Activas: *{len(activas)}*\n"
            f"💰 Pérdida fiscal total estimada: *RD${total_perdida:,.0f}*\n\n"
        )

        for r in records:
            estado_icon = {
                "ACTIVA": "🔴", "EN_INVESTIGACION": "🟠", "CERRADA": "🟢"
            }.get(r.get("estado", ""), "⚪")
            nivel_icon = {
                "CRITICO": "🚨", "ALTO": "🔴", "MEDIO": "🟠"
            }.get(r.get("nivel_riesgo", ""), "⚪")

            lines.append(
                f"\n{estado_icon} *{r['nombre_red']}* — {nivel_icon} Riesgo: {r['nivel_riesgo']}\n"
                f"   • Estado: {r['estado']} | Activa hace {r.get('semanas_activa', '?')} semanas\n"
                f"   • Provincias: {', '.join(r.get('provincias_operacion', []))}\n"
                f"   • Volumen sospechoso: *{r.get('volumen_total_sospechoso_galones', 0):,} gal*\n"
                f"   • Pérdida fiscal estimada: *RD${r.get('perdida_fiscal_estimada_rd', 0):,.0f}*\n"
                f"   • Entidades vinculadas ({len(r.get('entidades', []))}):\n"
            )
            for ent in r.get("entidades", []):
                lines.append(
                    f"       – [{ent['tipo']}] *{ent['nombre']}* — {ent['rol_en_red']}\n"
                )
            lines.append(
                f"   • Anomalías vinculadas: {', '.join(r.get('anomalias_vinculadas', []))}\n"
                f"   • Acción recomendada: {r.get('accion_recomendada', 'N/D')}\n"
            )

        return HandlerResult(
            message="".join(lines),
            datos=records,
            intent="RED_ENTIDADES",
        )
