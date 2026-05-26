/******************************************************************************
 * CGSM_Extraccion_Estaciones_Buffer150m.js
 *
 * Componente B - Validacion §3.1.2 y §3.1.3
 *
 * Extrae para cada combinacion estacion x anio (2020-2023):
 *   - Valores medios de B8, B11, NDVI desde Sentinel-2 SR Harmonized seca
 *   - Clase RF dominante desde el raster del Informe 1
 * Sobre buffers de 150 m alrededor de las 5 estaciones CARICOMP del INVEMAR.
 *
 * Salida: CSV con columnas station, year, B8, B11, NDVI, clase_RF
 *         Exportado a Drive carpeta 'Informe2'.
 *
 * REQUISITOS:
 * 1. Tener subido a GEE Assets el raster de clasificacion del Informe 1
 *    (uno por anio o uno multibanda con 4 bandas anuales)
 *    Ajustar la ruta CLASIF_PATH abajo segun como lo tengas almacenado.
 *****************************************************************************/

// ============================================================================
// 0. CONFIGURACION
// ============================================================================

var PROJECT = 'basic-buttress-338101';

// AJUSTAR: ruta de las clasificaciones RF Sentinel-2 del Informe 1
// Opcion A: una imagen por anio (assets separados)
//   var CLASIF_PATH = 'projects/basic-buttress-338101/assets/Informe1_clasif_';
//   y luego ee.Image(CLASIF_PATH + year)
// Opcion B: una sola imagen con bandas nombradas 'class_2020', 'class_2021', etc.
//   var CLASIF_IMG = ee.Image('projects/basic-buttress-338101/assets/Informe1_clasificaciones');
// Aqui asumo Opcion A por defecto:
var CLASIF_BASE = 'projects/' + PROJECT + '/assets/Informe1_S2_Seca/clasif_';

var YEARS = [2020, 2021, 2022, 2023];

// ============================================================================
// 1. ESTACIONES CARICOMP (coordenadas WGS84)
// ============================================================================

var stationsList = [
  {name: 'Aguas_Negras', code: 'ANE',  lat: 10.8097, lon: -74.6079},
  {name: 'Cano_Grande',  code: 'CGE',  lat: 10.8636, lon: -74.4816},
  {name: 'Km22',         code: 'KM22', lat: 10.9774, lon: -74.5767},
  {name: 'Luna',         code: 'LUN',  lat: 10.9075, lon: -74.5882},
  {name: 'Rinconada',    code: 'RIN',  lat: 10.9632, lon: -74.4919}
];

// Construir FeatureCollection de buffers
var stationsFC = ee.FeatureCollection(stationsList.map(function(s) {
  var pt = ee.Geometry.Point([s.lon, s.lat]);
  var buf = pt.buffer(150);  // buffer 150 m
  return ee.Feature(buf, {
    'name': s.name,
    'code': s.code,
    'lat': s.lat,
    'lon': s.lon
  });
}));

print('Estaciones cargadas:', stationsFC.size());
Map.centerObject(stationsFC, 12);
Map.addLayer(stationsFC, {color: 'red'}, 'Estaciones (buffer 150 m)');

// ============================================================================
// 2. FUNCION DE COMPOSITE SENTINEL-2 SECO POR ANIO
//    (ESPEJO de la metodologia del Informe 1)
// ============================================================================

function buildS2DryComposite(year) {
  var start = ee.Date.fromYMD(year, 1, 1);
  var end   = ee.Date.fromYMD(year, 5, 31);

  var s2 = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
    .filter(ee.Filter.date(start, end))
    .filter(ee.Filter.bounds(stationsFC.geometry().buffer(1000)));

  // CloudScore+ mascara
  var cs = ee.ImageCollection('GOOGLE/CLOUD_SCORE_PLUS/V1/S2_HARMONIZED');
  var csBands = cs.first().bandNames();

  function mask(img) {
    return img.updateMask(img.select('cs').gte(0.5));
  }
  function scale(img) {
    return img.multiply(0.0001).copyProperties(img, ['system:time_start']);
  }
  function addNDVI(img) {
    var ndvi = img.normalizedDifference(['B8', 'B4']).rename('NDVI');
    return img.addBands(ndvi);
  }

  var s2Linked = s2.linkCollection(cs, csBands);
  var processed = s2Linked.map(mask).select('B.*').map(scale).map(addNDVI);

  return processed.median().select(['B8', 'B11', 'NDVI']);
}

// ============================================================================
// 3. EXTRAER VALORES POR ESTACION-ANIO
// ============================================================================

var resultados = ee.FeatureCollection([]);

YEARS.forEach(function(year) {
  print('Procesando anio', year);

  var s2 = buildS2DryComposite(year);

  // Cargar clasificacion del Informe 1 (si no existe el asset, comentar este bloque)
  var clasif;
  try {
    clasif = ee.Image(CLASIF_BASE + year).rename('clase_RF');
  } catch (e) {
    print('AVISO anio ' + year + ': no se encontro clasificacion. Solo se extraen S2.');
    clasif = null;
  }

  // Stack: S2 + clasificacion
  var stack = clasif ? s2.addBands(clasif) : s2;

  // Extraer media en cada buffer
  var sampled = stack.reduceRegions({
    collection: stationsFC,
    reducer: ee.Reducer.mean(),
    scale: 10,
    tileScale: 4
  });

  // Anadir clase dominante (moda) si existe clasificacion
  if (clasif) {
    var sampledMode = clasif.reduceRegions({
      collection: stationsFC,
      reducer: ee.Reducer.mode(),
      scale: 10,
      tileScale: 4
    });
    // Merge por code
    sampled = sampled.map(function(f) {
      var code = f.get('code');
      var match = sampledMode.filter(ee.Filter.eq('code', code)).first();
      return f.set('clase_RF_moda', match.get('clase_RF'));
    });
  }

  // Anadir el ano como propiedad
  sampled = sampled.map(function(f) {
    return f.set('year', year);
  });

  resultados = resultados.merge(sampled);
});

// ============================================================================
// 4. EXPORT CSV
// ============================================================================

print('Total filas resultado (5 estaciones x 4 anios):', resultados.size());
print('Sample feature:', resultados.first());

Export.table.toDrive({
  collection: resultados,
  description: 'CGSM_Extraccion_Estaciones_2020_2023',
  folder: 'Informe2',
  fileNamePrefix: 'CGSM_Extraccion_Estaciones_2020_2023',
  fileFormat: 'CSV',
  selectors: ['code', 'name', 'year', 'lat', 'lon', 'B8', 'B11', 'NDVI', 'clase_RF_moda']
});

// Tambien una version pivotada por anio para inspeccion rapida
print('============================================================');
print('Tabla por estacion-anio:');
print('============================================================');
resultados.aggregate_array('code').evaluate(function(codes) {
  print('Estaciones:', codes);
});

// ============================================================================
// 5. NOTAS DE EJECUCION
// ============================================================================
//
// 1. Si la ruta CLASIF_BASE no es correcta, ajusta segun donde esten los assets
//    de las clasificaciones del Informe 1.
//
// 2. Si las clasificaciones del Informe 1 estan en GeoTIFF local (no asset),
//    subelas como assets desde la pestaña Assets > New > Image upload.
//
// 3. El CSV resultante quedara en Drive 'Informe2/CGSM_Extraccion_Estaciones_2020_2023.csv'.
//    Una vez descargado, abrir en pandas para popular las Tablas 3 y 4 del informe.
//
// 4. Si quieres extraer tambien BSI o EVI, agregarlos en buildS2DryComposite()
//    como bandas calculadas adicionales.
//
// 5. Para asociar estos valores con la salinidad CARICOMP, hay que descargarla
//    aparte del DwC-A INVEMAR DOI 10.15472/2poedl (esta no esta en GEE).
