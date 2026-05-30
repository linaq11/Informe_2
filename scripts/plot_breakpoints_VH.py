# -*- coding: utf-8 -*-
"""
Genera Fig11_breakpoints_VH.png: panel 5 estaciones con la serie VH mensual
(Sentinel-1 banda C) y la fecha de primera alerta BFAST Monitor + IC95 bootstrap.

Entradas:
  ../ESTACIONES R/CGSM_VH_mensual_estaciones.csv  (relativo al repo)
  data/tabla_monitor_R.csv
  data/tabla_bootstrap.csv

Salida:
  figuras/Fig11_breakpoints_VH.png
"""

from pathlib import Path
import pandas as pd
import matplotlib.pyplot as plt
import matplotlib.dates as mdates
from datetime import datetime

REPO = Path(__file__).resolve().parents[1]
PR_ROOT = REPO.parent  # PERCEPCION REMOTA folder, where ESTACIONES R lives
VH_CSV = PR_ROOT / "ESTACIONES R" / "CGSM_VH_mensual_estaciones.csv"
MON_CSV = REPO / "data" / "tabla_monitor_R.csv"
BOOT_CSV = REPO / "data" / "tabla_bootstrap.csv"
OUT = REPO / "figuras" / "Fig11_breakpoints_VH.png"


def year_dec_to_date(y):
    if pd.isna(y) or y == "-":
        return None
    y = float(y)
    year = int(y)
    frac = y - year
    days = int(round(frac * 365.25))
    return pd.Timestamp(year=year, month=1, day=1) + pd.Timedelta(days=days)


def parse_ic(ic):
    if ic == "no estable" or pd.isna(ic):
        return None, None
    low, high = ic.strip("[]").split(",")
    return year_dec_to_date(low.strip()), year_dec_to_date(high.strip())


def main():
    vh = pd.read_csv(VH_CSV)
    vh["date"] = pd.to_datetime(vh["date"] + "-01")
    mon = pd.read_csv(MON_CSV)
    boot = pd.read_csv(BOOT_CSV)

    name_order = ["Aguas_Negras", "Luna", "Rinconada", "Km22", "Cano_Grande"]
    pretty = {
        "Aguas_Negras": "Aguas Negras (ANE)",
        "Luna": "Luna (LUN)",
        "Rinconada": "Rinconada (RIN)",
        "Km22": "Km22 (KM22)",
        "Cano_Grande": "Caño Grande (CGE)",
    }

    fig, axes = plt.subplots(5, 1, figsize=(11, 12), sharex=True)
    history_start = pd.Timestamp("2020-01-01")
    history_end = pd.Timestamp("2021-12-31")
    monitor_start = pd.Timestamp("2022-01-01")
    monitor_end = pd.Timestamp("2023-12-31")

    for i, station in enumerate(name_order):
        ax = axes[i]
        s = vh[vh["nombre"] == station].sort_values("date")
        ax.plot(s["date"], s["mean"], color="#1f78b4", linewidth=1.2,
                marker="o", markersize=3, label="VH mensual (dB)")

        # Sombreado de períodos
        ax.axvspan(history_start, history_end, color="#c8d6e5", alpha=0.35,
                   label="Histórico 2020-2021")
        ax.axvspan(monitor_start, monitor_end, color="#ffeaa7", alpha=0.35,
                   label="Monitoreo 2022-2023")

        # Breakpoint primera alerta R
        m_row = mon[mon["estacion"] == station].iloc[0]
        bp_date = year_dec_to_date(m_row["primera_alerta_year_dec"])
        magnitud = m_row["magnitud"]
        ax.axvline(bp_date, color="#e74c3c", linewidth=2.0,
                   label=f"Breakpoint R · {bp_date.strftime('%b %Y')}")

        # IC95 bootstrap
        b_row = boot[boot["estacion"] == station].iloc[0]
        low, high = parse_ic(b_row["CI95"])
        if low is not None and high is not None:
            ax.axvspan(low, high, color="#e74c3c", alpha=0.12,
                       label=f"IC95 bootstrap [{low.strftime('%b %y')}, {high.strftime('%b %y')}]")

        # Anotación de magnitud
        ymin, ymax = s["mean"].min() - 0.5, s["mean"].max() + 0.5
        ax.set_ylim(ymin, ymax)
        ax.text(bp_date, ymax - 0.3, f" ΔdB = {magnitud:.2f}",
                color="#c0392b", fontsize=9, fontweight="bold",
                verticalalignment="top")

        ax.set_title(pretty[station], loc="left", fontsize=11, fontweight="bold")
        ax.set_ylabel("VH (dB)", fontsize=9)
        ax.grid(True, alpha=0.25)
        ax.tick_params(axis="both", labelsize=8)
        if i == 0:
            ax.legend(loc="lower right", fontsize=7, ncol=2,
                      framealpha=0.85)

    axes[-1].xaxis.set_major_locator(mdates.YearLocator())
    axes[-1].xaxis.set_minor_locator(mdates.MonthLocator(bymonth=[4, 7, 10]))
    axes[-1].xaxis.set_major_formatter(mdates.DateFormatter("%Y"))
    axes[-1].set_xlabel("Fecha", fontsize=10)

    fig.suptitle(
        "Series mensuales VH (Sentinel-1 banda C) y primera alerta BFAST Monitor\n"
        "Período histórico 2020-2021 · Monitoreo 2022-2023 · α = 0.05",
        fontsize=12, fontweight="bold", y=0.995,
    )
    fig.tight_layout(rect=[0, 0, 1, 0.97])
    OUT.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(OUT, dpi=140, bbox_inches="tight")
    print(f"OK -> {OUT}")


if __name__ == "__main__":
    main()
