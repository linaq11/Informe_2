/******************************************************************************
 * CGSM_Fusion_S2_S1_4clases.js
 *
 * REENTRENAMIENTO RF con FUSIÓN óptico (Sentinel-2 dry) + SAR (Sentinel-1
 * wet) y 4 clases ordinales. La hipótesis: la banda C de Sentinel-1
 * penetra parcialmente el dosel del manglar y permite detectar estructura
 * interna que el óptico no captura — específicamente, la diferencia entre
 * un dosel cerrado sobre estructura sana (Intacto) y un dosel cerrado
 * sobre estructura debilitada (Regular o Degradado), caso documentado para
 * Caño Grande y Luna en la Tabla 3 con clasificación solo óptica.
 *
 * BANDAS PREDICTORAS (n = 18):
 *   Ópticas Sentinel-2 dry (Jan-May): B2, B3, B4, B5, B6, B7, B8, B8A,
 *     B11, B12, NDVI, NDWI, EVI, BSI
 *   SAR Sentinel-1 wet (Jun-Nov):     VV, VH, VH/VV ratio, VV-VH diff
 *
 * MUESTRAS DE ENTRENAMIENTO:
 *   - 371 originales del Informe 1 remapeadas a esquema ordinal 0/1/2/3
 *   - 100 nuevas Regular generadas con criterios Giri + NDVI [0.35, 0.65]
 *
 * Salida:
 *   - 4 rasters anuales con clase 0/1/2/3 (no-manglar/degradado/regular/intacto)
 *   - Métricas OA, Kappa, matriz de confusión por año
 *   - Importancia de variables — comparable al desempeño solo óptico
 *   - Tabla CSV con clase moda en buffers 150 m de las 5 estaciones reubicadas
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

var EXPORT_PATH = 'projects/' + PROJECT + '/assets/Informe2_Fusion_S2_S1_4clases/';
var YEARS = [2020, 2021, 2022, 2023];
var N_TREES = 200;
var N_REGULAR = 100;
var SEMILLA = 42;

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
// 1. COMPOSITE SENTINEL-2 DRY POR AÑO (mismo que script 4-clases solo óptico)
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
// 2. COMPOSITE SENTINEL-1 WET POR AÑO (espejo del script SAR Lluviosa)
// ============================================================================

function buildS1WetComposite(year) {
  var start = ee.Date.fromYMD(year, 6, 1);    // 1 junio
  var end   = ee.Date.fromYMD(year, 11, 30);  // 30 noviembre

  var s1 = ee.ImageCollection('COPERNICUS/S1_GRD')
    .filter(ee.Filter.eq('instrumentMode', 'IW'))
    .filter(ee.Filter.listContains('transmitterReceiverPolarisation', 'VV'))
    .filter(ee.Filter.listContains('transmitterReceiverPolarisation', 'VH'))
    .filter(ee.Filter.eq('orbitProperties_pass', 'ASCENDING'))
    .filter(ee.Filter.date(start, end))
    .filter(ee.Filter.bounds(aoi))
    .select(['VV', 'VH']);

  // Filtro speckle: mediana focal 3x3 sobre cada imagen
  var s1Smoothed = s1.map(function(img) {
    return img.focalMedian({radius: 1.5, kernelType: 'square', units: 'pixels'})
              .copyProperties(img, ['system:time_start']);
  });

  var composite = s1Smoothed.median();

  // Bandas derivadas SAR
  var vh_vv_ratio = composite.expression(
    'pow(10, VH/10) / pow(10, VV/10)', {
      'VH': composite.select('VH'),
      'VV': composite.select('VV')
  }).rename('VH_VV_ratio');

  var vv_vh_diff = composite.select('VV').subtract(composite.select('VH'))
                            .rename('VV_VH_diff');

  return composite.addBands(vh_vv_ratio).addBands(vv_vh_diff);
}

// ============================================================================
// 3. FUNCIÓN DE COMPOSITE FUSIONADO POR AÑO
//    Reproyecta el SAR a la grilla del óptico (10 m) para alinearlos
// ============================================================================

function buildFusionComposite(year) {
  var s2 = buildS2DryComposite(year);
  var s1 = buildS1WetComposite(year);

  // Reproyectar SAR a 10 m para alinear con S2
  var s1At10m = s1.resample('bilinear').reproject({crs: s2.projection(), scale: 10});

  return s2.addBands(s1At10m);
}

var BANDS = [
  // Ópticas Sentinel-2 dry
  'B2','B3','B4','B5','B6','B7','B8','B8A','B11','B12',
  'NDVI','NDWI','EVI','BSI',
  // SAR Sentinel-1 wet
  'VV','VH','VH_VV_ratio','VV_VH_diff'
];

// ============================================================================
// 4. GENERAR MUESTRAS REGULAR (idéntico al script solo óptico)
// ============================================================================

var s2_2021 = buildS2DryComposite(2021);
var ndvi_2021 = s2_2021.select('NDVI');
var manglarGiri = ee.Image('LANDSAT/MANGROVE_FORESTS/2000').select(0).unmask(0);

var criteriaStack = manglarGiri.rename('giri').addBands(ndvi_2021.rename('NDVI_2021'));
var allRandom = ee.FeatureCollection.randomPoints({
  region: aoi, points: 10000, seed: SEMILLA
});
var allRandomWithVals = criteriaStack.reduceRegions({
  collection: allRandom, reducer: ee.Reducer.first(),
  scale: 30, tileScale: 8
});
allRandomWithVals = allRandomWithVals.map(function(f) {
  return f.set('dist_min_m', trainingPoints.geometry().distance(f.geometry()));
});
var regularCandidates = allRandomWithVals
  .filter(ee.Filter.eq('giri', 1))
  .filter(ee.Filter.gte('NDVI_2021', 0.35))
  .filter(ee.Filter.lt('NDVI_2021', 0.65))
  .filter(ee.Filter.gte('dist_min_m', 100));
print('Candidatos Regular tras filtros:', regularCandidates.size());

var regularPoints = regularCandidates.limit(N_REGULAR).map(function(f) {
  return ee.Feature(f.geometry()).set('class', 2);
});
print('Muestras Regular generadas:', regularPoints.size());

// Remapear 371 originales
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
// 5. ENTRENAMIENTO RF + CLASIFICACIÓN POR AÑO (CON FUSIÓN S2+S1)
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

  // Importancia agrupada por sensor
  var imp = ee.Dictionary(classifier.explain().get('importance'));
  print('Importancia variables ' + year + ':', imp);

  // Importancia agregada óptico vs SAR
  var bandasOpticas = ['B2','B3','B4','B5','B6','B7','B8','B8A','B11','B12','NDVI','NDWI','EVI','BSI'];
  var bandasSAR = ['VV','VH','VH_VV_ratio','VV_VH_diff'];
  var sumOptico = bandasOpticas.reduce(function(acc, b) {
    return ee.Number(acc).add(ee.Number(imp.get(b)));
  }, 0);
  var sumSAR = bandasSAR.reduce(function(acc, b) {
    return ee.Number(acc).add(ee.Number(imp.get(b)));
  }, 0);
  print('Importancia agregada — óptico (S2 dry):', sumOptico);
  print('Importancia agregada — SAR (S1 wet):',    sumSAR);

  var classified = composite.select(BANDS).classify(classifier).clip(aoi);
  var smooth = classified.focalMode({
    radius: 1.5, kernelType: 'square', units: 'pixels'
  }).unmask(0);

  if (year === YEARS[YEARS.length - 1]) {
    Map.addLayer(smooth, {
      min: 0, max: 3,
      palette: ['lightblue','orange','yellow','darkgreen']
    }, 'Fusión 4 clases ' + year, true);
    Map.addLayer(stationsFC, {color: 'red'}, 'Estaciones', true);
  }

  // Áreas
  var pixelKm = ee.Image.pixelArea().divide(1e6);
  ['Degradado','Regular','Intacto'].forEach(function(label, i) {
    var code = i + 1;
    var area = smooth.eq(code).multiply(pixelKm).reduceRegion({
      reducer: ee.Reducer.sum(), geometry: aoi, scale: 10,
      maxPixels: 1e10, tileScale: 8
    }).getNumber('classification');
    print('Área ' + label + ' ' + year + ' (km²):', area);
  });

  var sampledMode = smooth.reduceRegions({
    collection: stationsFC, reducer: ee.Reducer.mode(),
    scale: 10, tileScale: 4
  }).map(function(f) { return f.set('year', year); });

  Export.image.toAsset({
    image: smooth.toByte(),
    description: 'CGSM_Fusion_4c_' + year,
    assetId: EXPORT_PATH + 'fusion_4c_' + year,
    region: aoi, scale: 10, maxPixels: 1e10,
    pyramidingPolicy: {'.default': 'mode'}
  });

  Export.table.toDrive({
    collection: sampledMode,
    description: 'CGSM_Fusion_4c_estaciones_' + year,
    folder: 'Informe2',
    fileNamePrefix: 'CGSM_Fusion_4c_estaciones_' + year,
    fileFormat: 'CSV',
    selectors: ['code','name','year','lat','lon','mode']
  });
});

// ============================================================================
// 6. NOTAS DE EJECUCIÓN
// ============================================================================
//
// 1. Crear carpeta 'projects/<PROJECT>/assets/Informe2_Fusion_S2_S1_4clases/'
//    antes de ejecutar.
//
// 2. La fusión es más exigente computacionalmente que solo S2. Si hay
//    timeouts, reducir tileScale o lanzar las tareas una por una.
//
// 3. La importancia agregada óptico vs SAR al final de cada año revelará
//    cuánto peso le da el RF al SAR. Si SAR > 30 %, la fusión aporta
//    información complementaria significativa. Si SAR < 10 %, el óptico
//    domina y la fusión no agrega mucho.
//
// 4. Comparar la concordancia con la versión solo óptico (Tabla3_4clases.csv)
//    para evaluar si CGE y LUN bajan a Regular/Degradado con SAR.
