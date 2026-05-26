"""
bfast_bootstrap.py
------------------
Bootstrap CI95 para los breakpoints de BFAST sobre las series mensuales VH
de las cinco estaciones CARICOMP en CGSM (2020-2023).

El modelo armónico-estacional ajustado es

    y(t) = a + b*t + sum_{k=1..K} [c_k cos(2pi k t/12) + d_k sin(2pi k t/12)] + e(t)

y la detección del breakpoint se realiza sobre la serie desestacionalizada
con ruptures.Pelt (penalización tipo BIC). El bootstrap remuestrea los
residuales del modelo armónico para producir un intervalo de confianza de la
fecha del breakpoint por estación.

El script se ejecuta directamente desde la línea de comandos sin argumentos
(las rutas se definen como constantes al inicio). Genera tabla_bootstrap.csv
y bootstrap_results.json en /tmp/bfast_out/.
"""

import pandas as pd
import numpy as np
import ruptures as rpt
import json
import warnings
warnings.filterwarnings('ignore')

SEED = 42
N_BOOT = 300
SERIES_PATH = "/sessions/optimistic-lucid-ptolemy/mnt/PERCEPCION REMOTA/ESTACIONES R/CGSM_VH_mensual_estaciones.csv"
OUT_DIR = '/tmp/bfast_out'

np.random.seed(SEED)

df = pd.read_csv(SERIES_PATH, parse_dates=['date'], date_format='%Y-%m')
df = df.sort_values(['nombre', 'date']).reset_index(drop=True)
print(f"Estaciones: {sorted(df['nombre'].unique())}")
print(f"Ventana: {df['date'].min().date()} – {df['date'].max().date()}")


def harmonic_design(t_idx, K=2, period=12):
    """Matriz de diseño con intercepto, tendencia lineal y K armónicos."""
    X = [np.ones_like(t_idx, dtype=float), t_idx.astype(float)]
    for k in range(1, K + 1):
        X.append(np.cos(2 * np.pi * k * t_idx / period))
        X.append(np.sin(2 * np.pi * k * t_idx / period))
    return np.column_stack(X)


def fit_bfast_lite(y, dates, K=2, period=12, h=0.15):
    """Ajusta el modelo armónico y detecta un breakpoint en la tendencia.

    Devuelve (bp_idx, seasonal, fitted, residuales, betas). bp_idx es None
    cuando PELT no encuentra cambio significativo.
    """
    t = np.arange(len(y))
    X = harmonic_design(t, K=K, period=period)
    beta, _, _, _ = np.linalg.lstsq(X, y, rcond=None)
    fitted = X @ beta
    seasonal_only = X[:, 2:] @ beta[2:]
    deseasoned = y - seasonal_only

    min_size = max(int(h * len(y)), 4)
    bp_idx = None
    try:
        algo = rpt.Pelt(model="l2", min_size=min_size, jump=1).fit(deseasoned)
        bps = algo.predict(pen=np.log(len(y)) * np.var(deseasoned) * 2)
        if len(bps) > 1:
            bp_idx = bps[0]
    except Exception:
        pass

    resid = y - fitted
    return bp_idx, seasonal_only, fitted, resid, beta


def idx_to_year_dec(idx, dates):
    """Convierte un índice de la serie a año decimal (ej. 2022.17 = feb 2022)."""
    if idx is None or idx >= len(dates):
        return None
    d = dates.iloc[idx] if hasattr(dates, 'iloc') else dates[idx]
    return d.year + (d.month - 1) / 12


import os
os.makedirs(OUT_DIR, exist_ok=True)
results = {}

for nombre in sorted(df['nombre'].unique()):
    sub = df[df['nombre'] == nombre].reset_index(drop=True)
    y = sub['mean'].values
    dates = sub['date']

    bp_orig, season, fit, resid, beta = fit_bfast_lite(y, dates)
    bp_year_orig = idx_to_year_dec(bp_orig, dates)

    bp_boot = []
    np.random.seed(SEED)
    for _ in range(N_BOOT):
        eps_b = np.random.choice(resid, size=len(resid), replace=True)
        y_b = fit + eps_b
        bp_b, _, _, _, _ = fit_bfast_lite(y_b, dates)
        if bp_b is not None:
            bp_boot.append(idx_to_year_dec(bp_b, dates))

    bp_boot = np.array([x for x in bp_boot if x is not None])

    if len(bp_boot) > 50:
        ci_lo, ci_hi = np.percentile(bp_boot, [2.5, 97.5])
        p_no_bp = 1.0 - len(bp_boot) / N_BOOT
    else:
        ci_lo, ci_hi = None, None
        p_no_bp = 1.0 - len(bp_boot) / N_BOOT

    results[nombre] = {
        'n_obs': len(y),
        'bp_idx': int(bp_orig) if bp_orig is not None else None,
        'bp_year_orig': bp_year_orig,
        'bp_boot_n': len(bp_boot),
        'ci95_lo': ci_lo,
        'ci95_hi': ci_hi,
        'p_no_bp': p_no_bp,
        'boot_mean': float(np.mean(bp_boot)) if len(bp_boot) else None,
        'boot_sd': float(np.std(bp_boot)) if len(bp_boot) else None,
    }

    print(f"\n{nombre}")
    print(f"  breakpoint original: índice {bp_orig} → año {bp_year_orig}")
    if ci_lo is not None:
        print(f"  CI95 bootstrap: [{ci_lo:.3f}, {ci_hi:.3f}]  "
              f"(media {np.mean(bp_boot):.3f}, sd {np.std(bp_boot):.3f})")
        print(f"  P(sin breakpoint) = {p_no_bp:.3f}")

with open(f'{OUT_DIR}/bootstrap_results.json', 'w') as f:
    json.dump(results, f, indent=2, default=str)

tabla = []
for k, v in results.items():
    tabla.append({
        'estacion': k,
        'breakpoint_anho': f"{v['bp_year_orig']:.3f}" if v['bp_year_orig'] else 'sin BP',
        'CI95': f"[{v['ci95_lo']:.3f}, {v['ci95_hi']:.3f}]" if v['ci95_lo'] else 'no estable',
        'amplitud_meses': f"{(v['ci95_hi'] - v['ci95_lo']) * 12:.1f}" if v['ci95_lo'] else '-',
        'P_no_BP': f"{v['p_no_bp']:.3f}",
    })
tabla_df = pd.DataFrame(tabla)
print("\n=== Tabla bootstrap CI95 por estación ===")
print(tabla_df.to_string(index=False))
tabla_df.to_csv(f'{OUT_DIR}/tabla_bootstrap.csv', index=False)
print(f"\n[OK] resultados en {OUT_DIR}/")
