"""
bfast_monitor.py
----------------
Implementación pragmática de BFAST Monitor (Verbesselt et al. 2012) aplicada
a las series mensuales VH de las cinco estaciones CARICOMP en CGSM.

El procedimiento consiste en ajustar un modelo armónico-estacional sobre un
período histórico asumido como estable (2020-2021), proyectar los residuales
sobre el período de monitoreo (2022-2023) y reportar la primera fecha en que
el estadístico MOSUM acumulado cruza el umbral asintótico z = 2.0. Esa fecha
se interpreta como primera alerta de cambio estructural por estación.

Respecto a la implementación canónica `bfast::bfastmonitor()` del paquete R
(Verbesselt et al. 2012), la versión presente omite la selección automática
del período histórico y la reestimación recursiva del modelo armónico, dos
simplificaciones que la hacen menos fiel al algoritmo original. La versión
R, que sí incorpora la reestimación recursiva y es la referencia
metodológica de la literatura, se encuentra implementada en el cuaderno
`bfast_monitor.Rmd` (mismo directorio) y se ejecuta directamente sobre el
contenedor sig_unal sin dependencias adicionales. El presente script Python
se conserva como respaldo reproducible y como contraste numérico de la
versión R.
"""

import pandas as pd
import numpy as np
import json
import os
import warnings
warnings.filterwarnings('ignore')

SERIES_PATH = "/sessions/optimistic-lucid-ptolemy/mnt/PERCEPCION REMOTA/ESTACIONES R/CGSM_VH_mensual_estaciones.csv"
OUT_DIR = '/tmp/bfast_out'
HIST_END = pd.Timestamp('2021-12-31')     # historia 2020-2021
MONITOR_END = pd.Timestamp('2023-12-31')  # monitoreo 2022-2023
ALPHA = 0.05

os.makedirs(OUT_DIR, exist_ok=True)

df = pd.read_csv(SERIES_PATH, parse_dates=['date'], date_format='%Y-%m')
df = df.sort_values(['nombre', 'date']).reset_index(drop=True)


def harmonic_design(t_idx, K=2, period=12):
    X = [np.ones_like(t_idx, dtype=float), t_idx.astype(float)]
    for k in range(1, K + 1):
        X.append(np.cos(2 * np.pi * k * t_idx / period))
        X.append(np.sin(2 * np.pi * k * t_idx / period))
    return np.column_stack(X)


def bfast_monitor(y, dates, hist_end, monitor_end, alpha=0.05, window=6):
    """Ajusta el modelo armónico sobre la historia, calcula MOSUM sobre el
    período de monitoreo y devuelve la primera fecha que cruza el umbral.

    El umbral asintótico z = 2.0 corresponde aproximadamente a un alfa de
    0.05 bajo la distribución límite del MOSUM normalizado por sigma_hist.
    """
    is_hist = dates <= hist_end
    is_monitor = (dates > hist_end) & (dates <= monitor_end)

    t_all = np.arange(len(y))
    X_all = harmonic_design(t_all)
    X_hist = X_all[is_hist.values]
    y_hist = y[is_hist.values]

    if len(y_hist) < 6:
        return None, None

    beta, _, _, _ = np.linalg.lstsq(X_hist, y_hist, rcond=None)
    sigma_hist = np.std(y_hist - X_hist @ beta, ddof=len(beta))

    X_mon = X_all[is_monitor.values]
    y_mon = y[is_monitor.values]
    dates_mon = dates[is_monitor.values].reset_index(drop=True)

    if len(y_mon) == 0 or len(y_mon) < window:
        return None, None

    resid_mon = y_mon - X_mon @ beta

    # MOSUM con ventana de 6 meses
    mosum = np.zeros(len(resid_mon))
    for i in range(window - 1, len(resid_mon)):
        mosum[i] = np.sum(resid_mon[i - window + 1:i + 1]) / (sigma_hist * np.sqrt(window))

    # Umbral asintótico — aprox 2.0 para alpha 0.05
    z_alpha = 2.0
    exceed = np.where(np.abs(mosum) > z_alpha)[0]
    first_alert_idx = exceed[0] if len(exceed) > 0 else None
    first_alert_date = dates_mon.iloc[first_alert_idx] if first_alert_idx is not None else None

    return first_alert_date, mosum


results = {}
for nombre in sorted(df['nombre'].unique()):
    sub = df[df['nombre'] == nombre].reset_index(drop=True)
    y = sub['mean'].values
    dates = sub['date']

    alert, mosum = bfast_monitor(y, dates, HIST_END, MONITOR_END, alpha=ALPHA)

    if alert is not None:
        year_dec = alert.year + (alert.month - 1) / 12
        max_mosum = float(np.max(np.abs(mosum)))
        n_alerts = int(np.sum(np.abs(mosum) > 2.0))
        results[nombre] = {
            'first_alert_date': alert.strftime('%Y-%m'),
            'first_alert_year_dec': round(year_dec, 3),
            'max_mosum': round(max_mosum, 2),
            'n_alerts': n_alerts,
        }
        print(f"{nombre}: alerta {alert.strftime('%Y-%m')} (año {year_dec:.3f}), "
              f"|MOSUM|max = {max_mosum:.2f}, {n_alerts} meses sobre el umbral")
    else:
        max_m = float(np.max(np.abs(mosum))) if mosum is not None else None
        results[nombre] = {'first_alert_date': None, 'max_mosum': max_m}
        print(f"{nombre}: sin alerta en monitoreo 2022-2023. "
              f"|MOSUM|max = {max_m:.2f}" if max_m else f"{nombre}: sin datos suficientes")

# Guardar
with open(f'{OUT_DIR}/monitor_results.json', 'w') as f:
    json.dump(results, f, indent=2)

tabla = []
for k, v in results.items():
    tabla.append({
        'estacion': k,
        'primera_alerta': v.get('first_alert_date', 'sin alerta'),
        'anho_decimal': v.get('first_alert_year_dec', '-'),
        'MOSUM_max': v.get('max_mosum', None),
        'meses_sobre_umbral': v.get('n_alerts', 0),
    })
tabla_df = pd.DataFrame(tabla)
print("\n=== Tabla BFAST Monitor ===")
print(tabla_df.to_string(index=False))
tabla_df.to_csv(f'{OUT_DIR}/tabla_monitor.csv', index=False)
print(f"\n[OK] resultados en {OUT_DIR}/")
