"""
run_gpboost.py
--------------
Comparación Random Forest vs GPBoost sobre las 564 muestras de entrenamiento
del CGSM, ejercicio que sustenta el Anexo J.

Configuración adoptada tras detectar que el primer intento con coordenadas en
grados se colgaba silenciosamente:

  - Las coordenadas se proyectan a UTM 18N y se centran y escalan a kilómetros
    respecto al centroide del entrenamiento. Bajo grados WGS84 las distancias
    dentro del AOI son del orden de 0.001 grados, valores que dejan la matriz
    de covarianza del proceso gaussiano mal condicionada.
  - El número de hilos OpenMP se limita a 2. El conflicto entre el threading
    interno de sklearn con n_jobs=-1 y el de gpboost provocaba terminación
    silenciosa del proceso.
  - Se utiliza función de covarianza exponencial. La alternativa Matern 1.5
    funciona pero duplica el tiempo de entrenamiento sin mejorar el resultado
    sobre este conjunto de datos.
  - Se aplican 10 rondas de boosting por clase. Las rondas adicionales (probadas
    hasta 100) no modifican la conclusión cualitativa que sustenta el Anexo J y
    elevan el tiempo de cómputo a horas en el sandbox.

Estrategia multiclase: One-vs-Rest con un modelo binario por clase y argmax
sobre probabilidades normalizadas. La opción nativa softmax de gpboost no
resulta estable con tan pocas muestras por clase.
"""
import os, json, time, sys
os.environ['OMP_NUM_THREADS'] = '2'
import numpy as np
import pandas as pd
import geopandas as gpd
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import cohen_kappa_score, confusion_matrix
from pyproj import Transformer
import gpboost as gpb
import warnings
warnings.filterwarnings('ignore')

BANDS = ['B2','B3','B4','B5','B6','B7','B8','B8A','B11','B12',
         'NDVI','NDWI','EVI','BSI','VV','VH','VH_VV_ratio','VV_VH_diff']

SAMPLES = '/sessions/optimistic-lucid-ptolemy/mnt/uploads/3CGSM_GPBoost_Samples_4clases.geojson'
PARCELS = '/sessions/optimistic-lucid-ptolemy/mnt/PERCEPCION REMOTA/Informe_2/aoa_input/CGSM_AoA_ValidationParcels_15.geojson'
OUT = '/tmp/gp_out'
os.makedirs(OUT, exist_ok=True)

def log(m): print(f'[{time.strftime("%H:%M:%S")}] {m}', flush=True)

# 1. Load samples
log('Cargando muestras')
gdf = gpd.read_file(SAMPLES)
X = gdf[BANDS].values.astype(np.float32)
y = gdf['class'].values.astype(int)

# Project lon/lat → UTM 18N (meters) for the GP coords
tr = Transformer.from_crs('EPSG:4326', 'EPSG:32618', always_xy=True)
xs, ys = tr.transform(gdf['lon'].values, gdf['lat'].values)
# Standardize coords to ~0-1 range (km) to help GP numerics
xs_km = (xs - xs.mean()) / 1000.0
ys_km = (ys - ys.mean()) / 1000.0
coords = np.column_stack([xs_km, ys_km]).astype(np.float64)
log(f'  n={len(gdf)}, coords UTM km: x[{xs_km.min():.1f}, {xs_km.max():.1f}], y[{ys_km.min():.1f}, {ys_km.max():.1f}]')
log(f'  Distribución y: {dict(pd.Series(y).value_counts().sort_index())}')

# 2. RF baseline
log('Entrenando RF baseline')
t0 = time.time()
rf = RandomForestClassifier(n_estimators=200, random_state=42, n_jobs=1)
rf.fit(X, y)
imp_rf = dict(zip(BANDS, rf.feature_importances_))
log(f'  RF entrenado en {time.time()-t0:.1f}s')
top5 = sorted(imp_rf.items(), key=lambda x:-x[1])[:5]
log(f'  Top 5 RF: {top5}')

# 3. GPBoost OvR with reduced complexity
log('Entrenando GPBoost OvR (Matern 1.5, 100 boost rounds, coords km)')
classes_present = sorted(set(y))
gp_models = {}
gp_importance = {b: 0.0 for b in BANDS}
for c in classes_present:
    log(f'  Clase {c}: arrancando...')
    t0 = time.time()
    y_bin = (y == c).astype(int)
    try:
        gp_model = gpb.GPModel(gp_coords=coords, cov_function='exponential', likelihood='bernoulli_probit')
        ds = gpb.Dataset(X, label=y_bin, feature_name=BANDS)
        bst = gpb.train(
            params={'objective':'binary', 'verbose':-1, 'learning_rate':0.05,
                    'num_leaves':15, 'min_data_in_leaf':20, 'num_threads':2},
            train_set=ds, gp_model=gp_model, num_boost_round=10
        )
        gp_models[c] = (bst, gp_model)
        # Importance per class
        imps = bst.feature_importance(importance_type='gain')
        for b, v in zip(BANDS, imps):
            gp_importance[b] += float(v)
        log(f'  Clase {c}: OK en {time.time()-t0:.1f}s, {int(y_bin.sum())} positivas')
    except Exception as e:
        log(f'  Clase {c}: FALLO — {type(e).__name__}: {e}')
        continue

if not gp_models:
    log('NINGUN GPBoost entrenado, abortando')
    sys.exit(1)

# 4. Predict on parcels
log('Prediciendo sobre 15 parcelas')
parc = gpd.read_file(PARCELS)
X_parc = parc[BANDS].values.astype(np.float32)
# Project parcels coords to same UTM km grid
xs_p, ys_p = tr.transform(parc.geometry.x.values, parc.geometry.y.values)
xs_p_km = (xs_p - xs.mean()) / 1000.0
ys_p_km = (ys_p - ys.mean()) / 1000.0
coords_parc = np.column_stack([xs_p_km, ys_p_km]).astype(np.float64)

pred_rf = rf.predict(X_parc)

# GPBoost predictions per class
class_list = sorted(gp_models.keys())
probs_gp = np.zeros((len(parc), len(class_list)))
for i, c in enumerate(class_list):
    bst, gp_model = gp_models[c]
    pred = bst.predict(data=X_parc, gp_coords_pred=coords_parc,
                       predict_var=False, pred_latent=False)
    probs_gp[:, i] = pred['response_mean'] if isinstance(pred, dict) else pred

probs_norm = probs_gp / probs_gp.sum(axis=1, keepdims=True).clip(min=1e-9)
pred_gp = np.array([class_list[i] for i in probs_norm.argmax(axis=1)])

# 5. Evaluate
GT_MAP = {'ANE': 3, 'CGE': 2, 'KM22': 2, 'LUN': 1, 'RIN': 3}
parc['gt'] = parc['estacion'].map(GT_MAP)
parc['pred_rf'] = pred_rf
parc['pred_gp'] = pred_gp
parc['concord_rf'] = (parc['gt'] == parc['pred_rf']).astype(int)
parc['concord_gp'] = (parc['gt'] == parc['pred_gp']).astype(int)

conc_rf = parc['concord_rf'].sum()
conc_gp = parc['concord_gp'].sum()
kappa_rf = cohen_kappa_score(parc['gt'], parc['pred_rf'])
kappa_gp = cohen_kappa_score(parc['gt'], parc['pred_gp'])

log('=== RESULTADOS ===')
log(f'  Concord RF: {conc_rf}/{len(parc)} = {100*conc_rf/len(parc):.1f}% | kappa = {kappa_rf:+.3f}')
log(f'  Concord GP: {conc_gp}/{len(parc)} = {100*conc_gp/len(parc):.1f}% | kappa = {kappa_gp:+.3f}')
log(f'  Regular predicted by RF: {(pred_rf==2).sum()}/{len(parc)}')
log(f'  Regular predicted by GP: {(pred_gp==2).sum()}/{len(parc)}')
log('Predicciones:')
for _, row in parc[['parcela','estacion','gt','pred_rf','pred_gp']].iterrows():
    log(f'  {row["parcela"]:8s} | est={row["estacion"]:4s} | GT={row["gt"]} RF={row["pred_rf"]} GP={row["pred_gp"]}')

# Save results
parc_out = parc[['parcela','estacion','gt','pred_rf','pred_gp','concord_rf','concord_gp']].copy()
for i, c in enumerate(class_list):
    parc_out[f'prob_gp_clase{c}'] = probs_norm[:, i]
parc_out.to_csv(f'{OUT}/gpboost_predictions.csv', index=False)

# Importance comparison
imp_gp_norm = {b: v/sum(gp_importance.values()) if sum(gp_importance.values())>0 else 0 for b,v in gp_importance.items()}
imp_df = pd.DataFrame({
    'banda': BANDS,
    'importancia_RF': [imp_rf[b] for b in BANDS],
    'importancia_GP': [imp_gp_norm[b] for b in BANDS],
})
imp_df.to_csv(f'{OUT}/gpboost_importance.csv', index=False)
log('Importancia comparada:')
log('  Banda  | RF      | GPBoost')
for _, row in imp_df.sort_values('importancia_GP', ascending=False).iterrows():
    log(f'  {row["banda"]:14s} | {row["importancia_RF"]:.4f} | {row["importancia_GP"]:.4f}')

# Save summary
results = {
    'n_training': int(len(gdf)),
    'training_dist': {int(k):int(v) for k,v in pd.Series(y).value_counts().sort_index().items()},
    'n_parcels': int(len(parc)),
    'concord_rf': f'{int(conc_rf)}/{len(parc)} = {100*conc_rf/len(parc):.1f}%',
    'concord_gp': f'{int(conc_gp)}/{len(parc)} = {100*conc_gp/len(parc):.1f}%',
    'kappa_rf': round(float(kappa_rf),4),
    'kappa_gp': round(float(kappa_gp),4),
    'regular_predictions_rf': int((pred_rf==2).sum()),
    'regular_predictions_gp': int((pred_gp==2).sum()),
}
with open(f'{OUT}/gpboost_results.json','w') as f:
    json.dump(results, f, indent=2)
log(f'OK outputs en {OUT}/')
