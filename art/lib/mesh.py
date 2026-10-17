"""Mesh building blocks: rounded primitives, lofts, vertex-colour paint and flat materials.

Every mesh carries one corner-domain colour attribute, `Col`, in linear RGBA. It is the
albedo that every look reads as glTF COLOR_0. Materials stay flat: base colour comes
from `Col`, and the material name tells a look which role a surface plays.
"""

import math

import bmesh
import bpy
from mathutils import Matrix, Vector

COLOR = "Col"


def clear_scene():
    """Remove everything an asset build creates, so the next build's names carry no `.001` suffix."""
    for collection in (bpy.data.objects, bpy.data.meshes, bpy.data.materials, bpy.data.curves, bpy.data.cameras):
        for block in list(collection):
            collection.remove(block)


def link(name, data=None, parent=None, matrix=None):
    """Create an object for `data` (None makes an empty) and link it to the scene."""
    obj = bpy.data.objects.new(name, data)
    bpy.context.scene.collection.objects.link(obj)
    obj.parent = parent
    if matrix is not None:
        obj.matrix_local = matrix
    return obj


def mesh_object(name, bm, rgba, materials=(), parent=None):
    """Turn a bmesh into a linked object whose `Col` is filled with one colour.

    Material slots are filled here, before any modifier runs, because modifiers clamp
    face material indices to the slots that exist.
    """
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    for mat in materials:
        mesh.materials.append(mat)
    obj = link(name, mesh, parent)
    attr = mesh.color_attributes.new(COLOR, "FLOAT_COLOR", "CORNER")
    mesh.color_attributes.active_color = attr
    mesh.color_attributes.render_color_index = mesh.color_attributes.active_color_index
    paint(obj, rgba)
    return obj


def remove(obj):
    """Delete an object and its mesh."""
    mesh = obj.data
    bpy.data.objects.remove(obj)
    bpy.data.meshes.remove(mesh)


def ground(name, size, rgba=(1, 1, 1, 1)):
    """A square ground plane at z=0."""
    bm = bmesh.new()
    bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=size / 2)
    return mesh_object(name, bm, rgba)


def apply_modifier(obj, mod):
    with bpy.context.temp_override(object=obj, active_object=obj, selected_objects=[obj]):
        bpy.ops.object.modifier_apply(modifier=mod.name)


def bevel(obj, width, segments, angle=None):
    """Round edges with a Bevel modifier and apply it. Hardened normals keep flat faces flat."""
    obj.data.shade_smooth()
    mod = obj.modifiers.new("bevel", "BEVEL")
    mod.width = width
    mod.segments = segments
    mod.limit_method = "ANGLE" if angle else "NONE"
    if angle:
        mod.angle_limit = math.radians(angle)
    mod.harden_normals = True
    mod.miter_outer = "MITER_ARC"
    apply_modifier(obj, mod)
    return obj


def subdivide(obj, levels, sharp_angle=50):
    """Catmull-Clark smooth a cage, then mark edges sharper than `sharp_angle` degrees."""
    mod = obj.modifiers.new("subsurf", "SUBSURF")
    mod.levels = levels
    mod.render_levels = levels
    apply_modifier(obj, mod)
    obj.data.shade_smooth()
    obj.data.set_sharp_from_angle(angle=math.radians(sharp_angle))
    return obj


def cut(obj, cutters, sharp_angle=50):
    """Boolean-subtract each cutter from `obj`, then delete the cutters.

    Cut faces take the cutter's colour. The cutter takes the target's materials, because
    the boolean adds an empty slot for a cutter without any.
    """
    for cutter in cutters:
        for mat in obj.data.materials:
            cutter.data.materials.append(mat)
        mod = obj.modifiers.new("cut", "BOOLEAN")
        mod.operation = "DIFFERENCE"
        mod.solver = "EXACT"
        mod.object = cutter
        apply_modifier(obj, mod)
        remove(cutter)
    obj.data.shade_smooth()
    obj.data.set_sharp_from_angle(angle=math.radians(sharp_angle))
    return obj


def rounded_box(name, size, radius, segments, rgba, materials=(), parent=None):
    """A box of `size` (x, y, z) metres centred on its origin, every edge rounded by `radius`."""
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0, matrix=Matrix.Diagonal((*size, 1.0)))
    return bevel(mesh_object(name, bm, rgba, materials, parent), radius, segments)


def cylinder(radius_start, radius_end, length, segments):
    """A capped bmesh tube along +Y, from y=0 (radius_start) to y=length (radius_end)."""
    bm = bmesh.new()
    bmesh.ops.create_cone(
        bm,
        cap_ends=True,
        segments=segments,
        radius1=radius_start,
        radius2=radius_end,
        depth=length,
        matrix=Matrix.Translation((0, length / 2, 0)) @ Matrix.Rotation(-math.pi / 2, 4, "X"),
    )
    bm.normal_update()
    return bm


def axle_cylinder(radius, width, segments, at=(0, 0, 0)):
    """A capped bmesh cylinder whose axis runs along X, centred on `at`."""
    bm = cylinder(radius, radius, width, segments)
    bm.transform(Matrix.Translation(at) @ Matrix.Rotation(-math.pi / 2, 4, "Z") @ Matrix.Translation((0, -width / 2, 0)))
    # Rotating moves the vertices but not the cached face normals, and callers select caps by normal.
    bm.normal_update()
    return bm


def socket(name, parent, mesh, matrix):
    """A named node with a clean transform, holding its mesh in a `<name>_mesh` child.

    Meshopt quantization rescales the node that owns a mesh. The child absorbs that,
    so the named node keeps the origin and axes the game reads.
    """
    node = link(name, parent=parent, matrix=matrix)
    link(f"{name}_mesh", mesh, node)
    return node


CAP_INSET = 0.12


def loft(name, rings, rgba, materials=(), parent=None):
    """Skin closed rings of equal length into a tube with n-gon end caps.

    Each ring is a list of world-space points in the same winding. The result is a
    subdivision cage, so the caller usually follows with `subdivide`.
    """
    bm = bmesh.new()
    verts = [[bm.verts.new(p) for p in ring] for ring in rings]
    n = len(rings[0])
    for a, b in zip(verts, verts[1:]):
        for i in range(n):
            bm.faces.new((a[i], a[(i + 1) % n], b[(i + 1) % n], b[i]))
    caps = [bm.faces.new(list(reversed(verts[0]))), bm.faces.new(verts[-1])]
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    # An inset ring keeps subdivision from fanning long thin wedges out of a single n-gon pole.
    # Only caps several insets across get one: on a thin cap the ring crosses itself and folds.
    for cap in caps:
        extents = [max(v.co[i] for v in cap.verts) - min(v.co[i] for v in cap.verts) for i in range(3)]
        if sorted(extents)[1] >= 4 * CAP_INSET:
            bmesh.ops.inset_region(bm, faces=[cap], thickness=CAP_INSET)
    return mesh_object(name, bm, rgba, materials, parent)


def join(name, objects, parent=None):
    """Merge mesh objects into the first one, keeping their colours and materials."""
    target, absorbed = objects[0], [o.data for o in objects[1:]]
    with bpy.context.temp_override(
        object=target, active_object=target, selected_objects=objects, selected_editable_objects=objects
    ):
        bpy.ops.object.join()
    for mesh in absorbed:
        bpy.data.meshes.remove(mesh)
    target.name = name
    target.data.name = name
    target.parent = parent
    return target


def paint(obj, rgba, where=None):
    """Set `Col` on every face, or on the faces where `where(polygon)` is true."""
    mesh = obj.data
    colors = mesh.color_attributes[COLOR].data
    for poly in mesh.polygons:
        if where is None or where(poly):
            for i in poly.loop_indices:
                colors[i].color = rgba


def flat_material(name, roughness):
    """A texture-free material whose base colour is the `Col` attribute."""
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    bsdf = nodes["Principled BSDF"]
    attr = nodes.new("ShaderNodeVertexColor")
    attr.layer_name = COLOR
    mat.node_tree.links.new(attr.outputs["Color"], bsdf.inputs["Base Color"])
    # glTF multiplies COLOR_0 by the base colour factor, which the exporter takes from here.
    bsdf.inputs["Base Color"].default_value = (1, 1, 1, 1)
    mat.use_backface_culling = True
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = 0.0
    return mat


def triangles(obj):
    mesh = obj.data
    mesh.calc_loop_triangles()
    return len(mesh.loop_triangles)


def frame(origin, z_axis, x_hint=Vector((1, 0, 0))):
    """A matrix at `origin` whose local Z is `z_axis` and whose local X stays close to `x_hint`."""
    z = Vector(z_axis).normalized()
    x = (Vector(x_hint) - z * z.dot(x_hint)).normalized()
    y = z.cross(x)
    m = Matrix((x, y, z)).transposed().to_4x4()
    m.translation = origin
    return m
