import logging
from app.domains.intel.schemas import HandlerResult, QueryEntities
from app.services import data_service

logger = logging.getLogger("handlers.fiscal")


class FiscalHandler:
    """Module 2 — Fiscal Triangulation (DGA + DGII + MICM cross-reference)."""

    def handle(self, entities: dict) -> HandlerResult:
        q = QueryEntities(**{k: v for k, v in entities.items() if k in QueryEntities.model_fields})

        records = data_service.get_triangulacion(
            empresa=q.distribuidor,
        )

        alertas = [r for r in records if r.get("estado") == "ALERTA_ACTIVA"]
        normales = [r for r in records if r.get("estado") == "NORMAL"]

        if not records:
            return HandlerResult(
                message="No se encontraron registros de triangulación fiscal para los filtros indicados.",
                datos=[],
                intent="TRIANGULACION_FISCAL",
            )

        total_sin_destino = sum(r.get("volumen_sin_destino_galones", 0) for r in alertas)
        total_evadido_rd = sum(r.get("impuesto_evadido_rd", 0) for r in alertas)

        lines = ["🧾 *Módulo 2 — Triangulación Fiscal*\n\n"]
        lines.append(
            f"Registros analizados: *{len(records)}* | "
            f"Alertas activas: *{len(alertas)}* | "
            f"Sin anomalía: *{len(normales)}*\n\n"
        )

        if alertas:
            lines.append(
                f"⚠️ *Volumen total sin destino declarado: {total_sin_destino:,} galones*\n"
                f"💰 *Impuesto estimado en riesgo: RD${total_evadido_rd:,.0f}*\n\n"
            )
            lines.append("*Alertas activas:*\n")
            for r in alertas:
                lines.append(
                    f"\n🔴 *{r['empresa']}* (RUC: {r['ruc']})\n"
                    f"   • Categoría de exención: {r['categoria_exencion']}\n"
                    f"   • Importado: {r['volumen_importado_galones']:,} gal\n"
                    f"   • Declarado a DGII: {r['volumen_declarado_dgii_galones']:,} gal\n"
                    f"   • Sin destino: *{r['volumen_sin_destino_galones']:,} gal*\n"
                    f"   • Impuesto en riesgo: *RD${r['impuesto_evadido_rd']:,.0f}*\n"
                    f"   • Fuentes cruzadas: {', '.join(r.get('fuentes_cruzadas', []))}\n"
                    f"   • Observación: {r.get('observaciones', 'N/D')}\n"
                )

        return HandlerResult(
            message="".join(lines),
            datos=records,
            intent="TRIANGULACION_FISCAL",
        )
