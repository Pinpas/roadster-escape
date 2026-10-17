"""Build the police car, three traffic cars and a roadblock, export each to public/models/ and
render a two-view preview of each to art/previews/.

    ~/projects/agentbox/scripts/heavy ~/.local/bin/blender -b --factory-startup \\
        --python art/fleet.py

Blender works in Z up with the nose on +Y; three.js receives Y up with the nose on -Z.
Every car has a root named after it holding a `body` mesh, wheel sockets `wheel_<axle><l|r>` that spin about local X, and
flat materials named by role. art/README.md documents the node contract.
"""

import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from mathutils import Matrix  # noqa: E402

from lib.bake import bake_ao  # noqa: E402
from lib.cli import REPO, run  # noqa: E402
from lib.export import GLTF_TRANSFORM  # noqa: E402
from lib.export import export_glb  # noqa: E402
from lib.kit import box, check, wheel_mesh, wheels  # noqa: E402
from lib.mesh import clear_scene, cylinder, flat_material, join, link, mesh_object  # noqa: E402
from lib.preview import View, render_preview  # noqa: E402
from palette import color, hex_color  # noqa: E402


BLACK = hex_color("#1f1d29")
CREAM = hex_color("#f2e2bf")


def materials():
    names = [("body", 0.5), ("glass", 0.15), ("lights", 0.4), ("wheel", 0.85), ("lightbar_red", 0.3), ("lightbar_blue", 0.3)]
    return {name: flat_material(name, rough) for name, rough in names}


def police(m):
    """A chunky, goofy black-and-cream sedan with an oversized light bar."""
    root = link("police")
    body = join(
        "body",
        [
            box("shell", (2.06, 4.7, 0.72), (0, 0, 0.66), 0.28, BLACK, m["body"]),
            box("doors", (2.12, 2.2, 0.44), (0, -0.1, 0.72), 0.16, CREAM, m["body"]),
            box("roof", (1.66, 1.8, 0.1), (0, -0.3, 1.66), 0.05, CREAM, m["body"]),
            box("bar_base", (1.3, 0.44, 0.12), (0, -0.25, 1.76), 0.05, BLACK, m["body"]),
            box("grille", (2.0, 0.34, 0.3), (0, 2.38, 0.46), 0.1, BLACK, m["body"]),
            box("bumper", (2.0, 0.3, 0.24), (0, -2.38, 0.46), 0.1, BLACK, m["body"]),
        ],
        root,
    )
    glass = box("glass", (1.74, 2.2, 0.62), (0, -0.3, 1.32), 0.26, color("glass"), m["glass"])
    glass.parent = root
    lights = join(
        "lights",
        [
            box("tail", (1.6, 0.06, 0.08), (0, -2.36, 0.9), 0.03, color("police_red"), m["lights"]),
            box("head_l", (0.4, 0.06, 0.12), (-0.62, 2.36, 0.8), 0.03, color("lane_paint"), m["lights"]),
            box("head_r", (0.4, 0.06, 0.12), (0.62, 2.36, 0.8), 0.03, color("lane_paint"), m["lights"]),
        ],
        root,
    )
    red = box("lightbar_red", (0.6, 0.38, 0.22), (-0.32, -0.25, 1.92), 0.09, color("police_red"), m["lightbar_red"])
    blue = box("lightbar_blue", (0.6, 0.38, 0.22), (0.32, -0.25, 1.92), 0.09, color("police_blue"), m["lightbar_blue"])
    red.parent = blue.parent = root
    wheel = wheel_mesh(0.42, 0.38, m["wheel"], color("tyre"), CREAM)
    w = wheels(root, wheel, 0.42, 0.92, {"f": 1.5, "r": -1.5})
    bake_ao([body, glass, lights, w[0].children[0]], distance=0.6, strength=0.8, unlit={"lights", "lightbar_red", "lightbar_blue"})
    return root, (1500, 6000), (2.22, 5.08, 2.03)


def car(m, name, shell, cabin, paint_rgba, track, radius, axles):
    """A two-box traffic car: a shell, a cabin in the body colour, and a darker window band."""
    (sw, sl, sh), (cw, cl, ch, cy) = shell, cabin
    root = link(name)
    base = radius * 0.95
    body = join(
        "body",
        [
            box("shell", (sw, sl, sh), (0, 0, base + sh / 2), 0.22, paint_rgba, m["body"]),
            box("cabin", (cw, cl, ch), (0, cy, base + sh + ch / 2 - 0.04), 0.2, paint_rgba, m["body"]),
            box("bumper", (sw - 0.1, 0.24, 0.2), (0, -sl / 2, base + 0.06), 0.08, color("trim"), m["body"]),
        ],
        root,
    )
    glass = box("glass", (cw + 0.04, cl + 0.04, ch * 0.62), (0, cy, base + sh + ch / 2 - 0.02), 0.12, color("glass"), m["glass"])
    glass.parent = root
    lights = join(
        "lights",
        [
            box("tail", (sw - 0.3, 0.05, 0.08), (0, -sl / 2 - 0.01, base + sh * 0.75), 0.02, color("police_red"), m["lights"]),
            box("head", (sw - 0.5, 0.05, 0.08), (0, sl / 2 + 0.01, base + sh * 0.6), 0.02, color("lane_paint"), m["lights"]),
        ],
        root,
    )
    wheel = wheel_mesh(radius, 0.28, m["wheel"], color("tyre"), color("rim"), spokes=4)
    w = wheels(root, wheel, radius, track, axles)
    bake_ao([body, glass, lights, w[0].children[0]], distance=0.6, strength=0.8, unlit={"lights"})
    return root


def hatch(m):
    root = car(m, "hatch", (1.9, 3.9, 0.62), (1.62, 2.2, 0.62, -0.78), hex_color("#8fa39a"), 0.86, 0.36, {"f": 1.1, "r": -1.1})
    return root, (600, 4000), (2.0, 4.03, 1.52)


def suv(m):
    root = car(m, "suv", (1.95, 4.8, 0.78), (1.7, 3.0, 0.8, -0.4), hex_color("#a7b4c2"), 0.9, 0.4, {"f": 1.5, "r": -1.5})
    return root, (600, 4000), (2.08, 4.93, 1.92)


def semi(m):
    """A long box truck: cab up front, a pale trailer behind, three axles."""
    root = link("semi")
    cab_rgba = hex_color("#cbb79a")
    body = join(
        "body",
        [
            box("cab", (2.5, 2.4, 2.6), (0, 6.2, 1.9), 0.3, cab_rgba, m["body"]),
            box("trailer", (2.6, 11.6, 3.4), (0, -1.5, 2.35), 0.15, hex_color("#e6dfd2"), m["body"]),
            box("chassis", (2.2, 14.5, 0.35), (0, 0, 0.6), 0.1, color("trim"), m["body"]),
        ],
        root,
    )
    glass = box("glass", (2.3, 1.0, 0.8), (0, 6.95, 2.5), 0.2, color("glass"), m["glass"])
    glass.parent = root
    lights = join(
        "lights",
        [
            box("tail", (2.2, 0.05, 0.1), (0, -7.32, 0.9), 0.02, color("police_red"), m["lights"]),
            box("head", (2.0, 0.05, 0.1), (0, 7.42, 1.0), 0.02, color("lane_paint"), m["lights"]),
        ],
        root,
    )
    wheel = wheel_mesh(0.5, 0.5, m["wheel"], color("tyre"), color("rim"), spokes=4)
    w = wheels(root, wheel, 0.5, 1.0, {"f": 6.2, "m": -4.5, "r": -6.2})
    bake_ao([body, glass, lights, w[0].children[0]], distance=1.0, strength=0.8, unlit={"lights"})
    return root, (600, 5000), (2.6, 14.8, 4.05)


def roadblock(m):
    """A striped barrier on two A-frames with a red lamp, and two cones. One lane wide."""
    root = link("roadblock")
    stripes = 8
    width = 3.4 / stripes
    parts = [
        box("stripe", (width, 0.24, 0.42), (-1.7 + width * (i + 0.5), 0, 0.92), 0.04,
            color("police_red" if i % 2 == 0 else "lane_paint"), m["body"])
        for i in range(stripes)
    ]
    for side in (-1, 1):
        for tilt in (-1, 1):
            leg = box("leg", (0.12, 0.1, 1.2), (0, 0, 0), 0.03, color("trim"), m["body"])
            leg.data.transform(Matrix.Translation((side * 1.4, tilt * 0.22, 0.58)) @ Matrix.Rotation(math.radians(tilt * 18), 4, "X"))
            parts.append(leg)
    # Cones stand in front of the beam ends, so the whole block fits one 3.7 m lane.
    for x in (-1.45, 1.45):
        cone = mesh_object("cone", cylinder(0.24, 0.05, 0.75, 12), color("police_red"), [m["body"]])
        cone.data.transform(Matrix.Translation((x, -0.6, 0)) @ Matrix.Rotation(math.pi / 2, 4, "X"))
        parts.append(cone)
    body = join("body", parts, root)
    lamp = box("lamp", (0.2, 0.2, 0.18), (1.2, 0, 1.22), 0.08, color("police_red"), m["lights"])
    lamp.parent = root
    bake_ao([body], distance=0.6, strength=0.7, unlit={"lights"})
    return root, (200, 3000), (3.4, 1.28, 1.31)


ASSETS = {"police": police, "hatch": hatch, "suv": suv, "semi": semi, "roadblock": roadblock}

VIEWS = {
    "police": (8.0, 2.2),
    "hatch": (7.0, 1.6),
    "suv": (8.0, 2.0),
    "semi": (22.0, 4.0),
    "roadblock": (7.0, 1.4),
}


def main():
    if "--" in sys.argv and sys.argv[sys.argv.index("--") + 1 :]:
        sys.exit("art/fleet.py takes no arguments; it always writes public/models/ and art/previews/.")
    if not GLTF_TRANSFORM.exists():
        sys.exit(f"{GLTF_TRANSFORM} is missing. Run `npm ci` in art/ first.")
    models = REPO / "public" / "models"
    previews = Path(__file__).resolve().parent / "previews"
    for name, build in ASSETS.items():
        clear_scene()
        root, tris, size = build(materials())
        check(root, name, tris, size)
        before, after = export_glb(root, models / f"{name}.glb")
        print(f"{name}: {before} bytes raw, {after} bytes after meshopt")
        dist, height = VIEWS[name]
        render_preview(
            previews / f"{name}.png",
            [
                View(eye=(-dist * 0.7, dist * 0.8, height), target=(0, 0, height * 0.35), lens=50),
                View(eye=(dist * 0.55, -dist * 0.9, height * 0.9), target=(0, 0, height * 0.35), lens=50),
            ],
            ground_rgba=color("sand"),
            sky_rgba=color("sky_horizon"),
            columns=2,
        )


if __name__ == "__main__":
    run(main)
