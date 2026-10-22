# Proceso de órdenes de compra (as-is)

## Entrada

Correo del solicitante con:

- Solicitud de compra (Excel → JSON en fixtures)
- Cotización del proveedor (PDF → texto)
- Correo de aprobación del líder ("Aprobado")
- Opcional: factura (caso retroactivo)

## Controles clave

| Código | Control |
|--------|---------|
| RC1 | Proveedor activo en maestro |
| RC2 | Aprobador autorizado para el centro de costo |
| RC3 | Monto ≤ tope del aprobador |
| RC4 | Subárea válida en el centro |
| RC5 | Cotización vs solicitud (±2 %) |
| RC6 | IVA derivado del proveedor si falta |
| RC7 | Condiciones de pago derivadas (informar) |
| RC8 | Factura anterior a solicitud → retroactiva |
| RC9 | Fecha aprobación ≥ fecha solicitud |
| RC10 | cantidad × unitario = total (±1 COP) |

## Salidas

- Payload SAP (sociedad 1000)
- Evidencia `out/<caso>/aprobacion.txt` + SHA-256
- OC en `out/sap/ordenes.jsonl`
- Log de control `out/control.csv`

## Desvío retroactivo

Si la factura llegó antes de la solicitud, la OC se marca retroactiva en control para medición gerencial; requiere confirmación explícita del analista.
