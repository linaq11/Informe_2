/******************************************************************************
 * CGSM_Fusion_2018_2023_parcelas.js
 *
 * Iteración v3 del clasificador de fusión Sentinel-2 dry + Sentinel-1 wet con
 * cuatro clases ordinales que atiende los hallazgos C2, C3 y C4 de la
 * auditoría senior del Informe 2:
 *
 *   - C2 RESUELTO: Coordenadas exactas de las 15 parcelas CARICOMP extraídas
 *     del DwC-A público de GBIF (DOI 10.15472/2poedl). Se reemplazan las
 *     5 estaciones reubicadas + buffer 150 m por las 15 parcelas exactas
 *     con buffer 30 m (resolución mejorada).
 *
 *   - C3 RESUELTO: Muestras REGULAR y DEGRADADO generadas con criterios
 *     independientes de NDVI (Giri 2000 + Hansen Global Forest Change),
 *     evitando la circularidad metodológica en el entrenamiento.
 *
 *   - C4 PARCIAL: Tabla 3 ampliada de 20 a 90 observaciones (15 parcelas ×
 *     6 años 2018-2023), lo que permite analizar la sensibilidad metodológica
 *     a la escala espacial de validación.
 *
 * NOTA DE COBERTURA TEMPORAL:
 *   Sentinel-2 SR Harmonized tiene cobertura confiable global desde diciembre
 *   de 2017, por lo que el análisis se restringe al periodo 2018-2023. Los
 *   eventos CARICOMP de 2015-2017 (relevantes para el colapso de Luna 2017)
 *   se discuten cualitativamente a partir de los datos de campo.
 *
 * MUESTRAS DE ENTRENAMIENTO:
 *   - 100 Regular: Giri 2000 = manglar AND treecover2000 entre 40-80 %
 *                  AND sin pérdida reciente (lossyear < 10 o sin pérdida)
 *   - 100 Degradado: Giri 2000 = manglar AND lossyear entre 15 y 22
 *                    (pérdida documentada por Hansen entre 2015 y 2022)
 *
 * ESQUEMA ORDINAL:
 *   0 = no-manglar
 *   1 = degradado
 *   2 = regular (NUEVA)
 *   3 = intacto
 *****************************************************************************/

// ============================================================================
// 0. CONFIGURACIÓN
// ============================================================================
var PROJECT = 'basic-buttress-338101';
var trainingPoints = ee.FeatureCollection('projects/' + PROJECT + '/assets/CGSM_muestras_371');

var aoi = ee.Geometry.Polygon([[
  [-74.88, 10.34], [-74.08, 10.34], [-74.08, 11.00], [-74.88, 11.00], [-74.88, 10.34]
]]);

var EXPORT_PATH = 'projects/' + PROJECT + '/assets/Informe2_Fusion_2018_2023/';
var YEARS = [2018, 2019, 2020, 2021, 2022, 2023];   // S2_SR_HARMONIZED desde 2018
var N_TREES = 200;
var N_REGULAR = 100;
var N_DEGRADADO = 100;
var SEMILLA = 42;
var BUFFER_PARCELA_M = 30;   // antes 150 m sobre estación; ahora 30 m sobre parcela exacta

// 15 parcelas CARICOMP con coordenadas exactas del DwC-A GBIF
// [id_parcela, estacion, lat, lon]
var parcelasList = [
  ['ANE-1','ANE',10.8096667,-74.6078889],
  ['ANE-2','ANE',10.8099167,-74.6080278],
  ['ANE-3','ANE',10.8102778,-74.6082222],
  ['CGE-1','CGE',10.8635556,-74.4815556],
  ['CGE-2','CGE',10.8615556,-74.4813889],
  ['CGE-3','CGE',10.8625000,-74.4813889],
  ['KM22-1','KM22',10.9774167,-74.5767500],
  ['KM22-2','KM22',10.9778056,-74.5776389],
  ['KM22-3','KM22',10.9780833,-74.5784722],
  ['LUN-1','LUN',10.9074722,-74.5882222],
  ['LUN-2','LUN',10.9074722,-74.5882222],
  ['LUN-3','LUN',10.9074722,-74.5882222],
  ['RIN-1','RIN',10.9631944,-74.4918611],
  ['RIN-2','RIN',10.9621389,-74.4937222],
  ['RIN-3','RIN',10.9618333,-74.4936667]
];

var parcelasFC = ee.FeatureCollection(parcelasList.map(function(p) {
  return ee.Feature(
    ee.Geometry.Point([p[3], p[2]]).buffer(BUFFER_PARCELA_M),
    {parcela: p[0], estacion: p[1], lat: p[2], lon: p[3]}
  );
}));

print('Parcelas CARICOMP cargadas:', parcelasFC.size(), '(esperado: 15)');
Map.centerObject(parcelasFC, 11);
Map.addLayer(parcelasFC, {color:'red'}, 'Parcelas CARICOMP (buffer 30 m)');

// ============================================================================
// 1. COMPOSITE SENTINEL-2 DRY POR AÑO  (idem v2)
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
    .filterBounds(aoi)
    .filterDate(start, end)
    .filter(ee.Filter.eq('instrumentMode', 'IW'))
    .filter(ee.Filter.listContains('transmitterReceiverPolarisation', 'VV'))
    .filter(ee.Filter.listContains('transmitterReceiverPolarisation', 'VH'))
    // Preprocesamiento estándar GEE Sentinel-1 GRD:
    .filter(ee.Filter.eq('orbitProperties_pass', 'DESCENDING'))    // (Mejora 2) consistencia geométrica
    .map(function(img) {
      // (Mejora 1) Máscara de bordes: descartar píxeles con VV < -30 dB (artefactos)
      var edge = img.select('VV').lt(-30.0);
      return img.updateMask(img.mask().select(0).and(edge.not()));
    });
  var med = s1.select(['VV','VH']).median().clip(aoi);
  med = med.focalMedian(30, 'square', 'meters');
  var vhmvv = med.select('VH').subtract(med.select('VV')).rename('VHmVV');
  var vhdvv = med.select('VH').divide(med.select('VV')).rename('VHdVV');
  return med.addBands([vhmvv, vhdvv]);
}

var BANDS = [
  'B2','B3','B4','B8','B11','B12',     // S2 dry
  'NDVI','NDWI','EVI','BSI',
  'VV','VH','VHmVV','VHdVV'             // S1 wet
];

// ============================================================================
// 3. MUESTRAS REGULAR Y DEGRADADO (HANSEN + GIRI, INDEPENDIENTE DE NDVI)
// ============================================================================
var giri = ee.Image('LANDSAT/MANGROVE_FORESTS/2000').select(0).unmask(0);
var gfc  = ee.Image('UMD/hansen/global_forest_change_2024_v1_12');
var lossyear = gfc.select('lossyear');
var treecover2000 = gfc.select('treecover2000');

var allRandom = ee.FeatureCollection.randomPoints({
  region: aoi, points: 10000, seed: SEMILLA
});

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

var regularCandidates = allRandomWithVals
  .filter(ee.Filter.eq('giri', 1))
  .filter(ee.Filter.gte('tc2000', 40))
  .filter(ee.Filter.lt('tc2000', 80))
  .filter(ee.Filter.lt('lossy', 10))
  .filter(ee.Filter.gte('dist_min_m', 100));
print('Candidatos REGULAR:', regularCandidates.size());

var regularPoints = regularCandidates.limit(N_REGULAR).map(function(f) {
  return ee.Feature(f.geometry()).set('class', 2);
});

var degradadoCandidates = allRandomWithVals
  .filter(ee.Filter.eq('giri', 1))
  .filter(ee.Filter.gte('lossy', 15))
  .filter(ee.Filter.lte('lossy', 22))
  .filter(ee.Filter.gte('dist_min_m', 100));
print('Candidatos DEGRADADO:', degradadoCandidates.size());

var degradadoPoints = degradadoCandidates.limit(N_DEGRADADO).map(function(f) {
  return ee.Feature(f.geometry()).set('class', 1);
});

// ============================================================================
// 4. REMAPEO + ENTRENAMIENTO
// ============================================================================
var trainingRemap = trainingPoints.map(function(f) {
  var cls = f.get('class');
  var newCls = ee.Algorithms.If(ee.Number(cls).eq(2), 1,
                ee.Algorithms.If(ee.Number(cls).eq(1), 3, 0));
  return f.set('class', newCls);
});
var allTraining = trainingRemap.merge(regularPoints).merge(degradadoPoints);
print('Total entrenamiento:', allTraining.size());

// ============================================================================
// 5. CLASIFICACIÓN POR AÑO + EXPORT
// ============================================================================
YEARS.forEach(function(year) {
  print('--- Año', year, '---');
  var s2 = buildS2DryComposite(year);
  var s1 = buildS1WetComposite(year);
  var stack = s2.addBands(s1).select(BANDS);

  var trained = stack.sampleRegions({
    collection: allTraining,
    properties: ['class'],
    scale: 10,
    tileScale: 4
  });

  var rf = ee.Classifier.smileRandomForest(N_TREES)
    .train(trained, 'class', BANDS);

  var classified = stack.classify(rf);
  var smooth = classified.focalMode({radius: 1, units: 'pixels'});

  // Muestrear las 15 parcelas (modo de la clase en buffer 30 m)
  var sampledMode = smooth.reduceRegions({
    collection: parcelasFC,
    reducer: ee.Reducer.mode(),
    scale: 10
  }).map(function(f) {
    return f.set('year', year);
  });

  Export.image.toAsset({
    image: smooth.toByte(),
    description: 'CGSM_Fusion_18_23_' + year,
    assetId: EXPORT_PATH + 'fusion_' + year,
    region: aoi, scale: 10, maxPixels: 1e10,
    pyramidingPolicy: {'.default': 'mode'}
  });

  Export.table.toDrive({
    collection: sampledMode,
    description: 'CGSM_Fusion_18_23_parcelas_' + year,
    folder: 'Informe2',
    fileNamePrefix: 'CGSM_Fusion_18_23_parcelas_' + year,
    fileFormat: 'CSV',
    selectors: ['parcela','estacion','lat','lon','year','mode']
  });
});

// ============================================================================
// 6. NOTAS DE EJECUCIÓN
// ============================================================================
//
// 1. Crear la carpeta 'projects/<PROJECT>/assets/Informe2_Fusion_2018_2023/'
//    en GEE Assets antes de ejecutar (Assets → New → Folder).
//
// 2. Lanzar las 12 tareas (6 rasters + 6 CSV). Tiempo total estimado: 1-2 h.
//    Conviene aceptar primero los 6 CSV (~2 min cada uno) para tener los datos
//    de validación de inmediato.
//
// 3. Cuando los 6 CSV estén en Drive carpeta 'Informe2', descargarlos a
//    Informe_2/csvs/ y reconstruir la Tabla 3 con n = 15 parcelas × 6 años = 90.
//
// 4. Distribución esperada del entrenamiento:
//      0 (no-manglar): ~121 originales
//      1 (degradado):  ~120 originales remapeadas + ~100 nuevas = ~220
//      2 (regular):    ~100 nuevas Hansen+Giri
//      3 (intacto):    ~130 originales remapeadas
