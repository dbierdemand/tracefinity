"""Tests for the flat-bottom bin (gridfinity feet replaced by a flat underside).

A flat-bottomed bin keeps its grid footprint -- the same grid width and depth
at the same 42mm pitch -- so it still occupies the cells it claims. Only the
underside changes: there are no feet, so the 4.75mm base height is repurposed
as usable interior depth for tool cutouts and the shell cavity, bounded so
MIN_FLAT_FLOOR_DEPTH of solid floor always remains.
"""
import math

import numpy as np
import pytest

from app.models.schemas import GenerateRequest
from app.services.polygon_scaler import ScaledPolygon
from app.services.stl_generator_manifold import (
    FLAT_BOTTOM_CHAMFER,
    GF_BASE_HEIGHT,
    GF_GRID,
    GF_HEIGHT_UNIT,
    MIN_CUTOUT_DEPTH,
    MIN_FLAT_FLOOR_DEPTH,
    ManifoldSTLGenerator,
    _base_top_z,
    _flat_bottom,
    _is_shelled,
    _max_pocket_depth,
)


def _config(**overrides) -> GenerateRequest:
    defaults = dict(
        grid_x=2,
        grid_y=2,
        height_units=4,
        magnets=False,
        stacking_lip=True,
        bed_size=0,
    )
    defaults.update(overrides)
    return GenerateRequest(**defaults)


def _square_poly(size=20.0, poly_id="tool"):
    return ScaledPolygon(
        id=poly_id,
        points_mm=[(0.0, 0.0), (size, 0.0), (size, size), (0.0, size)],
        label=poly_id,
        finger_holes=[],
        interior_rings_mm=[],
    )


def _max_depth(config: GenerateRequest) -> float:
    return _max_pocket_depth(config, config.height_units * GF_HEIGHT_UNIT)


# ── schema ───────────────────────────────────────────────────────────────────


def test_flat_bottom_defaults_off():
    assert _config().flat_bottom is False


def test_flat_bottom_disables_magnets():
    config = _config(flat_bottom=True, magnets=True)
    assert config.magnets is False


def test_flat_bottom_keeps_half_grid_base():
    # half_grid_base describes the grid footprint (cell pitch, layout
    # snapping), not just the feet, so it stays selectable on a flat bottom
    config = _config(flat_bottom=True, half_grid_base=True)
    assert config.half_grid_base is True
    # and the two compose without magnets
    assert config.magnets is False


def test_flat_bottom_helpers():
    assert _flat_bottom(_config()) is False
    assert _flat_bottom(_config(flat_bottom=True)) is True
    # interior material starts at the feet tops, or at z=0 on a flat bottom
    assert _base_top_z(_config()) == pytest.approx(GF_BASE_HEIGHT)
    assert _base_top_z(_config(flat_bottom=True)) == pytest.approx(0.0)


# ── max cutout depth ─────────────────────────────────────────────────────────


def test_flat_bottom_unlocks_the_foot_height():
    # 4u shelled, no lip: a standard bin tops out at its nominal
    # 1.5 + 7 * 3 = 22.5mm, because its range is height-relative and never
    # spends the 4.75mm base. A flat bottom instead gets the whole 28mm wall
    # less the 2mm floor, so the height the feet occupied becomes usable
    # depth (26mm > 22.5mm).
    standard = _max_depth(_config(shelled=True, flat_bottom=False))
    flat = _max_depth(_config(shelled=True, flat_bottom=True))
    assert standard == pytest.approx(22.5)
    assert flat == pytest.approx(4 * GF_HEIGHT_UNIT - MIN_FLAT_FLOOR_DEPTH)
    assert flat > standard


def test_flat_bottom_keeps_the_lip_deduction_for_solid_bins():
    # solid + stacking lip: the lip notch still eats into the wall top
    assert _max_depth(_config(flat_bottom=True)) == pytest.approx(
        4 * GF_HEIGHT_UNIT - MIN_FLAT_FLOOR_DEPTH - 3.8
    )


def test_flat_bottom_never_leaves_less_than_min_floor():
    # a 1u flat bin is 7mm tall, so 7 - 2 = 5mm is the hard cap even though
    # the nominal height-relative range for a standard bin is only 1.5mm
    assert _max_depth(_config(shelled=True, flat_bottom=True, height_units=1)) == pytest.approx(5.0)


def test_flat_bottom_respects_min_cutout_depth_floor():
    # 1u with a stacking lip: 5 - 3.8 < 0, so the 1.5mm floor holds
    assert _max_depth(_config(flat_bottom=True, height_units=1)) == MIN_CUTOUT_DEPTH


# ── solid geometry ───────────────────────────────────────────────────────────


def test_flat_bottom_has_no_between_feet_grooves(tmp_path):
    """The underside of a flat bin is one continuous face.

    A standard bin's z=0 face is only the bottom taper of each foot, so open
    grooves remain between the feet and the underside covers far less than
    the footprint. A flat bin's z=0 face is one continuous face, inset by
    the chamfer. Asserting against the footprint (rather than a ratio between
    the two bins) also keeps this from passing vacuously if one of the
    geometries went missing.
    """
    gen = ManifoldSTLGenerator()
    footprint = (2 * GF_GRID - 0.5) ** 2
    # the 45° chamfer insets the bottom face on every side
    chamfered = (2 * GF_GRID - 0.5 - 2 * FLAT_BOTTOM_CHAMFER) ** 2

    standard = _config(shelled=False, flat_bottom=False)
    standard_mesh = gen.generate_bin([], standard, str(tmp_path / "std.stl"))[0]

    flat = _config(shelled=False, flat_bottom=True)
    flat_mesh = gen.generate_bin([], flat, str(tmp_path / "flat.stl"))[0]

    assert standard_mesh.is_empty() is False
    assert flat_mesh.is_empty() is False

    standard_bottom_area = _bottom_face_area(standard_mesh)
    flat_bottom_area = _bottom_face_area(flat_mesh)

    # standard: four separate foot pads, most of the underside is open air
    assert standard_bottom_area < footprint * 0.9
    # flat: one continuous face, at the chamfered footprint (rounded corners
    # shave a little off the ideal rectangle)
    assert chamfered * 0.98 < flat_bottom_area < chamfered * 1.02
    assert flat_bottom_area > standard_bottom_area


def _bottom_face_area(mesh) -> float:
    """Total area of downward-facing (z=0) triangles in a mesh."""
    verts = _tri_soup(mesh)
    if verts.size == 0:
        return 0.0
    tri = verts.reshape(-1, 3, 3)
    at_zero = np.all(np.abs(tri[:, :, 2]) < 1e-6, axis=1)
    flat = tri[at_zero]
    if flat.size == 0:
        return 0.0
    p0, p1, p2 = flat[:, 0, :], flat[:, 1, :], flat[:, 2, :]
    cross = (p1[:, 0] - p0[:, 0]) * (p2[:, 1] - p0[:, 1]) - (p2[:, 0] - p0[:, 0]) * (p1[:, 1] - p0[:, 1])
    return float(np.abs(cross).sum() / 2.0)


def _tri_soup(mesh) -> np.ndarray:
    """(N, 9) array of flat triangles from a manifold mesh."""
    data = mesh.to_mesh()
    verts = np.asarray(data.vert_properties, dtype=np.float64)
    tris = np.asarray(data.tri_verts, dtype=np.int64).reshape(-1, 3)
    return verts[tris].reshape(-1, 9)


def test_flat_bottom_is_watertight(tmp_path):
    gen = ManifoldSTLGenerator()
    flat = _config(shelled=False, flat_bottom=True, stacking_lip=True)
    mesh = gen.generate_bin([], flat, str(tmp_path / "flat.stl"))[0]
    assert mesh.is_empty() is False
    assert mesh.genus() == 0


def test_flat_shell_is_watertight(tmp_path):
    gen = ManifoldSTLGenerator()
    flat = _config(shelled=True, flat_bottom=True, stacking_lip=True)
    mesh = gen.generate_bin([], flat, str(tmp_path / "flat_shell.stl"))[0]
    assert mesh.is_empty() is False
    assert mesh.genus() == 0


def test_flat_shell_has_no_open_underside(tmp_path):
    """A flat shell's floor plate must seal the bottom at z=0.

    The standard shell overlaps its plate 0.01mm below the base top; a flat
    bottom has no base top to overlap into, so the plate has to start
    exactly at z=0 or the underside is left open.
    """
    gen = ManifoldSTLGenerator()
    flat = _config(shelled=True, flat_bottom=True, height_units=4)
    mesh = gen.generate_bin([], flat, str(tmp_path / "flat_shell.stl"))[0]

    verts = _tri_soup(mesh)
    assert verts.size > 0
    z_min = float(verts[:, 2::3].min())
    assert z_min == pytest.approx(0.0, abs=1e-6)
    # and there is real material at z=0 (the chamfer's small end), not an
    # open face
    assert _bottom_face_area(mesh) > 1000.0


# ── bottom chamfer ───────────────────────────────────────────────────────────


def test_flat_bottom_is_chamfered(tmp_path):
    """The bottom edge carries a 0.7mm 45° chamfer.

    z=0 is the small end of the chamfer and the footprint is reached again
    at z=FLAT_BOTTOM_CHAMFER, so the widest cross-section at the bottom of
    the bin is measured at the chamfer top, not at z=0.
    """
    gen = ManifoldSTLGenerator()
    flat = _config(shelled=False, flat_bottom=True, stacking_lip=False)
    mesh = gen.generate_bin([], flat, str(tmp_path / "flat.stl"))[0]

    tri = _tri_soup(mesh).reshape(-1, 3, 3)
    assert tri.size > 0
    z = tri[:, :, 2]

    # nothing below z=0
    assert z.min() == pytest.approx(0.0, abs=1e-6)
    # the chamfer top plane exists
    at_top = np.isclose(z, FLAT_BOTTOM_CHAMFER, atol=1e-6).any(axis=1)
    assert at_top.any()
    # and nothing at the chamfer top reaches beyond the outer footprint
    xy_at_top = tri[at_top][:, :, 0:2].reshape(-1, 2)
    assert np.abs(xy_at_top).max() <= (2 * GF_GRID - 0.5) / 2 + 1e-6


def test_flat_shell_is_chamfered(tmp_path):
    """The shelled flat body gets the same chamfer, cut as a wedge."""
    gen = ManifoldSTLGenerator()
    flat = _config(shelled=True, flat_bottom=True, stacking_lip=False)
    mesh = gen.generate_bin([], flat, str(tmp_path / "flat_shell.stl"))[0]

    assert mesh.is_empty() is False
    # still watertight after the wedge subtraction
    assert mesh.genus() == 0

    verts = _tri_soup(mesh)
    z = verts[:, 2::3]
    assert z.min() == pytest.approx(0.0, abs=1e-6)
    assert np.isclose(z, FLAT_BOTTOM_CHAMFER, atol=1e-6).any()


def test_flat_chamfer_is_45_degrees():
    """Equal rise and run makes the chamfer 45°.

    The cutter's frustum starts at (outer - 2c) and opens to the full outer
    footprint over a rise of c, so the run per side equals the rise.
    """
    c = FLAT_BOTTOM_CHAMFER
    outer = 2 * GF_GRID - 0.5
    run_per_side = (outer - (outer - 2 * c)) / 2
    assert run_per_side == pytest.approx(c)
    assert 45.0 == pytest.approx(math.degrees(math.atan2(c, run_per_side)))
