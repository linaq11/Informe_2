/******************************************************************************
 * CGSM_Fusion_2015_2023_independiente.js
 *
 * Iteración corregida del clasificador de fusión Sentinel-2 dry + Sentinel-1
 * wet con cuatro clases ordinales, que atiende los hallazgos C3 y F1=0 de
 * la auditoría:
 *
 *   - Genera muestras nuevas REGULAR y DEGRADADO con criterios independientes
 *     de NDVI (Giri 2000 + Hansen Global Forest Change), evitando la
 *     circularidad metodológica en el entrenamiento.
 *
 *   - Extiende la ventana de clasificación y validación a 2015-2023 (9 años)
 *     para incluir los casos Luna 2017-2019 y Km22 2018-2019 que sí presentan
 *     estructura Degradada bajo cualquier criterio.
 *
 * NUEVAS MUESTRAS:
 *   - 100 Regular: Giri 2000 = manglar AND treecover2000 entre 40-80 %
 *                  AND sin pérdida reciente (lossyear < 10 o sin pérdida)
 *   - 100 Degradado: Giri 2000 = manglar AND lossyear entre 15 y 22
 *                    (pérdida documentada por Hansen entre 2015 y 2022)
 *
 * REMAPEO esquema ordinal del Informe 1:
 *   0 = no-manglar (igual)
 *   1 = degradado (era 2)
 *   2 = regular (NUEVA)
 *   3 = intacto (era 1)
 *
 *****************************************************************************/

// ============================================================================
// 0. CONFIGURACIÓN
// ============================================================================

var PROJECT = 'basic-buttress-338101';
var trainingPoints = ee.FeatureCollection('projects/' + PROJECT + '/assets/CGSM_muestras_371');

var aoi = ee.Geometry.Polygon([[
  [-74.88, 10.34], [-74.88, 10.99],
  [-74.08, 10.99], [-74.08, 10.34],
  [-74.88, 10.34]
]], null, false);
print('AOI (km²):', aoi.area(1).divide(1e6));
Map.centerObject(aoi, 10);

var EXPORT_PATH = 'projects/' + PROJECT + '/assets/Informe2_Fusion_2015_2023/';
var YEARS = [2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023];
var N_TREES = 200;
var N_REGULAR = 100;
var N_DEGRADADO = 100;
var SEMILLA = 42;

// Estaciones reubicadas (criterio Giri ≥ 60 % manglar)
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
// 1. COMPOSITE SENTINEL-2 DRY POR AÑO
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

// ============================================================================
// 2. COMPOSITE SENTINEL-1 WET POR AÑO
// ============================================================================

function buildS1WetComposite(year) {
  var start = ee.Date.fromYMD(year, 6, 1);
  var end   = ee.Date.fromYMD(year, 11, 30);

  var s1 = ee.ImageCollection('COPERNICUS/S1_GRD')
    .filter(ee.Filter.eq('instrumentMode', 'IW'))
    .filter(ee.Filter.listContains('transmitterReceiverPolarisation', 'VV'))
    .filter(ee.Filter.listContains('transmitterReceiverPolarisation', 'VH'))
    .filter(ee.Filter.eq('orbitProperties_pass', 'ASCENDING'))
    .filter(ee.Filter.date(start, end))
    .filter(ee.Filter.bounds(aoi))
    .select(['VV', 'VH']);

  var s1Smoothed = s1.map(function(img) {
    return img.focalMedian({radius: 1.5, kernelType: 'square', units: 'pixels'})
              .copyProperties(img, ['system:time_start']);
  });

  var composite = s1Smoothed.median();

  var vh_vv_ratio = composite.expression(
    'pow(10, VH/10) / pow(10, VV/10)', {
      'VH': composite.select('VH'),
      'VV': composite.select('VV')
  }).rename('VH_VV_ratio');

  var vv_vh_diff = composite.select('VV').subtract(composite.select('VH'))
                            .rename('VV_VH_diff');

  return composite.addBands(vh_vv_ratio).addBands(vv_vh_diff);
}

function buildFusionComposite(year) {
  var s2 = buildS2DryComposite(year);
  var s1 = buildS1WetComposite(year);
  var s1At10m = s1.resample('bilinear').reproject({crs: s2.projection(), scale: 10});
  return s2.addBands(s1At10m);
}

var BANDS = [
  'B2','B3','B4','B5','B6','B7','B8','B8A','B11','B12',
  'NDVI','NDWI','EVI','BSI',
  'VV','VH','VH_VV_ratio','VV_VH_diff'
];

// ============================================================================
// 3. GENERAR MUESTRAS REGULAR + DEGRADADO INDEPENDIENTES DE NDVI
//    Criterios: Giri 2000 (membresía histórica de manglar) + Hansen GFC
//    (detección de pérdida de cobertura), ninguno usa NDVI como criterio.
// ============================================================================

var giri = ee.Image('LANDSAT/MANGROVE_FORESTS/2000').select(0).unmask(0);
var gfc  = ee.Image('UMD/hansen/global_forest_change_2024_v1_12');
var lossyear = gfc.select('lossyear');             // 1 = 2001 ... 24 = 2024
var treecover2000 = gfc.select('treecover2000');   // % cobertura forestal año 2000

print('--- Stack de criterios para muestras independientes ---');
print('Giri 2000 (manglar):',  giri.bandTypes());
print('Hansen lossyear:',      lossyear.bandTypes());
print('Hansen treecover2000:', treecover2000.bandTypes());

// 10 000 puntos aleatorios sobre AOI
var allRandom = ee.FeatureCollection.randomPoints({
  region: aoi, points: 10000, seed: SEMILLA
});

// Stack con todos los criterios
var criteriaStack = giri.rename('giri')
  .addBands(treecover2000.rename('tc2000'))
  .addBands(lossyear.rename('lossy'));

var allRandomWithVals = criteriaStack.reduceRegions({
  collection: allRandom,
  reducer: ee.Reducer.first(),
  scale: 30,
  tileScale: 8
});
allRandomWithVals = allRandomWithVals.map(function(f) {
  return f.set('dist_min_m', trainingPoints.geometry().distance(f.geometry()));
});

// --- Candidatos REGULAR: era manglar Y cobertura moderada Y sin pérdida reciente ---
var regularCandidates = allRandomWithVals
  .filter(ee.Filter.eq('giri', 1))
  .filter(ee.Filter.gte('tc2000', 40))
  .filter(ee.Filter.lt('tc2000', 80))
  .filter(ee.Filter.lt('lossy', 10))    // sin pérdida o pérdida pre-2010
  .filter(ee.Filter.gte('dist_min_m', 100));
print('Candidatos REGULAR tras filtros:', regularCandidates.size());

var regularPoints = regularCandidates.limit(N_REGULAR).map(function(f) {
  return ee.Feature(f.geometry()).set('class', 2);  // Regular = 2
});
print('Muestras Regular generadas:', regularPoints.size());

// --- Candidatos DEGRADADO: era manglar Y pérdida reciente Hansen ---
var degradadoCandidates = allRandomWithVals
  .filter(ee.Filter.eq('giri', 1))
  .filter(ee.Filter.gte('lossy', 15))   // pérdida en 2015 o posterior
  .filter(ee.Filter.lte('lossy', 22))   // hasta 2022 para dejar margen al Sentinel-2 dry 2023
  .filter(ee.Filter.gte('dist_min_m', 100));
print('Candidatos DEGRADADO tras filtros:', degradadoCandidates.size());

var degradadoPoints = degradadoCandidates.limit(N_DEGRADADO).map(function(f) {
  return ee.Feature(f.geometry()).set('class', 1);  // Degradado = 1
});
print('Muestras Degradado generadas:', degradadoPoints.size());

// Visualizar
Map.addLayer(regularPoints, {color: 'yellow'}, 'Regular nuevas (Hansen+Giri)', false);
Map.addLayer(degradadoPoints, {color: 'orange'}, 'Degradado nuevas (Hansen+Giri)', false);

// ============================================================================
// 4. REMAPEO 371 ORIGINALES + COMBINACIÓN
// ============================================================================

var trainingRemap = trainingPoints.map(function(f) {
  var oldClass = ee.Number(f.get('class'));
  // 0 = no-manglar (igual), 1 (intacto) -> 3, 2 (degradado) -> 1
  var newClass = ee.Algorithms.If(oldClass.eq(0), 0,
                  ee.Algorithms.If(oldClass.eq(1), 3, 1));
  return ee.Feature(f.geometry()).set('class', newClass);
});

var allTraining = trainingRemap.merge(regularPoints).merge(degradadoPoints);
print('Muestras totales:', allTraining.size());
print('Distribución por clase:', allTraining.aggregate_histogram('class'));

Map.addLayer(allTraining, {color: 'red'}, 'Muestras totales (4 clases)', false);

// ============================================================================
// 5. ENTRENAMIENTO + CLASIFICACIÓN POR AÑO (2015-2023)
// ============================================================================

YEARS.forEach(function(year) {
  print('============================================================');
  print('AÑO', year, '— FUSIÓN S2 dry + S1 wet (' + BANDS.length + ' bandas)');
  print('============================================================');

  var composite = buildFusionComposite(year);

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

  var validated = test30.classify(classifier);
  var confMat = validated.errorMatrix('class', 'classification');
  print('Matriz confusión ' + year + ':', confMat);
  print('OA ' + year + ':', confMat.accuracy());
  print('Kappa ' + year + ':', confMat.kappa());

  var classified = composite.select(BANDS).classify(classifier).clip(aoi);
  var smooth = classified.focalMode({
    radius: 1.5, kernelType: 'square', units: 'pixels'
  }).unmask(0);

  if (year === 2023) {
    Map.addLayer(smooth, {
      min: 0, max: 3,
      palette: ['lightblue','orange','yellow','darkgreen']
    }, 'Fusión 2023 (criterios independientes)', true);
    Map.addLayer(stationsFC, {color: 'red'}, 'Estaciones', true);
  }

  // Extraer en estaciones
  var sampledMode = smooth.reduceRegions({
    collection: stationsFC, reducer: ee.Reducer.mode(),
    scale: 10, tileScale: 4
  }).map(function(f) { return f.set('year', year); });

  // Export raster
  Export.image.toAsset({
    image: smooth.toByte(),
    description: 'CGSM_Fusion_2015_23_' + year,
    assetId: EXPORT_PATH + 'fusion_' + year,
    region: aoi, scale: 10, maxPixels: 1e10,
    pyramidingPolicy: {'.default': 'mode'}
  });

  // Export tabla CSV
  Export.table.toDrive({
    collection: sampledMode,
    description: 'CGSM_Fusion_2015_23_estaciones_' + year,
    folder: 'Informe2',
    fileNamePrefix: 'CGSM_Fusion_2015_23_estaciones_' + year,
    fileFormat: 'CSV',
    selectors: ['code','name','year','lat','lon','mode']
  });
});

// ============================================================================
// 6. NOTAS DE EJECUCIÓN
// ============================================================================
//
// 1. Crear la carpeta 'projects/<PROJECT>/assets/Informe2_Fusion_2015_2023/'
//    en GEE Assets antes de ejecutar (Assets → New → Folder).
//
// 2. Lanzar todas las tareas (9 rasters + 9 CSV = 18 tareas). Tiempo total
//    estimado: 2-4 horas. Conviene aceptar primero los 9 CSV (~2 min cada uno)
//    para tener los datos de validación de inmediato, y dejar los rasters
//    corriendo en paralelo.
//
// 3. Cuando los 9 CSV estén en Drive carpeta 'Informe2', descargarlos a
//    Informe_2/csvs/ y subirlos al chat para reconstruir la Tabla 3 con
//    n = 5 estaciones × 9 años = 45 observaciones.
//
// 4. Distribución esperada del entrenamiento:
//      0 (no-manglar): ~121 (originales)
//      1 (degradado):  ~120 (originales remapeadas) + ~100 nuevas Hansen+Giri = ~220
//      2 (regular):    ~100 nuevas Hansen+Giri
//      3 (intacto):    ~130 (originales remapeadas)
//    Total: ~571 muestras balanceadas
//
// 5. Si Hansen GFC encuentra pocos píxeles de pérdida en CGSM (que es
//    posible — los manglares se detectan menos bien que los bosques densos),
//    los criterios pueden afinarse:
//      - Bajar tc2000 mínimo de 40 % a 30 %
//      - Ampliar lossyear de [15, 22] a [10, 22] para Degradado
//    Ajustar y re-ejecutar.
