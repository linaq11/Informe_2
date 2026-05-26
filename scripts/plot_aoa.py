"""
plot_aoa.py
-----------
Genera la Figura 10 del Anexo I: mapa del Area of Applicability sobre el
AOI CGSM con las 5 estaciones CARICOMP superpuestas como etiquetas amarillas.

Carga la máscara binaria submuestreada a 1/16 de resolución (es solo para
visualización, el raster completo no aporta detalle visible a esa escala) y
sobrepone las coordenadas centroides de cada estación reproyectadas a UTM
18N. El verde indica píxeles dentro del envoltorio multivariado del
clasificador (AoA), el rojo extrapolación.
"""
import rasterio, numpy as np, matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import matplotlib.colors as mcolors
from matplotlib.patches import Patch
from pyproj import Transformer

with rasterio.open('../data_anexoI/aoa_mask_2023.tif') as src:
    H, W = src.height, src.width
    arr = src.read(1, out_shape=(H//16, W//16))
    bounds = src.bounds

cmap = mcolors.ListedColormap(['#d73027', '#1a9850', '#ffffff'])
norm = mcolors.BoundaryNorm([0, 0.5, 1.5, 256], cmap.N)
fig, ax = plt.subplots(figsize=(9, 8))
ax.imshow(arr, cmap=cmap, norm=norm, extent=[bounds.left, bounds.right, bounds.bottom, bounds.top])
ax.set_title('Area of Applicability — CGSM 2023 (Meyer & Pebesma 2021)', fontsize=12, weight='bold')
ax.set_xlabel('Easting (m, EPSG:32618)'); ax.set_ylabel('Northing (m, EPSG:32618)')
ax.legend(handles=[
    Patch(facecolor='#1a9850', label='Dentro AoA (2 347.8 km², 36.8%)'),
    Patch(facecolor='#d73027', label='Extrapolación (4 038.9 km², 63.2%)'),
], loc='lower right', fontsize=9, framealpha=0.95)
tr = Transformer.from_crs('EPSG:4326', 'EPSG:32618', always_xy=True)
for est, lon, lat in [('ANE',-74.6080,10.8099),('CGE',-74.4815,10.8625),
                      ('KM22',-74.5776,10.9778),('LUN',-74.5882,10.9075),
                      ('RIN',-74.4925,10.9624)]:
    x, y = tr.transform(lon, lat)
    ax.annotate(est, (x, y), fontsize=10, weight='bold', ha='center', va='center',
                bbox=dict(boxstyle='round,pad=0.3', fc='yellow', ec='black', alpha=0.9))
plt.tight_layout()
plt.savefig('../figuras/Fig10_AoA_mask_2023.png', dpi=110, bbox_inches='tight')
