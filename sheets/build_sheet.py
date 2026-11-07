"""Genera la plantilla del CRM de captación (xlsx) que se sube a Google Drive
convertida a Google Sheets.

Uso:  python3 sheets/build_sheet.py
Salida: sheets/CRM_RedesiaNet_Captacion.xlsx

Las cabeceras de la pestaña Leads son el contrato con los workflows de n8n:
si cambias un nombre aquí, cámbialo también en src/code/*.js.
"""
from pathlib import Path

from openpyxl import Workbook
from openpyxl.formatting.rule import FormulaRule
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.worksheet.datavalidation import DataValidation

OUT = Path(__file__).with_name("CRM_RedesiaNet_Captacion.xlsx")

LEADS_COLUMNS = [
    # (cabecera, ancho)
    ("lead_id", 10),
    ("estado", 20),
    ("fecha_alta", 17),
    ("empresa", 28),
    ("sector", 20),
    ("zona", 18),
    ("web", 30),
    ("email", 28),
    ("emails_alternativos", 28),
    ("telefono", 15),
    ("instagram", 22),
    ("facebook", 26),
    ("linkedin", 26),
    ("direccion", 34),
    ("google_maps_url", 24),
    ("place_id", 14),
    ("rating", 8),
    ("num_resenas", 11),
    ("resumen_empresa", 40),
    ("pain_point", 40),
    ("servicio_propuesto", 22),
    ("agente_catalogo", 22),
    ("plan_sugerido", 18),
    ("confianza_ia", 12),
    ("asunto", 34),
    ("cuerpo_email", 60),
    ("mensaje_dm", 45),
    ("motivo_descarte", 30),
    ("fecha_decision", 17),
    ("fecha_envio", 17),
    ("canal_enviado", 14),
    ("gmail_message_id", 18),
    ("gmail_thread_id", 18),
    ("dm_estado", 12),
    ("fecha_dm", 17),
    ("fecha_respuesta", 17),
    ("clasificacion_respuesta", 20),
    ("respuesta", 50),
    ("busqueda_origen", 30),
    ("notas", 30),
]

ESTADOS = [
    ("pendiente_aprobacion", "Borrador enviado a Telegram, esperando /enviar o /rechazar", "FFF4CC"),
    ("enviado", "Email enviado (y DM, si había perfil social y lo confirmaste)", "D9EAD3"),
    ("dm_pendiente", "Sin email: tienes que mandar el DM a mano y confirmarlo con /dm_ok", "FCE5CD"),
    ("respondido", "La empresa ha contestado (ver clasificacion_respuesta)", "B6D7A8"),
    ("rechazado", "Lo rechazaste en Telegram", "EFEFEF"),
    ("descartado_ia", "La IA lo descartó (no es pyme, sin encaje, web rota...)", "EFEFEF"),
    ("sin_canal", "Ni email ni redes en su web: solo teléfono (para llamar)", "EFEFEF"),
    ("error_ia", "Falló el análisis con Claude: revisar a mano", "F4CCCC"),
    ("error_envio", "Gmail no pudo enviar: revisar el email", "F4CCCC"),
    ("rebotado", "El email rebotó (dirección inexistente)", "F4CCCC"),
    ("baja", "Pidió no recibir más mensajes: no volver a contactar", "CCCCCC"),
]

CLASIFICACIONES = [
    "interesado", "pide_info", "no_interesado", "baja",
    "fuera_oficina", "rebote", "otro", "sin_clasificar",
]

ZONAS = ["Arganda del Rey", "Alcalá de Henares", "Torrejón de Ardoz", "Coslada"]

# (palabra clave para Google Maps, etiqueta de sector)
SECTORES = [
    ("clínica dental", "Salud · Dental"),
    ("clínica de fisioterapia", "Salud · Fisioterapia"),
    ("centro de estética", "Estética"),
    ("asesoría gestoría", "Asesoría / Gestoría"),
    ("despacho de abogados", "Legal"),
    ("inmobiliaria", "Inmobiliaria"),
    ("empresa de reformas", "Construcción / Reformas"),
    ("instalaciones de climatización", "Instaladores"),
    ("taller mecánico", "Automoción · Taller"),
    ("concesionario de coches", "Automoción · Concesionario"),
    ("empresa de transporte y logística", "Logística"),
    ("distribuidor mayorista", "Distribución B2B"),
    ("empresa industrial", "Industria"),
    ("academia de formación", "Educación"),
    ("clínica veterinaria", "Veterinaria"),
    ("gimnasio", "Deporte / Fitness"),
    ("imprenta", "Artes gráficas"),
    ("empresa de limpieza", "Servicios de limpieza"),
]

HEADER_FILL = PatternFill("solid", fgColor="0B1220")
HEADER_FONT = Font(bold=True, color="FFFFFF")


def style_header(ws, widths):
    for idx, width in enumerate(widths, start=1):
        cell = ws.cell(row=1, column=idx)
        cell.fill = HEADER_FILL
        cell.font = HEADER_FONT
        cell.alignment = Alignment(vertical="center")
        ws.column_dimensions[cell.column_letter].width = width
    ws.freeze_panes = "B2"


def build():
    wb = Workbook()

    # --- Leads -------------------------------------------------------------
    ws = wb.active
    ws.title = "Leads"
    ws.append([c for c, _ in LEADS_COLUMNS])
    style_header(ws, [w for _, w in LEADS_COLUMNS])
    ws.freeze_panes = "E2"  # deja visibles lead_id, estado, fecha y empresa

    col = {name: i + 1 for i, (name, _) in enumerate(LEADS_COLUMNS)}
    letter = lambda name: ws.cell(row=1, column=col[name]).column_letter  # noqa: E731

    dv_estado = DataValidation(
        type="list",
        formula1='"' + ",".join(e for e, _, _ in ESTADOS) + '"',
        allow_blank=True,
        showErrorMessage=False,
    )
    ws.add_data_validation(dv_estado)
    dv_estado.add(f"{letter('estado')}2:{letter('estado')}5000")

    dv_clasif = DataValidation(
        type="list",
        formula1='"' + ",".join(CLASIFICACIONES) + '"',
        allow_blank=True,
        showErrorMessage=False,
    )
    ws.add_data_validation(dv_clasif)
    c = letter("clasificacion_respuesta")
    dv_clasif.add(f"{c}2:{c}5000")

    est = letter("estado")
    for estado, _, color in ESTADOS:
        ws.conditional_formatting.add(
            f"A2:{letter('notas')}5000",
            FormulaRule(
                formula=[f'${est}2="{estado}"'],
                fill=PatternFill("solid", fgColor=color, bgColor=color),
            ),
        )

    # --- Busquedas ---------------------------------------------------------
    wb_b = wb.create_sheet("Busquedas")
    wb_b.append(["id", "activa", "sector", "zona", "consulta", "ultima_ejecucion", "veces_ejecutada"])
    style_header(wb_b, [8, 8, 26, 20, 48, 18, 15])
    n = 1
    # Orden intercalado (sector por sector, las 4 zonas) para que la rotación
    # diaria vaya variando de sector.
    for keyword, label in SECTORES:
        for zona in ZONAS:
            wb_b.append([f"B{n:03d}", "SI", label, zona, f"{keyword} en {zona}", "", 0])
            n += 1
    dv_si = DataValidation(type="list", formula1='"SI,NO"', allow_blank=False)
    wb_b.add_data_validation(dv_si)
    dv_si.add("B2:B1000")

    # --- Bloqueados --------------------------------------------------------
    wb_x = wb.create_sheet("Bloqueados")
    wb_x.append(["valor", "motivo", "fecha"])
    style_header(wb_x, [36, 40, 18])
    wb_x.append(["redesianet.com", "dominio propio", ""])

    # --- Leyenda (solo para humanos; n8n no la lee) -------------------------
    wb_l = wb.create_sheet("Leyenda")
    wb_l.column_dimensions["A"].width = 26
    wb_l.column_dimensions["B"].width = 90
    rows = [
        ("CRM de captación B2B · RedesiaNet", ""),
        ("", ""),
        ("ESTADO", "SIGNIFICADO"),
        *[(e, d) for e, d, _ in ESTADOS],
        ("", ""),
        ("ÓRDENES EN TELEGRAM", ""),
        ("/enviar ID", "Envía el email (y te prepara el DM si hay Instagram/Facebook)"),
        ("/rechazar ID", "Descarta el borrador"),
        ("/dm_ok ID", "Marca que ya enviaste el DM a mano"),
        ("/pendientes", "Lista los borradores pendientes de aprobar"),
        ("/ayuda", "Muestra la ayuda"),
        ("", ""),
        ("CONSEJOS", ""),
        ("Retocar un email", "Edita las celdas asunto / cuerpo_email de la fila ANTES de pulsar Enviar: se envía lo que haya en el Sheet."),
        ("Añadir búsquedas", "Pestaña Busquedas: añade una fila con id único, activa=SI y la consulta tal cual la escribirías en Google Maps."),
        ("No contactar", "Pestaña Bloqueados: pon un email o un dominio (sin www). El generador lo salta siempre."),
        ("Pestaña Leads", "No cambies los nombres de las cabeceras: los workflows escriben por nombre de columna."),
    ]
    for r in rows:
        wb_l.append(list(r))
    wb_l["A1"].font = Font(bold=True, size=14)
    for cell in ("A3", "B3", f"A{5 + len(ESTADOS)}", f"A{12 + len(ESTADOS)}"):
        wb_l[cell].font = Font(bold=True)
    for i, (_, _, color) in enumerate(ESTADOS, start=4):
        wb_l[f"A{i}"].fill = PatternFill("solid", fgColor=color)

    wb.save(OUT)
    return OUT


if __name__ == "__main__":
    print(build())
