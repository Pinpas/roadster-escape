"""Build the Roadster, export public/models/roadster.glb and render art/previews/roadster.png.

    ~/projects/agentbox/scripts/heavy ~/.local/bin/blender -b --factory-startup \\
        --python art/roadster.py -- --out public/models/roadster.glb

Blender works in Z up with the nose on +Y. The glTF exporter turns that into three.js
Y up with the nose on -Z. art/README.md documents the node contract the game reads.
"""

import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import bmesh  # noqa: E402
import bpy  # noqa: E402
from mathutils import Matrix, Vector  # noqa: E402
from mathutils.bvhtree import BVHTree  # noqa: E402

from lib.bake import bake_ao  # noqa: E402
from lib.cli import asset_args, run  # noqa: E402
from lib.export import export_glb  # noqa: E402
from lib.mesh import (  # noqa: E402
    axle_cylinder,
    bevel,
    clear_scene,
    cut,
    cylinder,
    flat_material,
    frame,
    join,
    link,
    loft,
    mesh_object,
    paint,
    rounded_box,
    socket,
    subdivide,
    triangles,
)
from lib.preview import View, render_preview  # noqa: E402
from palette import color  # noqa: E402

WHEEL_RADIUS = 0.36
WHEEL_WIDTH = 0.30
WHEEL_X = 0.83
AXLES = {"f": 1.36, "r": -1.32}
ARCH_RADIUS = 0.41
ARCH_INNER_X = 0.62

# Body cage stations from tail to nose: y, half width, bottom, side shoulder, fender crest, centre top.
BODY = [
    (-2.20, 0.94, 0.24, 0.86, 0.94, 0.94),
    (-2.12, 1.00, 0.20, 0.90, 0.98, 0.98),
    (-1.70, 1.03, 0.19, 0.90, 1.00, 0.98),
    (-1.10, 1.03, 0.18, 0.88, 0.99, 0.96),
    (-0.40, 0.99, 0.17, 0.84, 0.95, 0.92),
    (0.40, 0.99, 0.17, 0.78, 0.89, 0.84),
    (1.20, 1.03, 0.18, 0.72, 0.86, 0.79),
    (1.80, 1.00, 0.19, 0.64, 0.80, 0.72),
    (2.14, 0.92, 0.21, 0.40, 0.46, 0.43),
    (2.22, 0.78, 0.26, 0.32, 0.35, 0.34),
]

# Cabin cage stations from tail to nose: y, half width at the base, half width at the roof, base, roof.
CABIN = [
    (-1.55, 0.60, 0.46, 0.94, 0.99),
    (-1.15, 0.70, 0.54, 0.93, 1.06),
    (-0.55, 0.72, 0.56, 0.90, 1.13),
    (-0.05, 0.72, 0.55, 0.87, 1.15),
    (0.30, 0.68, 0.50, 0.85, 1.02),
    (0.60, 0.58, 0.44, 0.82, 0.86),
]

# Thruster mouths: rear ones by (x, z) on the diffuser, left to right; corner ones by x under the
# tail, left then right; side ones by y along the sill, front to back.
REAR_THRUSTERS = [(-0.54, 0.40), (-0.18, 0.40), (0.18, 0.40), (0.54, 0.40)]
CORNER_THRUSTERS = (("left", -0.82), ("right", 0.82))
CORNER_Y = -1.92
SIDE_THRUSTERS = [0.45, -0.45]
LOWER_BAND = 0.44
TAIL_BAND = 0.66
PLATE_TEXT = "ESC4PE"
SIDE_TILT = math.radians(25)
NOZZLE_OUT = 0.06


def body_ring(y, hw, bottom, shoulder, crest, top):
    right = [
        (0.6 * hw, bottom),
        (0.96 * hw, bottom + 0.05),
        (hw, shoulder),
        (0.84 * hw, crest),
        (0.42 * hw, top),
    ]
    left = [(-x, z) for x, z in reversed(right)]
    return [(x, y, z) for x, z in [(0, bottom), *right, (0, top), *left]]


def cabin_ring(y, base_hw, roof_hw, base, roof):
    right = [(base_hw, base), (0.5 * (base_hw + roof_hw) + 0.04, 0.5 * (base + roof)), (roof_hw, roof)]
    left = [(-x, z) for x, z in reversed(right)]
    return [(x, y, z) for x, z in [(0, base - 0.02), *right, (0, roof + 0.02), *left]]


def build_body(parent, mat):
    body = loft("body", [body_ring(*s) for s in BODY], color("roadster"), [mat], parent)
    # One subdivision level and a low sharp angle keep the panels flat and the creases crisp.
    subdivide(body, 1, sharp_angle=24)
    bevel(body, 0.012, 1, angle=24)
    arch_width = 0.8
    arches = [
        mesh_object(
            "arch",
            axle_cylinder(ARCH_RADIUS, arch_width, 32, (side * (ARCH_INNER_X + arch_width / 2), y, WHEEL_RADIUS)),
            color("trim"),
        )
        for y in AXLES.values()
        for side in (-1, 1)
    ]
    cut(body, arches)

    # Cut the body along the band first, so no face straddles it and the two-tone line runs straight.
    bm = bmesh.new()
    bm.from_mesh(body.data)
    for z in (LOWER_BAND, TAIL_BAND):
        bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], plane_co=(0, 0, z), plane_no=(0, 0, 1))
    bm.to_mesh(body.data)
    bm.free()
    paint(body, color("roadster_lower"), lambda p: p.center.z < LOWER_BAND)
    paint(body, color("trim"), lambda p: p.normal.z < -0.5)
    paint(body, color("roadster_lower"), lambda p: p.normal.y < -0.5 and p.center.z < TAIL_BAND)

    wing = rounded_box("wing", (2.04, 0.46, 0.05), 0.02, 2, color("roadster"), [mat])
    wing.data.transform(Matrix.Translation((0, -1.96, 1.31)) @ Matrix.Rotation(math.radians(-6), 4, "X"))
    struts = [
        rounded_box("strut", (0.05, 0.14, 0.38), 0.02, 2, color("roadster_lower"), [mat])
        for _ in (-1, 1)
    ]
    for strut, side in zip(struts, (-1, 1)):
        strut.data.transform(Matrix.Translation((side * 0.46, -1.96, 1.1)))
    diffuser = rounded_box("diffuser", (1.5, 0.28, 0.3), 0.05, 2, color("trim"), [mat])
    diffuser.data.transform(Matrix.Translation((0, -2.02, 0.4)))
    return join("body", [body, wing, *struts, diffuser], parent)


def build_glass(parent, mat):
    glass = loft("glass", [cabin_ring(*s) for s in CABIN], color("glass"), [mat], parent)
    subdivide(glass, 1, sharp_angle=24)
    bevel(glass, 0.01, 1, angle=24)
    return glass


def cast(bvh, name, origin, direction):
    """Where a ray from `origin` along `direction` hits the body, as (point, normal)."""
    hit, normal, _, _ = bvh.ray_cast(Vector(origin), Vector(direction).normalized())
    if hit is None:
        raise ValueError(f"{name}: the ray from {origin} missed the body")
    return hit, normal


def stick(name, size, rgba, mat, bvh, origin, direction, sink):
    """Seat a rounded pill on the body where a ray from `origin` along `direction` hits it.

    A pill centred on the mirror plane takes a mirrored normal, since a ray at x = 0 lands on
    a seam whose triangles lean a degree either way.
    """
    hit, normal = cast(bvh, name, origin, direction)
    if abs(origin[0]) < 1e-6:
        normal = Vector((0, normal.y, normal.z)).normalized()
    pill = rounded_box(name, size, min(size) * 0.45, 2, rgba, [mat])
    pill.data.transform(frame(hit - normal * sink, normal))
    return pill


def build_lights(parent, mat, bvh):
    heads = [
        stick("head", (0.46, 0.07, 0.08), color("lane_paint"), mat, bvh, (side * 0.6, 3, 0.6), (0, -1, -0.4), 0.03)
        for side in (-1, 1)
    ]
    tail = stick("tail", (1.62, 0.07, 0.08), color("police_red"), mat, bvh, (0, -3, 0.86), (0, 1, 0), 0.0)
    return join("lights", [*heads, tail], parent)


def build_plate(parent, mat, bvh):
    """A plate under the tail bar with our own text, raised a few millimetres off the plate."""
    hit, normal = cast(bvh, "plate", (0, -3, 0.68), (0, 1, 0))
    place = frame(hit - normal * 0.005, normal)
    plate = rounded_box("plate", (0.5, 0.15, 0.03), 0.012, 2, color("lane_paint"), [mat])
    plate.data.transform(place)
    curve = bpy.data.curves.new("plate_text", "FONT")
    curve.body = PLATE_TEXT
    curve.size = 0.1
    curve.align_x = "CENTER"
    curve.align_y = "CENTER"
    curve.extrude = 0.003
    text_obj = link("plate_text", curve)
    text_mesh = bpy.data.meshes.new_from_object(text_obj.evaluated_get(bpy.context.evaluated_depsgraph_get()))
    bpy.data.objects.remove(text_obj)
    bpy.data.curves.remove(curve)
    bm = bmesh.new()
    bm.from_mesh(text_mesh)
    bpy.data.meshes.remove(text_mesh)
    bm.transform(place @ Matrix.Translation((0, 0, 0.02)))
    text = mesh_object("plate_text", bm, color("trim"), [mat])
    return join("plate", [plate, text], parent)


def build_wheel_mesh(mat):
    """One wheel on an X axle, with painted spokes on both faces, so all four wheels share it."""
    bm = axle_cylinder(WHEEL_RADIUS, WHEEL_WIDTH, 24)
    caps = [f for f in bm.faces if abs(f.normal.x) > 0.9]
    for cap in caps:
        bmesh.ops.inset_region(bm, faces=[cap], thickness=0.09)
    bmesh.ops.poke(bm, faces=caps)
    wheel = mesh_object("wheel", bm, color("tyre"), [mat])

    def spoke(p, k):
        hub = abs(p.normal.x) > 0.9 and math.hypot(p.center.y, p.center.z) < WHEEL_RADIUS - 0.09
        return hub and int((math.atan2(p.center.z, p.center.y) % math.tau) / math.tau * 12) % 2 == k

    paint(wheel, color("rim"), lambda p: spoke(p, 0))
    paint(wheel, color("trim"), lambda p: spoke(p, 1))
    bevel(wheel, 0.06, 3, angle=40)
    mesh = wheel.data
    bpy.data.objects.remove(wheel)
    return mesh


def build_nozzle_mesh(shell, mouth):
    """One nozzle with its mouth at the origin, firing along local +Y. The mouth disc uses `mouth`."""
    length = 0.11
    bm = cylinder(0.05, 0.075, length, 10)
    bm.transform(Matrix.Translation((0, -length, 0)))
    cap = next(f for f in bm.faces if f.normal.y > 0.9)
    bmesh.ops.inset_region(bm, faces=[cap], thickness=0.016)
    bmesh.ops.translate(bm, verts=cap.verts, vec=(0, -0.03, 0))
    cap.material_index = 1
    nozzle = mesh_object("nozzle", bm, color("trim"), [shell, mouth])
    paint(nozzle, color("thruster"), lambda p: p.material_index == 1)
    bevel(nozzle, 0.008, 1, angle=40)
    mesh = nozzle.data
    bpy.data.objects.remove(nozzle)
    return mesh


def thruster_matrix(at, thrust):
    """Local +Y along the gas jet. glTF export turns Blender local +Y into local -Z."""
    m = Vector(thrust).to_track_quat("Y", "Z").to_matrix().to_4x4()
    m.translation = Vector(at) + Vector(thrust).normalized() * NOZZLE_OUT
    return m


def build_thrusters(parent, bvh, mesh):
    nodes = []
    for i, (x, z) in enumerate(REAR_THRUSTERS, 1):
        name = f"thruster_rear_{i}"
        hit, _ = cast(bvh, name, (x, -3, z), (0, 1, 0))
        nodes.append(socket(name, parent, mesh, thruster_matrix(hit, (0, -1, 0))))
    for side, x in CORNER_THRUSTERS:
        name = f"thruster_corner_{side}"
        hit, _ = cast(bvh, name, (x, CORNER_Y, -1), (0, 0, 1))
        nodes.append(socket(name, parent, mesh, thruster_matrix(hit, (0, 0, -1))))
    for side, sign in (("left", -1), ("right", 1)):
        for i, y in enumerate(SIDE_THRUSTERS, 1):
            name = f"thruster_{side}_{i}"
            hit, _ = cast(bvh, name, (sign * 0.8, y, -1), (0, 0, 1))
            thrust = (sign * math.sin(SIDE_TILT), 0, -math.cos(SIDE_TILT))
            nodes.append(socket(name, parent, mesh, thruster_matrix(hit, thrust)))
    return nodes


def build():
    clear_scene()
    mats = {
        name: flat_material(name, roughness)
        for name, roughness in [
            ("body", 0.45),
            ("glass", 0.15),
            ("lights", 0.4),
            ("wheel", 0.85),
            ("nozzle", 0.5),
            ("thruster_mouth", 0.4),
        ]
    }
    root = link("roadster")
    chassis = link("chassis", parent=root)
    body = build_body(chassis, mats["body"])
    glass = build_glass(chassis, mats["glass"])
    bvh = BVHTree.FromObject(body, bpy.context.evaluated_depsgraph_get())
    lights = build_lights(chassis, mats["lights"], bvh)
    plate = build_plate(chassis, mats["body"], bvh)
    nozzle = build_nozzle_mesh(mats["nozzle"], mats["thruster_mouth"])
    thrusters = build_thrusters(chassis, bvh, nozzle)
    wheel = build_wheel_mesh(mats["wheel"])
    wheels = [
        socket(f"wheel_{axle}{side}", root, wheel, Matrix.Translation((x, y, WHEEL_RADIUS)))
        for axle, y in AXLES.items()
        for side, x in (("l", -WHEEL_X), ("r", WHEEL_X))
    ]
    bake_ao(
        [body, glass, lights, plate, wheels[0].children[0], thrusters[0].children[0]],
        distance=0.6,
        strength=0.8,
        unlit={"lights", "thruster_mouth"},
    )
    return root


def check(root):
    """Print and enforce the triangle budget and real-world size from docs/ART_DIRECTION.md."""
    meshes = [o for o in root.children_recursive if o.type == "MESH"]
    tris = sum(triangles(o) for o in meshes)
    corners = [o.matrix_world @ Vector(c) for o in meshes for c in o.bound_box]
    lo = Vector(min(c[i] for c in corners) for i in range(3))
    size = Vector(max(c[i] for c in corners) for i in range(3)) - lo
    print(f"roadster: {tris} triangles, {size.y:.2f} m long, {size.x:.2f} m wide, {size.z:.2f} m high")
    problems = []
    if not 6000 <= tris <= 10000:
        problems.append(f"{tris} triangles is outside the 6,000 to 10,000 budget")
    # The wing stands above the 1.15 m roofline.
    if abs(size.y - 4.4) > 0.1 or abs(size.x - 2.0) > 0.06 or not 1.15 <= size.z <= 1.4:
        problems.append(f"size {size.y:.2f} x {size.x:.2f} x {size.z:.2f} m is not about 4.4 x 2.0 x 1.15-1.4 m")
    if abs(lo.z) > 1e-3:
        problems.append(f"the wheels must touch the ground at z=0, the lowest point is {lo.z:.3f}")
    if problems:
        raise ValueError("; ".join(problems))


def main():
    args = asset_args("roadster")
    root = build()
    check(root)
    before, after = export_glb(root, args.out)
    print(f"roadster: {args.out} {before} bytes raw, {after} bytes after meshopt")
    render_preview(
        args.preview,
        [
            View(eye=(-5.6, 6.4, 3.0), target=(0, 0.1, 0.45), lens=58),
            View(eye=(4.6, -6.0, 1.7), target=(0, -0.3, 0.45), lens=58),
            View(eye=(-10, 0, 0.7), target=(0, 0, 0.55), lens=60),
            View(eye=(0, 0, 14), target=(0, 0, 0), lens=60),
            View(eye=(-5.6, 6.4, 3.0), target=(0, 0.1, 0.45), lens=110, pixels=20),
            View(eye=(0, -9.5, 3.6), target=(0, 0, 0.5), lens=110, pixels=20),
        ],
        ground_rgba=color("sand"),
        sky_rgba=color("sky_horizon"),
        columns=3,
    )
    rear = args.preview.with_name("roadster-rear.png")
    render_preview(
        rear,
        [View(eye=(3.6, -6.2, 2.0), target=(0, -0.6, 0.6), lens=55)],
        ground_rgba=color("sand"),
        sky_rgba=color("sky_horizon"),
        columns=1,
    )
    print(f"roadster: preview {args.preview} and {rear}")


if __name__ == "__main__":
    run(main)
