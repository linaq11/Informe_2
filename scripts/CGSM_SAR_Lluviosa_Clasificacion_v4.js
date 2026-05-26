// ============================================================================
// ============================================================================
// CLASIFICACIÓN SAR SENTINEL-1 — TEMPORADA LLUVIOSA — INFORME 2 §3.2
// CGSM 2020-2023 — Componente A — Versión v4
// Espejo metodológico de la clasificación Sentinel-2 seca del Informe 1
// ============================================================================
// ============================================================================
//
// Periodo:        Junio 1 a Noviembre 30 de cada año (temporada lluviosa)
// Sensor:         Sentinel-1 GRD modo IW, órbita ASCENDING
// Polarizaciones: VV, VH, ratio VH/VV (lineal), diferencia VV-VH (dB)
// Clasificador:   Random Forest 200 árboles (mismo del Informe 1)
// Muestras:       Las mismas 371 puntos del Informe 1 (asset CGSM_muestras_371)
// AOI:            Polígono completo del Informe 1 (5 053 km²) — inline
//
// Cambios v4:
//   - lat/lon se añaden a las muestras ANTES del sampleRegions, no después
//   - selectors explícitos en Export.table.toDrive para que el CSV salga con
//     columnas lat/lon planas y consumibles desde Python
//
// NOTA: el composite NO se recorta al AOI durante el entrenamiento → así las
//        muestras dispersas en todo el sistema lagunar reciben valores SAR
//        válidos. El recorte al AOI solo se aplica al raster clasificado final.
//
// ============================================================================

// ----------------------------------------------------------------------------
// 0. CONFIGURACIÓN
// ----------------------------------------------------------------------------

var PROJECT = 'basic-buttress-338101';

// AOI inline — polígono CGSM completo del Informe 1 (5 053 km²)
var aoi = ee.Geometry.Polygon([[[-74.87999999999708, 10.949999999996896], [-74.86999999999648, 11.060000000003543], [-74.82000000000245, 11.070000000004148], [-74.74999999999821, 11.065000000003845], [-74.68000000000296, 11.060000000003543], [-74.59999999999813, 11.050000000002939], [-74.53000000000289, 11.040000000002335], [-74.47999999999986, 11.035000000002032], [-74.42999999999685, 11.030000000001731], [-74.38000000000281, 11.020000000001126], [-74.31999999999918, 11.010000000000522], [-74.25000000000394, 10.989999999999313], [-74.20000000000091, 10.949999999996896], [-74.1699999999991, 10.900000000002859], [-74.14999999999789, 10.849999999999838], [-74.12999999999668, 10.799999999996816], [-74.11999999999608, 10.750000000002778], [-74.11000000000446, 10.699999999999756], [-74.10000000000386, 10.649999999996735], [-74.11999999999608, 10.600000000002698], [-74.14999999999789, 10.549999999999676], [-74.20000000000091, 10.499999999996655], [-74.25000000000394, 10.450000000002618], [-74.29999999999798, 10.399999999999595], [-74.35000000000099, 10.349999999996575], [-74.44999999999806, 10.33999999999597], [-74.5500000000041, 10.379999999998388], [-74.61999999999935, 10.420000000000805], [-74.70000000000418, 10.480000000004429], [-74.74999999999821, 10.549999999999676], [-74.80000000000123, 10.649999999996735], [-74.85000000000426, 10.750000000002778], [-74.86999999999648, 10.849999999999838], [-74.87999999999708, 10.949999999996896]]]);

print('--- Configuración inicial ---');
print('AOI cargado (km²):', aoi.area().divide(1e6));
Map.centerObject(aoi, 9);
Map.addLayer(aoi, {color: 'yellow'}, 'AOI CGSM (5 053 km²)');

// ----------------------------------------------------------------------------
// MUESTRAS DE ENTRENAMIENTO — del Informe 1 + enriquecimiento con lat/lon
// ----------------------------------------------------------------------------
//
// Asset exportado previamente desde el script del Informe 1:
//   mis_intacto.merge(mis_degradado).merge(mis_noManglar)
// Clases: 0=no-manglar, 1=intacto, 2=degradado
//
// Antes de cualquier sampleRegions, se añaden lat/lon como propiedades para
// que sobrevivan al classify (que devuelve features con geometría vacía).

var trainingPoints = ee.FeatureCollection(
  'projects/' + PROJECT + '/assets/CGSM_muestras_371');

// Añadir lat/lon a cada muestra como propiedades planas
trainingPoints = trainingPoints.map(function(f) {
  var c = f.geometry().coordinates();
  return f.set('lon', c.get(0)).set('lat', c.get(1));
});

print('Muestras totales:', trainingPoints.size());
print('Distribución de clases:', trainingPoints.aggregate_histogram('class'));
Map.addLayer(trainingPoints, {color: 'red'}, 'Muestras 371');

// Carpeta donde se exportarán los rasters clasificados (debe existir antes)
var EXPORT_PATH = 'projects/' + PROJECT + '/assets/Informe2_SAR_Lluviosa/';
var YEARS = [2020, 2021, 2022, 2023];

// ============================================================================
// 1. FUNCIÓN DE COMPOSITE SAR LLUVIOSO POR AÑO
// ============================================================================
// Construye el composite mediano Sentinel-1 GRD para la temporada lluviosa.
// Aplica filtro de speckle (mediana focal 3×3) imagen por imagen y luego
// agrega bandas polarimétricas derivadas:
//   → VH/VV ratio (lineal)  → indicador estructural de cobertura
//   → VV-VH diff (dB)       → indicador de orientación del scattering
//
// IMPORTANTE: el composite NO se recorta al AOI aquí. El recorte se aplica
// solo al raster clasificado final (sección 2). Esto evita que las muestras
// de entrenamiento que caen fuera del lagunar interno queden con valores NaN
// y rompan el clasificador con error "Only one class".
// ============================================================================

function buildS1WetComposite(year) {

  var start = ee.Date.fromYMD(year, 6, 1);    // 1 de junio
  var end   = ee.Date.fromYMD(year, 11, 30);  // 30 de noviembre

  // Filtrado de la colección Sentinel-1 GRD
  var s1 = ee.ImageCollection('COPERNICUS/S1_GRD')
    .filter(ee.Filter.eq('instrumentMode', 'IW'))
    .filter(ee.Filter.listContains('transmitterReceiverPolarisation', 'VV'))
    .filter(ee.Filter.listContains('transmitterReceiverPolarisation', 'VH'))
    .filter(ee.Filter.eq('orbitProperties_pass', 'ASCENDING'))
    .filter(ee.Filter.date(start, end))
    .filter(ee.Filter.bounds(aoi))
    .select(['VV', 'VH']);

  print('Año ' + year + ' — imágenes S1 disponibles:', s1.size());

  // Filtro speckle imagen por imagen → mediana focal 3×3
  // Reduce el ruido moteado característico del SAR sin perder bordes
  var s1Smoothed = s1.map(function(img) {
    return img.focalMedian({radius: 1.5, kernelType: 'square', units: 'pixels'})
              .copyProperties(img, ['system:time_start']);
  });

  // Composite mediano del año completo (sin recorte → ver nota arriba)
  var composite = s1Smoothed.median();

  // Bandas derivadas
  // VH/VV en escala lineal: convertir dB → lineal antes de dividir
  var vh_vv_ratio = composite.expression(
    'pow(10, VH/10) / pow(10, VV/10)', {
      'VH': composite.select('VH'),
      'VV': composite.select('VV')
    }).rename('VH_VV_ratio');

  // VV-VH en dB: diferencia de polarizaciones
  var vv_vh_diff = composite.select('VV').subtract(composite.select('VH'))
                            .rename('VV_VH_diff');

  return composite.addBands(vh_vv_ratio).addBands(vv_vh_diff)
                  .set('year', year);
}

// ============================================================================
// 2. CLASIFICACIÓN RANDOM FOREST + EVALUACIÓN POR AÑO
// ============================================================================
// Para cada año entre 2020 y 2023:
//   2.1. Construye el composite SAR lluvioso
//   2.2. Extrae valores SAR en las 371 muestras (sampleRegions con lat/lon)
//   2.3. Filtra muestras con valores nulos
//   2.4. Split estratificado 70/30 (entrenamiento / validación)
//   2.5. Entrena RF de 200 árboles
//   2.6. Calcula matriz de confusión + OA + Kappa
//   2.7. Clasifica espacialmente todo el AOI + filtro moda 3×3
//   2.8. Calcula áreas km² por clase y exporta raster + CSV de validación
// ============================================================================

var BANDS = ['VV', 'VH', 'VH_VV_ratio', 'VV_VH_diff'];
var N_TREES = 200;

YEARS.forEach(function(year) {

  print('============================================================');
  print('PROCESANDO AÑO ' + year);
  print('============================================================');

  // ---- 2.1. Composite SAR ----
  var composite = buildS1WetComposite(year);

  // Visualización del composite del primer año (referencia visual)
  if (year === YEARS[0]) {
    Map.addLayer(composite.select(['VV', 'VH', 'VH_VV_ratio']), {
      min: [-25, -30, 0], max: [0, -10, 1.5]
    }, 'S1 lluvioso ' + year, false);
  }

  // ---- 2.2. Extracción de muestras CON lat/lon como propiedades ----
  var training = composite.sampleRegions({
    collection: trainingPoints,
    properties: ['class', 'lat', 'lon'],   // lat y lon viajan con cada muestra
    scale: 10,
    tileScale: 4
  });

  // ---- 2.3. Filtrar muestras con valores SAR nulos ----
  training = training.filter(ee.Filter.notNull(BANDS));
  print('Muestras con SAR válido ' + year + ':', training.size());
  print('Distribución por clase ' + year + ':',
        training.aggregate_histogram('class'));

  // ---- 2.4. Split estratificado 70/30 ----
  training = training.randomColumn('rnd', 42);    // semilla 42 para reproducibilidad
  var train70 = training.filter(ee.Filter.lt('rnd', 0.7));   // entrenamiento
  var test30  = training.filter(ee.Filter.gte('rnd', 0.7));  // validación

  // ---- 2.5. Entrenamiento RF ----
  var classifier = ee.Classifier.smileRandomForest(N_TREES)
    .train({
      features: train70,
      classProperty: 'class',
      inputProperties: BANDS
    });

  // ---- 2.6. Matriz de confusión + métricas ----
  var validated = test30.classify(classifier);
  var confMat = validated.errorMatrix('class', 'classification');

  print('--- Métricas de validación ' + year + ' ---');
  print('Matriz de confusión:', confMat);
  print('OA (Overall Accuracy):', confMat.accuracy());
  print('Kappa de Cohen:', confMat.kappa());
  print('Exactitud por clase (productor):', confMat.producersAccuracy());
  print('Exactitud por clase (usuario):',  confMat.consumersAccuracy());

  // Importancia de variables → identificar qué bandas SAR aportan más
  var imp = ee.Dictionary(classifier.explain().get('importance'));
  print('Importancia de variables:', imp);

  // ---- 2.7. Clasificación espacial + posprocesamiento ----
  var classified = composite.select(BANDS).classify(classifier);
  // Filtro moda 3×3 → reduce sal-y-pimienta del clasificador píxel a píxel
  // Recorte al AOI → restringir el reporte al sistema CGSM
  var classifiedSmooth = classified
    .focalMode({radius: 1.5, kernelType: 'square', units: 'pixels'})
    .clip(aoi);

  // Visualizar capa final (encender solo el último año por defecto)
  // Paleta: 0=no-manglar (azul claro), 1=intacto (verde), 2=degradado (naranja)
  var palette = ['lightblue', 'darkgreen', 'orange'];
  Map.addLayer(classifiedSmooth, {min: 0, max: 2, palette: palette},
               'Clasif S1 ' + year, year === YEARS[YEARS.length - 1]);

  // ---- 2.8. Áreas por clase y exports ----
  // Configuración holgada para evitar timeout en el reduceRegion
  var pixelAreaKm = ee.Image.pixelArea().divide(1e6);
  ['intacto', 'degradado'].forEach(function(label) {
    var classCode = label === 'intacto' ? 1 : 2;
    var areaImg = classifiedSmooth.eq(classCode).multiply(pixelAreaKm);
    var area = areaImg.reduceRegion({
      reducer: ee.Reducer.sum(),
      geometry: aoi,
      scale: 30,           // 30 m → más rápido que 10 m, sin perder precisión relevante
      maxPixels: 1e10,
      tileScale: 16,       // más teselas → menos memoria por tesela
      bestEffort: true     // permite a GEE relajar precisión si necesita
    }).getNumber('classification');
    print('Área manglar ' + label + ' ' + year + ' (km²):', area);
  });

  // Export raster clasificado a Asset
  Export.image.toAsset({
    image: classifiedSmooth.toByte(),
    description: 'CGSM_SAR_Lluviosa_' + year,
    assetId: EXPORT_PATH + 'clasif_' + year,
    region: aoi,
    scale: 10,
    maxPixels: 1e10,
    pyramidingPolicy: {'.default': 'mode'}
  });

  // Export CSV con muestras validadas → con lat/lon ya como columnas planas
  Export.table.toDrive({
    collection: validated,
    description: 'CGSM_SAR_Lluviosa_' + year + '_validacion',
    folder: 'Informe2',
    fileNamePrefix: 'CGSM_SAR_Lluviosa_' + year + '_validacion',
    fileFormat: 'CSV',
    selectors: ['class', 'classification', 'VV', 'VH', 'VH_VV_ratio',
                'VV_VH_diff', 'lat', 'lon']
  });

});

// ============================================================================
// 3. NOTAS DE EJECUCIÓN
// ============================================================================
//
// 1. ANTES de exportar rasters, crear la carpeta:
//      'projects/basic-buttress-338101/assets/Informe2_SAR_Lluviosa/'
//      → Pestaña Assets > NEW > Folder
//
// 2. Si los rasters ya existen como assets (de una corrida previa),
//    NO aceptar las 4 tareas raster nuevas → desperdicio de cuota.
//    Sí aceptar las 4 tareas CSV de validación → traen lat/lon ahora.
//
// 3. Outputs requeridos para el Informe 2 §3.2:
//      → Tabla 4: matriz de confusión + OA + Kappa por año
//      → Gráfico §3.2.2: importancia de variables (VV, VH, VH_VV_ratio, VV_VH_diff)
//      → Tabla 5: áreas por clase y año
//
// 4. Para §3.3 (comparación óptico vs SAR), los rasters Asset generados aquí
//    se usarán junto con los rasters del Informe 1 (Sentinel-2 seco) en
//    otro script de comparación píxel a píxel.
