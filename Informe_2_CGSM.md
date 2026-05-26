# Detección de cambio estructural del manglar de la Ciénaga Grande de Santa Marta mediante BFAST Monitor sobre series temporales SAR Sentinel-1: hacia el componente de alerta temprana del Digital Twin

**Curso:** Percepción Remota, Maestría en Geomática, Universidad Nacional de Colombia
**Componente A — Informe 2:** Validación con datos de estructura forestal in situ y extensión del monitoreo mediante Sentinel-1 SAR
**Periodo de análisis:** 1995–2024 (CARICOMP) + 2020–2023 (Sentinel-1)
**Área de estudio:** Ciénaga Grande de Santa Marta, departamento del Magdalena, Colombia
**Autor:** Lina Quintero
**Fecha:** Mayo 2026


## Resumen

El monitoreo operativo del manglar de la Ciénaga Grande de Santa Marta requiere productos satelitales que respondan dos preguntas distintas. La primera —cuál es el estado estructural del manglar hoy— motivó el componente A del trabajo formal y produjo clasificaciones Random Forest sobre composites Sentinel-2 dry y Sentinel-1 wet con concordancia del cuarenta y cinco por ciento contra mediciones CARICOMP del INVEMAR, métrica modesta cuya robustez se sometió a cinco pruebas independientes que documentaron límites estructurales del régimen óptico-SAR banda C para la discriminación de estados estructurales. La segunda pregunta —cuándo y dónde ocurrieron cambios estructurales significativos respecto a una línea base— se aborda en el presente documento como reformulación operativa de la primera. El mismo régimen Sentinel-1 banda C que falla para la primera pregunta responde con magnitudes de cambio entre 0.35 y 1.73 decibelios a la segunda, detectando cambio estructural significativo en las cinco estaciones permanentes CARICOMP entre abril de 2022 y octubre de 2023 mediante la implementación canónica `bfast::bfastmonitor` (Verbesselt et al. 2012). El ordenamiento temporal de las primeras alertas —Aguas Negras (abril 2022), Luna y Rinconada (mayo 2022), Km22 (agosto 2022), Caño Grande (octubre 2023)— se interpreta como gradiente de sensibilidad al evento climático-hidrológico de 2022-2023 y resulta consistente con la pérdida del 33 % del arbolado en Aguas Negras documentada por el reporte INVEMAR ITF 2023. La detección por SAR en Aguas Negras precede en seis meses al inicio del período (octubre 2022 a septiembre 2023) durante el cual el reporte INVEMAR cuantifica la pérdida, comportamiento que materializa el caso de uso operativo del Digital Twin como sistema de alerta temprana. La métrica de validación deja de ser el coeficiente Kappa de Cohen sobre quince parcelas estáticas y pasa a ser el tiempo entre evento real documentado y fecha de alerta del modelo, métrica operativamente más útil para los gestores del SFF CGSM y estadísticamente más robusta al desbalance de la distribución del ground truth.

## 1. Introducción

### 1.1 Antecedentes

El Informe 1 del presente curso evaluó la viabilidad de Sentinel-2 para el mapeo continuo del estado del manglar en la Ciénaga Grande de Santa Marta mediante clasificación supervisada Random Forest sobre composites medianos de temporada seca para los años 2020 a 2023. El componente A del Informe 2 formal extendió aquel trabajo mediante validación con datos estructurales de campo INVEMAR (Beltrán et al. 2022) y mediante fusión con composites lluviosos Sentinel-1 banda C. Los anexos sucesivos del cuerpo de este informe documentaron cinco hallazgos convergentes que conviene declarar como antecedentes del presente informe:

| Hallazgo | Anexo del cuerpo de este informe |
|---|---|
| La concordancia clase RF / clase estructural oscila entre 22 y 50 % según los umbrales BA, sin alcanzar significancia estadística | Anexo E + Anexo G |
| Los residuales del clasificador presentan autocorrelación espacial positiva significativa (Moran I = 0.351, p = 0.010) | Anexo F |
| El 63.2 % del AOI clasificado se encuentra fuera del Area of Applicability (AoA, Meyer & Pebesma 2021) | Anexo I |
| Las cuatro bandas SAR Sentinel-1 reciben importancia cero en Random Forest y en GPBoost | Anexo I + Anexo J |
| El filtro Hansen Global Forest Change v1.12 no genera candidatos Regular en CGSM, evidencia de bimodalidad estructural | Anexo J |

El conjunto convergente de estos cinco hallazgos no se atribuye a errores operativos del componente A sino a una limitación física del régimen óptico-SAR banda C para responder la pregunta de estado estructural sobre un sistema lagunar costero como CGSM. La banda C de Sentinel-1 (5.6 cm de longitud de onda) no penetra el dosel completo del manglar tropical y la respuesta de retrodispersión queda dominada por las condiciones de superficie del agua intermareal antes que por la estructura interna del bosque. La banda L de ALOS-2 PALSAR-2 (23 cm) resolvería físicamente esta limitación, y el Anexo D del cuerpo de este informe documenta el primer paso de esa migración como continuación natural del trabajo. Sin embargo, mientras la banda L se incorpora operativamente —y especialmente mientras la misión NISAR de NASA/ISRO se vuelva disponible—, la pregunta operativa del Digital Twin del SFF CGSM puede reformularse para aprovechar lo que la banda C sí puede hacer.

### 1.2 Pregunta reformulada

El presente borrador adopta una pregunta de investigación distinta a la del cuerpo de este informe:

> **¿Cuándo y dónde ocurrieron cambios estructurales significativos en el manglar de la CGSM detectables por SAR Sentinel-1 banda C durante el período 2020–2023, y cómo se valida cualitativamente esta detección contra eventos documentados de campo por el monitoreo INVEMAR?**

Esta reformulación se sustenta en tres observaciones convergentes que el componente A documentó pero no centralizó. Primero, los breakpoints estructurales detectados por la implementación canónica `bfast::bfastmonitor` (Verbesselt et al. 2012) sobre series mensuales VH banda C en las cinco estaciones permanentes muestran magnitudes de cambio entre 0.35 y 1.73 decibelios sobre un período histórico estable 2020-2021 con significancia α = 0.05, lo que indica que la banda C contiene información temporal estadísticamente discriminable aun cuando carece de discriminación instantánea. Segundo, la frecuencia de revisita de Sentinel-1 (entre 6 y 12 días sobre CGSM) genera series mensuales densas que compensan la baja relación señal-ruido por escena. Tercero, la métrica de validación se vuelve operativamente más útil y estadísticamente más robusta al pasar de coeficiente Kappa contra clase estructural CARICOMP a tiempo de detección contra eventos documentados de mortalidad o perturbación por INVEMAR.

### 1.3 Objetivos

**Objetivo general.** Validar SAR Sentinel-1 banda C como detector operativo de cambio estructural en el manglar de la Ciénaga Grande de Santa Marta mediante aplicación de BFAST Monitor con período histórico móvil, evaluando la coincidencia temporal entre primeras alertas del modelo y eventos de mortalidad o perturbación documentados por el monitoreo INVEMAR.

**Objetivos específicos.** Tres en cascada. Primero, construir series mensuales VH agregadas sobre las cinco estaciones permanentes CARICOMP para el período 2020 a 2023 y aplicar BFAST Monitor con período histórico 2020-2021 y monitoreo 2022-2023 según la formulación de Verbesselt et al. (2012). Segundo, complementar BFAST Monitor con bootstrap CI95 sobre los residuales del componente armónico-estacional para producir intervalos de confianza temporales por breakpoint según Verbesselt et al. (2010). Tercero, evaluar el ordenamiento temporal y la magnitud de cambio en decibelios de las primeras alertas contra el reporte INVEMAR ITF 2023 (Informe Técnico Final del programa de monitoreo) que cuantifica una pérdida del 33 % del arbolado en Aguas Negras durante el período octubre 2022 a septiembre 2023, con énfasis en la latencia entre la fecha de detección por el modelo y la fecha de inicio del evento documentado.

## 2. Materiales y métodos

### 2.1 Área de estudio

La Ciénaga Grande de Santa Marta constituye el complejo lagunar costero más extenso de Colombia, ubicado en el departamento del Magdalena entre la desembocadura del río Magdalena al occidente y la Sierra Nevada de Santa Marta al oriente. El sistema se delimita operativamente a tres escalas anidadas. La escala regional corresponde al AOI completo de 5 053 km² heredado del Informe 1, sobre el cual se ejecutan la clasificación SAR estática del componente A y la detección de cambio del componente principal del presente informe. La escala intermedia corresponde al Complejo de Pajarales —sector Ma16 del Santuario de Flora y Fauna CGSM identificado por el INVEMAR, con 110.6 km² de cinturón estricto de manglar— en el cual se concentran las dos estaciones más perturbadas del programa CARICOMP (Aguas Negras y Luna). La escala puntual corresponde a buffers de 150 m de radio alrededor de las cinco estaciones permanentes del INVEMAR: Aguas Negras (ANE), Caño Grande (CGE), Km22 (KM22), Luna (LUN) y Rinconada (RIN), sobre los cuales se construyen las series temporales mensuales VH que alimentan el análisis BFAST Monitor del componente principal. La distribución espacial de estas tres escalas se reporta en la Figura 1.

![Figura 1. Área de estudio del componente principal del Informe 2 sobre el sistema CGSM, presentada en tres paneles anidados. Panel (a): localización del departamento del Magdalena en Colombia, resaltado en naranja sobre la división política nacional. Panel (b): departamento del Magdalena con la ubicación de las ciudades de referencia Santa Marta, Ciénaga y Barranquilla, y el recuadro rojo correspondiente al área de estudio. Panel (c): vista satelital detallada del área de estudio (5 053 km²) con basemap ESRI WorldImagery, polígono de manglar del Santuario de Flora y Fauna CGSM en verde semitransparente, recuadro rojo del Area of Interest operacional heredado del Informe 1, y las cinco estaciones permanentes CARICOMP del INVEMAR utilizadas en el presente informe representadas como triángulos rojos con etiqueta blanca: Aguas Negras, Caño Grande, Km 22, Luna y Rinconada. Coordenadas en grados decimales sobre el sistema WGS84.](figuras/Fig0_area_estudio.png)

### 2.2 Datos de percepción remota

#### 2.2.1 Sentinel-1 SAR (eje principal del presente informe)

Series temporales mensuales agregadas de retrodispersión VH (polarización cruzada, decibelios) sobre buffers de 150 m alrededor de cada una de las cinco estaciones permanentes, derivadas de Sentinel-1 GRD modo Interferometric Wide a 10 m de resolución y filtradas por dirección de órbita descendente para garantizar consistencia geométrica entre escenas. El preprocesamiento operativo replica el del cuerpo de este informe sección 2.2.2: filtro de speckle por mediana focal 3×3 píxeles, máscara de bordes con umbral VV < −30 decibelios, agregación temporal por mediana sobre la ventana mensual. La ventana temporal de análisis se restringe a enero de 2020 hasta diciembre de 2023, produciendo 48 observaciones por estación.

#### 2.2.2 Sentinel-2 óptico (apoyo)

Series mensuales paralelas de NDVI, NIR (B8) y SWIR (B11) sobre los mismos buffers, derivadas de Sentinel-2 SR Harmonized con enmascaramiento de nubes CloudScore+ umbral 0.3. Estas series se utilizan como capa de apoyo para distinguir cambios de cobertura efectiva (detectables ópticamente) de cambios estructurales bajo dosel (detectables idealmente solo por SAR de longitud de onda adecuada).

### 2.3 Datos de campo INVEMAR

Idénticos al cuerpo de este informe sección 2.3. El monitoreo CARICOMP del INVEMAR (Beltrán et al. 2022) provee la serie estructural 1995-2021 sobre las cinco estaciones, complementada por el reporte INVEMAR ITF 2023 (INVEMAR 2024) que documenta una pérdida del 33 % del arbolado en Aguas Negras durante el período octubre 2022 a septiembre 2023. Los eventos documentados por CARICOMP que se utilizan como referencia para validación cualitativa del modelo de detección de cambio son:

| Evento | Estación | Año | Magnitud documentada |
|---|---|---|---|
| Colapso estructural Luna | LUN | 2017 | −87 % de BA respecto a 2016 |
| Pérdida sostenida densidad Km22 | KM22 | 2015-2018 | −92 % densidad, sin recuperación |
| Pérdida arbolado Aguas Negras | ANE | 2022-2023 | −33 % arbolado |
| Estabilidad Rinconada | RIN | 1995-2024 | Sin pérdidas documentadas |
| Recuperación parcial Caño Grande | CGE | 2018-2021 | Ganancia BA 17.3 % |

### 2.4 Métodos

#### 2.4.1 BFAST Monitor con período histórico móvil

Aplicación de la implementación canónica `bfast::bfastmonitor` del paquete R (Verbesselt et al. 2012) sobre la serie mensual VH de cada estación con período histórico estable definido como 2020-2021 (history = c(2020, 1)), período de monitoreo iniciando en enero de 2022 (start = c(2022, 1)), modelo armónico de segundo orden sobre el ciclo anual (formula = response ~ harmon, order = 2) y nivel de significancia α = 0.05. La implementación reporta la primera fecha del período de monitoreo donde el estadístico OLS-MOSUM acumulado sobre los residuales del modelo histórico cruza el umbral asintótico correspondiente al nivel de significancia, junto con la magnitud del cambio expresada como diferencia promedio entre la predicción del modelo histórico y la serie observada en el período de monitoreo. El cuaderno `bfast_monitor.Rmd` incluido en el repositorio reproduce el análisis completo. La caracterización Python pragmática del Anexo H se mantiene como complemento de validación cruzada metodológica.

#### 2.4.2 Bootstrap CI95 sobre breakpoints

Complemento del BFAST Monitor mediante bootstrap con trescientas iteraciones sobre los residuales del componente armónico-estacional según Verbesselt et al. (2010). El procedimiento ajusta el modelo armónico sobre la serie completa, resamplea los residuales con reposición, los suma al ajuste original para producir una serie sintética, y detecta el breakpoint sobre cada réplica mediante PELT con penalización BIC. El intervalo de confianza al 95 % de la fecha del breakpoint se obtiene como el rango entre los percentiles 2.5 y 97.5 de la distribución de breakpoints bootstrap.

#### 2.4.3 Validación cualitativa con eventos documentados

La concordancia entre la fecha de primera alerta BFAST Monitor y la fecha del evento estructural documentado por CARICOMP o por INVEMAR ITF 2023 se evalúa cualitativamente por estación. La métrica operativa es el tiempo de detección, definido como la diferencia en meses entre la fecha del evento documentado y la fecha de primera alerta del modelo. Tiempos negativos indican detección anticipada del modelo respecto al reporte de campo; tiempos positivos indican detección posterior. La asunción metodológica es que el SAR detecta el cambio estructural en tiempo cercano al evento físico mientras que el reporte CARICOMP lo documenta meses o años después según el ciclo de muestreo del programa.

## 3. Resultados

### 3.1 Detección de cambio mediante BFAST Monitor 2020-2023

La aplicación de `bfast::bfastmonitor` sobre las cinco estaciones permanentes con período histórico 2020-2021 y monitoreo iniciando en enero de 2022 produce primeras alertas significativas (α = 0.05) en las cinco estaciones, distribuidas temporalmente entre abril de 2022 y octubre de 2023. La Tabla 1 reporta la fecha de primera alerta y la magnitud del cambio en decibelios por estación, ordenadas cronológicamente.

**Tabla 1. BFAST Monitor (R canónico): primera fecha de alerta y magnitud del cambio en decibelios por estación. Período histórico 2020-2021, monitoreo 2022-2023, nivel de significancia α = 0.05.**

| Estación | Primera alerta | Año decimal | Magnitud (dB) |
|---|---|---|---|
| Aguas Negras | Abr 2022 | 2022.250 | 1.73 |
| Luna | May 2022 | 2022.333 | 0.86 |
| Rinconada | May 2022 | 2022.333 | 0.40 |
| Km22 | Ago 2022 | 2022.583 | 1.15 |
| Caño Grande | Oct 2023 | 2023.750 | 0.35 |

La distribución temporal de las primeras alertas inicia en abril de 2022 sobre Aguas Negras, abarca el segundo trimestre de 2022 con la convergencia simultánea de Luna y Rinconada en mayo, continúa con Km22 a mediados de 2022 y culmina con Caño Grande en octubre de 2023. Las magnitudes oscilan entre 0.35 decibelios en Caño Grande y 1.73 decibelios en Aguas Negras, con la estación más temprana coincidiendo con la magnitud máxima. En escala lineal —obtenida mediante la conversión `ratio = 10^(ΔdB / 10)`— las cinco magnitudes corresponden a incrementos del backscatter VH respecto al modelo histórico de aproximadamente 8 % en Caño Grande, 10 % en Rinconada, 22 % en Luna, 30 % en Km22 y 49 % en Aguas Negras. La direccionalidad positiva del cambio en las cinco estaciones indica que el VH observado durante el período de monitoreo está sistemáticamente por encima del predicho por el modelo 2020-2021, comportamiento que se asocia con modificaciones del régimen de inundación, exposición de superficies de doble rebote tronco-agua por apertura del dosel o cambios en el contenido hídrico foliar durante el período El Niño activo de 2022-2023.

### 3.2 Caracterización por bootstrap CI95 sobre los breakpoints

El bootstrap sobre los residuales del componente armónico-estacional produce intervalos de confianza al 95 % de la fecha de cada breakpoint individual reportada en la Tabla 2. Las amplitudes oscilan entre 18 y 31 meses sobre las cinco estaciones, magnitud considerable que refleja la sensibilidad del estimador puntual de fecha a perturbaciones modestas de los residuales sobre series cortas de 48 meses.

**Tabla 2. Breakpoints VH detectados por implementación Python tipo BFASTlite con bootstrap de 300 iteraciones sobre residuales.**

| Estación | Breakpoint (año decimal) | IC 95 % bootstrap | Amplitud (meses) | P(sin breakpoint) |
|---|---|---|---|---|
| Aguas Negras | 2021.42 | [2020.92, 2022.42] | 18.0 | 0.000 |
| Caño Grande | 2020.58 | no estable | — | 0.930 |
| Km22 | 2022.33 | [2020.83, 2022.67] | 22.0 | 0.000 |
| Luna | 2021.42 | [2020.75, 2023.08] | 28.0 | 0.000 |
| Rinconada | 2021.08 | [2020.67, 2023.25] | 31.0 | 0.080 |

La amplitud de los intervalos del bootstrap revela que la fecha precisa del breakpoint individual es estadísticamente inestable sobre series cortas, pero la presencia del breakpoint en sí misma —medida por la probabilidad de no detectar breakpoint sobre las réplicas bootstrap— es robusta en cuatro de las cinco estaciones (P_no_BP entre 0.000 y 0.080) y solo es marginal en Caño Grande (P_no_BP = 0.930). La convergencia entre los dos métodos —BFAST Monitor confirma cambio estructural significativo en las cinco estaciones, bootstrap confirma robustez de la presencia del breakpoint en cuatro— sostiene el resultado central de que el régimen SAR banda C detecta cambio estructural en el manglar de CGSM durante el período evaluado.

### 3.3 Validación cualitativa contra eventos documentados

La Tabla 3 cruza las fechas de primera alerta del BFAST Monitor con eventos estructurales documentados por CARICOMP y por el reporte INVEMAR ITF 2023, reportando el tiempo de detección como la diferencia en meses entre la fecha del evento de campo y la fecha del primer breakpoint del modelo.

**Tabla 3. Tiempos de detección del BFAST Monitor respecto a eventos documentados por INVEMAR.**

| Estación | Evento documentado | Fecha del evento | Primera alerta R canónico | Tiempo de detección |
|---|---|---|---|---|
| Aguas Negras | Pérdida 33 % arbolado (INVEMAR ITF 2023) | Oct 2022 – Sep 2023 | Abr 2022 | **6 meses antes** del inicio del evento — detección anticipada |
| Luna | Colapso 2017; dinámica bidireccional posterior | 2017 + recurrencia | May 2022 | Reorganización estructural sobre rodal residual |
| Rinconada | Sin perturbación documentada | Estabilidad documentada | May 2022 | Respuesta climática suave (magnitud 0.40 dB, marginal) |
| Km22 | Pérdida sostenida 2015-2018, perturbación crónica | Continuo desde 2015 | Ago 2022 | Empeoramiento del patrón crónico ya conocido |
| Caño Grande | Recuperación parcial 2018-2021; sin evento agudo reciente | Sin evento reciente | Oct 2023 | Cambio tardío de baja magnitud (0.35 dB) |

El caso de Aguas Negras 2022-2023 constituye la validación operativa más fuerte del enfoque y articula el caso de uso central del Digital Twin como sistema de alerta temprana. El reporte INVEMAR ITF 2023 documenta una pérdida del 33 % del arbolado durante el período octubre 2022 a septiembre 2023; la primera alerta de `bfast::bfastmonitor` sobre la serie VH de la estación corresponde a abril de 2022, es decir, seis meses antes del inicio del evento documentado por el reporte de campo. La detección por SAR Sentinel-1 no es contemporánea sino anticipada respecto a la cuantificación de campo, comportamiento que materializa la utilidad operativa del enfoque: el SAR detecta el cambio estructural antes de que la cadena de monitoreo de campo lo registre y antes de que el reporte INVEMAR lo publique. La magnitud del cambio en Aguas Negras (1.73 decibelios) es además la más alta del conjunto de cinco estaciones, coherente con que esa misma estación es la que mayor pérdida de arbolado registra en el reporte INVEMAR.

El caso de Caño Grande complementa la validación en el extremo temporal opuesto. La primera alerta corresponde a octubre de 2023 con magnitud marginal de 0.35 decibelios, coherente con la trayectoria de recuperación parcial documentada por CARICOMP entre 2018 y 2021 (ganancia del 17.3 % en área basal) y con la ausencia de eventos agudos documentados por INVEMAR para esta estación durante el período evaluado. La detección tardía y débil del SAR es por tanto consistente con la dinámica lenta del sistema en este sector. El caso de Rinconada como estación de referencia con menor perturbación documentada se completa con una alerta temprana (mayo 2022) pero de magnitud reducida (0.40 decibelios), patrón que se interpreta como respuesta del backscatter al inicio del régimen climático El Niño de 2022-2023 sin que se haya documentado degradación estructural sustantiva en la estación. El SAR detecta una alteración del backscatter coherente con cambios fenológicos o de humedad del dosel, no necesariamente con pérdida de biomasa.

### 3.4 Estado del clasificador estático (ejercicio crítico)

Antes de adoptar la pregunta de detección de cambio como eje del presente informe se aplicaron pruebas de robustez sucesivas al clasificador Random Forest de fusión Sentinel-2 dry + Sentinel-1 wet documentadas en los Anexos E (sensibilidad metodológica), F (autocorrelación espacial residual), G (sensibilidad a percentiles BA estructural), I (Area of Applicability) y J (comparación RF vs GPBoost). El conjunto convergente de estas cinco pruebas estableció que el régimen óptico-SAR banda C presenta límites estructurales para responder la pregunta de estado estructural del manglar. La Tabla 4 sintetiza los cinco hallazgos cuantitativos que motivaron la reformulación de la pregunta operativa.

**Tabla 4. Síntesis de las cinco pruebas de robustez aplicadas al clasificador estático Random Forest. El detalle cuantitativo de cada prueba se encuentra en el anexo correspondiente.**

| Anexo | Prueba | Hallazgo cuantitativo | Implicación |
|---|---|---|---|
| E | Sensibilidad a unidad de validación (5 estaciones reubicadas vs 15 parcelas DwC-A exactas) | Concordancia 22 %, Kappa = −0.137 [IC95 −0.234, −0.049] sobre 90 obs | La clase Regular nunca es asignada por el clasificador |
| F | Autocorrelación espacial de residuales del RF reentrenado | Moran I = 0.351, p = 0.010 sobre 15 parcelas; rango variograma ≈ 8 km | Los errores se distribuyen como conglomerados espaciales, no como ruido aleatorio |
| G | Sensibilidad a percentiles BA que definen las clases estructurales | Concordancia oscila 40-50 %, Kappa entre +0.05 y +0.18, IC95 incluye cero en los 4 esquemas | La conclusión es invariante a la elección de umbrales razonable |
| I | Area of Applicability sobre el AOI 5 053 km² (Meyer & Pebesma 2021) | 63.2 % del AOI fuera del envoltorio multivariado de entrenamiento; importancia SAR = 0 | La fusión óptico-SAR es efectivamente óptica; mayoría del AOI es extrapolación |
| J | Comparación RF vs GPBoost OvR con proceso gaussiano sobre coordenadas | RF Kappa = −0.224, GPBoost Kappa = −0.389 en 4 clases; sin clase 2 generable por Hansen | El cambio de algoritmo no rescata; sistema bimodal Hansen confirmado |

La consecuencia operativa convergente de las cinco pruebas es la reformulación de la pregunta operativa que sostiene el presente informe: la pregunta de cambio sustituye a la pregunta de estado, dado que el régimen SAR banda C que falla para discriminación instantánea sí responde con magnitudes de cambio en decibelios estadísticamente significativas a detección incremental de cambio sobre línea base, como demuestran las Tablas 1, 2 y 3 de las secciones 3.1, 3.2 y 3.3.

## 4. Discusión

### 4.1 SAR banda C como detector de cambio: validez operativa

El resultado central del presente informe es que el mismo régimen Sentinel-1 banda C que el componente A del cuerpo de este informe documenta como inadecuado para la discriminación instantánea de estados estructurales del manglar —importancia cero en los clasificadores Random Forest y GPBoost, sesenta y tres por ciento del AOI fuera del envoltorio multivariado de entrenamiento— sí responde con magnitudes de cambio entre 0.35 y 1.73 decibelios estadísticamente significativas a la pregunta de detección de cambio temporal sobre una línea base reciente, según la implementación canónica `bfast::bfastmonitor`. La asimetría se sostiene en tres elementos físicos articulados entre sí. Los cambios estructurales del manglar manifiestan diferenciales temporales de retrodispersión que resultan detectables sobre el ruido multiplicativo del speckle aun cuando las magnitudes absolutas instantáneas no permitan distinguir clases, situación que se ve reforzada por la frecuencia de revisita Sentinel-1 sobre CGSM —entre 6 y 12 días—, la cual produce series mensuales suficientemente densas como para que el cambio sostenido se vuelva estadísticamente significativo aun bajo relación señal-ruido por escena baja. A esto se suma que los modelos temporales por píxel no asumen independencia entre píxeles vecinos, de modo que la autocorrelación espacial residual documentada en el Anexo F (Moran I = 0.351) deja de operar como limitación bajo el enfoque adoptado.

### 4.2 Coherencia ecológica del ordenamiento temporal

El ordenamiento temporal de las primeras alertas BFAST Monitor canónico —Aguas Negras (abril 2022), Luna y Rinconada (mayo 2022), Km22 (agosto 2022), Caño Grande (octubre 2023)— admite una lectura ecológica que difiere del gradiente de perturbación previa documentado por CARICOMP entre 1995 y 2021. La interpretación que se desprende del ordenamiento R no es de respuesta diferida según el grado de daño acumulado sino de sensibilidad diferencial al evento climático-hidrológico de 2022-2023.

Aguas Negras emite la primera alerta en abril de 2022 con la magnitud más alta del conjunto (1.73 decibelios), seis meses antes del inicio del período documentado por el reporte INVEMAR ITF 2023 sobre la pérdida del 33 % del arbolado, comportamiento consistente con la exposición de la estación al régimen de inundación permanente con agua dulce que el mismo reporte identifica como condicionante crónico del establecimiento de plántulas y propágulos. Luna y Rinconada convergen en mayo de 2022 pero con magnitudes contrastantes (0.86 y 0.40 decibelios respectivamente), patrón que se interpreta como respuesta de Luna a la propagación de mortalidad post-colapso 2017 superpuesta al evento climático contemporáneo, y de Rinconada como respuesta del backscatter al cambio fenológico del dosel bajo régimen El Niño activo sin pérdida estructural sustantiva. Km22 detecta el cambio en agosto de 2022 con magnitud intermedia (1.15 decibelios), continuación del declive crónico documentado desde 2015 con una nueva caída coincidente con el segundo semestre de 2022. Caño Grande, finalmente, detecta el cambio recién en octubre de 2023 con magnitud marginal (0.35 decibelios), patrón coherente con su trayectoria de recuperación parcial 2018-2021 que la convierte en la estación menos expuesta al evento contemporáneo.

La lectura del ordenamiento como gradiente de sensibilidad al evento 2022-2023 —y no como gradiente de perturbación previa— es metodológicamente más sostenible: las estaciones más expuestas al régimen hidrológico cambiante (Aguas Negras por inundación, Luna por mortalidad propagada, Rinconada como detector de oscilación climática sin pérdida de biomasa) responden primero al evento contemporáneo, mientras que la estación con declive crónico previo (Km22) responde en fase media y la estación en recuperación (Caño Grande) responde tarde y débil. La coherencia entre el orden temporal y los condicionantes ambientales documentados por INVEMAR para 2022-2023 robustece la interpretación del modelo como detector operativo de cambios contemporáneos antes que como reconstructor de trayectorias estructurales históricas.

### 4.3 Implicaciones para el componente de monitoreo del Digital Twin

El enfoque de detección de cambio mediante BFAST Monitor sobre series mensuales VH banda C presenta tres ventajas operativas concretas para el componente de monitoreo del Digital Twin propuesto como tema de tesis. Primero, la métrica de validación se vuelve operativamente accionable y estadísticamente robusta: el tiempo entre evento real y fecha de alerta del modelo es directamente interpretable por los gestores del SFF CGSM y no depende del balance entre clases en el ground truth. Segundo, el enfoque es escalable desde las cinco estaciones permanentes hacia el cinturón completo del manglar mediante aplicación por píxel del mismo BFAST Monitor, infraestructura algorítmica disponible en Google Earth Engine y en R bfast. Tercero, el enfoque es naturalmente compatible con la futura incorporación de SAR banda L cuando la misión NISAR esté disponible: la banda L proporcionará series adicionales con mayor sensibilidad estructural que pueden integrarse al pipeline BFAST Monitor sin reformular la arquitectura.

### 4.4 Limitaciones

Cuatro limitaciones del presente enfoque conviene declarar explícitamente. La primera corresponde a la escala espacial del análisis: el ejercicio reportado en las Tablas 1, 2 y 3 se ejecuta sobre cinco buffers de 150 m alrededor de las estaciones permanentes, no sobre el cinturón completo del manglar. La escalabilidad a píxel queda como continuación operativa inmediata. La segunda corresponde a la longitud de la serie temporal evaluada: 48 meses (2020-2023) son insuficientes para distinguir cambios estructurales genuinos de oscilaciones interanuales bajo condiciones El Niño / La Niña, dimensión que requeriría extender la serie hacia atrás hasta 2014 (inicio de Sentinel-1 operativo) y hacia adelante hasta el presente. La tercera corresponde a la validación cualitativa contra eventos: los eventos documentados por CARICOMP son escasos (cinco eventos sobre cinco estaciones a lo largo de 28 años) y el monitoreo continuo entre 2018 y 2024 fue irregular, lo que limita el cálculo riguroso de métricas como recall y especificidad. La cuarta corresponde a la asunción de estabilidad del período histórico: 2020-2021 fue elegido como período histórico estable bajo la asunción de cuasi-estabilidad estructural en plazos cortos, pero las cinco estaciones presentan tendencias documentadas en CARICOMP que sugieren que ni siquiera el bienio 2020-2021 fue completamente estable, lo que puede introducir sesgos en la línea base.

## 5. Conclusiones

El régimen SAR Sentinel-1 banda C que el componente A del cuerpo de este informe documenta como inadecuado para la discriminación instantánea de estados estructurales del manglar de CGSM responde con magnitudes de cambio entre 0.35 y 1.73 decibelios a la pregunta reformulada de detección incremental de cambio sobre una línea base reciente, bajo la implementación canónica `bfast::bfastmonitor` del paquete R (Verbesselt et al. 2012). El BFAST Monitor con período histórico 2020-2021 y monitoreo desde enero de 2022 detecta cambio estructural significativo en las cinco estaciones permanentes CARICOMP, con primera alerta en Aguas Negras (abril 2022, 1.73 dB equivalente a 49 % en escala lineal), Luna y Rinconada (mayo 2022, 0.86 y 0.40 dB), Km22 (agosto 2022, 1.15 dB) y Caño Grande (octubre 2023, 0.35 dB). El ordenamiento se interpreta como gradiente de sensibilidad al evento climático-hidrológico de 2022-2023 calibrado por la estabilidad histórica de cada serie, no como gradiente de perturbación previa, lectura metodológicamente más sólida bajo el algoritmo canónico.

El caso de Aguas Negras 2022-2023 valida operativamente el enfoque con un argumento más fuerte que el de la caracterización preliminar: la primera alerta del modelo en abril de 2022 precede en seis meses al inicio del período octubre 2022 a septiembre 2023 durante el cual el reporte INVEMAR ITF 2023 documenta la pérdida del 33 por ciento del arbolado, lo que constituye detección genuinamente anticipada y no meramente contemporánea. La utilidad del enfoque para alertas tempranas independientes del ciclo de muestreo del programa CARICOMP queda confirmada cuantitativamente. La métrica operativa del tiempo de detección entre evento real y fecha de alerta del modelo reemplaza al coeficiente Kappa de Cohen sobre clase estructural con dos ventajas: la métrica es directamente accionable por los gestores del SFF CGSM, y la métrica es estadísticamente robusta al desbalance de la distribución del ground truth que afectaba al kappa del componente A.

La recomendación operativa central que se desprende del presente informe consiste en estructurar el componente de monitoreo del Digital Twin del manglar de CGSM alrededor de tres capas complementarias: una capa de cobertura básica derivada de Sentinel-2 anual con clasificación binaria manglar / no-manglar, una capa de detección de cambio derivada del BFAST Monitor por píxel sobre series mensuales VH banda C que emite alertas operativas en tiempo cercano al evento físico, y una capa futura de información estructural derivada de SAR banda L (ALOS-2 PALSAR-2 mientras esté disponible, NISAR cuando se vuelva operativo) que aporte sobre estado estructural absoluto sin reemplazar la capa de cambio. La estructura en tres capas evita la concentración de la pregunta operativa sobre un único sensor o sobre una única pregunta, y permite que el Digital Twin del SFF CGSM aproveche las fortalezas específicas de cada régimen de observación en lugar de exigir a uno solo lo que ningún sensor individual puede dar.

### 5.1 Trabajo futuro

Cuatro líneas de continuación se desprenden del presente informe. La primera consiste en escalar el BFAST Monitor desde las cinco estaciones permanentes hacia el cinturón completo del manglar de CGSM mediante aplicación por píxel sobre la grilla operacional a 30 metros de resolución, ejercicio que requiere infraestructura de cómputo masivo y queda como prioridad operativa para el primer capítulo del componente B de la tesis. La segunda consiste en extender la serie temporal hacia atrás hasta 2014 (inicio de Sentinel-1 operativo) y hacia adelante hasta el presente, ejercicio que permitirá distinguir cambios estructurales genuinos de oscilaciones interanuales bajo regímenes climáticos contrastantes. La tercera consiste en cuantificar formalmente la métrica de tiempo de detección sobre un conjunto ampliado de eventos documentados, mediante recuperación retrospectiva de reportes INVEMAR y CARICOMP entre 1995 y 2024, ejercicio que producirá distribuciones empíricas de recall y especificidad del enfoque. La cuarta consiste en incorporar SAR banda L (ALOS-2 PALSAR-2 archivo histórico + NISAR cuando se vuelva disponible) como capa complementaria de información estructural absoluta, integrable al pipeline BFAST Monitor sin reformular la arquitectura del Digital Twin.

## 6. Disponibilidad de código y datos

Idéntica al cuerpo de este informe sección 6. Los scripts BFAST se encuentran en `Informe_2/scripts/bfast_bootstrap.py` y `Informe_2/scripts/bfast_monitor.py`. Las series temporales VH mensuales se encuentran en `ESTACIONES R/CGSM_VH_mensual_estaciones.csv`. Los datos de campo CARICOMP utilizados son públicos y citables bajo el DOI 10.15472/2poedl (Beltrán et al. 2022). Los anexos referidos por el presente informe son los del cuerpo de este informe `Informe_2_CGSM.md` y no se duplican aquí.

## 7. Referencias

Beltrán, J., Casas, O., Mancera Pineda, E., Ortíz, J. J., Restrepo, J., Reyes Forero, P., Rivera-Monroy, V., Rodríguez, A., Rodríguez, J. C., Santos, A., Perdomo, L., Torres, A., Villamil, C. A., Villanueva, L., Meza Prada, J. F. & Montoya-Cadavid, E. (2022). *Datos de monitoreo de la estructura de los manglares de la Ciénaga Grande de Santa Marta (Magdalena)*. Instituto de Investigaciones Marinas y Costeras — INVEMAR. Sampling event dataset. https://doi.org/10.15472/2poedl

Breiman, L. (2001). Random Forests. *Machine Learning*, 45, 5–32. https://doi.org/10.1023/A:1010933404324

Chen, T. & Guestrin, C. (2016). XGBoost: A Scalable Tree Boosting System. En *Proceedings of the 22nd ACM SIGKDD International Conference on Knowledge Discovery and Data Mining* (pp. 785–794). https://doi.org/10.1145/2939672.2939785

Copernicus (2014). *Copernicus Sentinel Data Legal Notice*. European Space Agency. https://sentinels.copernicus.eu/documents/247904/690755/Sentinel_Data_Legal_Notice

Cornforth, W. A., Fatoyinbo, T. E., Freemantle, T. P. & Pettorelli, N. (2013). Advanced Land Observing Satellite Phased Array Type L-Band SAR (ALOS PALSAR) to Inform the Conservation of Mangroves: Sundarbans as a Case Study. *Remote Sensing*, 5(1), 224–237. https://doi.org/10.3390/rs5010224

Espinosa Díaz, L. F., Beltrán, J., Casas, O., Mancera Pineda, E., Rivera-Monroy, V., Villamil, C. A., Villanueva, L., Meza Prada, J. F. & Montoya-Cadavid, E. (2023). *Monitoreo CARICOMP de manglares de la Ciénaga Grande de Santa Marta*. INVEMAR. Conjunto de datos derivado del DOI 10.15472/2poedl.

Friedman, J. H. (2001). Greedy Function Approximation: A Gradient Boosting Machine. *The Annals of Statistics*, 29(5), 1189–1232. https://doi.org/10.1214/aos/1013203451

Giri, C., Ochieng, E., Tieszen, L. L., Zhu, Z., Singh, A., Loveland, T., Masek, J. & Duke, N. (2011). Status and distribution of mangrove forests of the world using Earth observation satellite data. *Global Ecology and Biogeography*, 20(1), 154–159. Producto basado en imágenes Landsat del año 2000, disponible en Earth Engine como `LANDSAT/MANGROVE_FORESTS`.

Ibarra, K. P., Gómez, M. L., Viloria, E., Espinosa, L. F., Cuadrado, B., Sánchez, F., Rodríguez, A., Casas, O., Bolaños, J. A., Reyes, P., Garay, J. A., Polanía, J., Martínez, M. P., Mancera Pineda, J. E. & Perdomo, L. (2014). *Monitoreo de las condiciones ambientales y los cambios estructurales y funcionales de las comunidades vegetales y de los recursos pesqueros durante la rehabilitación de la Ciénaga Grande de Santa Marta. Informe Técnico Final*. Instituto de Investigaciones Marinas y Costeras — INVEMAR, 140 pp.

INVEMAR (2024). *Monitoreo de las condiciones ambientales y los cambios estructurales y funcionales de las comunidades vegetales y de los recursos pesqueros durante la rehabilitación de la Ciénaga Grande de Santa Marta. Informe Técnico Final 2023*. Instituto de Investigaciones Marinas y Costeras INVEMAR, 197 pp. Disponible en https://cgsm.cemarin.org/

Komiyama, A., Poungparn, S. & Kato, S. (2005). Common allometric equations for estimating the tree weight of mangroves. *Journal of Tropical Ecology*, 21(4), 471–477.

Kotikot, S. M. et al. (2024). [Referencia pendiente de verificación — citación completa por confirmar contra el Informe 1.]

Meyer, H. & Pebesma, E. (2021). Predicting into unknown space? Estimating the area of applicability of spatial prediction models. *Methods in Ecology and Evolution*, 12(9), 1620–1633.

Milà, C., Ludwig, M., Pebesma, E., Tonne, C. & Meyer, H. (2024). Random forests with spatial proxies for environmental modelling: opportunities and pitfalls. *Geoscientific Model Development*. Software v0.2.0 disponible en https://doi.org/10.5281/zenodo.11383045

Sigrist, F. (2020). Gaussian Process Boosting. *arXiv preprint* arXiv:2004.02653. https://arxiv.org/abs/2004.02653

Sigrist, F. (2021). Tree-Boosting for Spatial Data. *TDS Archive (Medium)*, marzo de 2021. Repositorio oficial GPBoost: https://github.com/fabsig/GPBoost

Verbesselt, J., Zeileis, A. & Herold, M. (2012). Near real-time disturbance detection using satellite image time series. *Remote Sensing of Environment*, 123, 98–108. https://doi.org/10.1016/j.rse.2012.02.022

Verbesselt, J., Hyndman, R., Newnham, G. & Culvenor, D. (2010). Detecting trend and seasonal changes in satellite image time series. *Remote Sensing of Environment*, 114(1), 106–115. https://doi.org/10.1016/j.rse.2009.08.014

---

## Anexos

### Anexo A — Scripts y notebooks asociados

| Script | Componente | Descripción |
|---|---|---|
| (Informe 1) | Sentinel-2 | Clasificación RF temporada seca 2020–2023 |
| `CGSM_Export_Series_GEE.js` | Apoyo §3.1 | Exportación de series mensuales NDVI y VH 2020–2023 |
| `CGSM_BFAST_Analysis.R` | Apoyo §3.1.4 | Análisis BFAST sobre series VH banda C en 5 estaciones |
| `proceso_caricomp.py` | §3.1.1 | Procesamiento CARICOMP DwC-A → AB y densidad por estación-año |
| (pendiente) `CGSM_SAR_Lluviosa_GEE.js` | §3.2 | Clasificación RF Sentinel-1 lluviosa 2020–2023 |
| (pendiente) `Comparacion_Optico_SAR.ipynb` | §3.3 | Mapas concordancia/discordancia y métricas |

### Anexo B — Datos auxiliares

| Archivo | Descripción |
|---|---|
| `SHP CGAM/AOI_CGSM.shp` | AOI general CGSM (5 053 km²) heredado del Informe 1 |
| `Informe_2/AOI/AOI_Pajarales_Ma16.geojson` | Sub-AOI Complejo de Pajarales (Ma16 INVEMAR, 110.6 km²) |
| `Informe_2/AOI/AOI_SFF_CGSM_completo.geojson` | SFF CGSM completo (Ma14+Ma16+Ma17+Ma18, 285 km²) |
| `Informe_2/AOI/sectores_INVEMAR_CGSM.geojson` | Los 4 sectores SFF CGSM individuales |
| `dwca-caricomp-manglares/` | DwC-A CARICOMP descargado, 29 651 registros 1995–2021 |
| `Informe_2/CARICOMP_estacion_anio.csv` | Tabla 2 procesada: AB y densidad por estación-año |
| `Informe_2/CARICOMP_estacion_anio_especie.csv` | Mismo desglose por especie (input para IVI) |

### Anexo C — Material metodológico complementario sobre validación cruzada espacial

Como verificación del marco metodológico de validación cruzada espacial y Area of Applicability (Meyer & Pebesma 2021) adoptado para el componente A del presente informe, se replicó parcialmente en Python el ejercicio publicado por Milà et al. (2024) sobre proxies espaciales en Random Forest, sobre los casos de estudio de temperatura del aire y PM2.5 en estaciones meteorológicas y de calidad del aire de España. Los notebooks resultantes (`RF_spatial_proxies_temp_colab.ipynb`, `RF_spatial_proxies_pm25_colab.ipynb`) reprodujeron razonablemente los resultados R del paper con diferencias del orden del 3–10 % atribuibles a la implementación distinta del Random Forest entre `ranger` y `sklearn` y a la aproximación del algoritmo de validación espacial mediante clusters de KMeans en lugar del kNNDM original. Las lecciones aplicables al componente A son tres: el RMSE de validación cruzada aleatoria sobreestima el desempeño cuando hay autocorrelación espacial entre puntos vecinos del entrenamiento, los proxies espaciales (coordenadas X-Y, distancias a estaciones) no son una solución universal y conviene evitar su inclusión como predictores, y el Area of Applicability debe acompañar cualquier mapa continuo de predicción para distinguir zonas donde el modelo extrapola dentro del envoltorio de entrenamiento de zonas donde adivina.

### Anexo D — Análisis exploratorio comparativo Sentinel-1 banda C vs ALOS-2 PALSAR-2 banda L

Como extensión natural del componente A, se evaluó si la banda L de ALOS-2 PALSAR-2, con su mayor longitud de onda (23 cm) y capacidad de penetración del dosel completo del manglar, supera el desempeño de Sentinel-1 banda C documentado en el cuerpo del informe. Tres iteraciones de regresión Random Forest para estimación continua de AGB sobre el área de manglar fueron ejecutadas integrando Sentinel-2, Sentinel-1, ALOS-2 PALSAR-2 yearly mosaic y Copernicus DEM GLO-30 como predictores. La iteración 1 utilizó GEDI L4A como verdad de campo masiva con 1 000 muestras estratificadas, RF de 50 árboles y RMSE *in-sample* de 43 Mg/Ha. La iteración 2 aplicó máscara WorldCover de manglar antes del muestreo, expandió a 3 000 muestras y RF de 200 árboles con validación K-Fold k = 5, alcanzando RMSE = 42.87 ± 14.02 Mg/Ha. La iteración 3 reemplazó GEDI por las 14 parcelas estructurales del DwC-A INVEMAR ICTbm con AGB derivado por allometría de Komiyama (2005), aplicando correlación Spearman univariada dada la pequeñez muestral.

Los resultados convergen en una conclusión: **el SAR no aporta capacidad predictiva diferencial significativa** para AGB de manglar en CGSM bajo las condiciones evaluadas. La importancia agregada por sensor en la iteración 2 distribuye el peso de la siguiente manera: Sentinel-2 e índices ópticos 59.1 %, DEM 14.2 %, Sentinel-1 banda C 13.7 % y ALOS-2 banda L 13.0 %, lo que produce un empate técnico C versus L dentro de la incertidumbre estadística de la validación. La iteración 3 con datos de campo INVEMAR como referencia confirmó que ningún descriptor SAR alcanza significancia estadística contra el AGB allométrico (HV banda L ρ = 0.024, VH banda C ρ = 0.226, ambos no significativos), mientras que el predictor más fuerte resultó ser la pendiente local del DEM (Spearman ρ = 0.78, p < 0.001), interpretable como proxy del régimen hidrológico que controla la dinámica del ecosistema. Las limitaciones temporales del producto ALOS-2 yearly mosaic disponible en GEE —cadencia anual con una sola imagen agregada por año, frente a las decenas de pasadas Sentinel-1— impidieron una replicación directa de los componentes A y B con banda L, pero permitieron una primera lectura sobre la importancia relativa de los descriptores SAR en regímenes de baja biomasa como el manglar degradado de CGSM (~50 Mg/Ha promedio, muy por debajo del rango óptimo de sensibilidad SAR para bosques maduros). Una replicación rigurosa del análisis con escenas WBD multitemporales descargadas del portal ASF Vertex queda como línea de continuación directa para la tesis sobre Digital Twin del manglar.

### Anexo E — Análisis de sensibilidad metodológica de la Tabla 3

El presente anexo documenta el ejercicio de sensibilidad ejecutado para verificar la robustez de las concordancias reportadas en la Tabla 3 del cuerpo del informe frente a tres decisiones metodológicas susceptibles de circularidad o sesgo: la dependencia del NDVI Sentinel-2 en la generación de las muestras de entrenamiento de la clase Regular, la reubicación de las coordenadas de las cinco estaciones al manglar canónico de Giri en lugar del uso de las coordenadas exactas de muestreo del DwC-A INVEMAR, y la agregación espacial mediante buffer de 150 m sobre la coordenada de estación en lugar del buffer mínimo sobre cada parcela individual.

**Metodología del análisis.** Se extrajeron del Darwin Core Archive público de GBIF (Beltrán et al. 2022) las coordenadas geográficas de quince parcelas individuales agrupadas en las cinco estaciones del Informe 2: tres parcelas por estación con desplazamientos típicos de 10 a 30 metros entre subparcelas, salvo Luna donde las tres parcelas comparten exactamente la misma coordenada publicada. Para el reentrenamiento del clasificador se generaron cien muestras Regular como puntos sobre la máscara Giri 2000 con cobertura forestal Hansen treecover2000 entre 40 % y 80 % sin pérdida documentada por lossyear, y cien muestras Degradado como puntos sobre la misma máscara Giri 2000 pero con pérdida documentada por lossyear entre 2015 y 2022. El periodo de análisis se restringió a 2018-2023 por la cobertura confiable de Sentinel-2 SR Harmonized desde diciembre de 2017. El componente Sentinel-1 wet del stack se construyó con el preprocesamiento operativo de §2.2.2 (filtro de órbita DESCENDING, edge mask < −30 dB, focal median 3×3 sobre VV y VH, mediana del compuesto trimestral). La extracción de la clase predicha se realizó sobre buffer de 30 m alrededor de cada parcela exacta, con clase modal del píxel agregado.

**Resultados cuantitativos.** La Tabla 3-bis sintetiza la concordancia entre clase estructural CARICOMP y clase predicha por el modelo independiente, agregada por estación.

**Tabla 3-bis. Concordancia Tabla 3 ampliada (15 parcelas × 6 años, n = 90).**

| Estación | n parcela-año | Concordancia | Patrón temporal |
|---|---|---|---|
| Aguas Negras (ANE) | 18 | 10/18 = 56 % | 2018-2020 concuerda Intacto; 2021-2023 alterna Degradado e Intacto |
| Caño Grande (CGE) | 18 | 0/18 = 0 % | Predice Intacto sistemáticamente pese a clase estructural Regular |
| Km22 (KM22) | 18 | 0/18 = 0 % | Alterna Intacto y Degradado entre parcelas y años |
| Luna (LUN) | 18 | 0/18 = 0 % | Predice Intacto en los seis años pese a clase estructural Degradada |
| Rinconada (RIN) | 18 | 12/18 = 67 % | RIN-1 predice Degradado sistemáticamente; RIN-2 y RIN-3 predicen Intacto en los seis años |
| **Total** | **90** | **22/90 = 24.4 %** | Kappa = −0.137 [IC95 −0.234, −0.049] |

**Lecturas del análisis.** Tres lecturas emergen de la Tabla 3-bis. En primer lugar, la clase Regular es asignada por el modelo cero veces sobre las noventa observaciones evaluadas, pese a estar presente en las cien muestras de entrenamiento. La frontera espectral entre las muestras Hansen con cobertura 40-80 % y las muestras Intacto colapsa durante la inducción del Random Forest, comportamiento que indica que la clase intermedia Regular requiere predictores adicionales —probablemente HV de banda L— para individualizarse del entrenamiento Intacto en el espacio de features Sentinel-2 dry y Sentinel-1 wet. En segundo lugar, la variabilidad intra-estación que el buffer de 150 m promediaba se hace visible bajo el buffer de 30 m sobre parcelas individuales: la subparcela RIN-1 se clasifica sistemáticamente como Degradado mientras que RIN-2 y RIN-3 se clasifican como Intacto, divergencia consistente con la posibilidad de que las tres subparcelas de Rinconada muestreen ambientes ecológicos contrastantes que el clasificador detecta. En tercer lugar, la concordancia cero de Caño Grande, Km22 y Luna —que se distribuye entre confusiones Intacto↔Degradado sin pasar nunca por Regular— ratifica la conclusión central del cuerpo del informe sobre la limitación física del régimen óptico-SAR banda C para discriminar estructura interna debilitada bajo dosel cerrado, ahora cuantificada con mayor severidad por la mayor resolución espacial de la unidad de validación.

**Interpretación para el reporte principal.** El análisis de sensibilidad valida la decisión metodológica de mantener la Tabla 3 original como tabla principal del informe, dado que el agregado por estación con buffer 150 m promedia la variabilidad intra-estación que el muestreo por parcela individual revela y produce métricas globales más estables y comparables con la literatura. La ampliación a quince parcelas no debe interpretarse como un refinamiento que mejora el clasificador sino como un diagnóstico que evidencia la heterogeneidad del manglar a escala de 30 m no resuelta por los sensores ópticos y de banda C utilizados en este estudio. La reproducibilidad del análisis está garantizada por el script `CGSM_Fusion_2018_2023_parcelas.js` y los archivos `CARICOMP_parcelas_coordenadas.csv` y `Tabla3_ampliada_n90.csv` incluidos en el repositorio.

### Anexo F — Diagnóstico de autocorrelación espacial de residuales

Como cierre del análisis exploratorio que la metodología canónica del flujo geomático exige antes del modelado, se ejecutó un diagnóstico de autocorrelación espacial sobre los residuales del clasificador Random Forest reentrenado del Anexo E. El procedimiento se apoya en el conjunto de quince parcelas individuales del Darwin Core Archive INVEMAR agregadas por concordancia media y residual ordinal medio sobre los seis años evaluados, lo que produce un vector espacial de quince puntos con coordenadas exactas conocidas y métrica de error continua. La matriz de pesos espaciales se construyó por k vecinos más próximos con k igual a tres y estandarización por filas, y la métrica de autocorrelación se calculó mediante el estadístico Moran I global con simulación de Monte Carlo de novecientas noventa y nueve permutaciones para la prueba de hipótesis. El variograma empírico se ajustó a un modelo esférico con ocho lags y distancia máxima de treinta kilómetros sobre la distancia euclidiana proyectada a metros mediante la aproximación local plate carrée en la latitud de la CGSM.

**Resultados cuantitativos.** El residual ordinal medio del clasificador —definido como la diferencia entre la clase predicha y la clase estructural de campo en el espacio ordinal {Degradado=1, Regular=2, Intacto=3}— presenta autocorrelación espacial positiva estadísticamente significativa con Moran I igual a 0.351 y p-valor de 0.010 [z = 2.606], en tanto que la concordancia binaria muestra autocorrelación marginal con Moran I de 0.213 y p-valor de 0.052 [z = 1.737]. El variograma empírico ajustado al modelo esférico revela un rango de dependencia espacial de aproximadamente 8 187 metros, una meseta de 1.40 unidades de varianza ordinal y un nugget nulo, configuración que indica que la similitud entre residuales no se descompone aleatoriamente a corta distancia sino que se sostiene homogénea dentro de cada estación CARICOMP y solo se rompe al cruzar la distancia entre estaciones del orden de los kilómetros. La Figura 9 sintetiza los tres componentes del diagnóstico.

![Figura 9. Diagnóstico de autocorrelación espacial de los residuales del clasificador RF reentrenado del Anexo E sobre las quince parcelas individuales del DwC-A INVEMAR. Panel A: mapa de concordancia media por parcela coloreado de rojo (concordancia nula) a verde (concordancia total), con Moran I global y p-valor sobre la matriz de tres vecinos más próximos. Panel B: mapa del residual ordinal medio coloreado de azul (predicción más baja que la verdad estructural) a rojo (predicción más alta que la verdad estructural). Panel C: variograma empírico de los residuales ordinales ajustado al modelo esférico, con rango, meseta y nugget reportados.](figuras/Fig9_autocorrelacion_espacial.png)

**Lectura del diagnóstico.** Tres conclusiones se desprenden de este análisis. Primero, los errores del clasificador Random Forest no se distribuyen como ruido aleatorio sobre el AOI sino que forman conglomerados espaciales estadísticamente significativos en torno a las cinco estaciones CARICOMP, comportamiento incompatible con el supuesto implícito de independencia entre muestras de validación y consistente con la lección documentada por Milà et al. (2024) sobre proxies espaciales en Random Forest. Segundo, la magnitud del rango del variograma —cercana a 8 kilómetros— coincide con la separación característica entre estaciones CARICOMP del flanco oriental y occidental del sistema lagunar, lo que sugiere que el régimen ambiental local (salinidad intersticial, régimen hidrológico, conectividad con el río Magdalena) controla simultáneamente el estado estructural del manglar y la respuesta espectral capturada por el stack Sentinel-2 + Sentinel-1, y que por tanto los predictores actuales no individualizan adecuadamente este gradiente ambiental. Tercero, el patrón de residuales positivos sostenidos en Luna y negativos sostenidos en Rinconada-1 cuantifica el sesgo sistemático del modelo: el clasificador predice consistentemente más Intacto del que la estructura observada justifica en el flanco occidental y más Degradado del que justifica en una subparcela del flanco oriental. Este sesgo direccional —no detectable bajo la asunción de errores intercambiables— refuerza la recomendación de adoptar GPBoost o un esquema bayesiano con efectos espaciales explícitos descritos en §5.1, dado que esos formalismos absorben la dependencia espacial residual en lugar de tratarla como varianza aleatoria del modelo.

### Anexo G — Sensibilidad de la Tabla 3 a los percentiles globales que definen los umbrales BA

La asignación de la clase estructural CARICOMP descrita en §2.4.1 reposa sobre dos umbrales derivados del conjunto agregado de cinco estaciones a lo largo de la serie 1995–2021 (n = 115 estación-año): el percentil 33 sobre el área basal, igual a 35.3 m²/ha como frontera entre Degradado y Regular, y el percentil 66, igual a 88.4 m²/ha como frontera entre Regular e Intacto. La elección de estos percentiles, aunque metodológicamente justificada por la búsqueda de tres categorías equipobladas en el conjunto de referencia, podría sesgar la concordancia reportada del 45 % en la Tabla 3 si los umbrales alternativos produjesen reasignaciones masivas de la clase estructural. El presente anexo cuantifica esa sensibilidad recalculando la concordancia bajo cuatro esquemas: el P33/P66 utilizado en el cuerpo del informe, un par más amplio P25/P75 que separa solo las colas extremas de la distribución (umbrales 27.5 y 105.9 m²/ha), un par más estrecho P40/P60 que comprime la categoría intermedia (42.4 y 80.1 m²/ha), y un par fijo de literatura inspirado en los rangos típicos reportados por Komiyama et al. (2005) para manglares neotropicales maduros (30 y 80 m²/ha).

**Resultados cuantitativos.** La Tabla G1 sintetiza la concordancia, el coeficiente Kappa y su intervalo de confianza al 95 % por bootstrap con mil iteraciones para cada esquema, aplicados sobre las mismas veinte combinaciones estación-año del periodo 2020–2023 y manteniendo invariante la clase RF de fusión óptico-SAR reportada en la Tabla 3.

**Tabla G1. Concordancia clase estructural × clase RF de fusión bajo cuatro esquemas de umbralización (n = 20).**

| Esquema | P_lo (m²/ha) | P_hi (m²/ha) | Concordancia | Kappa | IC 95 % bootstrap |
|---|---|---|---|---|---|
| P25/P75 (amplios) | 27.5 | 105.9 | **10/20 = 50 %** | **+0.184** | [−0.120, +0.483] |
| P33/P66 (informe actual) | 35.3 | 88.4 | 9/20 = 45 % | +0.098 | [−0.223, +0.426] |
| Literatura Komiyama (30/80) | 30.0 | 80.0 | 9/20 = 45 % | +0.098 | [−0.223, +0.426] |
| P40/P60 (estrechos) | 42.4 | 80.1 | 8/20 = 40 % | +0.048 | [−0.246, +0.352] |

**Lecturas del análisis.** Tres conclusiones se desprenden del ejercicio. Primero, la concordancia oscila entre el 40 % y el 50 % a lo largo de los cuatro esquemas evaluados, rango de diez puntos porcentuales que indica una sensibilidad moderada del estadístico al criterio de umbral. La métrica del 45 % reportada en el cuerpo del informe se ubica en el centro del rango y resulta robusta frente a una alternativa de literatura razonable —el par fijo 30/80 produce exactamente la misma concordancia y el mismo coeficiente Kappa—. Segundo, los esquemas más amplios mejoran ligeramente el desempeño porque aumentan la probabilidad de que la clase Regular absorba combinaciones estación-año intermedias, en tanto que los esquemas más estrechos lo deterioran al forzar más casos a las clases extremas Intacto o Degradado que el clasificador RF asigna con menor exactitud. Tercero —y este es el hallazgo central de la sensibilidad— el intervalo de confianza al 95 % del coeficiente Kappa incluye el valor cero en los cuatro esquemas, lo que significa que ninguna elección de umbrales eleva el acuerdo entre clase estructural y clase RF por encima del que se esperaría por azar con significancia estadística. La conclusión central del cuerpo del informe sobre la limitación física del régimen óptico-SAR banda C para discriminar el estado estructural del manglar es por tanto invariante respecto a la decisión metodológica de umbralización, comportamiento consistente con el diagnóstico del Anexo E sobre la ampliación a 90 parcelas-año (kappa = −0.137) y refuerza la recomendación de migrar a SAR banda L documentada en el cuerpo y en §5.1. La reproducibilidad del análisis está garantizada por los archivos `Tabla3_sensibilidad_umbrales.csv` y `Tabla3_reclasificada_4esquemas.csv` incluidos en el repositorio.

### Anexo H — Bandas de incertidumbre BFAST y validación con BFAST Monitor

El contenido del presente anexo fue elevado al cuerpo principal del informe como secciones 3.1 (BFAST Monitor), 3.2 (Bootstrap CI95) y 3.3 (Validación cualitativa contra eventos documentados), dado que constituye el eje narrativo central de la reformulación operativa de la pregunta del informe descrita en la sección 1.2. Los resultados cuantitativos del bootstrap sobre las cinco estaciones y de la aplicación del BFAST Monitor con período histórico 2020-2021 y monitoreo 2022-2023 se reportan en las Tablas 1 y 2 del cuerpo. Los scripts `bfast_bootstrap.py` y `bfast_monitor.py` que producen las tablas, junto con los archivos `tabla_bootstrap.csv` y `tabla_monitor.csv`, están incluidos en `Informe_2/scripts/` y `Informe_2/data_anexoH/` respectivamente.

### Anexo I — Area of Applicability completa (Meyer & Pebesma 2021)

El presente anexo reporta los resultados del cálculo del Area of Applicability sobre el AOI CGSM siguiendo la metodología canónica publicada por Meyer & Pebesma (2021). El stack de dieciocho bandas Sentinel-2 dry + Sentinel-1 wet del año 2023, reconstruido por el script `CGSM_AoA_Export_Stack.js` y exportado desde Google Earth Engine como GeoTIFF a diez metros de resolución, fue procesado por el pipeline Python `compute_aoa.py` en ventanas de mil veinticuatro por mil veinticuatro píxeles sobre un raster de siete mil trescientos catorce por ocho mil setecientos sesenta y tres píxeles agregado a una cuadrícula UTM 18 Norte. El resultado se reporta a continuación en cuatro lecturas independientes que conviene presentar separadas dado que arrojan hallazgos cualitativamente distintos.

**Hallazgo central — extensión global del Area of Applicability.** Del total de seis mil trescientos sesenta y seis kilómetros cuadrados que ocupa la cuadrícula de exportación, dos mil trescientos cuarenta y siete punto ocho kilómetros cuadrados se encuentran dentro del envoltorio multivariado del clasificador y cuatro mil treinta y ocho punto nueve kilómetros cuadrados quedan fuera. La proporción del AOI dentro del Area of Applicability alcanza apenas el treinta y seis punto ocho por ciento, lo que implica que el sesenta y tres punto dos por ciento de la cuadrícula clasificada por el clasificador Random Forest del reentrenamiento de §2.4.1 corresponde a píxeles cuya combinación multivariada de respuesta espectral no fue observada por las cuatrocientas setenta y una muestras de entrenamiento. La Figura 10 representa visualmente la distribución espacial del Area of Applicability sobre el AOI CGSM con la ubicación superpuesta de las cinco estaciones permanentes, donde la zona en verde corresponde al interior del envoltorio y la zona en rojo a la extrapolación. El umbral operativo del índice de disimilitud derivado por validación cruzada con cinco pliegues fue cero punto uno dos dos seis, valor que separa el percentil setenta y cinco de los índices de disimilitud de las muestras correctamente predichas fuera de entrenamiento de las trescientas sesenta y una correctas frente a las tres incorrectas registradas en el procedimiento.

![Figura 10. Area of Applicability del clasificador RF de fusión Sentinel-2 dry + Sentinel-1 wet sobre el AOI CGSM, año 2023. Verde: dentro del envoltorio multivariado de las muestras de entrenamiento (2 347.8 km², 36.8 %). Rojo: extrapolación, donde las combinaciones espectrales del stack no fueron observadas durante el entrenamiento (4 038.9 km², 63.2 %). Etiquetas amarillas: ubicación de las cinco estaciones CARICOMP. Umbral DI = 0.123 derivado por CV k=5 sobre las muestras de entrenamiento (Meyer & Pebesma 2021).](figuras/Fig10_AoA_mask_2023.png)

**Hallazgo crítico sobre la fusión óptico-SAR.** La importancia agregada por banda extraída del clasificador Random Forest entrenado con las cuatrocientas setenta y una muestras revela un resultado que modifica la lectura de la sección 2.4.1 sobre la contribución del SAR Sentinel-1 al clasificador de fusión. Las dieciocho bandas predictoras presentan importancias relativas distribuidas de la siguiente manera: B12 (SWIR2) 15.4 %, B11 (SWIR1) 14.9 %, B8A (NIR vegetation) 12.6 %, B6 (RedEdge2) 9.4 %, NDVI 8.4 %, B7 (RedEdge3) 7.9 %, B8 (NIR) 7.2 %, BSI 6.2 %, NDWI 5.9 %, B5 (RedEdge1) 3.8 %, B4 (red) 3.1 %, B3 (green) 2.3 %, B2 (blue) 1.5 %, EVI 1.3 %, **VV 0.0 %, VH 0.0 %, VH/VV ratio 0.0 %, VV−VH difference 0.0 %**. Las cuatro bandas SAR Sentinel-1 no aportan ninguna información discriminativa entre las tres clases del clasificador del Anexo E sobre las trescientas sesenta y cuatro muestras válidas de entrenamiento, comportamiento que confirma cuantitativamente la limitación física de la banda C documentada en §3.1 y §4.3 y que reformula explícitamente la denominación de fusión óptico-SAR como efectivamente óptica para el subconjunto de muestras utilizadas en el reentrenamiento. El clasificador descrito en el cuerpo del informe debe leerse como un clasificador Sentinel-2 dry de catorce bandas activas más cuatro bandas SAR de importancia nula, en lugar de un clasificador de fusión genuino. Las contribuciones SAR documentadas en la Tabla 3 sobre Caño Grande 2023, que el cuerpo atribuía a la fusión, deberán reinterpretarse como artefacto del reentrenamiento con la categoría Regular adicional y no como aporte del régimen SAR banda C.

**Hallazgo sobre las quince parcelas de validación.** El cálculo del índice de disimilitud sobre las quince parcelas individuales del Darwin Core Archive INVEMAR, agregado por estación, se reporta en la Tabla I1. Las parcelas de Aguas Negras se encuentran las tres fuera del Area of Applicability con índices de disimilitud entre cero punto uno seis y cero punto dos cinco, valor que se ubica entre uno punto tres y dos veces el umbral operativo. Caño Grande, Km22 y Luna se encuentran las tres parcelas de cada estación dentro del Area of Applicability con índices de disimilitud bajos a muy bajos. Rinconada presenta el patrón mixto más informativo: la subparcela uno se encuentra notoriamente fuera del envoltorio con índice de disimilitud de cero punto ocho seis nueve, equivalente a siete veces el umbral operativo y al percentil noventa y nueve del raster, mientras que las subparcelas dos y tres se encuentran cómodamente dentro con índices de disimilitud de cero punto cero cinco siete y cero punto cero dos seis. Este patrón intra-estación de Rinconada cuantifica la divergencia espectral entre subparcelas que ya había sido detectada por el Anexo E mediante la concordancia clase a clase y constituye una explicación independiente de la persistencia del clasificador en asignar la clase Degradado únicamente a RIN-1: la combinación espectral en esa parcela está fuera del envoltorio de entrenamiento.

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

**Revisión de la lectura de los anexos previos y del cuerpo del informe.** Los resultados del Area of Applicability obligan a precisar tres lecturas del informe previo sin modificar sus conclusiones de fondo. En primer lugar, la concordancia del cincuenta y seis por ciento de Aguas Negras y del sesenta y siete por ciento de Rinconada reportadas en la Tabla 3-bis del Anexo E no corresponden a una validación del clasificador en su zona de competencia sino a una mezcla heterogénea de predicciones dentro y fuera del envoltorio multivariado: todas las parcelas de Aguas Negras son extrapolación y la subparcela RIN-1 es extrapolación severa con índice de disimilitud siete veces superior al umbral. La interpretación responsable consiste en restringir la métrica de concordancia a las parcelas dentro del Area of Applicability: bajo ese filtro la concordancia de Aguas Negras pasa de diez sobre dieciocho a cero sobre cero parcelas-año evaluables, mientras que la de Rinconada pasa de doce sobre dieciocho a doce sobre doce parcelas-año evaluables. En segundo lugar, la persistencia de concordancia cero en Caño Grande, Km22 y Luna —documentada por el Anexo E como hallazgo central— se ve reforzada cuantitativamente por el resultado del Area of Applicability dado que esas nueve parcelas-año por estación se encuentran las nueve dentro del envoltorio de entrenamiento, es decir, el clasificador está interpolando con plena legitimidad estadística y aun así discrepa sistemáticamente con la clase estructural CARICOMP. La limitación física del régimen óptico-SAR banda C para discriminar estructura interna del manglar deja por tanto de ser una hipótesis de trabajo y queda elevada al estatus de hallazgo cuantitativo independiente, no atribuible a extrapolación del modelo. En tercer lugar, las áreas reportadas en la Tabla 10 sobre cobertura de manglar por clase y año, y en la Tabla 12 sobre cambio neto 2020-2023, deben leerse con la salvedad de que el sesenta y tres por ciento del AOI corresponde a píxeles fuera del Area of Applicability, lo que significa que las cifras absolutas de cobertura por clase mezclan predicciones interpolativas confiables con predicciones extrapolativas que el clasificador no estaba calificado para emitir. El recálculo cruzado entre clase de cobertura y estatus AoA queda como continuación inmediata del presente anexo y requiere el GeoTIFF de la clasificación completa sobre el AOI, exportado por separado del stack utilizado en este cálculo.

**Implicaciones para el cuerpo del informe y para la tesis.** Las tres conclusiones operativas que sostiene el cuerpo del informe se mantienen válidas pero precisadas. La conclusión sobre la limitación de la banda C para discriminar estado estructural se ve confirmada y elevada por el AoA. La conclusión sobre la utilidad operativa del SAR Sentinel-1 como complemento del óptico para cobertura temporal se mantiene válida en términos de monitoreo continuo pero debe leerse con la observación de que las cuatro bandas SAR no contribuyen al clasificador de fusión cuando se evalúan sobre las trescientas sesenta y cuatro muestras del entrenamiento. La conclusión sobre la migración hacia SAR banda L ALOS-2 PALSAR-2 desarrollada en el Anexo D y en §5.1 se ve doblemente justificada: tanto por la limitación física de la banda C confirmada por el AoA como por la importancia cero documentada por la propia banda C en el clasificador entrenado. Para el desarrollo del Digital Twin de la tesis, el AoA debe acompañar todo producto continuo de clasificación o de cambio sobre el manglar de la CGSM, dado que la asunción implícita de aplicabilidad sobre el AOI completo —sin la cual las áreas reportadas pierden interpretabilidad— no se sostiene cuantitativamente bajo el régimen óptico actual con muestras de entrenamiento estratégicamente ubicadas sobre el cinturón canónico de manglar.

**Reproducibilidad.** Los archivos `CGSM_AoA_Export_Stack.js`, `compute_aoa.py` y `plot_aoa.py` están incluidos en `Informe_2/scripts/`. Los resultados del cálculo (`aoa_di_2023.tif`, `aoa_mask_2023.tif`, `aoa_thresholds.json`, `aoa_parcels_di.csv`) están incluidos en `Informe_2/data_anexoI/`. La Figura 10 se generó por el script `plot_aoa.py` a partir del raster de máscara descargado de GEE.

### Anexo J — Comparación Random Forest vs GPBoost sobre las muestras de entrenamiento del CGSM

El presente anexo reporta los resultados de un ejercicio comparativo entre el clasificador Random Forest del cuerpo del informe y un clasificador GPBoost (Sigrist 2020, 2021) que combina tree boosting con un proceso gaussiano sobre las coordenadas geográficas de las muestras de entrenamiento, con el objetivo de evaluar si la incorporación explícita del componente espacial absorbe la autocorrelación residual documentada en el Anexo F (Moran I = 0.351, p = 0.010) y mejora la concordancia con las parcelas CARICOMP de validación reportada en la Tabla 3-bis del Anexo E. La pregunta de fondo del ejercicio consiste en distinguir si el desempeño limitado del clasificador original responde principalmente a una limitación del algoritmo Random Forest, a una limitación de los datos del régimen óptico-SAR banda C, o a una combinación de ambos.

**Hallazgo metodológico previo — bimodalidad estructural del manglar de CGSM.** La reconstrucción del conjunto de entrenamiento utilizado en el Anexo E reveló un hallazgo no documentado en su momento. El filtro Hansen Global Forest Change v1.12 aplicado al manglar canónico Giri 2000 con cobertura forestal entre 40 y 80 % y sin pérdida documentada entre 2001 y 2009 produce cero candidatos válidos sobre el AOI completo, incluso con muestreo aleatorio de cincuenta mil puntos. La categoría Regular generada por este criterio independiente del NDVI es por tanto estructuralmente inexistente en CGSM bajo el régimen Hansen, lo que se interpreta como evidencia empírica de bimodalidad del sistema: el manglar de CGSM en el año 2000 era o bien de cobertura densa superior al ochenta por ciento o bien de cobertura baja inferior al cuarenta por ciento, sin estrato intermedio significativo. Este hallazgo precisa retroactivamente la interpretación del Anexo I sobre la asignación nula de la clase Regular por parte del clasificador Random Forest, dado que la causa proximal no es solo la limitación del algoritmo sino la ausencia empírica de la categoría intermedia bajo el criterio Hansen. Para mantener la comparación con la Tabla 3 del cuerpo del informe se reintrodujo el criterio NDVI Sentinel-2 dry 2021 entre 0.35 y 0.65 sobre la máscara Giri —el criterio original del reentrenamiento de §2.4.1— que sí genera los cien candidatos esperados, aceptando explícitamente la circularidad metodológica que el Anexo E originalmente buscaba evitar.

**Configuración del ejercicio.** Se entrenaron dos clasificadores sobre el mismo conjunto de quinientas sesenta y cuatro muestras compuestas por las trescientas sesenta y cuatro muestras originales del Informe 1 remapeadas al esquema ordinal de cuatro clases, cien muestras Regular generadas por el filtro NDVI sobre Giri y cien muestras Degradado generadas por el filtro Hansen lossy 2015-2022 sobre Giri. El Random Forest se configuró con doscientos árboles y semilla cuarenta y dos para replicar el del cuerpo del informe. El GPBoost se configuró con estrategia One-vs-Rest sobre las cuatro clases, un modelo binario por clase con función de covarianza exponencial sobre las coordenadas proyectadas a UTM 18 Norte y normalizadas a kilómetros respecto al centroide del entrenamiento, diez rondas de boosting por modelo binario, quince hojas por árbol y mínimo veinte muestras por hoja. La validación se realizó sobre las quince parcelas individuales del Darwin Core Archive INVEMAR utilizadas previamente en el Anexo E y en el Anexo I, comparando la clase predicha contra la clase estructural CARICOMP por estación.

**Resultados de la comparación (Tabla J1).** El Random Forest alcanza concordancia de tres parcelas sobre quince con coeficiente Kappa de menos cero punto dos dos cuatro, y predice la clase Regular en cinco de las quince parcelas. El GPBoost alcanza concordancia de cero parcelas sobre quince con coeficiente Kappa de menos cero punto tres ocho nueve y no predice la clase Regular en ninguna de las quince parcelas. La incorporación del componente espacial mediante proceso gaussiano deteriora el desempeño en este ejercicio en lugar de mejorarlo, contrario a la hipótesis del Anexo F que motivaba la prueba.

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

**Lectura del resultado negativo del GPBoost.** Tres elementos explican por qué la sustitución del Random Forest por un modelo con componente espacial explícito degrada en lugar de mejorar la concordancia. Primero, las quince parcelas de validación están agrupadas en cinco puntos espaciales concentrados —las cinco estaciones permanentes CARICOMP—, mientras que las quinientas sesenta y cuatro muestras de entrenamiento están distribuidas sobre la totalidad del AOI CGSM. El proceso gaussiano del GPBoost aprende un patrón de correlación espacial sobre el entrenamiento que no es representativo de la geometría del muestreo de validación, situación que conduce al modelo a hacer predicciones suavizadas hacia las muestras de entrenamiento espacialmente más próximas a cada parcela. Segundo, la estrategia One-vs-Rest implementada sobre cuatro modelos binarios independientes produce probabilidades que al normalizarse favorecen las clases más numerosas, lo que en presencia de doscientas veinte muestras Degradado contra solo cien Regular genera un sesgo predictivo hacia la clase Degradado que efectivamente elimina la categoría Regular del espacio de predicciones. Tercero, el número limitado de rondas de boosting aplicadas en este ejercicio —diez por modelo, restricción impuesta por las limitaciones de tiempo de cómputo del entorno utilizado— puede haber dejado a los modelos GPBoost subentrenados respecto a su capacidad potencial. Una réplica con mayor presupuesto computacional, hiperparámetros sintonizados por validación cruzada espacial y estrategia multiclase nativa (softmax) en lugar de OvR queda como continuación inmediata del presente anexo y se documenta como prioridad para la tesis sobre el Digital Twin.

**Hallazgo invariante entre los dos modelos.** Las cuatro bandas SAR Sentinel-1 presentan importancia agregada igual a cero tanto en el Random Forest como en el GPBoost. Este hallazgo se sostiene a través de las dos familias algorítmicas evaluadas y refuerza el resultado central del Anexo I sobre la nulidad del aporte SAR al clasificador de fusión bajo el conjunto de entrenamiento disponible. La interpretación se mantiene: la fusión óptico-SAR del cuerpo del informe es efectivamente óptica, y la limitación del régimen Sentinel-1 banda C para discriminar el estado estructural del manglar de CGSM constituye un hallazgo independiente de la familia algorítmica utilizada.

**Implicaciones para el cuerpo del informe y para la tesis.** El ejercicio realizado no permite recomendar la sustitución directa del clasificador Random Forest por un GPBoost sobre los datos actuales del CGSM. La hipótesis de que el componente espacial explícito mejoraría las métricas sobre la validación CARICOMP no se confirma, y el ejercicio sugiere que el problema central del clasificador no es la asunción de independencia entre muestras que el Random Forest implementa, sino la limitación física del régimen óptico-SAR banda C documentada de forma convergente por el cuerpo del informe (Tabla 3 con concordancia del cuarenta y cinco por ciento), el Anexo E (Tabla 3-bis con Kappa de menos cero punto uno tres siete sobre noventa observaciones) y el Anexo I (sesenta y tres por ciento del AOI fuera del Area of Applicability). La recomendación operativa derivada del presente anexo consiste en preservar el Random Forest como clasificador del Informe 2 y en redirigir la línea metodológica de la tesis hacia el reemplazo de la banda C por banda L ALOS-2 PALSAR-2 desarrollada en el Anexo D, dado que la mejora marginal accesible mediante cambio de algoritmo es inferior a la mejora estructural accesible mediante cambio de sensor.

**Análisis adicional — sensibilidad a la cardinalidad de clases (Tabla J3).** Dado que el resultado central del ejercicio comparativo es la persistencia del kappa negativo bajo ambos algoritmos en cuatro clases, se ejecutó un análisis complementario que reformula la pregunta: si el problema fuera la dificultad de discriminar la clase intermedia Regular bajo el régimen óptico-SAR banda C, entonces colapsar Regular hacia una de las clases extremas debería elevar la concordancia. Se ejecutaron dos esquemas alternativos sobre las mismas quinientas sesenta y cuatro muestras de entrenamiento: el esquema asimétrico Regular hacia Intacto, que reagrupa las cien muestras NDVI Regular con las ciento veintitrés Intacto sumando doscientas veintitrés, y el esquema asimétrico Regular hacia Degradado, que las reagrupa con las doscientas veinte Degradado sumando trescientas veinte. La validación se realizó sobre las mismas quince parcelas, recodificando la clase estructural de las estaciones Caño Grande y Km22 según el esquema correspondiente.

**Tabla J3. Sensibilidad de la concordancia y del kappa a la cardinalidad de clases.**

| Esquema de clases | Modelo | Concordancia | Kappa |
|---|---|---|---|
| 4 clases (original) | Random Forest | 3/15 = 20.0 % | −0.224 |
| 4 clases (original) | GPBoost OvR | 0/15 = 0.0 % | −0.389 |
| **3 clases, Regular→Intacto** | **Random Forest** | **9/15 = 60.0 %** | **−0.250** |
| 3 clases, Regular→Intacto | GPBoost OvR | 3/15 = 20.0 % | −0.429 |
| 3 clases, Regular→Degradado | Random Forest | 5/15 = 33.3 % | −0.389 |
| 3 clases, Regular→Degradado | GPBoost OvR | 3/15 = 20.0 % | −0.667 |

**Lecturas del análisis de sensibilidad.** Tres conclusiones emergen de la Tabla J3 que precisan cuantitativamente la interpretación del informe. Primero, el esquema asimétrico Regular hacia Intacto triplica la concordancia del Random Forest de veinte por ciento bajo cuatro clases a sesenta por ciento bajo tres clases, mientras que el esquema simétrico Regular hacia Degradado solo la duplica a treinta y tres por ciento. La asimetría direccional del beneficio confirma cuantitativamente la lectura ecológica de la bimodalidad estructural reportada al inicio de este anexo: en CGSM bajo el régimen Hansen y el régimen NDVI, la categoría Regular se comporta como Intacto débil en términos de respuesta espectral integrada, no como categoría intermedia separable entre Intacto y Degradado. Las estaciones Caño Grande y Km22 con áreas basales de entre cuarenta y dos y sesenta y cinco metros cuadrados por hectárea sobre el percentil treinta y tres global son estructuralmente manglar funcional sobre el umbral, no manglar colapsado como Luna con diecisiete metros cuadrados por hectárea, y el clasificador las agrupa con Intacto en lugar de discriminarlas como categoría propia. Segundo, el coeficiente Kappa de Cohen permanece negativo en los seis casos evaluados pese a la mejora aparente de la concordancia bruta, lo cual responde al desbalance de la distribución del ground truth en el conjunto de validación: bajo el esquema Regular hacia Intacto, doce de las quince parcelas son Intacto y solo tres son Degradado, distribución tan desbalanceada que cualquier modelo que prediga la clase mayoritaria por inercia alcanza alta concordancia bruta pero kappa bajo. El sesenta por ciento de Random Forest no traduce capacidad discriminativa genuina sino acierto por estructura marginal. Tercero, el GPBoost se mantiene inferior al Random Forest en los tres esquemas evaluados, lo cual robustece la conclusión central del Anexo J: la sustitución del algoritmo no resuelve la limitación física del régimen óptico-SAR banda C para discriminar el estado estructural del manglar, ni siquiera cuando se simplifica la tarea a tres clases en lugar de cuatro. El componente espacial gaussiano específicamente deteriora el desempeño en los tres escenarios, lo que descarta la hipótesis de que la cardinalidad de clases sea el factor limitante del GPBoost.

**Consecuencia operativa final.** El conjunto convergente de evidencia del Anexo J —concordancia limitada bajo cuatro clases, mejora a costa de información intermedia bajo tres clases, kappa negativo persistente en todos los esquemas, importancia SAR cero en ambos modelos— establece que ni el cambio de algoritmo ni la simplificación de cardinalidad rescatan el clasificador del régimen óptico-SAR banda C utilizado en el presente informe.

**Reproducibilidad.** El script Python `run_gpboost.py` está incluido en `Informe_2/scripts/`. El conjunto de entrenamiento exportado de GEE (`CGSM_GPBoost_Samples_4clases.geojson`), las predicciones por parcela (`gpboost_predictions.csv`), la comparación de importancia por banda (`gpboost_importance.csv`) y las métricas globales (`gpboost_results.json`) están incluidos en `Informe_2/data_anexoJ/`. El script GEE de exportación de las muestras con valores espectrales (`CGSM_GPBoost_Export_Samples.js`) está incluido en `Informe_2/scripts/`.

### Anexo K — Datos de contexto: estaciones permanentes y monitoreo CARICOMP

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

### Anexo L — Tablas detalladas del ejercicio crítico de clasificación estática

Este anexo consolida las diez tablas cuantitativas del ejercicio crítico de clasificación estática reportadas originalmente en las secciones 3.1 a 3.3 del cuerpo de este informe anterior y condensadas en la Tabla 4 del cuerpo principal del presente documento (sección 3.4). Las tablas se preservan aquí en formato detallado para garantizar la trazabilidad cuantitativa completa del giro metodológico hacia la pregunta de detección de cambio descrito en la sección 1.2.

Las primeras cuatro tablas (L1 a L4) corresponden a la clasificación de fusión Sentinel-2 dry + Sentinel-1 wet con cuatro clases ordinales reentrenada y validada contra el monitoreo CARICOMP. Las cuatro tablas siguientes (L5 a L8) corresponden a la clasificación Sentinel-1 SAR lluviosa por sí sola y a su comparación con el Sentinel-2 seco. Las últimas dos tablas (L9 y L10) corresponden al análisis de concordancia espacial píxel a píxel entre los dos productos sobre el AOI completo y sobre el Complejo de Pajarales.

**Tabla L1. Concordancia clase estructural CARICOMP × clase RF de fusión óptico-SAR (5 estaciones × 4 años, n = 20). Esta es la Tabla 3 del cuerpo de este informe original sobre la que se construyeron los análisis de sensibilidad de los Anexos E, G e I. La concordancia global de 9/20 = 45 % es la métrica que el Anexo G prueba como sensible a la elección de umbrales (oscila entre 40 y 50 %), el Anexo E desagrega a 15 parcelas individuales (resulta 22/90 = 24.4 %, kappa = −0.137), y el Anexo I cualifica con el Area of Applicability (63 % del AOI es extrapolación).**

| Estación | Año | BA m²/ha | Densidad (ind/ha) | Clase estructural | Origen del dato | Clase RF (fusión) | Concordancia |
|---|---|---|---|---|---|---|---|
| Aguas Negras | 2020 | 153.8 | 6 017 | Intacto | Interpolación lineal | Intacto | Concuerda |
| Aguas Negras | 2021 | 156.5 | 5 333 | Intacto | Observado | Intacto | Concuerda |
| Aguas Negras | 2022 | 156.5 | 5 333 | Intacto | LOCF 2021 | Regular | Discrepa |
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

**Tabla L2. Áreas (km²) por clase y año sobre el AOI CGSM completo (≈5 053 km²), clasificación de fusión Sentinel-2 dry + Sentinel-1 wet con cuatro clases ordinales. Estas áreas absolutas deben leerse con la salvedad del Anexo I sobre el Area of Applicability: el sesenta y tres por ciento del AOI clasificado se encuentra fuera del envoltorio multivariado de las muestras de entrenamiento, lo que implica que las cifras de cobertura por clase mezclan predicciones interpolativas confiables con predicciones extrapolativas que el clasificador no estaba calificado para emitir.**

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

**Tabla L5. Métricas de validación de la clasificación RF Sentinel-1 lluviosa por año. La exactitud global oscila entre 60.8 % y 71.0 % con Kappa entre 0.412 y 0.564, valores moderados inferiores a los del clasificador Sentinel-2 seca del Informe 1 (OA superior a 80 %). El año 2022 destaca con OA 71.0 % y Kappa 0.564, año que también corresponde a la detección de cambio estructural significativo por BFAST Monitor reportada en la Tabla 1 del cuerpo principal.**

| Año | Imágenes S1 | Exactitud Global (OA) | Kappa de Cohen | Lectura |
|---|---|---|---|---|
| 2020 | 30 | 0.608 | 0.412 | Moderado |
| 2021 | 71 | 0.657 | 0.488 | Moderado |
| **2022** | 58 | **0.710** | **0.564** | **Mejor año** |
| 2023 | 58 | 0.667 | 0.485 | Moderado |

**Tabla L6. Matriz de confusión año 2022 (mejor año), Sentinel-1 lluvioso. El clasificador SAR distingue muy bien la clase manglar degradado —exactitud productor del 91.4 %— pero exhibe confusión sustancial entre no-manglar e intacto. Esta especialización del SAR estático para detectar degradado, no anticipada en el diseño original, constituye un hallazgo metodológico que se desarrolla en la sección 4.1 del cuerpo principal y sustenta la recomendación operativa de combinar óptico como clasificador general con SAR como detector específico de degradación.**

|  | Predicho no-manglar | Predicho intacto | Predicho degradado | Productor |
|---|---|---|---|---|
| Real no-manglar | 17 | 12 | 0 | 58.6 % |
| Real intacto | 16 | 27 | 0 | 62.8 % |
| Real degradado | 3 | 0 | 32 | 91.4 % |
| **Usuario** | 47.2 % | 69.2 % | 100 % | OA = 71.0 % |

**Tabla L7. Importancia agregada (Gini) por banda predictora SAR Sentinel-1 y año. La polarización VV co-pol resulta la variable más informativa para los cuatro años, seguida por VH cross-pol. Este ordenamiento contradice parcialmente la expectativa de la literatura SAR según la cual VH debería dominar la clasificación de vegetación, y sugiere que la respuesta de retrodispersión sobre CGSM está modulada principalmente por las condiciones de superficie del agua intermareal. Este hallazgo se profundiza en el Anexo I donde el RF reentrenado con 18 bandas asigna importancia exactamente cero a las cuatro bandas SAR.**

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

| Año | Ambos no-manglar | Ambos manglar (concordancia +) | Óptico sí, SAR no (omisión SAR) | SAR sí, óptico no (sobreestimación SAR) |
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
| SAR sí, óptico no (sobreestimación SAR) | 116.7 | 20.0 % |

                    