/******************************************************************************
 * CGSM_Classification_Export.js
 *
 * Exporta la clasificación Random Forest de fusión 4-clases sobre el AOI
 * CGSM para los años 2020-2023, en la misma grilla EPSG:32618 a 10 m del
 * stack del Anexo I, de modo que el cruce con `aoa_mask_2023.tif` sea
 * píxel a píxel sin reproyección posterior.
 *
 * La lógica del clasificador reproduce la de `CGSM_Fusion_S2_S1_4clases.js`
 * con las muestras Regular y Degradado generadas por Hansen+Giri del
 * Anexo E. La salida alimenta `crosstab_aoa_class.py` para producir las
 * tablas finales del cierre del Anexo I.
 *
 * Salidas a Drive/CGSM_Classification_Export/ (uint8, 1 banda, clases 0-3):
 *   CGSM_Classification_2020.tif
 *   CGSM_Classification_2021.tif
 *   CGSM_Classification_2022.tif
 *   CGSM_Classification_2023.tif
 *****************************************************************************/

// ============================================================================
// 1. CONFIGURACIÓN — idéntica al script del Anexo E para garantizar mismo modelo
// ============================================================================
var PROJECT = 'basic-buttress-338101';
var EXPORT_FOLDER = 'CGSM_Classification_Export';
var SCALE_M = 10;
var YEARS = [2020, 2021, 2022, 2023];
var N_TREES = 200;
var SEMILLA = 42;
var N_REGULAR = 100;
var N_DEGRADADO = 100;

var trainingPoints = ee.FeatureCollection(
  'projects/' + PROJECT + '/assets/CGSM_muestras_371'
);
var aoi = ee.Geometry.Polygon([[
  [-74.88, 10.34], [-74.08, 10.34],
  [-74.08, 11.00], [-74.88, 11.00], [-74.88, 10.34]
]], null, false);

// ============================================================================
// 2. BUILDERS DE COMPUESTOS (idénticos a CGSM_Fusion_2018_2023_parcelas.js)
// ============================================================================
function buildS2DryComposite(year) {
  var start = year + '-01-01';
  var end   = year + '-05-31';
  var col = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
    .filterBounds(aoi).filterDate(start, end)
    .linkCollection(
      ee.ImageCollection('GOOGLE/CLOUD_SCORE_PLUS/V1/S2_HARMONIZED'),
      ['cs'])
    .map(function(img) { return img.updateMask(img.select('cs').gte(0.3)); })
    .select('B.*');
  var composite = col.median().clip(aoi);
  var ndvi = composite.normalizedDifference(['B8','B4']).rename('NDVI');
  var ndwi = composite.normalizedDifference(['B3','B8']).rename('NDWI');
  var evi  = composite.expression(
    '2.5 * ((NIR - RED) / (NIR + 6 * RED - 7.5 * BLUE + 1))', {
      'NIR': composite.select('B8'),
      'RED': composite.select('B4'),
      'BLUE': composite.select('B2')
  }).rename('EVI');
  var bsi  = composite.expression(
    '((SWIR + RED) - (NIR + BLUE)) / ((SWIR + RED) + (NIR + BLUE))', {
      'SWIR': composite.select('B11'),
      'RED': composite.select('B4'),
      'NIR': composite.select('B8'),
      'BLUE': composite.select('B2')
  }).rename('BSI');
  return composite.addBands([ndvi, ndwi, evi, bsi]);
}

function buildS1WetComposite(year) {
  var start = year + '-06-01';
  var end   = year + '-11-30';
  var col = ee.ImageCollection('COPERNICUS/S1_GRD')
    .filterBounds(aoi).filterDate(start, end)
    .filter(ee.Filter.eq('instrumentMode', 'IW'))
    .filter(ee.Filter.listContains('transmitterReceiverPolarisation','VV'))
    .filter(ee.Filter.listContains('transmitterReceiverPolarisation','VH'))
    .filter(ee.Filter.eq('orbitProperties_pass','DESCENDING'))
    .map(function(img) {
      var edge = img.select('VV').lt(-30.0);
      return img.updateMask(img.mask().select(0).and(edge.not()));
    })
    .select(['VV','VH']);
  var composite = col.median().clip(aoi).focal_median(1, 'square', 'pixels');
  var vh_vv_ratio = composite.expression('VH/VV', {
    'VH': composite.select('VH'), 'VV': composite.select('VV')
  }).rename('VH_VV_ratio');
  var vv_vh_diff = composite.select('VV').subtract(composite.select('VH'))
    .rename('VV_VH_diff');
  return composite.addBands(vh_vv_ratio).addBands(vv_vh_diff);
}

var BANDS = [
  'B2','B3','B4','B5','B6','B7','B8','B8A','B11','B12',
  'NDVI','NDWI','EVI','BSI',
  'VV','VH','VH_VV_ratio','VV_VH_diff'
];

// ============================================================================
// 3. MUESTRAS Regular y Degradado (Hansen+Giri, mismo proceso del Anexo E)
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
  collection: allRandom, reducer: ee.Reducer.first(), scale: 30
});
allRandomWithVals = allRandomWithVals.map(function(f) {
  return f.set('dist_min_m', trainingPoints.geometry().distance(f.geometry()));
});

var regularCandidates = allRandomWithVals
  .filter(ee.Filter.eq('giri', 1))
  .filter(ee.Filter.gte('tc2000', 40))
  .filter(ee.Filter.lte('tc2000', 80))
  .filter(ee.Filter.eq('lossy', 0))
  .filter(ee.Filter.gte('dist_min_m', 100));
var regularPoints = regularCandidates.limit(N_REGULAR).map(function(f) {
  return ee.Feature(f.geometry()).set('class', 2);
});

var degradadoCandidates = allRandomWithVals
  .filter(ee.Filter.eq('giri', 1))
  .filter(ee.Filter.gte('lossy', 15))
  .filter(ee.Filter.lte('lossy', 22))
  .filter(ee.Filter.gte('dist_min_m', 100));
var degradadoPoints = degradadoCandidates.limit(N_DEGRADADO).map(function(f) {
  return ee.Feature(f.geometry()).set('class', 1);
});

// Remapear las 371 originales al esquema ordinal (2→1 degradado, 1→3 intacto, 0→0)
var trainingRemap = trainingPoints.map(function(f) {
  var cls = f.get('class');
  var newCls = ee.Algorithms.If(ee.Number(cls).eq(2), 1,
                ee.Algorithms.If(ee.Number(cls).eq(1), 3, 0));
  return f.set('class', newCls);
});
var allTraining = trainingRemap.merge(regularPoints).merge(degradadoPoints);
print('Total entrenamiento (~471):', allTraining.size());

// ============================================================================
// 4. CLASIFICACIÓN Y EXPORTACIÓN POR AÑO
// ============================================================================
YEARS.forEach(function(year) {
  print('=== AÑO', year, '===');
  var s2 = buildS2DryComposite(year);
  var s1 = buildS1WetComposite(year);
  var s1At10m = s1.resample('bilinear').reproject({
    crs: s2.projection(), scale: SCALE_M
  });
  var stack = s2.addBands(s1At10m).select(BANDS);

  var trained = stack.sampleRegions({
    collection: allTraining,
    properties: ['class'],
    scale: SCALE_M,
    tileScale: 4
  });

  var rf = ee.Classifier.smileRandomForest(N_TREES)
    .train(trained, 'class', BANDS);

  var classified = stack.classify(rf).clip(aoi).toByte();
  var smooth = classified.focalMode({radius: 1, units: 'pixels'});

  Export.image.toDrive({
    image: smooth,
    description: 'CGSM_Classification_' + year,
    folder: EXPORT_FOLDER,
    fileNamePrefix: 'CGSM_Classification_' + year,
    region: aoi,
    scale: SCALE_M,
    crs: 'EPSG:32618',
    maxPixels: 1e10,
    formatOptions: {cloudOptimized: true}
  });
});

