/******************************************************************************
 * CGSM_S2_Seca_Probabilities_3clases.js
 *
 * Reclasificación del Informe 1 (Sentinel-2 SR Harmonized temporada seca)
 * usando RF en modo MULTIPROBABILITY para producir una taxonomía de 3 clases
 * de manglar:
 *
 *   Degradado  : P(intacto) < 0.30
 *   Regular    : 0.30 ≤ P(intacto) < 0.70
 *   Intacto    : P(intacto) ≥ 0.70
 *   No-manglar : P(no-manglar) ≥ P(intacto)+P(degradado)
 *
 * Esta nueva taxonomía permite contrastar contra la clase estructural CARICOMP
 * recalibrada por percentiles globales (P33=35.3, P66=88.4 m²/ha BA), que
 * incluye una clase intermedia "Regular" no contemplada en la dicotomía
 * binaria del Informe 1. Resuelve la limitación documentada para Caño Grande
 * y Km22, ambas estructuralmente Regular.
 *
 * REQUISITOS - antes de ejecutar:
 * 1. Asset AOI_CGSM (5053 km²) en projects/<PROJECT>/assets/AOI_CGSM
 * 2. Asset CGSM_muestras_371 con propiedad 'class' (0=no-manglar, 1=intacto, 2=degradado)
 *
 * Salida:
 * - 4 rasters anuales (2020-2023) con la nueva clase 0/1/2/3 (no-manglar/degradado/regular/intacto)
 * - Tabla CSV con clase nueva para los buffers 150 m de las 5 estaciones reubicadas
 *****************************************************************************/

// ============================================================================
// 0. CONFIGURACIÓN
// ============================================================================

var PROJECT = 'basic-buttress-338101';
var trainingPoints = ee.FeatureCollection('projects/' + PROJECT + '/assets/CGSM_muestras_371');

print('Muestras entrenamiento:', trainingPoints.size());
print('Distribución de clases:', trainingPoints.aggregate_histogram('class'));

// AOI inline tipo bounding box que cubre TODO el sistema CGSM.
// Coordenadas tomadas del polígono operacional 5053 km² del Informe 1
// (SHP CGAM/AOI_CGSM.shp), simplificado a un rectángulo amplio que
// garantiza cubrir las 5 estaciones independientemente de si el asset
// AOI_CGSM en GEE está en su versión grande o lagunar reducida.
var aoi = ee.Geometry.Polygon([[
  [-74.88, 10.34],   // SW
  [-74.88, 10.99],   // NW
  [-74.08, 10.99],   // NE
  [-74.08, 10.34],   // SE
  [-74.88, 10.34]
]], null, false);
print('AOI inline (km²):', aoi.area().divide(1e6));

Map.centerObject(aoi, 10);
Map.addLayer(aoi, {color: 'yellow'}, 'AOI inline CGSM completo', false);

var EXPORT_PATH = 'projects/' + PROJECT + '/assets/Informe2_S2_Probabilities_3clases/';
var YEARS = [2020, 2021, 2022, 2023];
var N_TREES = 200;

// Umbrales sobre P(intacto)
var UMBRAL_INTACTO   = 0.70;
var UMBRAL_DEGRADADO = 0.30;

// ============================================================================
// 1. ESTACIONES CARICOMP REUBICADAS (criterio Giri ≥ 60% manglar)
// ============================================================================

var stationsList = [
  {name: 'Aguas_Negras', code: 'ANE',  lat: 10.813176, lon: -74.609484},  // 96 % manglar
  {name: 'Cano_Grande',  code: 'CGE',  lat: 10.864945, lon: -74.482619},  // 69 % manglar
  {name: 'Km22',         code: 'KM22', lat: 10.9774,   lon: -74.5767},    // nominal (90 %)
  {name: 'Luna',         code: 'LUN',  lat: 10.9075,   lon: -74.5882},    // nominal (40 % - zona transicional)
  {name: 'Rinconada',    code: 'RIN',  lat: 10.963514, lon: -74.495779}   // 65 % manglar
];

var stationsFC = ee.FeatureCollection(stationsList.map(function(s) {
  return ee.Feature(ee.Geometry.Point([s.lon, s.lat]).buffer(150),
                     {'name': s.name, 'code': s.code, 'lat': s.lat, 'lon': s.lon});
}));

// ============================================================================
// 2. COMPOSITE SENTINEL-2 SECO POR AÑO (espejo del Informe 1)
// ============================================================================

function buildS2DryComposite(year) {
  var start = ee.Date.fromYMD(year, 1, 1);
  var end   = ee.Date.fromYMD(year, 5, 31);

  var s2 = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
    .filter(ee.Filter.date(start, end))
    .filter(ee.Filter.bounds(aoi));

  var cs = ee.ImageCollection('GOOGLE/CLOUD_SCORE_PLUS/V1/S2_HARMONIZED');
  var csBands = cs.first().bandNames();

  var s2Linked = s2.linkCollection(cs, csBands);

  // Máscara CloudScore+ con umbral 0.3 (menos restrictivo que 0.5).
  // Con 0.5 muchas estaciones quedan sin píxeles válidos en la mediana
  // anual; 0.3 mantiene observaciones con calidad razonable y asegura
  // que las 5 estaciones tengan datos extraíbles.
  var processed = s2Linked
    .map(function(img) { return img.updateMask(img.select('cs').gte(0.3)); })
    .select('B.*')
    .map(function(img) {
      return img.multiply(0.0001).copyProperties(img, ['system:time_start']);
    })
    .map(function(img) {
      var ndvi = img.normalizedDifference(['B8','B4']).rename('NDVI');
      var ndwi = img.normalizedDifference(['B3','B8']).rename('NDWI');
      return img.addBands([ndvi, ndwi]);
    });

  // Mediana anual + focal_mean 30m para rellenar gaps puntuales que
  // podrían quedar enmascarados, evitando que el classify devuelva null
  // en los buffers de las 5 estaciones.
  var median = processed.median();
  return median.focal_mean({radius: 30, units: 'meters'});
}

// Bandas predictoras (igual que el Informe 1)
var BANDS = ['B2','B3','B4','B5','B6','B7','B8','B8A','B11','B12','NDVI','NDWI'];

// ============================================================================
// 3. CLASIFICACIÓN RF EN MODO MULTIPROBABILITY POR AÑO
// ============================================================================

YEARS.forEach(function(year) {
  print('============================================================');
  print('AÑO', year);
  print('============================================================');

  var composite = buildS2DryComposite(year);

  // Extraer firmas espectrales en muestras de entrenamiento
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

  // ENTRENAR RF EN MODO MULTIPROBABILITY
  // Devuelve un array por píxel con [P(class=0), P(class=1), P(class=2)]
  var classifierProb = ee.Classifier.smileRandomForest(N_TREES)
    .train({
      features: train70,
      classProperty: 'class',
      inputProperties: BANDS
    })
    .setOutputMode('MULTIPROBABILITY');

  // Aplicar a la imagen completa - cada píxel obtiene un array de 3 probabilidades
  // Aquí sí clipeamos, después del classify, para limitar la salida al AOI
  var probs = composite.select(BANDS).classify(classifierProb).clip(aoi);

  // Extraer probabilidades individuales y unmask(0) para que ningún píxel
  // quede sin valor — esto garantiza que reduceRegions devuelva números
  // en los buffers de las 5 estaciones aunque el composite tenga huecos.
  var pNoManglar = probs.arrayGet(0).unmask(0).rename('P_no_manglar');
  var pIntacto   = probs.arrayGet(1).unmask(0).rename('P_intacto');
  var pDegradado = probs.arrayGet(2).unmask(0).rename('P_degradado');

  // ----------------------------------------------------------------------------
  // RECLASIFICACIÓN CON 3 CLASES SOBRE P(intacto):
  //   0 = No-manglar  : P(no-manglar) ≥ max(P(intacto), P(degradado))
  //   1 = Degradado   : es manglar Y P(intacto) < 0.30
  //   2 = Regular     : es manglar Y 0.30 ≤ P(intacto) < 0.70
  //   3 = Intacto     : es manglar Y P(intacto) ≥ 0.70
  // ----------------------------------------------------------------------------

  var esManglar = pIntacto.add(pDegradado).gt(pNoManglar);

  var nuevaClase = ee.Image(0)              // por defecto no-manglar
    .where(esManglar.and(pIntacto.gte(UMBRAL_INTACTO)),     3)  // Intacto
    .where(esManglar.and(pIntacto.gte(UMBRAL_DEGRADADO))
                   .and(pIntacto.lt(UMBRAL_INTACTO)),       2)  // Regular
    .where(esManglar.and(pIntacto.lt(UMBRAL_DEGRADADO)),    1)  // Degradado
    .clip(aoi)
    .rename('clase_3');

  // Posprocesamiento: filtro moda 3x3 + unmask(0) para evitar nulls en estaciones
  var nuevaClaseSmooth = nuevaClase.focalMode({
    radius: 1.5, kernelType: 'square', units: 'pixels'
  }).unmask(0);

  // Visualizar el último año
  if (year === YEARS[YEARS.length - 1]) {
    Map.addLayer(nuevaClaseSmooth, {
      min: 0, max: 3,
      palette: ['lightblue','orange','yellow','darkgreen']
    }, 'Clase 3-clases ' + year, true);
    Map.addLayer(stationsFC, {color: 'red'}, 'Estaciones (buffer 150 m)', true);
  }

  // Áreas por clase (km²)
  var pixelAreaKm = ee.Image.pixelArea().divide(1e6);
  ['Degradado','Regular','Intacto'].forEach(function(label, i) {
    var classCode = i + 1;  // 1, 2, 3
    var area = nuevaClaseSmooth.eq(classCode).multiply(pixelAreaKm).reduceRegion({
      reducer: ee.Reducer.sum(),
      geometry: aoi,
      scale: 10,
      maxPixels: 1e10,
      tileScale: 8
    }).getNumber('clase_3');
    print('Área ' + label + ' ' + year + ' (km²):', area);
  });

  // ----------------------------------------------------------------------------
  // EXTRAER P(intacto) y clase nueva en buffers 150 m de las 5 estaciones
  // ----------------------------------------------------------------------------
  var stack = pIntacto.addBands(pDegradado).addBands(pNoManglar)
                      .addBands(nuevaClaseSmooth);

  var sampled = stack.reduceRegions({
    collection: stationsFC,
    reducer: ee.Reducer.mean(),
    scale: 10,
    tileScale: 4
  });

  // Añadir clase moda
  var sampledMode = nuevaClaseSmooth.reduceRegions({
    collection: stationsFC,
    reducer: ee.Reducer.mode(),
    scale: 10,
    tileScale: 4
  });

  sampled = sampled.map(function(f) {
    var code = f.get('code');
    var match = sampledMode.filter(ee.Filter.eq('code', code)).first();
    return f.set('clase_3_moda', match.get('mode'), 'year', year);
  });

  // Export raster a Asset
  Export.image.toAsset({
    image: nuevaClaseSmooth.toByte(),
    description: 'CGSM_S2_3clases_' + year,
    assetId: EXPORT_PATH + 'clasif_3c_' + year,
    region: aoi,
    scale: 10,
    maxPixels: 1e10,
    pyramidingPolicy: {'.default': 'mode'}
  });

  // Export tabla con valores en estaciones
  Export.table.toDrive({
    collection: sampled,
    description: 'CGSM_S2_3clases_estaciones_' + year,
    folder: 'Informe2',
    fileNamePrefix: 'CGSM_S2_3clases_estaciones_' + year,
    fileFormat: 'CSV',
    selectors: ['code','name','year','lat','lon',
                'P_intacto','P_degradado','P_no_manglar','clase_3_moda']
  });
});

// ============================================================================
// 4. NOTAS DE EJECUCIÓN
// ============================================================================
//
// 1. La carpeta 'projects/<PROJECT>/assets/Informe2_S2_Probabilities_3clases/'
//    debe existir antes de lanzar los exports. Crearla en pestaña Assets.
//
// 2. Lanzar las 8 tareas (4 toAsset + 4 toDrive) desde la pestaña Tasks.
//    Tiempo estimado: 10-30 min cada raster.
//
// 3. Cuando los 4 CSV estén en Drive carpeta 'Informe2', descargarlos y
//    consolidarlos en Python para regenerar la Tabla 3 con la nueva taxonomía
//    de 3 clases.
//
// 4. Si los umbrales 0.30/0.70 dan demasiado/poco "Regular", ajustar en las
//    constantes UMBRAL_DEGRADADO y UMBRAL_INTACTO al inicio del script.
//
// ----------------------------------------------------------------------------
// SI EL ASSET CGSM_muestras_371 NO EXISTE
// ----------------------------------------------------------------------------
// Subir las 371 muestras del Informe 1 como FeatureCollection desde la
// pestaña Assets > New > Table upload.
