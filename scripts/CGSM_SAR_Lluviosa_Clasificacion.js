/******************************************************************************
 * CGSM_SAR_Lluviosa_Clasificacion.js
 *
 * Componente A — Clasificacion RF con Sentinel-1 SAR temporada lluviosa
 * Periodo: 2020-2023 (jun 1 - nov 30 de cada anio)
 * Para el Informe 2 - SeccIon 3.2
 *
 * Espejo metodologico de la clasificacion Sentinel-2 del Informe 1 pero
 * con SAR banda C en temporada lluviosa.
 *
 * REQUISITOS - antes de ejecutar:
 * 1. Tener subido a GEE Assets el polígono AOI_CGSM (5 053 km^2 del Informe 1)
 *    Ruta sugerida: 'projects/basic-buttress-338101/assets/AOI_CGSM'
 * 2. Tener subido a GEE Assets las 371 muestras de entrenamiento del Informe 1
 *    como FeatureCollection con propiedad 'class' (0=no-manglar, 1=intacto, 2=degradado)
 *    Ruta sugerida: 'projects/basic-buttress-338101/assets/CGSM_muestras_371'
 *
 * Salida:
 * - 4 rasters de clasificacion (uno por anio) exportados como assets
 * - Matriz de confusion + OA + Kappa impresos en consola
 * - Importancia de variables impresa
 *****************************************************************************/

// ============================================================================
// 0. CONFIGURACION
// ============================================================================

var PROJECT = 'basic-buttress-338101';

// AJUSTAR RUTAS DE ASSETS:
var aoi = ee.FeatureCollection('projects/' + PROJECT + '/assets/AOI_CGSM').geometry();
var trainingPoints = ee.FeatureCollection('projects/' + PROJECT + '/assets/CGSM_muestras_371');

// Verificar que existen
print('AOI cargado:', aoi.area().divide(1e6), 'km^2');
print('Muestras entrenamiento:', trainingPoints.size());
print('Distribucion de clases:', trainingPoints.aggregate_histogram('class'));

Map.centerObject(aoi, 10);
Map.addLayer(aoi, {color: 'yellow'}, 'AOI CGSM');
Map.addLayer(trainingPoints, {color: 'red'}, 'Muestras 371');

// Carpeta de export
var EXPORT_PATH = 'projects/' + PROJECT + '/assets/Informe2_SAR_Lluviosa/';
var YEARS = [2020, 2021, 2022, 2023];

// ============================================================================
// 1. FUNCION DE COMPOSITE SAR LLUVIOSO POR ANIO
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

  // Numero de imagenes
  print('Anio ' + year + ' - imagenes S1:', s1.size());

  // Filtro speckle: mediana focal 3x3 sobre cada imagen
  var s1Smoothed = s1.map(function(img) {
    return img.focalMedian({radius: 1.5, kernelType: 'square', units: 'pixels'})
              .copyProperties(img, ['system:time_start']);
  });

  // Composite mediano del anio
  var composite = s1Smoothed.median();

  // Bandas derivadas
  var vh_vv_ratio = composite.expression('pow(10, VH/10) / pow(10, VV/10)', {
    'VH': composite.select('VH'),
    'VV': composite.select('VV')
  }).rename('VH_VV_ratio');

  var vv_vh_diff = composite.select('VV').subtract(composite.select('VH'))
                            .rename('VV_VH_diff');

  return composite.addBands(vh_vv_ratio).addBands(vv_vh_diff)
                  .clip(aoi)
                  .set('year', year);
}

// ============================================================================
// 2. CLASIFICACION RF POR ANIO + EVALUACION
// ============================================================================

var BANDS = ['VV', 'VH', 'VH_VV_ratio', 'VV_VH_diff'];
var N_TREES = 200;

YEARS.forEach(function(year) {
  print('============================================================');
  print('PROCESANDO ANIO', year);
  print('============================================================');

  var composite = buildS1WetComposite(year);

  // Visualizar el composite del primer anio
  if (year === YEARS[0]) {
    Map.addLayer(composite.select(['VV', 'VH', 'VH_VV_ratio']), {
      min: [-25, -30, 0], max: [0, -10, 1.5]
    }, 'S1 lluvioso ' + year, false);
  }

  // Extraer valores SAR en las muestras
  var training = composite.sampleRegions({
    collection: trainingPoints,
    properties: ['class'],
    scale: 10,
    tileScale: 4
  });

  // Split 70/30 estratificado
  training = training.randomColumn('rnd', 42);
  var train70 = training.filter(ee.Filter.lt('rnd', 0.7));
  var test30  = training.filter(ee.Filter.gte('rnd', 0.7));

  // Entrenar RF
  var classifier = ee.Classifier.smileRandomForest(N_TREES)
    .train({
      features: train70,
      classProperty: 'class',
      inputProperties: BANDS
    });

  // Predecir en test
  var validated = test30.classify(classifier);

  // Matriz de confusion + OA + Kappa
  var confMat = validated.errorMatrix('class', 'classification');
  print('Matriz de confusion ' + year + ':', confMat);
  print('OA ' + year + ':', confMat.accuracy());
  print('Kappa ' + year + ':', confMat.kappa());
  print('Por clase (productor):', confMat.producersAccuracy());
  print('Por clase (usuario):', confMat.consumersAccuracy());

  // Importancia variables
  var imp = ee.Dictionary(classifier.explain().get('importance'));
  print('Importancia ' + year + ':', imp);

  // Clasificacion espacial
  var classified = composite.select(BANDS).classify(classifier);

  // Posprocesamiento: filtro moda 3x3
  var classifiedSmooth = classified.focalMode({radius: 1.5, kernelType: 'square', units: 'pixels'});

  // Visualizar
  var palette = ['lightblue', 'darkgreen', 'orange'];  // 0=no-manglar, 1=intacto, 2=degradado
  Map.addLayer(classifiedSmooth, {min: 0, max: 2, palette: palette},
               'Clasif S1 ' + year, year === YEARS[YEARS.length - 1]);

  // Areas por clase (km^2)
  var pixelAreaKm = ee.Image.pixelArea().divide(1e6);
  ['intacto', 'degradado'].forEach(function(label) {
    var classCode = label === 'intacto' ? 1 : 2;
    var areaImg = classifiedSmooth.eq(classCode).multiply(pixelAreaKm);
    var area = areaImg.reduceRegion({
      reducer: ee.Reducer.sum(),
      geometry: aoi,
      scale: 10,
      maxPixels: 1e10,
      tileScale: 8
    }).getNumber('classification');
    print('Area manglar ' + label + ' ' + year + ' (km^2):', area);
  });

  // Export raster a Asset
  Export.image.toAsset({
    image: classifiedSmooth.toByte(),
    description: 'CGSM_SAR_Lluviosa_' + year,
    assetId: EXPORT_PATH + 'clasif_' + year,
    region: aoi,
    scale: 10,
    maxPixels: 1e10,
    pyramidingPolicy: {'.default': 'mode'}
  });

  // Export CSV con muestras predichas para analisis posterior
  Export.table.toDrive({
    collection: validated,
    description: 'CGSM_SAR_Lluviosa_' + year + '_validacion',
    folder: 'Informe2',
    fileNamePrefix: 'CGSM_SAR_Lluviosa_' + year + '_validacion',
    fileFormat: 'CSV'
  });
});

// ============================================================================
// 3. NOTAS DE EJECUCION
// ============================================================================
//
// 1. La carpeta 'projects/basic-buttress-338101/assets/Informe2_SAR_Lluviosa/'
//    debe existir ANTES de exportar. Crearla en pestaña Assets > New > Folder.
//
// 2. Cada export toAsset es una tarea separada. Lanzar las 4 tareas desde la
//    pestaña Tasks. Tiempo estimado: 10-30 min cada una.
//
// 3. Los CSVs de validacion van a Drive carpeta 'Informe2' para analisis
//    posterior en Python o R.
//
// 4. Si no tienes el shapefile AOI_CGSM como asset, subelo desde la pestaña
//    Assets > New > Shape Files.
//
// 5. Si las 371 muestras del Informe 1 estan en un GeoJSON local, conviertelas
//    a FeatureCollection y subelas como asset igualmente.
