# Anexos - Informe 2 BFAST Monitor sobre Sentinel-1 banda C en el manglar de la CGSM

**Documento complementario.** Este archivo contiene los anexos A-L del Informe 2 (Quintero Fonseca, 2026), que documentan el material reproducible, las sensibilidades secundarias y el análisis exploratorio que sostienen el cuerpo principal sin saturarlo. El cuerpo principal del Informe 2 se distribuye en `Informe_2_CGSM.docx` dentro del mismo repositorio.

---


### Anexo A. Scripts y notebooks asociados

| Script | Componente | Descripción |
|---|---|---|
| (Informe 1) | Sentinel-2 | Clasificación RF temporada seca 2020–2023 |
| `CGSM_Export_Series_GEE.js` | Apoyo §3.1 | Exportación de series mensuales NDVI y VH 2020–2023 |
| `CGSM_BFAST_Analysis.R` | Apoyo §3.3.1 | Análisis BFAST sobre series VH banda C en 5 estaciones |
| `proceso_caricomp.py` | §3.2 | Procesamiento CARICOMP DwC-A para obtener AB y densidad por estación-año |
| (pendiente) `CGSM_SAR_Lluviosa_GEE.js` | Componente A (legacy) | Clasificación RF Sentinel-1 lluviosa 2020–2023 |
| (pendiente) `Comparacion_Optico_SAR.ipynb` | Componente A (legacy) | Mapas concordancia/discordancia y métricas |

### Anexo B. Datos auxiliares

| Archivo | Descripción |
|---|---|
| `SHP CGAM/AOI_CGSM.shp` | AOI general CGSM (5 053 km²) heredado del Informe 1 |
| `Informe_2/AOI/AOI_Pajarales_Ma16.geojson` | Sub-AOI Complejo de Pajarales (Ma16 INVEMAR, 110.6 km²) |
| `Informe_2/AOI/AOI_SFF_CGSM_completo.geojson` | SFF CGSM completo (Ma14+Ma16+Ma17+Ma18, 285 km²) |
| `Informe_2/AOI/sectores_INVEMAR_CGSM.geojson` | Los 4 sectores SFF CGSM individuales |
| `dwca-caricomp-manglares/` | DwC-A CARICOMP descargado, 29 651 registros 1995–2021 |
| `Informe_2/CARICOMP_estacion_anio.csv` | Tabla procesada: AB y densidad por estación-año |
| `Informe_2/CARICOMP_estacion_anio_especie.csv` | Mismo desglose por especie (input para IVI) |

### Anexo C. Material metodológico complementario sobre validación cruzada espacial

Como verificación del marco metodológico de validación cruzada espacial y Area of Applicability (Meyer & Pebesma 2021) adoptado para el componente A del presente informe, se replicó parcialmente en Python el ejercicio publicado por Milà et al. (2024) sobre proxies espaciales en Random Forest. La replicación se aplicó a los casos de estudio de temperatura del aire y PM2.5 en estaciones meteorológicas y de calidad del aire de España.

Los notebooks resultantes (`RF_spatial_proxies_temp_colab.ipynb`, `RF_spatial_proxies_pm25_colab.ipynb`) reprodujeron razonablemente los resultados R del paper, con diferencias del orden del 3–10 % atribuibles a dos fuentes: la implementación distinta del Random Forest entre `ranger` y `sklearn`, y la aproximación del algoritmo de validación espacial mediante clusters de KMeans en lugar del kNNDM original.

De la replicación se desprenden tres lecciones aplicables al componente A. Primera, el RMSE de validación cruzada aleatoria sobreestima el desempeño cuando hay autocorrelación espacial entre puntos vecinos del entrenamiento. Segunda, los proxies espaciales (coordenadas X-Y, distancias a estaciones) no son una solución universal y conviene evitar su inclusión como predictores. Tercera, el Area of Applicability debe acompañar cualquier mapa continuo de predicción para distinguir zonas de interpolación de zonas de extrapolación.

### Anexo D. Análisis exploratorio comparativo Sentinel-1 banda C vs ALOS-2 PALSAR-2 banda L

Como extensión natural del componente A, se evaluó si la banda L de ALOS-2 PALSAR-2, con su mayor longitud de onda (23 cm) y capacidad de penetración del dosel completo del manglar reportada por Cornforth et al. (2013) para manglares del Sundarbans, supera el desempeño de Sentinel-1 banda C documentado en el cuerpo del informe. Se ejecutaron 3 iteraciones de regresión Random Forest para estimación continua de AGB sobre el área de manglar, integrando Sentinel-2, Sentinel-1, ALOS-2 PALSAR-2 yearly mosaic y Copernicus DEM (Digital Elevation Model) GLO-30 como predictores.

La iteración 1 utilizó GEDI (Global Ecosystem Dynamics Investigation) L4A como referencia (*ground truth*) masiva, con 1 000 muestras estratificadas, RF de 50 árboles y RMSE *in-sample* de 43 Mg/Ha. La iteración 2 aplicó máscara WorldCover de manglar antes del muestreo, expandió a 3 000 muestras y RF de 200 árboles con validación K-Fold k = 5, alcanzando RMSE = 42.87 ± 14.02 Mg/Ha. La iteración 3 reemplazó GEDI por las 14 parcelas estructurales del DwC-A INVEMAR ICTbm (protocolo de monitoreo de manglares), con AGB derivado por allometría de Komiyama et al. (2005) y correlación Spearman univariada dado el tamaño de muestra reducido.

Los resultados convergen en una conclusión: **el SAR no aporta capacidad predictiva diferencial significativa** para AGB de manglar en la CGSM bajo las condiciones evaluadas. La importancia agregada por sensor en la iteración 2 se distribuye así: Sentinel-2 e índices ópticos 59.1 %, DEM 14.2 %, Sentinel-1 banda C 13.7 % y ALOS-2 banda L 13.0 %, lo que produce un empate técnico entre C y L dentro de la incertidumbre estadística de la validación. La iteración 3 con datos de campo INVEMAR como referencia confirmó que ningún descriptor SAR alcanza significancia estadística frente al AGB allométrico (HV banda L ρ = 0.024, VH banda C ρ = 0.226, ambos no significativos), mientras que el predictor más fuerte resultó ser la pendiente local del DEM (Spearman ρ = 0.78, p < 0.001), interpretable como proxy del régimen hidrológico que controla la dinámica del ecosistema.

Las limitaciones temporales del producto ALOS-2 yearly mosaic disponible en GEE (cadencia anual con una sola imagen agregada por año, frente a las decenas de pasadas Sentinel-1) impidieron una replicación directa de la metodología del componente A con banda L. Aun así, los resultados permiten una primera lectura sobre la importancia relativa de los descriptores SAR en regímenes de baja biomasa como el manglar degradado de la CGSM (~50 Mg/Ha promedio, muy por debajo del rango óptimo de sensibilidad SAR para bosques maduros). Una replicación rigurosa con escenas WBD multitemporales descargadas del portal ASF Vertex queda como línea de continuación directa para la tesis sobre gemelo digital del manglar.

### Anexo E. Análisis de sensibilidad metodológica de la concordancia clase estructural × clase RF

El presente anexo documenta el ejercicio de sensibilidad ejecutado para verificar la robustez de las concordancias reportadas en la Tabla L1 del Anexo L (Tabla 1 del cuerpo principal, fila E) frente a tres decisiones metodológicas susceptibles de circularidad o sesgo. Primera, la dependencia del NDVI Sentinel-2 en la generación de las muestras de entrenamiento de la clase Regular. Segunda, la reubicación de las coordenadas de las cinco estaciones al manglar canónico de Giri en lugar del uso de las coordenadas exactas de muestreo del DwC-A INVEMAR. Tercera, la agregación espacial mediante buffer de 150 m sobre la coordenada de estación en lugar del buffer mínimo sobre cada parcela individual.

**Metodología del análisis.** Se extrajeron del Darwin Core Archive público de GBIF (Global Biodiversity Information Facility) (Beltrán et al. 2022) las coordenadas geográficas de 15 parcelas individuales agrupadas en las cinco estaciones del Informe 2; cada estación tiene tres parcelas con desplazamientos típicos de 10 a 30 metros entre subparcelas, salvo Luna donde las tres parcelas comparten exactamente la misma coordenada publicada. Para el reentrenamiento del clasificador se generaron 100 muestras Regular como puntos sobre la máscara global de manglar Giri 2000 (Giri et al. 2011) con cobertura forestal Hansen treecover2000 (Hansen et al. 2013) entre 40 % y 80 % sin pérdida documentada por lossyear, y 100 muestras Degradado como puntos sobre la misma máscara Giri 2000 pero con pérdida documentada por lossyear entre 2015 y 2022.

El periodo de análisis se restringió a 2018-2023 por la cobertura confiable de Sentinel-2 SR Harmonized desde diciembre de 2017. El componente Sentinel-1 wet del stack se construyó con el preprocesamiento operativo de §3.1.1 (filtro de órbita DESCENDING, edge mask < −30 dB, focal median 3×3 sobre VV y VH, mediana del compuesto trimestral). La extracción de la clase predicha se realizó sobre buffer de 30 m alrededor de cada parcela exacta, con clase modal del píxel agregado.

**Resultados cuantitativos.** La Tabla 3-bis sintetiza la concordancia entre clase estructural CARICOMP y clase predicha por el modelo independiente, agregada por estación.

**Tabla 3-bis. Concordancia clase estructural × clase RF ampliada (15 parcelas × 6 años, n = 90).**

| Estación | n parcela-año | Concordancia | Patrón temporal |
|---|---|---|---|
| Aguas Negras (ANE) | 18 | 10/18 = 56 % | 2018-2020 concuerda Intacto; 2021-2023 alterna Degradado e Intacto |
| Caño Grande (CGE) | 18 | 0/18 = 0 % | Predice Intacto sistemáticamente pese a clase estructural Regular |
| Km22 (KM22) | 18 | 0/18 = 0 % | Alterna Intacto y Degradado entre parcelas y años |
| Luna (LUN) | 18 | 0/18 = 0 % | Predice Intacto en los seis años pese a clase estructural Degradada |
| Rinconada (RIN) | 18 | 12/18 = 67 % | RIN-1 predice Degradado sistemáticamente; RIN-2 y RIN-3 predicen Intacto en los seis años |
| **Total** | **90** | **22/90 = 24.4 %** | Kappa = −0.137 [IC95 −0.234, −0.049] |

**Lecturas del análisis.** La clase Regular es asignada por el modelo cero veces sobre las 90 observaciones evaluadas, pese a estar presente en las 100 muestras de entrenamiento. La frontera espectral entre las muestras Hansen con cobertura 40-80 % y las muestras Intacto colapsa durante la inducción del Random Forest, lo que indica que la clase intermedia Regular requiere predictores adicionales (probablemente HV de banda L) para individualizarse del entrenamiento Intacto en el espacio de predictores Sentinel-2 dry y Sentinel-1 wet.

La variabilidad intra-estación que el buffer de 150 m promediaba se hace visible bajo el buffer de 30 m sobre parcelas individuales. La subparcela RIN-1 se clasifica sistemáticamente como Degradado mientras que RIN-2 y RIN-3 se clasifican como Intacto, divergencia consistente con la posibilidad de que las tres subparcelas de Rinconada muestreen ambientes ecológicos contrastantes que el clasificador detecta.

La concordancia cero de Caño Grande, Km22 y Luna, que se distribuye entre confusiones Intacto↔Degradado sin pasar nunca por Regular, ratifica la conclusión del cuerpo del informe sobre la limitación física de la fusión óptico-SAR banda C para discriminar estructura interna debilitada bajo dosel cerrado, ahora cuantificada con mayor severidad por la mayor resolución espacial de la unidad de validación.

**Interpretación para el reporte principal.** El análisis de sensibilidad valida la decisión metodológica de mantener la tabla original de concordancia (Tabla L1) como tabla principal del informe, dado que el agregado por estación con buffer 150 m promedia la variabilidad intra-estación que el muestreo por parcela individual revela y produce métricas globales más estables y comparables con la literatura. La ampliación a 15 parcelas no debe interpretarse como un refinamiento que mejora el clasificador sino como un diagnóstico que evidencia la heterogeneidad del manglar a escala de 30 m no resuelta por los sensores ópticos y de banda C utilizados en este estudio. La reproducibilidad del análisis está garantizada por el script `CGSM_Fusion_2018_2023_parcelas.js` y los archivos `CARICOMP_parcelas_coordenadas.csv` y `Tabla3_ampliada_n90.csv` incluidos en el repositorio.

### Anexo F. Diagnóstico de autocorrelación espacial de residuales

Como cierre del análisis exploratorio previo al modelado, se ejecutó un diagnóstico de autocorrelación espacial sobre los residuales del clasificador Random Forest reentrenado del Anexo E. El procedimiento se apoya en el conjunto de 15 parcelas individuales del Darwin Core Archive INVEMAR, agregadas por concordancia media y residual ordinal medio sobre los seis años evaluados. La agregación produce un vector espacial de quince puntos con coordenadas exactas conocidas y métrica de error continua.

La matriz de pesos espaciales se construyó por k vecinos más próximos con k igual a 3 y estandarización por filas. La métrica de autocorrelación se calculó mediante el estadístico Moran I global con simulación de Monte Carlo de 999 permutaciones para la prueba de hipótesis. El variograma empírico se ajustó a un modelo esférico con 8 lags y distancia máxima de 30 km sobre la distancia euclidiana proyectada a metros mediante la aproximación local plate carrée en la latitud de la CGSM.

**Resultados cuantitativos.** El residual ordinal medio del clasificador, definido como la diferencia entre la clase predicha y la clase estructural de campo en el espacio ordinal {Degradado=1, Regular=2, Intacto=3}, presenta autocorrelación espacial positiva estadísticamente significativa con Moran I igual a 0.351 y p-valor de 0.010 [z = 2.606]. La concordancia binaria muestra autocorrelación marginal con Moran I de 0.213 y p-valor de 0.052 [z = 1.737].

El variograma empírico ajustado al modelo esférico revela un rango de dependencia espacial de aproximadamente 8 187 metros, una meseta de 1.40 unidades de varianza ordinal y un nugget nulo. Esta configuración indica que la similitud entre residuales no se descompone aleatoriamente a corta distancia, sino que se sostiene homogénea dentro de cada estación CARICOMP y solo se rompe al cruzar la distancia entre estaciones del orden de los kilómetros. La Figura 3 del cuerpo principal (§1.2) sintetiza los tres componentes del diagnóstico.

**Lectura del diagnóstico.** Los errores del clasificador Random Forest no se distribuyen como ruido aleatorio sobre el AOI: forman conglomerados espaciales estadísticamente significativos en torno a las cinco estaciones CARICOMP, comportamiento incompatible con el supuesto implícito de independencia entre muestras de validación y consistente con la lección documentada por Milà et al. (2024) sobre proxies espaciales en Random Forest.

La magnitud del rango del variograma (cercana a 8 kilómetros) coincide con la separación característica entre estaciones CARICOMP del flanco oriental y occidental del sistema lagunar. Esa coincidencia sugiere que el entorno ambiental local (salinidad intersticial, régimen hidrológico, conectividad con el río Magdalena) controla simultáneamente el estado estructural del manglar y la respuesta espectral capturada por el stack Sentinel-2 + Sentinel-1, y que los predictores actuales no individualizan adecuadamente ese gradiente.

El patrón de residuales positivos sostenidos en Luna y negativos sostenidos en Rinconada-1 cuantifica un sesgo direccional del modelo: el clasificador predice consistentemente más Intacto del que la estructura observada justifica en el flanco occidental y más Degradado del que justifica en una subparcela del flanco oriental. Este sesgo, no detectable bajo la asunción de errores intercambiables, refuerza la recomendación de adoptar GPBoost o un esquema bayesiano con efectos espaciales explícitos descritos en el Anexo J, dado que esos formalismos absorben la dependencia espacial residual en lugar de tratarla como varianza aleatoria.

### Anexo G. Sensibilidad de la concordancia clase estructural × clase RF a los percentiles globales que definen los umbrales BA

La asignación de la clase estructural CARICOMP descrita en §3.2 reposa sobre 2 umbrales derivados del conjunto agregado de cinco estaciones a lo largo de la serie 1995–2021 (n = 115 estación-año). El percentil 33 sobre el área basal, igual a 35.3 m²/ha, define la frontera entre Degradado y Regular; el percentil 66, igual a 88.4 m²/ha, define la frontera entre Regular e Intacto. La elección de estos percentiles, aunque metodológicamente justificada por la búsqueda de tres categorías equipobladas en el conjunto de referencia, podría sesgar la concordancia reportada del 45 % en la tabla original (Tabla L1) si los umbrales alternativos produjesen reasignaciones masivas de la clase estructural.

El presente anexo cuantifica esa sensibilidad recalculando la concordancia bajo 4 esquemas. Primero, el esquema P33/P66 utilizado en el cuerpo del informe. Segundo, un par más amplio P25/P75 que separa solo las colas extremas de la distribución (umbrales 27.5 y 105.9 m²/ha). Tercero, un par más estrecho P40/P60 que comprime la categoría intermedia (42.4 y 80.1 m²/ha). Cuarto, un par fijo de literatura inspirado en los rangos típicos reportados por Komiyama et al. (2005) para manglares neotropicales maduros (30 y 80 m²/ha).

**Resultados cuantitativos.** La Tabla G1 sintetiza la concordancia, el coeficiente Kappa y su intervalo de confianza al 95 % por bootstrap con 1 000 iteraciones para cada esquema, aplicados sobre las mismas 20 combinaciones estación-año del periodo 2020–2023 y manteniendo invariante la clase RF de fusión óptico-SAR reportada en la Tabla L1.

**Tabla G1. Concordancia clase estructural × clase RF de fusión bajo 4 esquemas de umbralización (n = 20).**

| Esquema | P_lo (m²/ha) | P_hi (m²/ha) | Concordancia | Kappa | IC 95 % bootstrap |
|---|---|---|---|---|---|
| P25/P75 (amplios) | 27.5 | 105.9 | **10/20 = 50 %** | **+0.184** | [−0.120, +0.483] |
| P33/P66 (informe actual) | 35.3 | 88.4 | 9/20 = 45 % | +0.098 | [−0.223, +0.426] |
| Literatura Komiyama (30/80) | 30.0 | 80.0 | 9/20 = 45 % | +0.098 | [−0.223, +0.426] |
| P40/P60 (estrechos) | 42.4 | 80.1 | 8/20 = 40 % | +0.048 | [−0.246, +0.352] |

**Lecturas del análisis.** La concordancia oscila entre el 40 % y el 50 % a lo largo de los 4 esquemas evaluados, rango de diez puntos porcentuales que indica una sensibilidad moderada del estadístico al criterio de umbral. La métrica del 45 % reportada en el cuerpo se ubica en el centro del rango y resulta robusta frente a una alternativa de literatura razonable (el par fijo 30/80 produce exactamente la misma concordancia y el mismo coeficiente Kappa).

Los esquemas más amplios mejoran ligeramente el desempeño porque aumentan la probabilidad de que la clase Regular absorba combinaciones estación-año intermedias, mientras que los esquemas más estrechos lo deterioran al forzar más casos a las clases extremas Intacto o Degradado que el clasificador asigna con menor exactitud.

El hallazgo central de la sensibilidad es que el intervalo de confianza al 95 % del coeficiente Kappa incluye el valor cero en los 4 esquemas: ninguna elección de umbrales eleva el acuerdo entre clase estructural y clase RF por encima del que se esperaría por azar con significancia estadística. La conclusión del informe sobre la limitación física de la fusión óptico-SAR banda C es por tanto invariante a la decisión de umbralización, consistente con el diagnóstico del Anexo E sobre la ampliación a 90 parcelas-año (kappa = −0.137), y refuerza la recomendación de migrar a SAR banda L documentada en §6. La reproducibilidad del análisis está garantizada por los archivos `Tabla3_sensibilidad_umbrales.csv` y `Tabla3_reclasificada_4esquemas.csv` incluidos en el repositorio.

### Anexo H. Bandas de incertidumbre BFAST y validación con BFAST Monitor

El contenido del presente anexo fue elevado al cuerpo principal del informe como subsecciones §3.3.1 (BFAST Monitor), §3.3.2 (Bootstrap CI95) y §3.3.3 (Contraste temporal con eventos INVEMAR), dado que constituye el eje narrativo central de la reformulación operativa de la pregunta del informe descrita en §1.2. Los resultados cuantitativos del BFAST Monitor con período histórico 2020-2021 y monitoreo 2022-2023 y del bootstrap sobre las cinco estaciones se reportan en las Tablas 4 y 5 del cuerpo principal. Los scripts `bfast_bootstrap.py` y `bfast_monitor.py` que producen las tablas, junto con los archivos `tabla_bootstrap.csv` y `tabla_monitor.csv`, están incluidos en `Informe_2/scripts/` y `Informe_2/data_anexoH/` respectivamente.

### Anexo I. Area of Applicability completa (Meyer & Pebesma 2021)

El presente anexo reporta los resultados del cálculo del Area of Applicability sobre el AOI CGSM siguiendo la metodología publicada por Meyer & Pebesma (2021). El stack de 18 bandas Sentinel-2 dry + Sentinel-1 wet del año 2023 fue reconstruido por el script `CGSM_AoA_Export_Stack.js` y exportado desde Google Earth Engine como GeoTIFF a 10 m de resolución. El pipeline Python `compute_aoa.py` lo procesó en ventanas de 1 024 por 1 024 píxeles sobre un raster de 7 314 por 8 763 píxeles agregado a una cuadrícula UTM 18 Norte. El resultado se reporta a continuación en 4 lecturas independientes.

**Hallazgo central: extensión global del Area of Applicability.** Del total de 6 366 km² que ocupa la cuadrícula de exportación, 2 347.8 km² se encuentran dentro del envoltorio multivariado del clasificador y 4 038.9 km² quedan fuera. La proporción del AOI dentro del Area of Applicability alcanza apenas el 36.8 %. Esto implica que el 63.2 % de la cuadrícula clasificada por el clasificador del reentrenamiento de §1.2 corresponde a píxeles cuya respuesta espectral no fue observada por las 471 muestras de entrenamiento. La Figura I.1 representa la distribución espacial del Area of Applicability sobre el AOI CGSM con la ubicación de las cinco estaciones permanentes: la zona en verde corresponde al interior del envoltorio y la zona en rojo a la extrapolación. El umbral del índice de disimilitud derivado por validación cruzada con 5 pliegues fue 0.1226.

![Figura I.1. Area of Applicability del clasificador RF sobre el AOI CGSM, 2023. Verde: dentro del envoltorio multivariado de entrenamiento (2 347.8 km², 36.8 %). Rojo: extrapolación (4 038.9 km², 63.2 %). Etiquetas amarillas: estaciones CARICOMP. Umbral DI = 0.123 (CV k=5).](figuras/Fig10_AoA_mask_2023.png)

**Hallazgo sobre la fusión óptico-SAR.** La importancia agregada por banda del clasificador Random Forest entrenado con las 471 muestras modifica la lectura de §1.2 sobre la contribución del SAR Sentinel-1 al clasificador de fusión. Las 18 bandas predictoras presentan importancias relativas como sigue: B12 (SWIR2) 15.4 %, B11 (SWIR1) 14.9 %, B8A (NIR vegetation) 12.6 %, B6 (RedEdge2) 9.4 %, NDVI 8.4 %, B7 (RedEdge3) 7.9 %, B8 (NIR) 7.2 %, BSI 6.2 %, NDWI 5.9 %, B5 (RedEdge1) 3.8 %, B4 (red) 3.1 %, B3 (green) 2.3 %, B2 (blue) 1.5 %, EVI 1.3 %, **VV 0.0 %, VH 0.0 %, VH/VV ratio 0.0 %, VV−VH difference 0.0 %**. Las 4 bandas SAR Sentinel-1 no aportan información discriminativa entre las 3 clases del clasificador del Anexo E sobre las 364 muestras válidas de entrenamiento. Este comportamiento confirma la limitación física de la banda C documentada en §5.1 y reformula la denominación de fusión óptico-SAR: sobre el subconjunto de muestras utilizadas en el reentrenamiento, el clasificador opera como puramente óptico. El clasificador del cuerpo del informe debe leerse como un clasificador Sentinel-2 dry de 14 bandas activas más 4 bandas SAR de importancia nula. Las contribuciones SAR documentadas en la Tabla L1 sobre Caño Grande 2023 deberán reinterpretarse como artefacto del reentrenamiento con la categoría Regular adicional.

**Hallazgo sobre las 15 parcelas de validación.** El cálculo del índice de disimilitud sobre las 15 parcelas individuales del Darwin Core Archive INVEMAR, agregado por estación, se reporta en la Tabla I1. Las tres parcelas de Aguas Negras se encuentran fuera del Area of Applicability con índices de disimilitud entre 0.16 y 0.25 (entre 1.3 y 2 veces el umbral). En Caño Grande, Km22 y Luna las tres parcelas de cada estación se encuentran dentro del Area of Applicability con índices de disimilitud bajos a muy bajos. Rinconada presenta el patrón mixto más informativo: la subparcela 1 se encuentra fuera del envoltorio con índice de disimilitud de 0.869 (7 veces el umbral, percentil 99 del raster), mientras que las subparcelas 2 y 3 se encuentran cómodamente dentro con índices de 0.057 y 0.026. Este patrón cuantifica la divergencia espectral entre subparcelas detectada por el Anexo E mediante la concordancia clase a clase y explica la persistencia del clasificador en asignar la clase Degradado únicamente a RIN-1: la combinación espectral en esa parcela está fuera del envoltorio de entrenamiento.

**Tabla I1. Índice de disimilitud (DI) y estatus AoA por parcela individual sobre la clasificación RF de fusión del año 2023.**

| Parcela | DI | Within AoA | Lectura |
|---|---|---|---|
| ANE-1 | 0.164 | NO | Extrapolación (1.3 × umbral) |
| ANE-2 | 0.215 | NO | Extrapolación (1.8 × umbral) |
| ANE-3 | 0.246 | NO | Extrapolación (2.0 × umbral) |
| CGE-1 | 0.121 | SÍ | Borde del envoltorio (0.99 × umbral) |
| CGE-2 | 0.038 | SÍ | Interior cómodo |
| CGE-3 | 0.038 | SÍ | Interior cómodo |
| KM22-1 | 0.071 | SÍ | Interior |
| KM22-2 | 0.077 | SÍ | Interior |
| KM22-3 | 0.092 | SÍ | Interior |
| LUN-1 | 0.029 | SÍ | Interior cómodo |
| LUN-2 | 0.029 | SÍ | Interior cómodo |
| LUN-3 | 0.029 | SÍ | Interior cómodo |
| RIN-1 | 0.869 | **NO** | **Extrapolación severa (7.1 × umbral, P99 del raster)** |
| RIN-2 | 0.058 | SÍ | Interior |
| RIN-3 | 0.026 | SÍ | Interior cómodo |

**Revisión de las lecturas previas a la luz del AoA.** La concordancia del 56 % de Aguas Negras y del 67 % de Rinconada reportadas en la Tabla 3-bis del Anexo E no corresponde a una validación del clasificador en su zona de competencia, sino a una mezcla heterogénea de predicciones dentro y fuera del envoltorio multivariado: todas las parcelas de Aguas Negras son extrapolación y la subparcela RIN-1 es extrapolación severa con índice de disimilitud 7 veces superior al umbral. Bajo este filtro, Aguas Negras pasa de 10/18 a 0/0 parcelas-año evaluables, mientras que Rinconada pasa de 12/18 a 12/12.

La persistencia de concordancia cero en Caño Grande, Km22 y Luna, documentada por el Anexo E como hallazgo central, se ve reforzada cuantitativamente por el resultado del AoA: esas 9 parcelas-año por estación se encuentran todas dentro del envoltorio de entrenamiento. El clasificador está interpolando con plena legitimidad estadística y aun así discrepa sistemáticamente con la clase estructural CARICOMP. La limitación física de la fusión óptico-SAR banda C para discriminar estructura interna del manglar deja por tanto de ser una hipótesis de trabajo y queda elevada al estatus de hallazgo cuantitativo independiente, no atribuible a extrapolación del modelo.

Las áreas reportadas en la Tabla L2 sobre cobertura de manglar por clase y año, y en la Tabla L3 sobre cambio neto 2020-2023, deben leerse con la salvedad de que el 63 % del AOI corresponde a píxeles fuera del Area of Applicability. Las cifras absolutas de cobertura por clase mezclan predicciones interpolativas confiables con predicciones extrapolativas que el clasificador no estaba calificado para emitir. El recálculo cruzado entre clase de cobertura y estatus AoA queda como continuación inmediata del presente anexo y requiere el GeoTIFF de la clasificación completa sobre el AOI, exportado por separado del stack utilizado en este cálculo.

**Implicaciones para el cuerpo del informe y para la tesis.** Las tres conclusiones que sostiene el cuerpo del informe se mantienen válidas pero precisadas. La conclusión sobre la limitación de la banda C para discriminar estado estructural se ve confirmada y elevada por el AoA. La conclusión sobre la utilidad del SAR Sentinel-1 como complemento del óptico para cobertura temporal se mantiene en términos de monitoreo continuo, pero las 4 bandas SAR no contribuyen al clasificador de fusión sobre las 364 muestras del entrenamiento. La conclusión sobre la migración hacia SAR banda L ALOS-2 PALSAR-2 desarrollada en el Anexo D y en §6 se ve doblemente justificada: tanto por la limitación física de la banda C confirmada por el AoA como por la importancia cero documentada por la propia banda C en el clasificador entrenado. Para el desarrollo del gemelo digital de la tesis, el AoA debe acompañar todo producto continuo de clasificación o de cambio sobre el manglar de la CGSM. La asunción implícita de aplicabilidad sobre el AOI completo no se sostiene cuantitativamente bajo el enfoque óptico actual, con muestras de entrenamiento ubicadas sobre el cinturón de manglar.

**Reproducibilidad.** Los archivos `CGSM_AoA_Export_Stack.js`, `compute_aoa.py` y `plot_aoa.py` están incluidos en `Informe_2/scripts/`. Los resultados del cálculo (`aoa_di_2023.tif`, `aoa_mask_2023.tif`, `aoa_thresholds.json`, `aoa_parcels_di.csv`) están incluidos en `Informe_2/data_anexoI/`. La Figura I.1 se generó por el script `plot_aoa.py` a partir del raster de máscara descargado de GEE.

### Anexo J. Comparación Random Forest vs GPBoost sobre las muestras de entrenamiento del CGSM

El presente anexo reporta los resultados de un ejercicio comparativo entre el clasificador Random Forest del cuerpo del informe y un clasificador GPBoost (Sigrist 2020, 2021) que combina tree boosting en la tradición de Friedman (2001) con un proceso gaussiano sobre las coordenadas geográficas de las muestras de entrenamiento, con el objetivo de evaluar si la incorporación explícita del componente espacial absorbe la autocorrelación residual documentada en el Anexo F (Moran I = 0.351, p = 0.010) y mejora la concordancia con las parcelas CARICOMP de validación reportada en la Tabla 3-bis del Anexo E. La pregunta de fondo del ejercicio consiste en distinguir si el desempeño limitado del clasificador original responde principalmente a una limitación del algoritmo Random Forest, a una limitación de los datos de la fusión óptico-SAR banda C, o a una combinación de ambos.

**Hallazgo metodológico previo: bimodalidad estructural del manglar de la CGSM.** La reconstrucción del conjunto de entrenamiento utilizado en el Anexo E reveló un hallazgo no documentado en su momento. El filtro Hansen Global Forest Change v1.12 (Hansen et al. 2013) aplicado al manglar canónico Giri 2000 (Giri et al. 2011) con cobertura forestal entre 40 y 80 % y sin pérdida documentada entre 2001 y 2009 produce cero candidatos válidos sobre el AOI completo, incluso con muestreo aleatorio de 50 000 puntos. La categoría Regular generada por este criterio independiente del NDVI es por tanto estructuralmente inexistente en la CGSM bajo el criterio Hansen, lo que se interpreta como evidencia empírica de bimodalidad del sistema: el manglar de la CGSM en el año 2000 era o bien de cobertura densa superior al 80 % o bien de cobertura baja inferior al 40 %, sin estrato intermedio significativo. Este hallazgo precisa retroactivamente la interpretación del Anexo I sobre la asignación nula de la clase Regular por parte del clasificador Random Forest, dado que la causa proximal no es solo la limitación del algoritmo sino la ausencia empírica de la categoría intermedia bajo el criterio Hansen. Para mantener la comparación con la Tabla L1 del Anexo L se reintrodujo el criterio NDVI Sentinel-2 dry 2021 entre 0.35 y 0.65 sobre la máscara Giri, el criterio original del reentrenamiento del componente A, que sí genera los 100 candidatos esperados, aceptando explícitamente la circularidad metodológica que el Anexo E originalmente buscaba evitar.

**Configuración del ejercicio.** Se entrenaron dos clasificadores sobre el mismo conjunto de 564 muestras compuestas por las 364 muestras originales del Informe 1 remapeadas al esquema ordinal de 4 clases, 100 muestras Regular generadas por el filtro NDVI sobre Giri y 100 muestras Degradado generadas por el filtro Hansen lossy 2015-2022 sobre Giri. El Random Forest se configuró con 200 árboles y semilla 42 para replicar el del cuerpo del informe. El GPBoost se configuró con estrategia One-vs-Rest sobre las 4 clases, un modelo binario por clase con función de covarianza exponencial sobre las coordenadas proyectadas a UTM 18 Norte y normalizadas a kilómetros respecto al centroide del entrenamiento, 10 rondas de boosting por modelo binario, 15 hojas por árbol y mínimo 20 muestras por hoja. La validación se realizó sobre las 15 parcelas individuales del Darwin Core Archive INVEMAR utilizadas previamente en el Anexo E y en el Anexo I, comparando la clase predicha contra la clase estructural CARICOMP por estación.

**Resultados de la comparación (Tabla J1).** El Random Forest alcanza concordancia de 3 parcelas sobre 15 con coeficiente Kappa de −0.224 y predice la clase Regular en 5 de las 15 parcelas. El GPBoost alcanza concordancia de 0 parcelas sobre 15 con coeficiente Kappa de −0.389 y no predice la clase Regular en ninguna de las 15 parcelas. La incorporación del componente espacial mediante proceso gaussiano deteriora el desempeño en este ejercicio en lugar de mejorarlo, contrario a la hipótesis del Anexo F que motivaba la prueba.

**Tabla J1. Comparación RF vs GPBoost sobre 564 muestras de entrenamiento, validación en 15 parcelas DwC-A INVEMAR.**

| Métrica | Random Forest | GPBoost (OvR + GP exponencial) |
|---|---|---|
| Muestras de entrenamiento | 564 | 564 |
| Distribución (0/1/2/3) | 121 / 220 / 100 / 123 | 121 / 220 / 100 / 123 |
| Concordancia parcelas | 3/15 = 20.0 % | 0/15 = 0.0 % |
| Kappa de Cohen | **−0.224** | **−0.389** |
| Predicciones Regular | 5/15 | 0/15 |
| Predicciones No-manglar | 0/15 | 0/15 |
| Importancia agregada bandas SAR | 0.000 | 0.000 |

**Predicciones por parcela (Tabla J2).** La distribución espacial de las predicciones de los dos modelos revela el mecanismo por el cual GPBoost pierde concordancia respecto a Random Forest sobre este conjunto de validación.

**Tabla J2. Predicciones RF y GPBoost para las 15 parcelas DwC-A. Códigos de clase: 1=Degradado, 2=Regular, 3=Intacto. La marca de acierto se omite por brevedad de la tabla y los aciertos individuales se identifican por coincidencia entre las columnas Campo y RF/GP.**

| Parcela | Estación | Campo | RF | GP |
|---|---|---|---|---|
| ANE-1 | ANE | 3 | 2 | 1 |
| ANE-2 | ANE | 3 | 2 | 1 |
| ANE-3 | ANE | 3 | 2 | 1 |
| CGE-1 | CGE | 2 | 1 | 3 |
| CGE-2 | CGE | 2 | 3 | 3 |
| CGE-3 | CGE | 2 | 3 | 3 |
| KM22-1 | KM22 | 2 | 2 | 1 |
| KM22-2 | KM22 | 2 | 2 | 1 |
| KM22-3 | KM22 | 2 | 1 | 1 |
| LUN-1 | LUN | 1 | 3 | 3 |
| LUN-2 | LUN | 1 | 3 | 3 |
| LUN-3 | LUN | 1 | 3 | 3 |
| RIN-1 | RIN | 3 | 1 | 1 |
| RIN-2 | RIN | 3 | 1 | 1 |
| RIN-3 | RIN | 3 | 3 | 1 |

**Lectura del resultado negativo del GPBoost.** El proceso gaussiano del GPBoost aprende sobre las 564 muestras de entrenamiento un patrón de correlación espacial distribuido sobre todo el AOI, mientras que las 15 parcelas de validación están agrupadas en 5 puntos concentrados sobre las estaciones permanentes CARICOMP. La geometría del muestreo de validación no es representativa de la geometría del entrenamiento, lo que lleva al modelo a producir predicciones suavizadas hacia las muestras de entrenamiento espacialmente más próximas a cada parcela.

La estrategia One-vs-Rest implementada sobre 4 modelos binarios independientes produce probabilidades que al normalizarse favorecen las clases más numerosas. Con 220 muestras Degradado contra solo 100 Regular se genera un sesgo predictivo hacia la clase Degradado que efectivamente elimina la categoría Regular del espacio de predicciones.

El presupuesto de cómputo limitó el ejercicio a 10 rondas de boosting por modelo, lo que puede haber dejado a los modelos GPBoost subentrenados respecto a su capacidad potencial. Una réplica con mayor presupuesto, hiperparámetros sintonizados por validación cruzada espacial y estrategia multiclase nativa (softmax) en lugar de OvR queda como continuación inmediata del presente anexo y se documenta como prioridad para la tesis sobre el gemelo digital.

**Hallazgo invariante entre los dos modelos.** Las 4 bandas SAR Sentinel-1 presentan importancia agregada igual a cero tanto en el Random Forest como en el GPBoost. Este hallazgo se sostiene a través de las dos familias algorítmicas evaluadas y refuerza el resultado central del Anexo I sobre la nulidad del aporte SAR al clasificador de fusión bajo el conjunto de entrenamiento disponible. La interpretación se mantiene: la fusión óptico-SAR del cuerpo del informe se reduce, en la práctica, a una fusión óptica, y la limitación de Sentinel-1 banda C para discriminar el estado estructural del manglar de la CGSM constituye un hallazgo independiente de la familia algorítmica utilizada.

**Implicaciones para el cuerpo del informe y para la tesis.** El ejercicio realizado no permite recomendar la sustitución directa del clasificador Random Forest por un GPBoost sobre los datos actuales de la CGSM. La hipótesis de que el componente espacial explícito mejoraría las métricas sobre la validación CARICOMP no se confirma. El ejercicio sugiere que el problema central no es la asunción de independencia entre muestras del Random Forest, sino la limitación física de la fusión óptico-SAR banda C documentada de forma convergente por el cuerpo del informe (Tabla L1 con concordancia del 45 %), el Anexo E (Tabla 3-bis con Kappa de −0.137 sobre 90 observaciones) y el Anexo I (63 % del AOI fuera del Area of Applicability). Se recomienda preservar el Random Forest como clasificador del Informe 2 y redirigir la línea metodológica de la tesis hacia el reemplazo de la banda C por banda L ALOS-2 PALSAR-2 (Anexo D): la mejora marginal accesible mediante cambio de algoritmo es inferior a la accesible mediante cambio de sensor.

**Análisis adicional: sensibilidad a la cardinalidad de clases (Tabla J3).** Dado que el resultado central del ejercicio comparativo es la persistencia del kappa negativo bajo ambos algoritmos en 4 clases, se ejecutó un análisis complementario que reformula la pregunta: si el problema fuera la dificultad de discriminar la clase intermedia Regular bajo la fusión óptico-SAR banda C, entonces colapsar Regular hacia una de las clases extremas debería elevar la concordancia. Se ejecutaron dos esquemas alternativos sobre las mismas 564 muestras de entrenamiento: el esquema asimétrico Regular hacia Intacto, que reagrupa las 100 muestras NDVI Regular con las 123 Intacto sumando 223, y el esquema asimétrico Regular hacia Degradado, que las reagrupa con las 220 Degradado sumando 320. La validación se realizó sobre las mismas 15 parcelas, recodificando la clase estructural de las estaciones Caño Grande y Km22 según el esquema correspondiente.

**Tabla J3. Sensibilidad de la concordancia y del kappa a la cardinalidad de clases.**

| Esquema de clases | Modelo | Concordancia | Kappa |
|---|---|---|---|
| 4 clases (original) | Random Forest | 3/15 = 20.0 % | −0.224 |
| 4 clases (original) | GPBoost OvR | 0/15 = 0.0 % | −0.389 |
| **3 clases, Regular reagrupado con Intacto** | **Random Forest** | **9/15 = 60.0 %** | **−0.250** |
| 3 clases, Regular reagrupado con Intacto | GPBoost OvR | 3/15 = 20.0 % | −0.429 |
| 3 clases, Regular reagrupado con Degradado | Random Forest | 5/15 = 33.3 % | −0.389 |
| 3 clases, Regular reagrupado con Degradado | GPBoost OvR | 3/15 = 20.0 % | −0.667 |

**Lecturas del análisis de sensibilidad.** El esquema asimétrico Regular reagrupado con Intacto triplica la concordancia del Random Forest de 20 % bajo 4 clases a 60 % bajo 3 clases, mientras que el otro esquema asimétrico Regular reagrupado con Degradado solo la duplica a 33 %. La asimetría direccional del beneficio confirma cuantitativamente la bimodalidad estructural reportada al inicio del anexo: en la CGSM bajo el criterio Hansen y criterio NDVI, la categoría Regular se comporta como Intacto débil en términos de respuesta espectral integrada, no como categoría intermedia separable. Las estaciones Caño Grande y Km22 (áreas basales de 42 a 65 m²/ha, sobre el percentil 33 global) son estructuralmente manglar funcional, no manglar colapsado como Luna (17 m²/ha), y el clasificador las agrupa con Intacto en lugar de discriminarlas como categoría propia.

El coeficiente Kappa de Cohen permanece negativo en los seis casos evaluados pese a la mejora aparente de la concordancia bruta. Bajo el esquema Regular reagrupado con Intacto, doce de las 15 parcelas son Intacto y solo tres son Degradado, distribución tan desbalanceada que cualquier modelo que prediga la clase mayoritaria por inercia alcanza alta concordancia bruta pero kappa bajo. El 60 % de Random Forest no refleja capacidad discriminativa genuina sino acierto por estructura marginal.

El GPBoost se mantiene inferior al Random Forest en los tres esquemas evaluados. La sustitución del algoritmo no resuelve la limitación física de la fusión óptico-SAR banda C para discriminar el estado estructural del manglar, ni siquiera cuando se simplifica la tarea a 3 clases en lugar de cuatro. El componente espacial gaussiano específicamente deteriora el desempeño en los tres escenarios, lo que descarta la hipótesis de que la cardinalidad de clases sea el factor limitante del GPBoost.

**Consecuencia operativa final.** El conjunto de evidencia del Anexo J (concordancia limitada bajo 4 clases, mejora a costa de información intermedia bajo 3 clases, kappa negativo persistente en todos los esquemas, importancia SAR cero en ambos modelos) establece que ni el cambio de algoritmo ni la simplificación de cardinalidad rescatan el clasificador de la fusión óptico-SAR banda C utilizado en el presente informe.

**Reproducibilidad.** El script Python `run_gpboost.py` está incluido en `Informe_2/scripts/`. El conjunto de entrenamiento exportado de GEE (`CGSM_GPBoost_Samples_4clases.geojson`), las predicciones por parcela (`gpboost_predictions.csv`), la comparación de importancia por banda (`gpboost_importance.csv`) y las métricas globales (`gpboost_results.json`) están incluidos en `Informe_2/data_anexoJ/`. El script GEE de exportación de las muestras con valores espectrales (`CGSM_GPBoost_Export_Samples.js`) está incluido en `Informe_2/scripts/`.

### Anexo K. Datos de contexto: estaciones permanentes y monitoreo CARICOMP

Este anexo consolida la información base sobre las cinco estaciones permanentes del monitoreo CARICOMP del INVEMAR utilizadas a lo largo del informe, junto con la serie estructural completa de área basal y densidad medida por el programa entre 2015 y 2021. Estas tablas constituyen el sustrato empírico al que se refieren todos los análisis del cuerpo principal (secciones 1 a 5) y de los anexos analíticos (E, F, G, H, I, J), y se reportan aquí en un anexo dedicado para facilitar la consulta cruzada.

**Tabla K1. Coordenadas geográficas y período de monitoreo de las cinco estaciones permanentes CARICOMP del INVEMAR sobre la CGSM. Las coordenadas reportadas son las nominales del DwC-A (Beltrán et al. 2022); para los análisis del cuerpo principal se aplicó adicionalmente el protocolo de reubicación al manglar canónico Giri descrito en el Anexo E.**


| Estación | Código | Latitud (WGS84) | Longitud (WGS84) | Periodo de monitoreo |
|---|---|---|---|---|
| Aguas Negras | ANE | 10.8097 | -74.6079 | 1998–2021 |
| Caño Grande | CGE | 10.8636 | -74.4816 | 1995–2021 |
| Km22 | KM22 | 10.9774 | -74.5767 | 1995–2021 |
| Luna | LUN | 10.9075 | -74.5882 | 2000–2021 |
| Rinconada | RIN | 10.9632 | -74.4919 | 1995–2021 |

**Tabla K2. Área basal y densidad por estación CARICOMP, 2015-2021. Cada fila reporta el número de árboles muestreados, el área total muestreada en metros cuadrados (número de parcelas multiplicado por 100 m²), el área basal en metros cuadrados por hectárea y la densidad en individuos por hectárea. Esta tabla es la base estructural sobre la que se calculan los percentiles globales P33 y P66 que definen el esquema ordinal Intacto / Regular / Degradado utilizado en el Anexo G y en la Tabla L1.**


| Estación | Año | n_parcelas | n_árboles | Área basal (m²/ha) | Densidad (ind/ha) |
|---|---|---|---|---|---|
| ANE | 2015 | 3 | 288 | 146.8 | 9 600 |
| ANE | 2016 | 3 | 278 | 150.0 | 9 267 |
| ANE | 2017 | 3 | 248 | 149.8 | 8 267 |
| ANE | 2018 | 3 | 225 | 146.4 | 7 500 |
| ANE | 2019 | 3 | 201 | 151.1 | 6 700 |
| ANE | 2021 | 3 | 160 | 156.5 | 5 333 |
| CGE | 2015 | 5 | 205 | 55.1 | 4 100 |
| CGE | 2016 | 3 | 175 | 104.1 | 5 833 |
| CGE | 2017 | 3 | 134 | 81.9 | 4 467 |
| CGE | 2018 | 3 | 77 | 59.9 | 2 567 |
| CGE | 2019 | 3 | 82 | 54.6 | 2 733 |
| CGE | 2021 | 3 | 85 | 64.6 | 2 833 |
| KM22 | 2015 | 4 | 240 | 95.7 | 6 000 |
| KM22 | 2016 | 3 | 195 | 113.2 | 6 500 |
| KM22 | 2017 | 4 | 93 | 53.3 | 2 325 |
| KM22 | 2018 | 3 | 20 | 40.1 | 667 |
| KM22 | 2019 | 3 | 19 | 40.1 | 633 |
| KM22 | 2021 | 3 | 18 | 42.9 | 600 |
| LUN | 2015 | 8 | 695 | 52.5 | 8 688 |
| LUN | 2016 | 5 | 592 | 80.1 | 11 840 |
| LUN | 2017 | 6 | 36 | 6.7 | 600 |
| LUN | 2018 | 3 | 12 | 5.8 | 400 |
| LUN | 2019 | 3 | 14 | 7.0 | 467 |
| LUN | 2021 | 3 | 178 | 17.5 | 5 933 |
| RIN | 2015 | 5 | 291 | 98.9 | 5 820 |
| RIN | 2016 | 3 | 273 | 164.0 | 9 100 |
| RIN | 2017 | 3 | 261 | 166.1 | 8 700 |
| RIN | 2018 | 3 | 193 | 130.5 | 6 433 |
| RIN | 2019 | 4 | 172 | 95.7 | 4 300 |
| RIN | 2021 | 3 | 155 | 126.7 | 5 167 |

### Anexo L. Tablas detalladas del ejercicio de revisión de la clasificación estática

Este anexo consolida las diez tablas cuantitativas del ejercicio de revisión de la clasificación estática del componente A, condensadas en la Tabla 1 del cuerpo principal del presente documento (§1.2). Las tablas se preservan aquí en formato detallado para garantizar la trazabilidad cuantitativa completa del giro metodológico hacia la pregunta de detección de cambio descrito en §1.2.

Las primeras cuatro tablas (L1 a L4) corresponden a la clasificación de fusión Sentinel-2 dry + Sentinel-1 wet con 4 clases ordinales reentrenada y validada contra el monitoreo CARICOMP. Las cuatro tablas siguientes (L5 a L8) corresponden a la clasificación Sentinel-1 SAR lluviosa por sí sola y a su comparación con el Sentinel-2 seco. Las últimas dos tablas (L9 y L10) corresponden al análisis de concordancia espacial píxel a píxel entre los dos productos sobre el AOI completo y sobre el Complejo de Pajarales.

**Tabla L1. Concordancia clase estructural CARICOMP × clase RF de fusión óptico-SAR (5 estaciones × 4 años, n = 20). Esta es la tabla original de concordancia del componente A sobre la que se construyeron los análisis de sensibilidad de los Anexos E, G e I (corresponde a la Tabla 1 del cuerpo principal, fila E). La concordancia global de 9/20 = 45 % es la métrica que el Anexo G prueba como sensible a la elección de umbrales (oscila entre 40 y 50 %), el Anexo E desagrega a 15 parcelas individuales (resulta 22/90 = 24.4 %, kappa = −0.137), y el Anexo I cualifica con el Area of Applicability (63 % del AOI es extrapolación).**

| Estación | Año | BA m²/ha | Densidad (ind/ha) | Clase estructural | Origen del dato | Clase RF (fusión) | Concordancia |
|---|---|---|---|---|---|---|---|
| Aguas Negras | 2020 | 153.8 | 6 017 | Intacto | Interpolación lineal | Intacto | Concuerda |
| Aguas Negras | 2021 | 156.5 | 5 333 | Intacto | Observado | Intacto | Concuerda |
| Aguas Negras | 2022 | 156.5 | 5 333 | Intacto | LOCF (Last Observation Carried Forward) 2021 | Regular | Discrepa |
| Aguas Negras | 2023 | 104.8 | 3 573 | Intacto | INVEMAR ITF 2023 | Regular | Discrepa |
| Caño Grande | 2020 | 59.6 | 2 783 | Regular | Interpolación lineal | Intacto | Discrepa |
| Caño Grande | 2021 | 64.6 | 2 833 | Regular | Observado | Intacto | Discrepa |
| Caño Grande | 2022 | 64.6 | 2 833 | Regular | LOCF 2021 | Intacto | Discrepa |
| Caño Grande | 2023 | 64.6 | 2 833 | Regular | LOCF 2021 | Regular | Concuerda |
| Km22 | 2020 | 41.5 | 617 | Regular | Interpolación lineal | Regular | Concuerda |
| Km22 | 2021 | 42.9 | 600 | Regular | Observado | Degradado | Discrepa |
| Km22 | 2022 | 42.9 | 600 | Regular | LOCF 2021 | Regular | Concuerda |
| Km22 | 2023 | 42.9 | 600 | Regular | LOCF 2021 | Regular | Concuerda |
| Luna | 2020 | 12.2 | 3 200 | Degradado | Interpolación lineal | Intacto | Discrepa |
| Luna | 2021 | 17.5 | 5 933 | Degradado | Observado | Intacto | Discrepa |
| Luna | 2022 | 17.5 | 5 933 | Degradado | LOCF 2021 | Regular | Discrepa |
| Luna | 2023 | 17.5 | 5 933 | Degradado | LOCF 2021 | Regular | Discrepa |
| Rinconada | 2020 | 111.2 | 4 733 | Intacto | Interpolación lineal | Intacto | Concuerda |
| Rinconada | 2021 | 126.7 | 5 167 | Intacto | Observado | Intacto | Concuerda |
| Rinconada | 2022 | 126.7 | 5 167 | Intacto | LOCF 2021 | Intacto | Concuerda |
| Rinconada | 2023 | 126.7 | 5 167 | Intacto | LOCF 2021 | Regular | Discrepa |



**Tabla L2. Áreas (km²) por clase y año sobre el AOI CGSM completo (≈5 053 km²), clasificación de fusión Sentinel-2 dry + Sentinel-1 wet con 4 clases ordinales. Estas áreas absolutas deben leerse con la salvedad del Anexo I sobre el Area of Applicability: el 63 % del AOI clasificado se encuentra fuera del envoltorio multivariado de las muestras de entrenamiento, lo que implica que las cifras de cobertura por clase mezclan predicciones interpolativas confiables con predicciones extrapolativas que el clasificador no estaba calificado para emitir.**

| Clase | 2020 | 2021 | 2022 | 2023 | Promedio |
|---|---|---|---|---|---|
| No-manglar | 4 052.7 | 4 521.9 | 4 335.3 | 3 444.7 | 4 088.6 |
| Degradado | 929.5 | 944.6 | 953.8 | 957.5 | 946.4 |
| Regular | 1 005.6 | 547.3 | 783.1 | 1 680.0 | 1 004.0 |
| Intacto | 305.2 | 279.2 | 220.7 | 210.8 | 254.0 |
| **Manglar total (D+R+I)** | **2 240.3** | **1 771.1** | **1 957.6** | **2 848.3** | **2 204.4** |

**Tabla L3. Cambio temporal de cobertura entre 2020 y 2023, clasificación de fusión 4 clases sobre el AOI CGSM. La proporción de píxeles con mejora estructural (18.8 %) supera la de degradación (11.7 %), patrón que el Anexo I explica como artefacto parcial de la fluctuación inter-anual del clasificador en zonas de extrapolación.**

| Categoría | Área (km²) | Proporción del AOI |
|---|---|---|
| Sin cambio | 4 376.0 | 69.5 % |
| Mejora estructural | 1 180.0 | 18.8 % |
| Degradación | 736.9 | 11.7 % |

**Tabla L4. Áreas (km²) por clase y año dentro del Complejo de Pajarales (sector Ma16 INVEMAR, 110.6 km²). El sub-AOI presenta dinámica más pronunciada que el AOI completo: la clase Intacto cae de 93.7 km² en 2020 a 53.0 km² en 2023 (−43 %), mientras que la clase Regular crece de 128.5 km² a 285.0 km² (+122 %), sugiriendo transición masiva de manglar maduro hacia categoría intermedia en el sector occidental del sistema.**

| Clase | 2020 | 2021 | 2022 | 2023 |
|---|---|---|---|---|
| No-manglar | 195.0 | 205.8 | 173.5 | 94.1 |
| Degradado | 278.5 | 278.8 | 267.0 | 263.5 |
| Regular | 128.5 | 133.5 | 196.3 | 285.0 |
| Intacto | 93.7 | 77.5 | 58.8 | 53.0 |

**Tabla L5. Métricas de validación de la clasificación RF Sentinel-1 lluviosa por año. La exactitud global oscila entre 60.8 % y 71.0 % con Kappa entre 0.412 y 0.564, valores moderados inferiores a los del clasificador Sentinel-2 seca del Informe 1 (OA superior a 80 %). El año 2022 destaca con OA 71.0 % y Kappa 0.564, año que también corresponde a la detección de cambio estructural significativo por BFAST Monitor reportada en la Tabla 4 del cuerpo principal.**

| Año | Imágenes S1 | Exactitud Global (OA) | Kappa de Cohen | Lectura |
|---|---|---|---|---|
| 2020 | 30 | 0.608 | 0.412 | Moderado |
| 2021 | 71 | 0.657 | 0.488 | Moderado |
| **2022** | 58 | **0.710** | **0.564** | **Mejor año** |
| 2023 | 58 | 0.667 | 0.485 | Moderado |

**Tabla L6. Matriz de confusión año 2022 (mejor año), Sentinel-1 lluvioso. El clasificador SAR distingue muy bien la clase manglar degradado —exactitud productor del 91.4 %— pero exhibe confusión sustancial entre no-manglar e intacto. Esta especialización del SAR estático para detectar degradado, no anticipada en el diseño original, constituye un hallazgo metodológico que se desarrolla en §1.2 del cuerpo principal y sustenta la recomendación operativa de combinar óptico como clasificador general con SAR como detector específico de degradación.**

|  | Predicho no-manglar | Predicho intacto | Predicho degradado | Productor |
|---|---|---|---|---|
| Real no-manglar | 17 | 12 | 0 | 58.6 % |
| Real intacto | 16 | 27 | 0 | 62.8 % |
| Real degradado | 3 | 0 | 32 | 91.4 % |
| **Usuario** | 47.2 % | 69.2 % | 100 % | OA = 71.0 % |

**Tabla L7. Importancia agregada (Gini) por banda predictora SAR Sentinel-1 y año. La polarización VV co-pol resulta la variable más informativa para los cuatro años, seguida por VH cross-pol. Este ordenamiento contradice parcialmente la expectativa de la literatura SAR según la cual VH debería dominar la clasificación de vegetación, y sugiere que la respuesta de retrodispersión sobre la CGSM está modulada principalmente por las condiciones de superficie del agua intermareal. Este hallazgo se profundiza en el Anexo I donde el RF reentrenado con 18 bandas asigna importancia exactamente cero a las 4 bandas SAR.**

| Banda | 2020 | 2021 | 2022 | 2023 | Promedio | Posición |
|---|---|---|---|---|---|---|
| VV | 387.2 | 391.7 | 381.6 | 390.7 | **387.8** | 1 |
| VH | 367.8 | 374.0 | 359.1 | 399.7 | **375.1** | 2 |
| VH/VV (lineal) | 335.9 | 354.7 | 329.3 | 329.2 | **337.3** | 3 |
| VV−VH (dB) | 324.8 | 336.5 | 348.7 | 311.7 | **330.4** | 4 |

**Tabla L8. Áreas clasificadas como manglar por la clasificación SAR Sentinel-1 lluviosa comparadas con el Informe 1 (Sentinel-2 seca). La sobreestimación sistemática del manglar total por la clasificación SAR oscila entre 2.45× y 3.46× según el año, comportamiento coherente con la limitación documentada del SAR banda C para discriminar manglar de otras coberturas húmedas en sistemas lagunares costeros.**

| Año | Imágenes S1 | Manglar intacto SAR (km²) | Manglar degradado SAR (km²) | Manglar total SAR (km²) | Manglar total óptico Informe 1 (km²) | Sobreestimación SAR/óptico |
|---|---|---|---|---|---|---|
| 2020 | 75 | 1 798.6 | 654.1 | 2 452.7 | 858.7 | **2.86 ×** |
| 2021 | 71 | 1 514.0 | 1 093.9 | 2 607.9 | 1 064.0 | **2.45 ×** |
| **2022** | 58 | **1 925.1** | **1 139.5** | **3 064.6** | **1 074.8** | **2.85 ×** |
| **2023** | 58 | **2 238.4** | **1 175.2** | **3 413.6** | **987.0** | **3.46 ×** |

**Tabla L9. Áreas (km²) por categoría de acuerdo entre la clasificación Sentinel-2 seca (Informe 1) y Sentinel-1 lluviosa (presente informe), AOI completo de 5 053 km². La razón entre el área concordante positiva y el total de manglar reportado por cualquiera de los dos sensores se mantiene baja durante el período, confirmando que las dos clasificaciones miden objetos parcialmente disjuntos: el SAR captura cobertura húmeda costera amplia que excede al manglar real, mientras el óptico mantiene clasificación más conservadora pero pierde fracciones que el SAR detecta.**

| Año | Ambos no-manglar | Ambos manglar (concordancia +) | Óptico sí, SAR no (omisión SAR) | SAR sí, óptico no (sobreestimación SAR) | [VERIFICAR] | 20.4 % |ción SAR) |
|---|---|---|---|---|
| 2020 | 3 396.0 | 441.8 | 388.4 | 826.5 |
| 2021 | 3 406.6 | 439.0 | 596.6 | 610.5 |
| 2022 | 3 221.2 | 489.1 | 559.8 | 782.5 |
| **2023** | 3 121.4 | **551.5** | 421.1 | **958.6** |

**Tabla L10. Áreas (km²) por categoría de acuerdo dentro del Complejo de Pajarales (sector Ma16 INVEMAR) para el año 2023. La concordancia positiva alcanza el 29.0 % dentro del sub-AOI, marcadamente superior al 10.9 % del AOI completo, indicando que ambos sensores coinciden con mayor frecuencia sobre la cobertura efectiva de manglar puesto que el sector está mayoritariamente ocupado por cobertura de manglar real.**

| Categoría | Área (km²) | Proporción |
|---|---|---|
| Ambos no-manglar | 206.2 | 35.4 % |
| Ambos manglar (concordancia +) | 169.1 | 29.0 % |
| Óptico sí, SAR no (omisión SAR) | 88.4 | 15.2 % |
| SAR sí, óptico no (s