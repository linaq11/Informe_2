"""
compute_gpboost.py
------------------
Versión inicial del comparativo Random Forest vs GPBoost para el Anexo J. La
versión final que generó las tablas del informe es `run_gpboost.py`, con
coordenadas proyectadas a UTM 18N y los ajustes necesarios para evitar la
terminación silenciosa de gpboost.

Este script se conserva como referencia de la primera implementación. La
diferencia principal con run_gpboost.py reside en que las coordenadas se
pasan en grados (lon, lat WGS84), lo cual funciona en conjuntos pequeños pero
falla con N > 500 porque la matriz de covarianza del proceso gaussiano queda
mal condicionada.

Uso (legado):
    python compute_gpboost.py \\
      --samples aoa_input/CGSM_GPBoost_Samples_4clases.geojson \\
      --parcels aoa_input/CGSM_AoA_ValidationParcels_15.geojson \\
      --out_dir aoa_input/output/

Salidas:
    gpboost_results.json     métricas comparativas RF vs GPBoost
    gpboost_predictions.csv  predicciones sobre las 15 parcelas
    gpboost_importance.csv   importancia por banda
"""
import argparse
import json
import os
import numpy as np
import pandas as pd
import geopandas as gpd
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import cohen_kappa_score, confusion_matrix
import warnings
warnings.filterwarnings('ignore')

BANDS = [
    'B2','B3','B4','B5','B6','B7','B8','B8A','B11','B12',
    'NDVI','NDWI','EVI','BSI',
    'VV','VH','VH_VV_ratio','VV_VH_diff'
]
CLASE_NAMES = {0:'no-manglar', 1:'degradado', 2:'regular', 3:'intacto'}


def train_rf(X, y, n_trees=200):
    rf = RandomForestClassifier(n_estimators=n_trees, random_state=42, n_jobs=-1)
    rf.fit(X, y)
    return rf


def train_gpboost_ovr(X, y, coords, classes):
    """Entrena un modelo GPBoost por clase (One-vs-Rest).
    coords: (N, 2) array con (lon, lat) para el proceso gaussiano.
    Returns: dict {class: gpboost_model}
    """
    import gpboost as gpb
    models = {}
    for c in classes:
        y_bin = (y == c).astype(int)
        if y_bin.sum() < 5:
            print(f'  Clase {c}: solo {y_bin.sum()} muestras, omitiendo')
            continue
        gp_model = gpb.GPModel(gp_coords=coords, cov_function='exponential',
                                likelihood='bernoulli_probit')
        data_train = gpb.Dataset(X, label=y_bin)
        params = {
            'objective': 'binary',
            'learning_rate': 0.05,
            'num_leaves': 31,
            'min_data_in_leaf': 10,
            'verbose': -1,
        }
        bst = gpb.train(params=params, train_set=data_train, gp_model=gp_model,
                        num_boost_round=200)
        models[c] = (bst, gp_model)
        print(f'  Clase {c} ({CLASE_NAMES.get(c,"?")}): {y_bin.sum()} positivas, '
              f'{len(y_bin)-y_bin.sum()} negativas → modelo entrenado')
    return models


def predict_gpboost_ovr(models, X, coords):
    """Predice probabilidad por clase usando los modelos OvR.
    Returns: (n_samples, n_classes) array de probabilidades + array de clases predichas."""
    classes = sorted(models.keys())
    probs = np.zeros((len(X), len(classes)))
    for i, c in enumerate(classes):
        bst, gp_model = models[c]
        pred = bst.predict(data=X, gp_coords_pred=coords,
                           predict_var=False, pred_latent=False)
        # pred es un dict con 'response_mean' como probabilidad bernoulli
        if isinstance(pred, dict):
            probs[:, i] = pred['response_mean']
        else:
            probs[:, i] = pred
    # Clase predicha = argmax de probabilidad (normalizando)
    probs_norm = probs / probs.sum(axis=1, keepdims=True).clip(min=1e-9)
    pred_class_idx = probs_norm.argmax(axis=1)
    pred_class = np.array([classes[i] for i in pred_class_idx])
    return probs_norm, pred_class


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--samples', required=True)
    p.add_argument('--parcels', required=True)
    p.add_argument('--out_dir', required=True)
    args = p.parse_args()
    os.makedirs(args.out_dir, exist_ok=True)

    # 1. Cargar samples
    print('[1/5] Cargando muestras de entrenamiento')
    gdf = gpd.read_file(args.samples)
    n_total = len(gdf)
    # Drop nodata
    mask_valid = gdf[BANDS].notna().all(axis=1)
    gdf = gdf[mask_valid].reset_index(drop=True)
    X = gdf[BANDS].values.astype(np.float32)
    y = gdf['class'].values.astype(int)
    coords = gdf[['lon','lat']].values.astype(np.float64)
    print(f'  n={len(gdf)} de {n_total} totales')
    print(f'  Distribución clase: {dict(pd.Series(y).value_counts().sort_index())}')
    classes_present = sorted(set(y))
    print(f'  Clases presentes: {classes_present}')

    # 2. Train RF
    print('\n[2/5] Entrenando Random Forest baseline')
    rf = train_rf(X, y, n_trees=200)
    imp_rf = dict(zip(BANDS, rf.feature_importances_))
    print(f'  Top 5 bandas RF: {sorted(imp_rf.items(), key=lambda x:-x[1])[:5]}')

    # 3. Train GPBoost OvR
    print('\n[3/5] Entrenando GPBoost OvR')
    gp_models = train_gpboost_ovr(X, y, coords, classes_present)

    # 4. Cargar parcels y predecir 2023 (las bandas del GeoJSON son del año 2023)
    print('\n[4/5] Cargando parcelas DwC-A y prediciendo')
    parc = gpd.read_file(args.parcels)
    parc_valid = parc[BANDS].notna().all(axis=1)
    parc = parc[parc_valid].reset_index(drop=True)
    X_parc = parc[BANDS].values.astype(np.float32)
    coords_parc = np.column_stack([
        parc.geometry.x.values,
        parc.geometry.y.values
    ]).astype(np.float64)
    print(f'  Parcelas válidas: {len(parc)}')

    # RF predicción
    pred_rf = rf.predict(X_parc)

    # GPBoost predicción
    probs_gp, pred_gp = predict_gpboost_ovr(gp_models, X_parc, coords_parc)

    # Ground truth: usar mapping de estación → clase estructural CARICOMP
    GT_MAP = {'ANE': 3, 'CGE': 2, 'KM22': 2, 'LUN': 1, 'RIN': 3}
    parc['gt_class'] = parc['estacion'].map(GT_MAP)
    parc['pred_rf'] = pred_rf
    parc['pred_gp'] = pred_gp
    for i, c in enumerate(sorted(gp_models.keys())):
        parc[f'prob_gp_clase{c}'] = probs_gp[:, i]
    parc['concord_rf'] = (parc['gt_class'] == parc['pred_rf']).astype(int)
    parc['concord_gp'] = (parc['gt_class'] == parc['pred_gp']).astype(int)

    # 5. Resultados
    print('\n[5/5] Calculando métricas comparativas')

    # Concordancia y kappa
    n = len(parc)
    conc_rf = parc['concord_rf'].sum()
    conc_gp = parc['concord_gp'].sum()
    try:
        kappa_rf = cohen_kappa_score(parc['gt_class'], parc['pred_rf'])
    except Exception:
        kappa_rf = None
    try:
        kappa_gp = cohen_kappa_score(parc['gt_class'], parc['pred_gp'])
    except Exception:
        kappa_gp = None

    # ¿Cuántas veces se predijo la clase Regular (2)?
    n_regular_rf = (pred_rf == 2).sum()
    n_regular_gp = (pred_gp == 2).sum()

    results = {
        'n_training': int(len(gdf)),
        'n_parcels': int(n),
        'training_dist': {int(k): int(v) for k,v in pd.Series(y).value_counts().sort_index().items()},
        'concord_rf': f'{int(conc_rf)}/{n} = {100*conc_rf/n:.1f}%',
        'concord_gp': f'{int(conc_gp)}/{n} = {100*conc_gp/n:.1f}%',
        'kappa_rf': round(float(kappa_rf), 4) if kappa_rf is not None else None,
        'kappa_gp': round(float(kappa_gp), 4) if kappa_gp is not None else None,
        'n_predicciones_Regular_RF': int(n_regular_rf),
        'n_predicciones_Regular_GP': int(n_regular_gp),
        'feature_importance_RF': {b: round(float(v),4) for b,v in imp_rf.items()},
    }
    with open(os.path.join(args.out_dir, 'gpboost_results.json'), 'w') as f:
        json.dump(results, f, indent=2)

    # Predicciones por parcela
    cols_out = ['parcela','estacion','gt_class','pred_rf','pred_gp','concord_rf','concord_gp'] \
        + [c for c in parc.columns if c.startswith('prob_gp')]
    parc[cols_out].to_csv(os.path.join(args.out_dir, 'gpboost_predictions.csv'), index=False)

    print('\n=== RESULTADOS COMPARATIVOS ===')
    print(f'  Concordancia RF:    {results["concord_rf"]}, kappa = {kappa_rf}')
    print(f'  Concordancia GP:    {results["concord_gp"]}, kappa = {kappa_gp}')
    print(f'  Predicciones Regular RF: {n_regular_rf}/{n}')
    print(f'  Predicciones Regular GP: {n_regular_gp}/{n}')
    print(f'\n=== PREDICCIONES POR PARCELA ===')
    print(parc[['parcela','estacion','gt_class','pred_rf','pred_gp']].to_string(index=False))
    print(f'\n[OK] Outputs en {args.out_dir}/')


if __name__ == '__main__':
    main()
