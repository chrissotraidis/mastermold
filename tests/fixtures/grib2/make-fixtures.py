"""Builds the small GRIB2 fixtures for tests/polymarket-raw-feed.test.ts with
ECMWF ecCodes (an independent encoder). Run: python make-fixtures.py (needs
pip install eccodes numpy). Outputs *.grib2 plus expected.json."""
import json, os
import numpy as np
import eccodes

HERE = os.path.dirname(os.path.abspath(__file__))
rng = np.random.default_rng(7)

def message(values, ni, nj, la1, lo1, step, packing, extra=()):
    h = eccodes.codes_grib_new_from_samples("regular_ll_sfc_grib2")
    for key, value in [("Ni", ni), ("Nj", nj), ("latitudeOfFirstGridPointInDegrees", la1),
                       ("longitudeOfFirstGridPointInDegrees", lo1),
                       ("latitudeOfLastGridPointInDegrees", la1 - (nj - 1) * step),
                       ("longitudeOfLastGridPointInDegrees", (lo1 + (ni - 1) * step) % 360),
                       ("iDirectionIncrementInDegrees", step), ("jDirectionIncrementInDegrees", step),
                       ("bitsPerValue", 12)]:
        eccodes.codes_set(h, key, value)
    eccodes.codes_set(h, "packingType", packing)
    for key, value in extra:
        eccodes.codes_set(h, key, value)
    eccodes.codes_set_values(h, values.ravel())
    data = eccodes.codes_get_message(h)
    decoded = eccodes.codes_get_values(h)
    eccodes.codes_release(h)
    return data, decoded

expected = {}
ni, nj = 24, 12
field = 280 + 8 * np.sin(np.linspace(0, 3, ni))[None, :] + np.linspace(6, -6, nj)[:, None] + rng.normal(0, 0.8, (nj, ni))
field[4:8, :] = 285.0  # flat rows exercise CCSDS zero blocks
field[10:, :] = rng.uniform(250, 320, (2, ni))  # noisy rows force uncompressed blocks
# Small CCSDS blocks and reference intervals make the fixture cross several RSIs.
for name, packing, extra in [("ccsds", "grid_ccsds", [("ccsdsBlockSize", 8), ("ccsdsRsi", 4)]), ("complex", "grid_complex_spatial_differencing", [])]:
    data, decoded = message(field, ni, nj, 56.0, 354.0, 0.5, packing, extra)
    open(os.path.join(HERE, name + ".grib2"), "wb").write(data)
    expected[name] = {"ni": ni, "nj": nj, "la1": 56.0, "lo1": 354.0, "step": 0.5, "values": [float(v) for v in decoded]}

# Two GFS-like runs around London on lon 358..1.5, lat 53..50.5. Western
# columns (Heathrow) cool by 1 C between runs; eastern columns (City) barely move.
lon_grid, lat_grid = 8, 6
for name, west, east in [("gfs-prev", 289.95, 293.15), ("gfs-curr", 288.95, 293.25)]:
    values = np.where(np.arange(lon_grid)[None, :] < 4, west, east) + rng.normal(0, 0.02, (lat_grid, lon_grid))
    data, decoded = message(values, lon_grid, lat_grid, 53.0, 358.0, 0.5, "grid_complex_spatial_differencing")
    open(os.path.join(HERE, name + ".grib2"), "wb").write(data)
    grid = decoded.reshape(lat_grid, lon_grid)
    expected[name] = {"west_c": float(grid[:, :4].mean()) - 273.15, "east_c": float(grid[:, 4:].mean()) - 273.15}

json.dump(expected, open(os.path.join(HERE, "expected.json"), "w"))
print({k: os.path.getsize(os.path.join(HERE, k + ".grib2")) for k in ["ccsds", "complex", "gfs-prev", "gfs-curr"]})

