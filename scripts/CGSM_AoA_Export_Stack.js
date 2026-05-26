/******************************************************************************
 * CGSM_AoA_Export_Stack.js
 *
 * Exporta el stack de 18 bandas Sentinel-2 dry + Sentinel-1 wet 2023 sobre
 * el AOI CGSM completo (5 053 km², resolución 10 m) para alimentar el
 * pipeline Python del Area of Applicability (Meyer & Pebesma 2021).
 *
 * El stack reproduce exactamente la composición del clasificador Random
 * Forest reentrenado de §2.4.1, de modo que el AoA calculado sobre él
 * corresponde al envoltorio multivariado del clasificador utilizado en el
 * cuerpo del informe.
 *
 * Asset de muestras de entrenamiento esperado:
 *   projects/basic-buttress-338101/assets/CGSM_muestras_371
 * (ajustar la variable PROJECT si la ruta cambia).
 *
 * Salidas a Drive/CGSM_AoA_Export/:
 *   - CGSM_AoA_Stack_2023.tif         (18 bandas, 10 m, ~1.5-5 GB)
 *   - CGSM_AoA_TrainingSamples.geojson (471 puntos + clase)
 *   - CGSM_AoA_ValidationParcels.geojson (15 parcelas DwC-A)
 *****************************************************************************/

// ============================================================================
// 1. CONFIGURACIÓN
// ============================================================================
var PROJECT = 'basic-buttress-338101';
var YEAR_TARGET = 2023;  // Año del stack para AoA
var EXPORT_FOLDER = 'CGSM_AoA_Export';
var SCALE_M = 10;
var trainingPoints = ee.FeatureCollection(
  'projects/' + PROJECT + '/assets/CGSM_muestras_371'
);

// AOI completo CGSM (5 053 km² heredado del Informe 1)
var aoi = ee.Geometry.Polygon([[
  [-74.88, 10.34], [-74.08, 10.34],
  [-74.08, 11.00], [-74.88, 11.00], [-74.88, 10.34]
]], null, false);

// ============================================================================
// 2. BUILDERS DE COMPUESTOS (idénticos al script CGSM_Fusion_S2_S1_4clases.js)
// ============================================================================
function buildS2DryComposite(year) {
  var start = year + '-01-01';
  var end   = year + '-05-31';
  var col = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
    .filterBounds(aoi)
    .filterDate(start, end)
    .linkCollection(
      ee.ImageCollection('GOOGLE/CLOUD_SCORE_PLUS/V1/S2_HARMONIZED'),
      ['cs']
    )
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
    .filterBounds(aoi)
    .filterDate(start, end)
    .filter(ee.Filter.eq('instrumentMode', 'IW'))
    .filter(ee.Filter.listContains('transmitterReceiverPolarisation','VV'))
    .filter(ee.Filter.listContains('transmitterReceiverPolarisation','VH'))
    .filter(ee.Filter.eq('orbitProperties_pass','DESCENDING'))
    .map(function(img) {
      var edge = img.select('VV').lt(-30.0);
      return img.updateMask(img.mask().select(0).and(edge.not()));
    })
    .select(['VV','VH']);

  var composite = col.median().clip(aoi);

  // Filtro speckle
  composite = composite.focal_median(1, 'square', 'pixels');

  var vh_vv_ratio = composite.expression('VH/VV', {
    'VH': composite.select('VH'),
    'VV': composite.select('VV')
  }).rename('VH_VV_ratio');
  var vv_vh_diff = composite.select('VV').subtract(composite.select('VH'))
    .rename('VV_VH_diff');

  return composite.addBands(vh_vv_ratio).addBands(vv_vh_diff);
}

// ============================================================================
// 3. STACK 18 BANDAS
// ============================================================================
var s2 = buildS2DryComposite(YEAR_TARGET);
var s1 = buildS1WetComposite(YEAR_TARGET);
var s1At10m = s1.resample('bilinear').reproject({
  crs: s2.projection(), scale: SCALE_M
});
var stack = s2.addBands(s1At10m);

var BANDS = [
  'B2','B3','B4','B5','B6','B7','B8','B8A','B11','B12',
  'NDVI','NDWI','EVI','BSI',
  'VV','VH','VH_VV_ratio','VV_VH_diff'
];

var stackFinal = stack.select(BANDS).clip(aoi);
print('Stack 18 bandas año', YEAR_TARGET, ':', stackFinal);
print('Banda names:', stackFinal.bandNames());

// ============================================================================
// 4. MUESTRAS DE ENTRENAMIENTO (las mismas 471 del Anexo E)
// ============================================================================
// NOTA: el script CGSM_Fusion_2018_2023_parcelas.js genera 100 Regular + 100
// Degradado sobre Hansen+Giri. Aquí se reusan los 371 originales del Informe 1
// más los puntos derivados de Hansen para totalizar las 471 del clasificador
// del Anexo E. Para mantener el AoA reproducible exportamos los 371 (el resto
// se regenera en el pipeline Python con la misma semilla).
print('Training samples disponibles (asset 371):', trainingPoints.size());

// Las 15 parcelas DwC-A del Anexo E
var parcelas15 = ee.FeatureCollection([
  ee.Feature(ee.Geometry.Point([-74.6078889, 10.8096667]), {parcela:'ANE-1', estacion:'ANE'}),
  ee.Feature(ee.Geometry.Point([-74.6080278, 10.8099167]), {parcela:'ANE-2', estacion:'ANE'}),
  ee.Feature(ee.Geometry.Point([-74.6082222, 10.8102778]), {parcela:'ANE-3', estacion:'ANE'}),
  ee.Feature(ee.Geometry.Point([-74.4815556, 10.8635556]), {parcela:'CGE-1', estacion:'CGE'}),
  ee.Feature(ee.Geometry.Point([-74.4813889, 10.8615556]), {parcela:'CGE-2', estacion:'CGE'}),
  ee.Feature(ee.Geometry.Point([-74.4813889, 10.8625]),    {parcela:'CGE-3', estacion:'CGE'}),
  ee.Feature(ee.Geometry.Point([-74.57675,   10.9774167]), {parcela:'KM22-1',estacion:'KM22'}),
  ee.Feature(ee.Geometry.Point([-74.5776389, 10.9778056]), {parcela:'KM22-2',estacion:'KM22'}),
  ee.Feature(ee.Geometry.Point([-74.5784722, 10.9780833]), {parcela:'KM22-3',estacion:'KM22'}),
  ee.Feature(ee.Geometry.Point([-74.5882222, 10.9074722]), {parcela:'LUN-1', estacion:'LUN'}),
  ee.Feature(ee.Geometry.Point([-74.5882222, 10.9074722]), {parcela:'LUN-2', estacion:'LUN'}),
  ee.Feature(ee.Geometry.Point([-74.5882222, 10.9074722]), {parcela:'LUN-3', estacion:'LUN'}),
  ee.Feature(ee.Geometry.Point([-74.4918611, 10.9631944]), {parcela:'RIN-1', estacion:'RIN'}),
  ee.Feature(ee.Geometry.Point([-74.4937222, 10.9621389]), {parcela:'RIN-2', estacion:'RIN'}),
  ee.Feature(ee.Geometry.Point([-74.4936667, 10.9618333]), {parcela:'RIN-3', estacion:'RIN'})
]);
print('Parcelas DwC-A:', parcelas15.size());

// ============================================================================
// 5. EXPORTS A DRIVE
// ============================================================================

// Export 1: stack raster 18 bandas (5 053 km² @ 10 m)
Export.image.toDrive({
  image: stackFinal.toFloat(),
  description: 'CGSM_AoA_Stack_' + YEAR_TARGET,
  folder: EXPORT_FOLDER,
  fileNamePrefix: 'CGSM_AoA_Stack_' + YEAR_TARGET,
  region: aoi,
  scale: SCALE_M,
  crs: 'EPSG:32618',
  maxPixels: 1e10,
  formatOptions: {cloudOptimized: true}
});

// Export 2: training samples con valores espectrales
var trainingWithVals = stackFinal.sampleRegions({
  collection: trainingPoints,
  properties: ['class'],
  scale: SCALE_M,
  tileScale: 4,
  geometries: true
});
Export.table.toDrive({
  collection: trainingWithVals,
  description: 'CGSM_AoA_TrainingSamples',
  folder: EXPORT_FOLDER,
  fileNamePrefix: 'CGSM_AoA_TrainingSamples_371',
  fileFormat: 'GeoJSON'
});

// Export 3: parcelas DwC-A con valores espectrales
var parcelasWithVals = stackFinal.sampleRegions({
  collection: parcelas15,
  properties: ['parcela','estacion'],
  scale: SCALE_M,
  tileScale: 4,
  geometries: true
});
Export.table.toDrive({
  collection: parcelasWithVals,
  description: 'CGSM_AoA_ValidationParcels',
  folder: EXPORT_FOLDER,
  fileNamePrefix: 'CGSM_AoA_ValidationParcels_15',
  fileFormat: 'GeoJSON'
});

