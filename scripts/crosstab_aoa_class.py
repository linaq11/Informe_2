"""
crosstab_aoa_class.py
---------------------
Cruza los rasters de clasificación Random Forest (uno por año) con la máscara
AoA del Anexo I para recalcular las áreas de cobertura separando interpolación
de extrapolación. Constituye el insumo cuantitativo del cierre del Anexo I.

Asunción metodológica: la máscara AoA derivada del stack 2023 se utiliza como
referencia para los cuatro años. Esto se sostiene en que el envoltorio de
entrenamiento del clasificador es el mismo a lo largo del período (las 471
muestras no varían año a año); en estricto rigor habría que recomputar el AoA
por año si el rango espectral del stack variara sustantivamente, pero los
rangos espectrales 2020-2023 son comparables y el costo computacional de
ejecutar el AoA cuatro veces no se justifica.

Uso:
    python crosstab_aoa_class.py \\
        --classifications aoa_input/CGSM_Classification_202{0,1,2,3}.tif \\
        --aoa_mask aoa_input/output/aoa_mask_2023.tif \\
        --out_dir aoa_input/output/

Salidas:
    tabla10_aoa.csv     áreas por clase × año × estatus AoA
    tabla12_aoa.csv     cambio neto inicial→final × estatus AoA
"""
import argparse
import os
import numpy as np
import pandas as pd
import rasterio
from rasterio.warp import reproject, Resampling

CLASE_NAMES = {0: 'no-manglar', 1: 'degradado', 2: 'regular', 3: 'intacto'}


def reproject_to_match(src_path, ref_profile, ref_shape):
    """Reproyecta src para coincidir con el grid de referencia."""
    with rasterio.open(src_path) as src:
        arr = np.full(ref_shape, 255, dtype=np.uint8)
        reproject(
            source=rasterio.band(src, 1),
            destination=arr,
            src_transform=src.transform,
            src_crs=src.crs,
            dst_transform=ref_profile['transform'],
            dst_crs=ref_profile['crs'],
            resampling=Resampling.nearest,
        )
    return arr


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--classifications', nargs='+', required=True,
                   help='4 GeoTIFFs de clasificación (uno por año)')
    p.add_argument('--aoa_mask', required=True)
    p.add_argument('--out_dir', required=True)
    args = p.parse_args()

    os.makedirs(args.out_dir, exist_ok=True)

    # Leer la máscara AoA como referencia de grid
    with rasterio.open(args.aoa_mask) as src:
        aoa = src.read(1)
        ref_profile = src.profile
        ref_shape = aoa.shape
        pix_m2 = abs(ref_profile['transform'][0]) * abs(ref_profile['transform'][4])
    print(f'AoA mask: {ref_shape}, pixel {pix_m2} m²')
    print(f'  Dentro AoA: {(aoa==1).sum():,}  Fuera AoA: {(aoa==0).sum():,}  Nodata: {(aoa==255).sum():,}')

    # Procesar cada año
    rows_tabla10 = []
    classifs = {}
    for path in args.classifications:
        year_str = os.path.basename(path).replace('CGSM_Classification_', '').replace('.tif', '')
        try:
            year = int(year_str)
        except ValueError:
            print(f'  Aviso: nombre de archivo no estándar {path}, saltando')
            continue
        print(f'\n--- Año {year} ---')
        clf = reproject_to_match(path, ref_profile, ref_shape)
        classifs[year] = clf

        for c in [0, 1, 2, 3]:
            m_clase = (clf == c)
            m_dentro = m_clase & (aoa == 1)
            m_fuera = m_clase & (aoa == 0)
            area_total = m_clase.sum() * pix_m2 / 1e6
            area_dentro = m_dentro.sum() * pix_m2 / 1e6
            area_fuera = m_fuera.sum() * pix_m2 / 1e6
            pct_extrap = 100 * area_fuera / area_total if area_total > 0 else 0
            rows_tabla10.append({
                'año': year,
                'clase_code': c,
                'clase_nombre': CLASE_NAMES[c],
                'area_total_km2': round(area_total, 2),
                'area_AoA_dentro_km2': round(area_dentro, 2),
                'area_AoA_fuera_km2': round(area_fuera, 2),
                'pct_extrapolacion': round(pct_extrap, 1),
            })
            print(f'  Clase {c} ({CLASE_NAMES[c]:>10}): total {area_total:>8.1f} km² '
                  f'(dentro {area_dentro:>7.1f}, fuera {area_fuera:>7.1f}, '
                  f'{pct_extrap:>5.1f}% extrap)')

    df10 = pd.DataFrame(rows_tabla10)
    df10.to_csv(os.path.join(args.out_dir, 'tabla10_aoa.csv'), index=False)
    print(f'\n[OK] tabla10_aoa.csv guardado')

    # Tabla 12: cambio entre primer y último año, separado por AoA
    if len(classifs) >= 2:
        years_sorted = sorted(classifs.keys())
        y0, y1 = years_sorted[0], years_sorted[-1]
        clf0 = classifs[y0]
        clf1 = classifs[y1]
        # Mejora estructural = paso a clase superior (0<1<2<3)
        # Degradación = paso a clase inferior
        # Sin cambio = misma clase
        mejora = (clf1 > clf0) & (aoa != 255) & (clf0 != 255) & (clf1 != 255)
        degrad = (clf1 < clf0) & (aoa != 255) & (clf0 != 255) & (clf1 != 255)
        sin_cambio = (clf1 == clf0) & (aoa != 255) & (clf0 != 255) & (clf1 != 255)

        rows_tabla12 = []
        for cat, mask in [('Sin cambio', sin_cambio),
                          ('Mejora estructural', mejora),
                          ('Degradación', degrad)]:
            n_total = mask.sum()
            n_dentro = (mask & (aoa == 1)).sum()
            n_fuera = (mask & (aoa == 0)).sum()
            rows_tabla12.append({
                'categoria': cat,
                'area_total_km2': round(n_total * pix_m2 / 1e6, 2),
                'area_AoA_dentro_km2': round(n_dentro * pix_m2 / 1e6, 2),
                'area_AoA_fuera_km2': round(n_fuera * pix_m2 / 1e6, 2),
                'pct_extrapolacion': round(100 * n_fuera / n_total, 1) if n_total > 0 else 0,
            })
        df12 = pd.DataFrame(rows_tabla12)
        df12.to_csv(os.path.join(args.out_dir, 'tabla12_aoa.csv'), index=False)
        print(f'\nTabla 12 ({y0}→{y1}):')
        print(df12.to_string(index=False))
        print(f'\n[OK] tabla12_aoa.csv guardado')


if __name__ == '__main__':
    main()
