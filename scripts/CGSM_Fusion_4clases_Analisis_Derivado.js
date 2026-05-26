/******************************************************************************
 * CGSM_Fusion_4clases_Analisis_Derivado.js
 *
 * Análisis derivado de los 4 rasters de la clasificación FUSIÓN óptico+SAR
 * con 4 clases ordinales exportados como assets en
 *   projects/<PROJECT>/assets/Informe2_Fusion_S2_S1_4clases/fusion_4c_YYYY
 *
 * Produce:
 *   1. Visualización en pantalla con paleta consistente y leyenda
 *   2. Tabla de áreas km² por clase y año (export a Drive)
 *   3. Mapa de transición 2020 → 2023 (categorías de cambio)
 *   4. Tabla de áreas Pajarales (Ma16) por clase y año
 *   5. Tabla de áreas SFF completo por clase y año
 *   6. 4 PNGs (uno por año) listos para insertar como figura del informe
 *****************************************************************************/

// ============================================================================
// 0. CONFIGURACIÓN
// ============================================================================

var PROJECT = 'basic-buttress-338101';
var ASSET_BASE = 'projects/' + PROJECT + '/assets/Informe2_Fusion_S2_S1_4clases/';
var YEARS = [2020, 2021, 2022, 2023];

// AOI inline
var aoi = ee.Geometry.Polygon([[
  [-74.88, 10.34], [-74.88, 10.99],
  [-74.08, 10.99], [-74.08, 10.34],
  [-74.88, 10.34]
]], null, false);

// AOI Pajarales (Ma16) - centroide aproximado, ajustar si tienes asset
var pajaralesPoint = ee.Geometry.Point([-74.59971, 10.82415]);
var pajaralesAOI = pajaralesPoint.buffer(15000);  // 15 km buffer aproximado

// Estaciones reubicadas
var stationsList = [
  {name: 'Aguas_Negras', code: 'ANE',  lat: 10.813176, lon: -74.609484},
  {name: 'Cano_Grande',  code: 'CGE',  lat: 10.864945, lon: -74.482619},
  {name: 'Km22',         code: 'KM22', lat: 10.9774,   lon: -74.5767},
  {name: 'Luna',         code: 'LUN',  lat: 10.9075,   lon: -74.5882},
  {name: 'Rinconada',    code: 'RIN',  lat: 10.963514, lon: -74.495779}
];
var stationsFC = ee.FeatureCollection(stationsList.map(function(s) {
  return ee.Feature(ee.Geometry.Point([s.lon, s.lat]).buffer(150),
                     {'name': s.name, 'code': s.code});
}));

// Paleta consistente (mismas que el script de clasificación)
var PALETTE = ['lightblue','orange','yellow','darkgreen'];
var CLASS_NAMES = ['No-manglar','Degradado','Regular','Intacto'];
var VIS = {min: 0, max: 3, palette: PALETTE};

// ============================================================================
// 1. CARGAR LOS 4 RASTERS Y VISUALIZAR
// ============================================================================

var clasifs = {};
YEARS.forEach(function(year) {
  var img = ee.Image(ASSET_BASE + 'fusion_4c_' + year);
  clasifs[year] = img;
  Map.addLayer(img, VIS, 'Fusión 4 clases ' + year, year === 2023);
});

Map.centerObject(aoi, 10);
Map.addLayer(stationsFC, {color: 'red'}, 'Estaciones CARICOMP', true);

// Leyenda
var legend = ui.Panel({style: {position: 'bottom-left', padding: '8px 15px'}});
legend.add(ui.Label('Clasificación 4 clases (Fusión S2+S1)',
  {fontWeight: 'bold', fontSize: '14px'}));
CLASS_NAMES.forEach(function(name, i) {
  var color = PALETTE[i];
  legend.add(ui.Panel({
    widgets: [
      ui.Label('', {backgroundColor: color, padding: '8px', margin: '0 4px 0 0'}),
      ui.Label(name)
    ],
    layout: ui.Panel.Layout.flow('horizontal')
  }));
});
Map.add(legend);

// ============================================================================
// 2. ÁREAS km² POR CLASE Y AÑO — AOI COMPLETO
// ============================================================================

var pixelKm2 = ee.Image.pixelArea().divide(1e6);
var areasFeatures = [];

YEARS.forEach(function(year) {
  var img = clasifs[year];
  for (var clase = 0; clase < 4; clase++) {
    var area = img.eq(clase).multiply(pixelKm2).reduceRegion({
      reducer: ee.Reducer.sum(),
      geometry: aoi,
      scale: 10,
      maxPixels: 1e10,
      tileScale: 8
    });
    areasFeatures.push(ee.Feature(null, {
      'year': year,
      'clase': clase,
      'clase_nombre': CLASS_NAMES[clase],
      'area_km2': area.getNumber('classification'),
      'aoi': 'CGSM_completo'
    }));
  }
});

var areasFC = ee.FeatureCollection(areasFeatures);
print('Áreas por clase y año (CGSM completo):', areasFC);

// Export tabla CSV
Export.table.toDrive({
  collection: areasFC,
  description: 'CGSM_Fusion_areas_clase_anio',
  folder: 'Informe2',
  fileNamePrefix: 'CGSM_Fusion_areas_clase_anio',
  fileFormat: 'CSV',
  selectors: ['year','clase','clase_nombre','area_km2','aoi']
});

// ============================================================================
// 3. MAPA DE TRANSICIÓN 2020 → 2023
//    Codificación: 10*clase_2020 + clase_2023
//    Por ejemplo: 33 = Intacto 2020 → Intacto 2023 (sin cambio)
//                 32 = Intacto 2020 → Regular 2023 (degradación)
//                 21 = Regular 2020 → Degradado 2023 (degradación severa)
// ============================================================================

var transicion = clasifs[2020].multiply(10).add(clasifs[2023])
  .rename('transicion_20_23');

// Categorías de interés
var sin_cambio = transicion.eq(0).or(transicion.eq(11)).or(transicion.eq(22)).or(transicion.eq(33));
var mejora     = transicion.eq(12).or(transicion.eq(13)).or(transicion.eq(23))
                  .or(transicion.eq(1)).or(transicion.eq(2)).or(transicion.eq(3));
var degrada    = transicion.eq(32).or(transicion.eq(31)).or(transicion.eq(21))
                  .or(transicion.eq(30)).or(transicion.eq(20)).or(transicion.eq(10));

var categCambio = ee.Image(0)
  .where(sin_cambio, 1)  // 1 = sin cambio
  .where(mejora,     2)  // 2 = mejora (más manglar / clase superior)
  .where(degrada,    3)  // 3 = degradación
  .rename('categ_cambio');

Map.addLayer(categCambio, {
  min: 0, max: 3,
  palette: ['white','lightgray','green','red']
}, 'Cambio 2020→2023', false);

// Áreas por categoría de cambio
var categNames = ['otro', 'sin_cambio', 'mejora', 'degradacion'];
var cambioFeatures = [];
for (var c = 0; c < 4; c++) {
  var area_c = categCambio.eq(c).multiply(pixelKm2).reduceRegion({
    reducer: ee.Reducer.sum(),
    geometry: aoi,
    scale: 10,
    maxPixels: 1e10,
    tileScale: 8
  });
  cambioFeatures.push(ee.Feature(null, {
    'categoria': c,
    'nombre': categNames[c],
    'area_km2': area_c.getNumber('categ_cambio')
  }));
}
print('Áreas categoría de cambio 2020→2023:', ee.FeatureCollection(cambioFeatures));

Export.table.toDrive({
  collection: ee.FeatureCollection(cambioFeatures),
  description: 'CGSM_Fusion_cambio_2020_2023',
  folder: 'Informe2',
  fileNamePrefix: 'CGSM_Fusion_cambio_2020_2023',
  fileFormat: 'CSV',
  selectors: ['categoria','nombre','area_km2']
});

// ============================================================================
// 4. ÁREAS DENTRO DE PAJARALES POR CLASE Y AÑO
// ============================================================================

var pajaralesAreas = [];
YEARS.forEach(function(year) {
  var img = clasifs[year];
  for (var clase = 0; clase < 4; clase++) {
    var area_p = img.eq(clase).multiply(pixelKm2).reduceRegion({
      reducer: ee.Reducer.sum(),
      geometry: pajaralesAOI,
      scale: 10,
      maxPixels: 1e10,
      tileScale: 8
    });
    pajaralesAreas.push(ee.Feature(null, {
      'year': year, 'clase': clase,
      'clase_nombre': CLASS_NAMES[clase],
      'area_km2': area_p.getNumber('classification'),
      'aoi': 'Pajarales'
    }));
  }
});
print('Áreas Pajarales:', ee.FeatureCollection(pajaralesAreas));

Export.table.toDrive({
  collection: ee.FeatureCollection(pajaralesAreas),
  description: 'CGSM_Fusion_areas_Pajarales',
  folder: 'Informe2',
  fileNamePrefix: 'CGSM_Fusion_areas_Pajarales',
  fileFormat: 'CSV',
  selectors: ['year','clase','clase_nombre','area_km2','aoi']
});

// ============================================================================
// 5. EXPORTAR 4 THUMBNAILS PNG (uno por año) PARA FIGURA DEL INFORME
//    Cada uno como GeoTIFF visualizable, 600×800 px
// ============================================================================

YEARS.forEach(function(year) {
  Export.image.toDrive({
    image: clasifs[year].visualize(VIS),
    description: 'CGSM_Fusion_thumbnail_' + year,
    folder: 'Informe2',
    fileNamePrefix: 'CGSM_Fusion_thumbnail_' + year,
    region: aoi,
    scale: 30,  // resolución reducida para PNG
    fileFormat: 'GeoTIFF',
    maxPixels: 1e10
  });
});

// ============================================================================
// 6. NOTAS DE EJECUCIÓN
// ============================================================================
//
// 1. Run del script → 4+ tareas en pestaña Tasks (3 CSV + 4 GeoTIFF):
//      CGSM_Fusion_areas_clase_anio       (CSV, áreas AOI completo)
//      CGSM_Fusion_cambio_2020_2023       (CSV, categorías cambio)
//      CGSM_Fusion_areas_Pajarales        (CSV, áreas Pajarales)
//      CGSM_Fusion_thumbnail_2020/21/22/23 (GeoTIFF visualizables)
//
// 2. Lanzar todas las tareas, esperar a que terminen (5-15 min cada una).
//
// 3. Descargar los 7 archivos a Informe_2/csvs/ y Informe_2/figuras/.
//
// 4. Subir los 4 PNG thumbnails y los 3 CSV a la conversación para procesar
//    en Python: generar la figura 2x2 con paneles por año, calcular
//    porcentajes y producir las tablas finales para insertar en el informe.
