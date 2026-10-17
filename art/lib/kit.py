"""Shared parts for the chunky secondary vehicles and props: shells, wheels, sockets and checks."""

import math

import bmesh
import bpy
from mathutils import Matrix, Vector

from .mesh import axle_cylinder, bevel, link, mesh_object, paint, rounded_box, socket, triangles


def box(name, size, at, radius, rgba, mat, segments=2):
    """A rounded box of `size` (x, y, z) centred at `at`."""
    obj = rounded_box(name, size, radius, segments, rgba, [mat])
    obj.data.transform(Matrix.Translation(at))
    return obj


def wheel_mesh(radius, width, mat, tyre, rim, spokes=5):
    """One wheel on an X axle with a painted star hub on both faces, shared by every wheel socket."""
    bm = axle_cylinder(radius, width, spokes * 4)
    caps = [f for f in bm.faces if abs(f.normal.x) > 0.9]
    for cap in caps:
        bmesh.ops.inset_region(bm, faces=[cap], thickness=radius * 0.28)
    bmesh.ops.poke(bm, faces=caps)
    wheel = mesh_object("wheel", bm, tyre, [mat])

    def star(p):
        hub = abs(p.normal.x) > 0.9 and math.hypot(p.center.y, p.center.z) < radius * 0.72
        return hub and int((math.atan2(p.center.z, p.center.y) % math.tau) / math.tau * spokes * 2) % 2 == 0

    paint(wheel, rim, star)
    bevel(wheel, radius * 0.15, 2, angle=40)
    mesh = wheel.data
    bpy.data.objects.remove(wheel)
    return mesh


def wheels(root, mesh, radius, half_track, axles):
    """Wheel sockets `wheel_<axle><l|r>` for each named axle y position."""
    return [
        socket(f"wheel_{axle}{side}", root, mesh, Matrix.Translation((x, y, radius)))
        for axle, y in axles.items()
        for side, x in (("l", -half_track), ("r", half_track))
    ]


def check(root, name, tris_range, size):
    """Print and enforce a triangle budget and an approximate size (x, y, z) in metres."""
    meshes = [o for o in root.children_recursive if o.type == "MESH"]
    tris = sum(triangles(o) for o in meshes)
    corners = [o.matrix_world @ Vector(c) for o in meshes for c in o.bound_box]
    lo = Vector(min(c[i] for c in corners) for i in range(3))
    got = Vector(max(c[i] for c in corners) for i in range(3)) - lo
    print(f"{name}: {tris} triangles, {got.y:.2f} m long, {got.x:.2f} m wide, {got.z:.2f} m high")
    problems = []
    if not tris_range[0] <= tris <= tris_range[1]:
        problems.append(f"{tris} triangles is outside {tris_range}")
    if any(abs(g - s) > 0.15 for g, s in zip((got.x, got.y, got.z), size)):
        problems.append(f"size {got.x:.2f} x {got.y:.2f} x {got.z:.2f} m is not about {size}")
    if abs(lo.z) > 1e-3:
        problems.append(f"the lowest point must sit on the ground at z=0, it is {lo.z:.3f}")
    if problems:
        raise ValueError(f"{name}: " + "; ".join(problems))
