/******************************************************************************
 * CGSM_GPBoost_Export_Samples.js
 *
 * Exporta el conjunto de entrenamiento 4-clases utilizado por el pipeline
 * Python de GPBoost del Anexo J.
 *
 * Se reconstruye el mismo conjunto del Anexo E del informe:
 *   - 371 muestras originales del Informe 1 remapeadas al esquema 4 clases
 *     (0=no-manglar, 1=degradado, 2=regular, 3=intacto)
 *   - ~100 muestras Regular generadas por NDVI 0.35-0.65 sobre Giri (criterio
 *     del §2.4.1 original; el filtro Hansen produjo 0 candidatos en CGSM,
 *     hallazgo documentado en el Anexo J)
 *   - ~100 muestras Degradado generadas por Hansen lossy 2015-2022 sobre Giri
 *
 * Sobre cada una de las 571 muestras se muestrean las 18 bandas del stack
 * Sentinel-2 dry + Sentinel-1 wet 2023 (idéntico al Anexo I), produciendo
 * un GeoJSON único listo para el script Python compute_gpboost.py.
 *
 * Salida:
 *   CGSM_GPBoost_Samples_471.geojson — features con clase + 18 bandas + (lon, lat)
 *****************************************************************************/

// ============================================================================
// 1. CONFIGURACIÓN
// ============================================================================
var PROJECT = 'basic-buttress-338101';
var EXPORT_FOLDER = 'CGSM_GPBoost_Export';
var YEAR_TARGET = 2023;
var SCALE_M = 10;
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
// 2. BUILDERS DE COMPUESTOS — idénticos al script del Anexo E
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
// 3. STACK 18 BANDAS PARA YEAR_TARGET
// ============================================================================
var s2 = buildS2DryComposite(YEAR_TARGET);
var s1 = buildS1WetComposite(YEAR_TARGET);
var s1At10m = s1.resample('bilinear').reproject({
  crs: s2.projection(), scale: SCALE_M
});
var stack = s2.addBands(s1At10m).select(BANDS);

// ============================================================================
// 4. MUESTRAS Regular + Degradado (Hansen+Giri, idéntico al Anexo E)
// ============================================================================
var giri = ee.Image('LANDSAT/MANGROVE_FORESTS/2000').select(0).unmask(0);
var gfc  = ee.Image('UMD/hansen/global_forest_change_2024_v1_12');
var lossyear = gfc.select('lossyear');
var treecover2000 = gfc.select('treecover2000');

// v3: aumentar puntos aleatorios a 50 000 para incrementar probabilidad
// de hit en píxeles que pasen el filtro Hansen Regular (en CGSM con 10 000
// el filtro produjo 0 candidatos)
var allRandom = ee.FeatureCollection.randomPoints({
  region: aoi, points: 50000, seed: SEMILLA
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

// FILTRO REGULAR: idéntico al script original del Anexo E (CGSM_Fusion_2018_2023_parcelas.js)
//   - tc2000 entre 40 y 80 % de cobertura forestal Hansen 2000
//   - lossy < 10 (sin pérdida o pérdida muy temprana, años 2001-2009)
//   - distancia mínima 100 m de las 371 muestras originales para evitar superposición
var regularCandidates = allRandomWithVals
  .filter(ee.Filter.eq('giri', 1))
  .filter(ee.Filter.gte('tc2000', 40))
  .filter(ee.Filter.lt('tc2000', 80))
  .filter(ee.Filter.lt('lossy', 10))
  .filter(ee.Filter.gte('dist_min_m', 100));
var regularPoints = regularCandidates.limit(N_REGULAR).map(function(f) {
  return ee.Feature(f.geometry()).set('class', 2).set('origen', 'hansen_regular');
});
print('Candidatos Regular:', regularCandidates.size(), '→ usados:', regularPoints.size());

var degradadoCandidates = allRandomWithVals
  .filter(ee.Filter.eq('giri', 1))
  .filter(ee.Filter.gte('lossy', 15))
  .filter(ee.Filter.lte('lossy', 22))
  .filter(ee.Filter.gte('dist_min_m', 100));
var degradadoPoints = degradadoCandidates.limit(N_DEGRADADO).map(function(f) {
  return ee.Feature(f.geometry()).set('class', 1).set('origen', 'hansen_degradado');
});
print('Candidatos Degradado:', degradadoCandidates.size(), '→ usados:', degradadoPoints.size());

// ============================================================================
// 5. REMAPEO de las 371 originales al esquema 4 clases del Anexo E
//    Original: 0=no-manglar, 1=degradado, 2=intacto
//    Nuevo:    0=no-manglar, 1=degradado, 3=intacto (2 queda para Regular nuevas)
// ============================================================================
var trainingRemap = trainingPoints.map(function(f) {
  var cls = f.get('class');
  var newCls = ee.Algorithms.If(ee.Number(cls).eq(2), 1,
                ee.Algorithms.If(ee.Number(cls).eq(1), 3, 0));
  return f.set('class', newCls).set('origen', 'informe1_original');
});

// ============================================================================
// 6. MERGE: 371 + 100 + 100 = 571 muestras totales
//    (nota: en el Anexo E reportamos "471" porque originalmente eran 271
//     muestras del Informe 1 + 200 Hansen; revisar conteo real)
// ============================================================================
var allTraining = trainingRemap.merge(regularPoints).merge(degradadoPoints);
print('Total muestras:', allTraining.size());
print('Distribución por clase:',
  allTraining.aggregate_histogram('class'));

// ============================================================================
// 7. MUESTREAR 18 BANDAS SOBRE EL STACK + AÑADIR LON/LAT
// ============================================================================
var samplesWithBands = stack.sampleRegions({
  collection: allTraining,
  properties: ['class', 'origen'],
  scale: SCALE_M,
  tileScale: 4,
  geometries: true
}).map(function(f) {
  var coords = f.geometry().coordinates();
  return f.set('lon', ee.List(coords).get(0))
          .set('lat', ee.List(coords).get(1));
});
print('Muestras con bandas extraídas:', samplesWithBands.size());

// ============================================================================
// 8. EXPORT A DRIVE
// ============================================================================
Export.table.toDrive({
  collection: samplesWithBands,
  description: 'CGSM_GPBoost_Samples_471',
  folder: EXPORT_FOLDER,
  fileNamePrefix: 'CGSM_GPBoost_Samples_4clases',
  fileFormat: 'GeoJSON'
});

