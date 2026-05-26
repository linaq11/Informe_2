"""GPBoost + RF en 3 clases — colapsando Regular → Degradado o → Intacto."""
import os, json, time, sys
os.environ['OMP_NUM_THREADS'] = '2'
import numpy as np
import pandas as pd
import geopandas as gpd
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import cohen_kappa_score
from pyproj import Transformer
import gpboost as gpb
import warnings
warnings.filterwarnings('ignore')

BANDS = ['B2','B3','B4','B5','B6','B7','B8','B8A','B11','B12',
         'NDVI','NDWI','EVI','BSI','VV','VH','VH_VV_ratio','VV_VH_diff']
SAMPLES = '/sessions/optimistic-lucid-ptolemy/mnt/uploads/3CGSM_GPBoost_Samples_4clases.geojson'
PARCELS = '/sessions/optimistic-lucid-ptolemy/mnt/PERCEPCION REMOTA/Informe_2/aoa_input/CGSM_AoA_ValidationParcels_15.geojson'
OUT = '/tmp/gp_3clases'
os.makedirs(OUT, exist_ok=True)
def log(m): print(f'[{time.strftime("%H:%M:%S")}] {m}', flush=True)

# Load data
gdf = gpd.read_file(SAMPLES)
X = gdf[BANDS].values.astype(np.float32)
y = gdf['class'].values.astype(int)
tr = Transformer.from_crs('EPSG:4326','EPSG:32618', always_xy=True)
xs, ys = tr.transform(gdf['lon'].values, gdf['lat'].values)
coords = np.column_stack([(xs-xs.mean())/1000, (ys-ys.mean())/1000]).astype(np.float64)

parc = gpd.read_file(PARCELS)
X_parc = parc[BANDS].values.astype(np.float32)
xs_p, ys_p = tr.transform(parc.geometry.x.values, parc.geometry.y.values)
coords_parc = np.column_stack([(xs_p-xs.mean())/1000, (ys_p-ys.mean())/1000]).astype(np.float64)
GT_BASE = {'ANE':3, 'CGE':2, 'KM22':2, 'LUN':1, 'RIN':3}
parc['gt_4'] = parc['estacion'].map(GT_BASE)

all_results = {}
for scheme_name, collapse_to in [('Regular→Degradado', 1), ('Regular→Intacto', 3)]:
    log(f'\n=== ESQUEMA: {scheme_name} ===')
    y_3 = np.where(y == 2, collapse_to, y)
    gt_3 = parc['gt_4'].apply(lambda v: collapse_to if v == 2 else v)
    log(f'  Train dist: {dict(pd.Series(y_3).value_counts().sort_index())}')

    # RF
    rf = RandomForestClassifier(n_estimators=200, random_state=42, n_jobs=1)
    rf.fit(X, y_3)
    pred_rf = rf.predict(X_parc)
    k_rf = cohen_kappa_score(gt_3, pred_rf)
    c_rf = (gt_3.values == pred_rf).sum()

    # GPBoost OvR sobre 3 clases
    classes_present = sorted(set(y_3))
    probs = np.zeros((len(parc), len(classes_present)))
    for i, c in enumerate(classes_present):
        log(f'  GPBoost clase {c}: arrancando...')
        t0 = time.time()
        y_bin = (y_3 == c).astype(int)
        gp_model = gpb.GPModel(gp_coords=coords, cov_function='exponential', likelihood='bernoulli_probit')
        ds = gpb.Dataset(X, label=y_bin, feature_name=BANDS)
        bst = gpb.train(params={'objective':'binary','verbose':-1,'learning_rate':0.05,
                                'num_leaves':15,'min_data_in_leaf':20,'num_threads':2},
                        train_set=ds, gp_model=gp_model, num_boost_round=10)
        pred_p = bst.predict(data=X_parc, gp_coords_pred=coords_parc, predict_var=False, pred_latent=False)
        probs[:, i] = pred_p['response_mean']
        log(f'    OK en {time.time()-t0:.1f}s')

    probs_norm = probs / probs.sum(axis=1, keepdims=True).clip(min=1e-9)
    pred_gp = np.array([classes_present[i] for i in probs_norm.argmax(axis=1)])
    k_gp = cohen_kappa_score(gt_3, pred_gp)
    c_gp = (gt_3.values == pred_gp).sum()

    log(f'  RF:      concord {c_rf}/15 = {100*c_rf/15:.1f}% | kappa = {k_rf:+.3f}')
    log(f'  GPBoost: concord {c_gp}/15 = {100*c_gp/15:.1f}% | kappa = {k_gp:+.3f}')

    all_results[scheme_name] = {
        'train_dist': {int(k):int(v) for k,v in pd.Series(y_3).value_counts().sort_index().items()},
        'concord_rf': f'{int(c_rf)}/15 = {100*c_rf/15:.1f}%',
        'concord_gp': f'{int(c_gp)}/15 = {100*c_gp/15:.1f}%',
        'kappa_rf': round(float(k_rf),4),
        'kappa_gp': round(float(k_gp),4),
        'pred_rf': pred_rf.tolist(),
        'pred_gp': pred_gp.tolist(),
        'gt_3': gt_3.values.tolist(),
    }

with open(f'{OUT}/gpboost_3clases_results.json','w') as f:
    json.dump(all_results, f, indent=2)
log(f'\nGuardado: {OUT}/gpboost_3clases_results.json')
