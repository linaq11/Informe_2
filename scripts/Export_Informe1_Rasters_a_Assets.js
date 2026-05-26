// ============================================================================
// ============================================================================
// EXPORT DE RASTERS CLASIFICADOS DEL INFORME 1 COMO ASSETS DE GEE
// Para uso posterior en el Informe 2 §3.3 (comparación óptico vs SAR)
// ============================================================================
// ============================================================================
//
// USO: pegar este bloque al FINAL del Script del Informe 1
//      (donde ya están definidos filtered2020, filtered2021, filtered2022, filtered2023)
//      y darle Run. Después aceptar las 4 tareas en la pestaña Tasks.
//
// Las clasificaciones tienen valores:
//   0 = no-manglar
//   1 = manglar intacto
//   2 = manglar degradado
//
// ANTES DE EXPORTAR: crear la carpeta destino en GEE
//   Pestaña Assets > NEW > Folder
//   Nombre: Informe1_S2_Seca
//   → Ruta completa: 'projects/basic-buttress-338101/assets/Informe1_S2_Seca/'
//
// ============================================================================

var PROJECT = 'basic-buttress-338101';
var EXPORT_PATH = 'projects/' + PROJECT + '/assets/Informe1_S2_Seca/';

// AOI del Informe 1 (debería estar definido como variable 'aoi' en el script)
// Si no, ajustar la siguiente línea con el nombre correcto del AOI

// ----------------------------------------------------------------------------
// EXPORT 2020
// ----------------------------------------------------------------------------
Export.image.toAsset({
  image: filtered2020.toByte(),
  description: 'Export_Informe1_S2_Seca_2020',
  assetId: EXPORT_PATH + 'clasif_2020',
  region: aoi,
  scale: 10,
  maxPixels: 1e10,
  pyramidingPolicy: {'.default': 'mode'}
});

// ----------------------------------------------------------------------------
// EXPORT 2021
// ----------------------------------------------------------------------------
Export.image.toAsset({
  image: filtered2021.toByte(),
  description: 'Export_Informe1_S2_Seca_2021',
  assetId: EXPORT_PATH + 'clasif_2021',
  region: aoi,
  scale: 10,
  maxPixels: 1e10,
  pyramidingPolicy: {'.default': 'mode'}
});

// ----------------------------------------------------------------------------
// EXPORT 2022
// ----------------------------------------------------------------------------
Export.image.toAsset({
  image: filtered2022.toByte(),
  description: 'Export_Informe1_S2_Seca_2022',
  assetId: EXPORT_PATH + 'clasif_2022',
  region: aoi,
  scale: 10,
  maxPixels: 1e10,
  pyramidingPolicy: {'.default': 'mode'}
});

// ----------------------------------------------------------------------------
// EXPORT 2023
// ----------------------------------------------------------------------------
Export.image.toAsset({
  image: filtered2023.toByte(),
  description: 'Export_Informe1_S2_Seca_2023',
  assetId: EXPORT_PATH + 'clasif_2023',
  region: aoi,
  scale: 10,
  maxPixels: 1e10,
  pyramidingPolicy: {'.default': 'mode'}
});

// ============================================================================
// NOTAS DE EJECUCIÓN
// ============================================================================
//
// 1. Después de Run → ir a Tasks → aceptar las 4 tareas (botón RUN azul)
// 2. Tiempo estimado por raster: 5-15 min (más rápido que SAR porque ya están
//    pre-calculados en el script del Informe 1)
// 3. Una vez COMPLETED, los assets quedan disponibles en:
//    'projects/basic-buttress-338101/assets/Informe1_S2_Seca/clasif_YYYY'
// 4. El script §3.3 los cargará automáticamente para el mapa de concordancia.
//
// ----------------------------------------------------------------------------
// SI LAS VARIABLES NO SE LLAMAN ASÍ EN TU SCRIPT
// ----------------------------------------------------------------------------
// Verifica los nombres reales de las clasificaciones anuales en tu script
// (donde se hizo classifier.classify y luego el filtro de cobertura/no-cobertura
// para descartar agua y zonas no vegetadas).
//
// Si los nombres son distintos (por ejemplo 'clasif2020', 'mapa2020', etc.),
// reemplaza filtered2020/2021/2022/2023 por los nombres reales.
//
// ============================================================================
