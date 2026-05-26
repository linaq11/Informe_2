"""
compute_aoa.py
--------------
Pipeline del Area of Applicability (Meyer & Pebesma 2021) sobre el stack de
18 bandas Sentinel-2 dry + Sentinel-1 wet 2023 del CGSM.

El stack pesa aproximadamente 3.9 GB distribuidos en dos tiles, por lo cual
el procesamiento se realiza en ventanas de 1024×1024 píxeles para evitar
saturación de memoria. Se acepta un VRT virtual generado al vuelo mediante
`gdalbuildvrt` que une los tiles sin duplicar datos en disco.

Flujo:
  1. Se cargan las muestras de entrenamiento con las 18 bandas ya muestreadas
     desde GEE mediante sampleRegions sobre el stack.
  2. Se entrena un Random Forest de 200 árboles para obtener la importancia
     por banda.
  3. Se deriva el umbral DI por CV espacial de 5 pliegues: percentil 75 de
     los DI de las predicciones correctas fuera de pliegue.
  4. Se recorre el raster en ventanas y se calcula el DI por píxel ponderando
     con la importancia del RF; se escriben dos GeoTIFF: el DI continuo y la
     máscara binaria dentro/fuera del AoA.

Uso típico (ejecución en contenedor sig_unal con cómputo estimado de 30-60
minutos sobre 16 GB de RAM):

    python compute_aoa.py \\
      --stack aoa_input/CGSM_AoA_Stack_2023.vrt \\
      --training aoa_input/CGSM_AoA_TrainingSamples_371.geojson \\
      --parcels aoa_input/CGSM_AoA_ValidationParcels_15.geojson \\
      --out_dir aoa_input/output/ \\
      --window_size 1024

El VRT se crea previamente con:
    gdalbuildvrt CGSM_AoA_Stack_2023.vrt CGSM_AoA_Stack_2023-*.tif

Salidas (peso agregado ~10-50 MB):
    aoa_di_2023.tif       raster continuo del índice de disimilitud
    aoa_mask_2023.tif     máscara binaria 1=dentro / 0=extrapolación
    aoa_thresholds.json   umbral + estadísticos CV + importancia por banda
    aoa_parcels_di.csv    DI de cada una de las 15 parcelas DwC-A
"""
import argparse
import json
import os
import sys
import time
import numpy as np
import pandas as pd
import rasterio
from rasterio.windows import Window
import geopandas as gpd
from sklearn.ensemble import RandomForestClassifier
from sklearn.preprocessing import StandardScaler
from sklearn.model_selection import KFold
from scipy.spatial.distance import cdist
import warnings
warnings.filterwarnings('ignore')

BANDS = [
    'B2','B3','B4','B5','B6','B7','B8','B8A','B11','B12',
    'NDVI','NDWI','EVI','BSI',
    'VV','VH','VH_VV_ratio','VV_VH_diff'
]


def log(msg):
    """Print con timestamp para seguir el progreso."""
    print(f'[{time.strftime("%H:%M:%S")}] {msg}', flush=True)


def derive_threshold_cv(X_train, y_train, weights, k=5):
    """Umbral AoA por CV espacial: percentil 75 de los DI de predicciones
    correctas out-of-fold (Meyer & Pebesma 2021)."""
    scaler = StandardScaler().fit(X_train)
    Xt = scaler.transform(X_train)
    w_sqrt = np.sqrt(weights)
    Xt_w = Xt * w_sqrt
    d_train_mean = cdist(Xt_w, Xt_w).sum() / (len(Xt_w) * (len(Xt_w)-1))

    di_correct = []
    di_incorrect = []
    kf = KFold(n_splits=k, shuffle=True, random_state=42)
    for fold, (tr_idx, te_idx) in enumerate(kf.split(X_train)):
        rf = RandomForestClassifier(n_estimators=100, random_state=42, n_jobs=-1)
        rf.fit(X_train[tr_idx], y_train[tr_idx])
        y_pred = rf.predict(X_train[te_idx])
        # DI of held-out fold against training fold
        Xt_tr = scaler.transform(X_train[tr_idx]) * w_sqrt
        Xt_te = scaler.transform(X_train[te_idx]) * w_sqrt
        d_fold = cdist(Xt_te, Xt_tr).min(axis=1) / d_train_mean
        for i, p in enumerate(y_pred):
            if p == y_train[te_idx[i]]:
                di_correct.append(d_fold[i])
            else:
                di_incorrect.append(d_fold[i])

    thr = float(np.percentile(di_correct, 75))
    return thr, d_train_mean, {
        'n_correct': len(di_correct),
        'n_incorrect': len(di_incorrect),
        'di_correct_p75': thr,
        'di_correct_median': float(np.median(di_correct)),
        'di_incorrect_median': float(np.median(di_incorrect)),
    }, scaler, w_sqrt


def compute_di_window(X_query, Xt_w, w_sqrt, scaler, d_train_mean):
    """Computa DI de un bloque de píxeles contra el set de entrenamiento."""
    Xq = scaler.transform(X_query) * w_sqrt
    BLOCK = 10000
    di = np.full(len(Xq), np.inf, dtype=np.float32)
    for i in range(0, len(Xq), BLOCK):
        d = cdist(Xq[i:i+BLOCK], Xt_w, metric='euclidean')
        di[i:i+BLOCK] = d.min(axis=1).astype(np.float32)
    return di / d_train_mean


def process_raster_windowed(stack_path, out_di_path, out_mask_path,
                             Xt_w, w_sqrt, scaler, d_train_mean, thr,
                             window_size=1024):
    """Procesa el raster por ventanas, escribe DI y máscara AoA."""
    with rasterio.open(stack_path) as src:
        profile = src.profile.copy()
        H, W = src.height, src.width
        nodata = src.nodata if src.nodata is not None else -9999
        log(f'Raster: {H} × {W} píxeles, {src.count} bandas, CRS {src.crs}')

        n_windows = ((H + window_size - 1) // window_size) * \
                    ((W + window_size - 1) // window_size)
        log(f'Procesando en {n_windows} ventanas de {window_size}×{window_size}')

        # Salida DI: float32, nodata = -9999 (forzar GTiff aunque el input sea VRT)
        profile_di = profile.copy()
        profile_di.update(driver='GTiff', count=1, dtype='float32', nodata=-9999.0,
                          compress='deflate', tiled=True,
                          blockxsize=512, blockysize=512)
        # Salida máscara: uint8, nodata = 255
        profile_mask = profile.copy()
        profile_mask.update(driver='GTiff', count=1, dtype='uint8', nodata=255,
                            compress='deflate', tiled=True,
                            blockxsize=512, blockysize=512)

        stats = {'n_dentro':0, 'n_fuera':0, 'n_nodata':0, 'pix_area_m2':
                 abs(profile['transform'][0]) * abs(profile['transform'][4])}

        with rasterio.open(out_di_path, 'w', **profile_di) as dst_di, \
             rasterio.open(out_mask_path, 'w', **profile_mask) as dst_mask:

            wi = 0
            for row_off in range(0, H, window_size):
                for col_off in range(0, W, window_size):
                    wi += 1
                    win_h = min(window_size, H - row_off)
                    win_w = min(window_size, W - col_off)
                    win = Window(col_off, row_off, win_w, win_h)
                    block = src.read(window=win).astype(np.float32)  # (18, h, w)

                    valid = ~np.any(block == nodata, axis=0)
                    valid &= ~np.any(np.isnan(block), axis=0)
                    n_valid = int(valid.sum())

                    di_block = np.full((win_h, win_w), -9999.0, dtype=np.float32)
                    mask_block = np.full((win_h, win_w), 255, dtype=np.uint8)

                    if n_valid > 0:
                        X_pix = block[:, valid].T  # (n_valid, 18)
                        di_vals = compute_di_window(X_pix, Xt_w, w_sqrt,
                                                     scaler, d_train_mean)
                        di_block[valid] = di_vals
                        is_dentro = di_vals <= thr
                        m_temp = np.where(is_dentro, 1, 0).astype(np.uint8)
                        mask_block[valid] = m_temp
                        stats['n_dentro'] += int(is_dentro.sum())
                        stats['n_fuera']  += int((~is_dentro).sum())
                    stats['n_nodata'] += int((win_h*win_w) - n_valid)

                    dst_di.write(di_block, 1, window=win)
                    dst_mask.write(mask_block, 1, window=win)

                    if wi % 20 == 0 or wi == n_windows:
                        pct = 100.0 * wi / n_windows
                        log(f'  Ventana {wi}/{n_windows} ({pct:.1f}%) '
                            f'— dentro {stats["n_dentro"]:,}  fuera {stats["n_fuera"]:,}')

        return stats


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--stack', required=True, help='Path al .vrt o .tif único')
    p.add_argument('--training', required=True, help='GeoJSON 371 muestras')
    p.add_argument('--parcels', required=True, help='GeoJSON 15 parcelas DwC-A')
    p.add_argument('--out_dir', required=True)
    p.add_argument('--window_size', type=int, default=1024)
    args = p.parse_args()

    os.makedirs(args.out_dir, exist_ok=True)

    log('=== AoA pipeline v2 — Meyer & Pebesma 2021 ===')
    log(f'Stack: {args.stack}')
    log(f'Training: {args.training}')
    log(f'Out dir: {args.out_dir}')

    # 1. Cargar training samples (con valores espectrales muestreados en GEE)
    log('[1/5] Cargando muestras de entrenamiento')
    gdf = gpd.read_file(args.training)
    # Verificar bandas
    missing = [b for b in BANDS if b not in gdf.columns]
    if missing:
        log(f'  ERROR: faltan bandas en GeoJSON: {missing}')
        log(f'  Columnas disponibles: {list(gdf.columns)}')
        sys.exit(1)
    X_train = gdf[BANDS].values.astype(np.float32)
    y_train = gdf['class'].values
    # Drop rows con nodata
    mask_valid = ~np.any(np.isnan(X_train), axis=1)
    X_train = X_train[mask_valid]
    y_train = y_train[mask_valid]
    log(f'  n={len(X_train)} muestras válidas (de {len(gdf)} totales)')
    log(f'  Clases: {pd.Series(y_train).value_counts().sort_index().to_dict()}')

    # 2. Entrenar RF e importancia
    log('[2/5] Entrenando RF y extrayendo importancia')
    rf = RandomForestClassifier(n_estimators=200, random_state=42, n_jobs=-1)
    rf.fit(X_train, y_train)
    importance = rf.feature_importances_
    top5 = [(BANDS[i], float(importance[i])) for i in np.argsort(importance)[::-1][:5]]
    log(f'  Top 5 bandas: {top5}')

    # 3. Derivar umbral AoA por CV
    log('[3/5] Derivando umbral AoA (CV k=5)')
    thr, d_train_mean, cv_stats, scaler, w_sqrt = \
        derive_threshold_cv(X_train, y_train, importance, k=5)
    log(f'  Umbral DI = {thr:.4f}')
    log(f'  d_train_mean = {d_train_mean:.4f}')
    log(f'  CV: {cv_stats}')
    Xt_w = scaler.transform(X_train) * w_sqrt

    # 4. Procesar raster por ventanas
    log(f'[4/5] Calculando DI sobre el raster en ventanas de {args.window_size}')
    out_di = os.path.join(args.out_dir, 'aoa_di_2023.tif')
    out_mask = os.path.join(args.out_dir, 'aoa_mask_2023.tif')
    stats = process_raster_windowed(args.stack, out_di, out_mask,
                                     Xt_w, w_sqrt, scaler, d_train_mean, thr,
                                     window_size=args.window_size)

    # 5. Áreas dentro/fuera y guardado
    log('[5/5] Calculando áreas y exportando resultados')
    area_dentro_km2 = stats['n_dentro'] * stats['pix_area_m2'] / 1e6
    area_fuera_km2 = stats['n_fuera'] * stats['pix_area_m2'] / 1e6
    total_valid = stats['n_dentro'] + stats['n_fuera']
    pct_dentro = 100.0 * stats['n_dentro'] / total_valid if total_valid else 0

    # DI de las 15 parcelas de validación
    parc = gpd.read_file(args.parcels)
    if all(b in parc.columns for b in BANDS):
        X_parc = parc[BANDS].values.astype(np.float32)
        m_ok = ~np.any(np.isnan(X_parc), axis=1)
        if m_ok.any():
            di_parc = compute_di_window(X_parc[m_ok], Xt_w, w_sqrt,
                                          scaler, d_train_mean)
            parc_out = parc[m_ok].copy()
            parc_out['di'] = di_parc
            parc_out['within_aoa'] = (di_parc <= thr).astype(int)
            parc_out[['parcela','estacion','di','within_aoa']].to_csv(
                os.path.join(args.out_dir, 'aoa_parcels_di.csv'), index=False)
            log(f'  Parcelas dentro del AoA: {parc_out["within_aoa"].sum()}/{len(parc_out)}')
    else:
        log('  Aviso: parcelas no traen bandas espectrales, omitiendo aoa_parcels_di.csv')

    # JSON con todo
    results = {
        'umbral_DI': thr,
        'd_train_mean': float(d_train_mean),
        'cv_stats': cv_stats,
        'feature_importance': dict(zip(BANDS, [float(x) for x in importance])),
        'n_pixels_dentro': stats['n_dentro'],
        'n_pixels_fuera': stats['n_fuera'],
        'n_pixels_nodata': stats['n_nodata'],
        'area_dentro_km2': area_dentro_km2,
        'area_fuera_km2': area_fuera_km2,
        'pct_dentro': pct_dentro,
        'pixel_area_m2': stats['pix_area_m2'],
    }
    with open(os.path.join(args.out_dir, 'aoa_thresholds.json'), 'w') as f:
        json.dump(results, f, indent=2)

    log('=== RESULTADOS ===')
    log(f'  Área dentro AoA:  {area_dentro_km2:>10.1f} km²  ({pct_dentro:.1f}%)')
    log(f'  Área extrapolación: {area_fuera_km2:>10.1f} km²  ({100-pct_dentro:.1f}%)')
    log(f'  Outputs en {args.out_dir}/')
    log('  Pasa estos 4 archivos a Claude para cerrar el Anexo I:')
    log('    aoa_di_2023.tif, aoa_mask_2023.tif, aoa_thresholds.json, aoa_parcels_di.csv')


if __name__ == '__main__':
    main()
