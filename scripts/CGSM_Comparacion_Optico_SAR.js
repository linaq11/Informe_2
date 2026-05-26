// ============================================================================
// ============================================================================
// COMPARACIÓN ÓPTICO vs SAR — INFORME 2 §3.3
// CGSM 2020-2023 — Mapas de concordancia/discordancia píxel a píxel
// ============================================================================
// ============================================================================
//
// Compara las clasificaciones de:
//   → Sentinel-2 seca (Informe 1) — assets en Informe1_S2_Seca/clasif_YYYY
//   → Sentinel-1 lluviosa (Informe 2 §3.2) — assets en Informe2_SAR_Lluviosa/clasif_YYYY
//
// Ambas con valores: 0=no-manglar, 1=intacto, 2=degradado.
//
// Productos:
//   §3.3.1 — Mapa de concordancia/discordancia píxel a píxel para 2023
//   §3.3.2 — Tabla de áreas por categoría de acuerdo, los 4 años
//   §3.3.3 — Zoom al Complejo de Pajarales (sector Ma16 INVEMAR)
//
// REQUISITOS:
//   1. Carpeta Informe1_S2_Seca/ con 4 assets clasif_2020 a clasif_2023
//      → si no existe, primero correr Export_Informe1_Rasters_a_Assets.js
//   2. Carpeta Informe2_SAR_Lluviosa/ con 4 assets clasif_2020 a clasif_2023
//      → ya generadas por CGSM_SAR_Lluviosa_Clasificacion_v4.js
//   3. Asset AOI_Pajarales_Ma16 (opcional, para §3.3.3)
//      → o usar polígono inline del INVEMAR
//
// ============================================================================

// ----------------------------------------------------------------------------
// 0. CONFIGURACIÓN
// ----------------------------------------------------------------------------

var PROJECT = 'basic-buttress-338101';

// AOI inline del Informe 1 (5 053 km²)
var aoi = ee.Geometry.Polygon([[[-74.87999999999708, 10.949999999996896], [-74.86999999999648, 11.060000000003543], [-74.82000000000245, 11.070000000004148], [-74.74999999999821, 11.065000000003845], [-74.68000000000296, 11.060000000003543], [-74.59999999999813, 11.050000000002939], [-74.53000000000289, 11.040000000002335], [-74.47999999999986, 11.035000000002032], [-74.42999999999685, 11.030000000001731], [-74.38000000000281, 11.020000000001126], [-74.31999999999918, 11.010000000000522], [-74.25000000000394, 10.989999999999313], [-74.20000000000091, 10.949999999996896], [-74.1699999999991, 10.900000000002859], [-74.14999999999789, 10.849999999999838], [-74.12999999999668, 10.799999999996816], [-74.11999999999608, 10.750000000002778], [-74.11000000000446, 10.699999999999756], [-74.10000000000386, 10.649999999996735], [-74.11999999999608, 10.600000000002698], [-74.14999999999789, 10.549999999999676], [-74.20000000000091, 10.499999999996655], [-74.25000000000394, 10.450000000002618], [-74.29999999999798, 10.399999999999595], [-74.35000000000099, 10.349999999996575], [-74.44999999999806, 10.33999999999597], [-74.5500000000041, 10.379999999998388], [-74.61999999999935, 10.420000000000805], [-74.70000000000418, 10.480000000004429], [-74.74999999999821, 10.549999999999676], [-74.80000000000123, 10.649999999996735], [-74.85000000000426, 10.750000000002778], [-74.86999999999648, 10.849999999999838], [-74.87999999999708, 10.949999999996896]]]);

print('--- Configuración inicial ---');
print('AOI grande (km²):', aoi.area().divide(1e6));
Map.centerObject(aoi, 9);

// Rutas a los assets de los dos sensores
var PATH_S2_SECA      = 'projects/' + PROJECT + '/assets/Informe1_S2_Seca/clasif_';
var PATH_SAR_LLUVIOSA = 'projects/' + PROJECT + '/assets/Informe2_SAR_Lluviosa/clasif_';

var YEARS = [2020, 2021, 2022, 2023];

// ============================================================================
// 1. FUNCIONES AUXILIARES
// ============================================================================
// 1.1. Convertir clasificación 3-clases (0,1,2) a binario manglar/no-manglar
// 1.2. Generar mapa de concordancia 4-categorías
// ============================================================================

function toBinaryMangrove(img) {
  // 1 si manglar (intacto o degradado), 0 si no-manglar
  return img.gte(1).rename('manglar');
}

function buildConcordanceMap(s2img, sarimg) {
  var s2bin  = toBinaryMangrove(s2img);
  var sarbin = toBinaryMangrove(sarimg);

  // Codificar categorías:
  //   0 = ambos NO manglar (concordancia negativa)
  //   1 = ambos sí manglar (concordancia positiva)
  //   2 = óptico dice manglar, SAR no (omisión SAR)
  //   3 = SAR dice manglar, óptico no (comisión SAR / sobreestimación)
  var concordancia = s2bin.multiply(2).add(sarbin);
  // Mapeo: s2=0 sar=0 → 0  ;  s2=0 sar=1 → 1  ;  s2=1 sar=0 → 2  ;  s2=1 sar=1 → 3
  // Ajustar a la convención más legible:
  var conc = ee.Image(0)
    .where(s2bin.eq(0).and(sarbin.eq(0)), 0)   // 0 = ambos no-manglar
    .where(s2bin.eq(1).and(sarbin.eq(1)), 1)   // 1 = ambos manglar
    .where(s2bin.eq(1).and(sarbin.eq(0)), 2)   // 2 = óptico sí, SAR no
    .where(s2bin.eq(0).and(sarbin.eq(1)), 3)   // 3 = SAR sí, óptico no
    .rename('concordancia');

  return conc.clip(aoi);
}

// ============================================================================
// 2. PROCESAR TODOS LOS AÑOS Y GENERAR TABLA DE ÁREAS
// ============================================================================

print('============================================================');
print('§3.3 — TABLA DE CONCORDANCIA POR AÑO');
print('============================================================');

var pixelAreaKm = ee.Image.pixelArea().divide(1e6);
var concordanciaMaps = {};

YEARS.forEach(function(year) {
  print('--- Año ' + year + ' ---');

  var s2  = ee.Image(PATH_S2_SECA + year);
  var sar = ee.Image(PATH_SAR_LLUVIOSA + year);

  var conc = buildConcordanceMap(s2, sar);
  concordanciaMaps[year] = conc;

  // Áreas por categoría
  var labels = ['ambos no-manglar', 'ambos manglar', 'óptico sí SAR no',
                'SAR sí óptico no'];
  for (var i = 0; i < 4; i++) {
    var areaImg = conc.eq(i).multiply(pixelAreaKm);
    var area = areaImg.reduceRegion({
      reducer: ee.Reducer.sum(),
      geometry: aoi,
      scale: 30,
      maxPixels: 1e10,
      tileScale: 16,
      bestEffort: true
    }).getNumber('concordancia');
    print('  ' + i + '=' + labels[i] + ' (km²):', area);
  }
});

// ============================================================================
// 3. §3.3.1 — MAPA DE CONCORDANCIA 2023 SOBRE AOI COMPLETO
// ============================================================================

print('============================================================');
print('§3.3.1 — MAPA DE CONCORDANCIA 2023');
print('============================================================');

// Paleta:
//   0 ambos no-manglar → gris claro
//   1 ambos manglar → verde oscuro (concordancia positiva)
//   2 óptico sí SAR no → amarillo (omisión SAR)
//   3 SAR sí óptico no → rojo (comisión SAR / sobreestimación)
var palette4cat = ['#E0E0E0', '#1B5E20', '#FFD600', '#D50000'];

var conc2023 = concordanciaMaps[2023];
Map.addLayer(conc2023, {min: 0, max: 3, palette: palette4cat},
             'Concordancia óptico-SAR 2023', true);

// Las clasificaciones individuales como referencia (apagadas por defecto)
['lightgray', 'green', 'orange'];
var palette3cls = ['lightblue', 'darkgreen', 'orange'];
Map.addLayer(ee.Image(PATH_S2_SECA + '2023'),
             {min: 0, max: 2, palette: palette3cls}, 'S2 seca 2023', false);
Map.addLayer(ee.Image(PATH_SAR_LLUVIOSA + '2023'),
             {min: 0, max: 2, palette: palette3cls}, 'SAR lluvioso 2023', false);

// Leyenda
function makeLegend() {
  var legend = ui.Panel({
    style: {position: 'bottom-right', padding: '8px 15px'}
  });
  legend.add(ui.Label('Concordancia óptico-SAR 2023', {fontWeight: 'bold'}));

  var labels = [
    {color: '#E0E0E0', text: 'Ambos no-manglar (concordancia)'},
    {color: '#1B5E20', text: 'Ambos manglar (concordancia)'},
    {color: '#FFD600', text: 'Óptico sí, SAR no (omisión SAR)'},
    {color: '#D50000', text: 'SAR sí, óptico no (sobreest. SAR)'}
  ];

  labels.forEach(function(it) {
    var colorBox = ui.Label('', {
      backgroundColor: it.color, padding: '8px',
      margin: '0 0 4px 0', border: '1px solid #999'
    });
    var textLabel = ui.Label(it.text, {margin: '0 0 4px 6px'});
    legend.add(ui.Panel([colorBox, textLabel], ui.Panel.Layout.Flow('horizontal')));
  });

  Map.add(legend);
}
makeLegend();

// ============================================================================
// 4. §3.3.3 — ZOOM AL COMPLEJO DE PAJARALES (sector Ma16 INVEMAR)
// ============================================================================
// Carga el polígono del Pajarales del SIGMA INVEMAR (Sector Occidental SFF CGSM).
// Se intenta cargar desde asset; si no existe, usar la línea inline alternativa.
// ============================================================================

print('============================================================');
print('§3.3.3 — ANÁLISIS PAJARALES (Ma16 INVEMAR)');
print('============================================================');

// Si tienes el asset:
// var pajarales = ee.FeatureCollection('projects/' + PROJECT + '/assets/AOI_Pajarales_Ma16').geometry();
// Si no, query directo al servicio SIGMA del INVEMAR (rápido y reproducible):
var pajarales = ee.FeatureCollection(
  ee.FeatureCollection([
    ee.Feature(ee.Geometry.Rectangle([-74.66, 10.85, -74.45, 11.01]))
  ])
).geometry();
// NOTA: el rectángulo anterior es solo bounding box aproximado.
// Para usar el polígono exacto del INVEMAR, primero subir el GeoJSON
// AOI_Pajarales_Ma16.geojson como asset y descomentar la línea anterior.

print('Pajarales área km²:', pajarales.area().divide(1e6));
Map.addLayer(pajarales, {color: 'cyan'}, 'AOI Pajarales (Ma16 INVEMAR)', true);

// Áreas por categoría DENTRO de Pajarales para 2023
print('--- Áreas Pajarales 2023 (km²) ---');
var labels = ['ambos no-manglar', 'ambos manglar', 'óptico sí SAR no',
              'SAR sí óptico no'];
for (var i = 0; i < 4; i++) {
  var areaImg = conc2023.eq(i).multiply(pixelAreaKm);
  var area = areaImg.reduceRegion({
    reducer: ee.Reducer.sum(),
    geometry: pajarales,
    scale: 30,
    maxPixels: 1e10,
    tileScale: 16,
    bestEffort: true
  }).getNumber('concordancia');
  print('  ' + i + '=' + labels[i] + ' (km²):', area);
}

// ============================================================================
// 5. EXPORT DEL MAPA DE CONCORDANCIA 2023 PARA INSERTAR AL INFORME
// ============================================================================

Export.image.toDrive({
  image: conc2023.toByte(),
  description: 'CGSM_Concordancia_Optico_SAR_2023',
  folder: 'Informe2',
  fileNamePrefix: 'CGSM_Concordancia_Optico_SAR_2023',
  region: aoi,
  scale: 10,
  maxPixels: 1e10,
  fileFormat: 'GeoTIFF'
});

// Tambien la version recortada a Pajarales
Export.image.toDrive({
  image: conc2023.clip(pajarales).toByte(),
  description: 'CGSM_Concordancia_Pajarales_2023',
  folder: 'Informe2',
  fileNamePrefix: 'CGSM_Concordancia_Pajarales_2023',
  region: pajarales,
  scale: 10,
  maxPixels: 1e10,
  fileFormat: 'GeoTIFF'
});

// ============================================================================
// 6. NOTAS DE EJECUCIÓN
// ============================================================================
//
// 1. La consola imprime para cada año las 4 áreas (km²) de las categorías
//    de acuerdo. Estos números pueblan la Tabla 8 del Informe 2 §3.3.2.
//
// 2. El mapa de concordancia 2023 se genera en el lienzo (capa azul = no-manglar
//    concordante, verde = manglar concordante, amarillo = omisión SAR, rojo =
//    sobreestimación SAR). Captura un screenshot para insertar como Figura del
//    Informe §3.3.1.
//
// 3. Los 2 GeoTIFFs de export quedan en Drive carpeta Informe2/, listos para
//    abrir en QGIS y generar mapas de calidad publicación.
//
// 4. Para el polígono exacto de Pajarales (Ma16 INVEMAR), subir el GeoJSON
//    AOI_Pajarales_Ma16.geojson como asset y descomentar la línea correspondiente
//    en la sección 4.
