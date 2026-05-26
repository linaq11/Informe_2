# Informe 2 — Detección de cambio estructural del manglar de la CGSM mediante BFAST Monitor

Componente A del curso de Percepción Remota, Maestría en Geomática, Universidad Nacional de Colombia.

**Autor:** Lina María Quintero Fonseca · lquinterof@unal.edu.co
**Fecha:** Mayo 2026

## Estructura del repositorio

- `Informe_2_CGSM.docx` / `.md` — documento principal
- `scripts/` — pipelines Python (BFAST Monitor, AoA, GPBoost), scripts GEE de exportación, cuaderno R canónico de BFAST
- `figuras/` — figuras del cuerpo y de los anexos
- `data/` — outputs reproducibles (CSV, JSON, predicciones por parcela)

## Datos no incluidos

Por tamaño no se versionan los rasters originales (>50 MB cada uno):
- `CGSM_AoA_Stack_2023*.tif` (~3.9 GB) — exportar desde GEE con `scripts/CGSM_AoA_Export_Stack.js`
- `CGSM_Classification_*.tif` (~250 MB c/u) — exportar con `scripts/CGSM_Classification_Export.js`
- `aoa_di_2023.tif` (~138 MB) — generado por `scripts/compute_aoa.py`

## Reproducir el análisis

1. Ejecutar los scripts `.js` en Google Earth Engine para exportar stacks y muestras
2. Correr `scripts/compute_aoa.py`, `scripts/run_gpboost.py`, `scripts/bfast_bootstrap.py` y `scripts/bfast_monitor.py` en Python 3.10+ con las dependencias del contenedor sig_unal
3. La validación cruzada del Anexo H se reproduce con `scripts/bfast_monitor.Rmd` directamente en R
