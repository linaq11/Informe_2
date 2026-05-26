/******************************************************************************
 * CGSM_S2_Seca_Reentrenamiento_4clases.js
 *
 * REENTRENAMIENTO del clasificador Sentinel-2 seca con 4 clases ordinales
 * añadiendo "Regular" como clase intermedia entre Degradado e Intacto. Se
 * resuelve la limitación arquitectural del clasificador binario del Informe 1
 * documentada en la Tabla 3 (concordancia 30 % por confusión sistemática de
 * Caño Grande y Km22 — estructuralmente Regular — con Intacto).
 *
 * NUEVO ESQUEMA DE CLASES (ordinal):
 *   0 = No-manglar
 *   1 = Degradado     (BA < 35 m²/ha)
 *   2 = Regular       (35 ≤ BA < 88 m²/ha)
 *   3 = Intacto       (BA ≥ 88 m²/ha)
 *
 * GENERACIÓN DE MUESTRAS REGULAR (objetivo n ≈ 100):
 *   Filtros automáticos sobre el AOI (independientes de las 5 estaciones de
 *   validación CARICOMP):
 *     a. dentro del manglar canónico Giri 2000 (LANDSAT/MANGROVE_FORESTS)
 *     b. NDVI Sentinel-2 dry 2021 entre 0.40 y 0.60 (intermedio)
 *     c. al menos 100 m de las 371 muestras del Informe 1 (no overlap)
 *   Muestreo aleatorio estratificado con semilla fija (reproducible).
 *
 * NUEVAS BANDAS PREDICTORAS añadidas a las 12 originales del Informe 1:
 *   EVI = 2.5 · (B8 − B4) / (B8 + 6·B4 − 7.5·B2 + 1)
 *   BSI = ((B11 + B4) − (B8 + B2)) / ((B11 + B4) + (B8 + B2))
 *
 * REMAPEO DEL ESQUEMA EXISTENTE:
 *   Las 371 muestras del Informe 1 tenían 0=no-manglar, 1=intacto, 2=degradado.
 *   Se remapean a la nueva escala ordinal: 0→0, 1→3, 2→1.
 *
 * Salida:
 *   - 4 rasters anuales (2020-2023) con clase 0/1/2/3
 *   - Métricas OA, Kappa y matriz de confusión por año
 *   - Importancia de variables por año
 *   - Tabla CSV con clase moda en buffers 150 m de las 5 estaciones reubicadas
 *****************************************************************************/

// ============================================================================
// 0. CONFIGURACIÓN
// ============================================================================

var PROJECT = 'basic-buttress-338101';
var trainingPoints = ee.FeatureCollection('projects/' + PROJECT + '/assets/CGSM_muestras_371');

// AOI inline cubriendo todo el sistema CGSM
var aoi = ee.Geometry.Polygon([[
  [-74.88, 10.34], [-74.88, 10.99],
  [-74.08, 10.99], [-74.08, 10.34],
  [-74.88, 10.34]
]], null, false);
print('AOI (km²):', aoi.area(1).divide(1e6));
Map.centerObject(aoi, 10);
Map.addLayer(aoi, {color: 'yellow'}, 'AOI inline CGSM', false);

var EXPORT_PATH = 'projects/' + PROJECT + '/assets/Informe2_S2_4clases/';
var YEARS = [2020, 2021, 2022, 2023];
var N_TREES = 200;
var N_REGULAR = 100;          // muestras nuevas Regular a generar
var SEMILLA = 42;

// Estaciones CARICOMP reubicadas (criterio Giri ≥ 60 % manglar)
var stationsList = [
  {name: 'Aguas_Negras', code: 'ANE',  lat: 10.813176, lon: -74.609484},
  {name: 'Cano_Grande',  code: 'CGE',  lat: 10.864945, lon: -74.482619},
  {name: 'Km22',         code: 'KM22', lat: 10.9774,   lon: -74.5767},
  {name: 'Luna',         code: 'LUN',  lat: 10.9075,   lon: -74.5882},
  {name: 'Rinconada',    code: 'RIN',  lat: 10.963514, lon: -74.495779}
];
var stationsFC = ee.FeatureCollection(stationsList.map(function(s) {
  return ee.Feature(ee.Geometry.Point([s.lon, s.lat]).buffer(150),
                     {'name': s.name, 'code': s.code, 'lat': s.lat, 'lon': s.lon});
}));

// ============================================================================
// 1. COMPOSITE SENTINEL-2 DRY POR AÑO + EVI + BSI
// ============================================================================

function buildS2DryComposite(year) {
  var start = ee.Date.fromYMD(year, 1, 1);
  var end   = ee.Date.fromYMD(year, 5, 31);

  var s2 = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
    .filter(ee.Filter.date(start, end))
    .filter(ee.Filter.bounds(aoi));

  var cs = ee.ImageCollection('GOOGLE/CLOUD_SCORE_PLUS/V1/S2_HARMONIZED');
  var csBands = cs.first().bandNames();

  var processed = s2.linkCollection(cs, csBands)
    .map(function(img) { return img.updateMask(img.select('cs').gte(0.3)); })
    .select('B.*')
    .map(function(img) {
      return img.multiply(0.0001).copyProperties(img, ['system:time_start']);
    })
    .map(function(img) {
      var ndvi = img.normalizedDifference(['B8','B4']).rename('NDVI');
      var ndwi = img.normalizedDifference(['B3','B8']).rename('NDWI');
      var evi  = img.expression(
        '2.5 * (NIR - RED) / (NIR + 6*RED - 7.5*BLUE + 1)', {
          'NIR': img.select('B8'),
          'RED': img.select('B4'),
          'BLUE': img.select('B2')
      }).rename('EVI');
      var bsi = img.expression(
        '((SWIR + RED) - (NIR + BLUE)) / ((SWIR + RED) + (NIR + BLUE))', {
          'SWIR': img.select('B11'),
          'RED': img.select('B4'),
          'NIR': img.select('B8'),
          'BLUE': img.select('B2')
      }).rename('BSI');
      return img.addBands([ndvi, ndwi, evi, bsi]);
    });

  return processed.median().focal_mean({radius: 30, units: 'meters'});
}

var BANDS = ['B2','B3','B4','B5','B6','B7','B8','B8A','B11','B12',
             'NDVI','NDWI','EVI','BSI'];

// ============================================================================
// 2. GENERAR MUESTRAS NUEVAS DE "REGULAR"
//    Criterios: dentro de Giri manglar AND NDVI dry 2021 ∈ [0.40, 0.60]
//    AND a ≥ 100 m de las muestras existentes
// ============================================================================

var s2_2021 = buildS2DryComposite(2021);
var ndvi_2021 = s2_2021.select('NDVI');
var manglarGiri = ee.Image('LANDSAT/MANGROVE_FORESTS/2000').select(0).unmask(0);

// ENFOQUE: generar muchos puntos aleatorios sobre el AOI, evaluar cada uno
// contra los criterios (Giri, NDVI, distancia), filtrar y limitar. Más
// robusto que samplear sobre máscaras porque no depende de la propagación
// de masking entre operaciones .and().

// Stack con las bandas necesarias para evaluar criterios
var criteriaStack = manglarGiri.rename('giri')
  .addBands(ndvi_2021.rename('NDVI_2021'));

// 10000 puntos aleatorios distribuidos sobre el AOI (subido desde 5000
// para asegurar suficientes candidatos tras los filtros).
var allRandom = ee.FeatureCollection.randomPoints({
  region: aoi,
  points: 10000,
  seed: SEMILLA
});

// Evaluar valores en cada punto + distancia a muestras existentes
var allRandomWithVals = criteriaStack.reduceRegions({
  collection: allRandom,
  reducer: ee.Reducer.first(),
  scale: 30,
  tileScale: 8
});

// Calcular distancia mínima de cada punto al conjunto de muestras existentes
allRandomWithVals = allRandomWithVals.map(function(f) {
  var pt = f.geometry();
  var distMin = trainingPoints.geometry().distance(pt);
  return f.set('dist_min_m', distMin);
});

// Filtrar por criterios Regular — rango NDVI ampliado a [0.35, 0.65]
// para obtener más muestras candidatas (con [0.40, 0.60] solo se generaron
// 42, insuficientes para balancear contra ~120 de las otras clases).
var regularCandidates = allRandomWithVals
  .filter(ee.Filter.eq('giri', 1))
  .filter(ee.Filter.gte('NDVI_2021', 0.35))
  .filter(ee.Filter.lt('NDVI_2021', 0.65))
  .filter(ee.Filter.gte('dist_min_m', 100));

print('Candidatos Regular tras filtros:', regularCandidates.size());

// Tomar las primeras N_REGULAR
var regularPoints = regularCandidates.limit(N_REGULAR).map(function(f) {
  return ee.Feature(f.geometry()).set('class', 2);
});

print('Muestras Regular generadas:', regularPoints.size());

// Visualizar muestras Regular nuevas
Map.addLayer(regularPoints, {color: 'magenta'}, 'Muestras Regular nuevas', true);

// ============================================================================
// 3. REMAPEAR LAS 371 MUESTRAS EXISTENTES AL ESQUEMA ORDINAL
//    0=no-manglar (igual), 1=intacto→3, 2=degradado→1
// ============================================================================

var trainingRemap = trainingPoints.map(function(f) {
  var oldClass = ee.Number(f.get('class'));
  var newClass = ee.Algorithms.If(oldClass.eq(0), 0,
                  ee.Algorithms.If(oldClass.eq(1), 3, 1));
  return ee.Feature(f.geometry()).set('class', newClass);
});

var allTraining = trainingRemap.merge(regularPoints);
print('Muestras totales:', allTraining.size());
print('Distribución por clase:', allTraining.aggregate_histogram('class'));

Map.addLayer(allTraining, {color: 'red'}, 'Muestras totales (4 clases)', false);

// ============================================================================
// 4. ENTRENAMIENTO RF + CLASIFICACIÓN POR AÑO
// ============================================================================

YEARS.forEach(function(year) {
  print('============================================================');
  print('AÑO', year);
  print('============================================================');

  var composite = buildS2DryComposite(year);

  var training = composite.sampleRegions({
    collection: allTraining,
    properties: ['class'],
    scale: 10,
    tileScale: 4
  });

  training = training.randomColumn('rnd', SEMILLA);
  var train70 = training.filter(ee.Filter.lt('rnd', 0.7));
  var test30  = training.filter(ee.Filter.gte('rnd', 0.7));

  var classifier = ee.Classifier.smileRandomForest(N_TREES).train({
    features: train70,
    classProperty: 'class',
    inputProperties: BANDS
  });

  // Evaluación
  var validated = test30.classify(classifier);
  var confMat = validated.errorMatrix('class', 'classification');
  print('Matriz confusión ' + year + ':', confMat);
  print('OA ' + year + ':', confMat.accuracy());
  print('Kappa ' + year + ':', confMat.kappa());

  // Importancia
  print('Importancia variables ' + year + ':',
        ee.Dictionary(classifier.explain().get('importance')));

  // Clasificación espacial
  var classified = composite.select(BANDS).classify(classifier).clip(aoi);
  var smooth = classified.focalMode({
    radius: 1.5, kernelType: 'square', units: 'pixels'
  }).unmask(0);

  // Visualizar último año
  if (year === YEARS[YEARS.length - 1]) {
    Map.addLayer(smooth, {
      min: 0, max: 3,
      palette: ['lightblue','orange','yellow','darkgreen']
    }, 'Clasificación 4 clases ' + year, true);
    Map.addLayer(stationsFC, {color: 'red'}, 'Estaciones', true);
  }

  // Áreas por clase
  var pixelKm = ee.Image.pixelArea().divide(1e6);
  ['Degradado','Regular','Intacto'].forEach(function(label, i) {
    var code = i + 1;
    var area = smooth.eq(code).multiply(pixelKm).reduceRegion({
      reducer: ee.Reducer.sum(), geometry: aoi, scale: 10,
      maxPixels: 1e10, tileScale: 8
    }).getNumber('classification');
    print('Área ' + label + ' ' + year + ' (km²):', area);
  });

  // Extraer en estaciones
  var sampledMode = smooth.reduceRegions({
    collection: stationsFC, reducer: ee.Reducer.mode(),
    scale: 10, tileScale: 4
  }).map(function(f) { return f.set('year', year); });

  // Export raster a Asset
  Export.image.toAsset({
    image: smooth.toByte(),
    description: 'CGSM_S2_4clases_' + year,
    assetId: EXPORT_PATH + 'clasif_4c_' + year,
    region: aoi, scale: 10, maxPixels: 1e10,
    pyramidingPolicy: {'.default': 'mode'}
  });

  // Export tabla CSV
  Export.table.toDrive({
    collection: sampledMode,
    description: 'CGSM_S2_4clases_estaciones_' + year,
    folder: 'Informe2',
    fileNamePrefix: 'CGSM_S2_4clases_estaciones_' + year,
    fileFormat: 'CSV',
    selectors: ['code','name','year','lat','lon','mode']
  });
});

// ============================================================================
// 5. NOTAS DE EJECUCIÓN
// ============================================================================
//
// 1. Crear la carpeta 'projects/<PROJECT>/assets/Informe2_S2_4clases/' antes
//    de ejecutar (Assets > New > Folder).
//
// 2. La generación de muestras Regular es estocástica (depende de la semilla).
//    Verificar en consola que la cantidad sea cercana a 100; si es muy menor
//    (p.ej. < 50), ampliar el rango NDVI a [0.35, 0.65] o reducir el filtro
//    de distancia a 50 m.
//
// 3. Si la matriz de confusión muestra que Regular se confunde mucho con
//    Intacto, considerar:
//    - Ajustar el rango NDVI hacia abajo (e.g. 0.35-0.55)
//    - Generar más muestras (N_REGULAR = 150)
//    - Aumentar N_TREES a 300
//
// 4. La interpretación física de las nuevas bandas:
//    - EVI: vegetación densa sin saturar (ayuda a separar Intacto vs Regular)
//    - BSI: exposición de suelo (suele ser positivo en degradado)
