"""Bake ambient occlusion into the `Col` albedo attribute with Cycles."""

import bpy

from .mesh import COLOR, ground, remove


def bake_ao(objects, distance, strength, unlit=(), samples=64):
    """Multiply Cycles AO into `Col` of each unique mesh among `objects`.

    A ground plane joins the bake, so surfaces near the road darken too. `strength`
    mixes the AO towards white (0 keeps the albedo, 1 applies full AO). Faces whose
    material name is in `unlit` keep their colour, because looks make them glow.

    A mesh that several objects share bakes alone, without the ground or the rest of
    the model, because its occlusion has to hold for every instance and every turn of
    a wheel.
    """
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = samples
    scene.cycles.seed = 0
    scene.world.light_settings.distance = distance
    plane = ground("bake_ground", 60)
    hidden = {obj: obj.hide_render for obj in scene.objects}

    owners = {}
    for obj in objects:
        owners.setdefault(obj.data, obj)

    for mesh, obj in owners.items():
        alone = mesh.users > 1
        for other in scene.objects:
            other.hide_render = hidden[other] or (alone and other is not obj)
            other.select_set(other is obj)
        bpy.context.view_layer.objects.active = obj
        ao = mesh.color_attributes.new("ao", "FLOAT_COLOR", "CORNER")
        mesh.color_attributes.active_color = ao
        bpy.ops.object.bake(type="AO", target="VERTEX_COLORS")

        ao = mesh.color_attributes["ao"]
        albedo = mesh.color_attributes[COLOR]
        lit = {i for i, mat in enumerate(mesh.materials) if mat.name not in unlit}
        for poly in mesh.polygons:
            if poly.material_index not in lit:
                continue
            for i in poly.loop_indices:
                k = 1 - strength + strength * ao.data[i].color[0]
                r, g, b, a = albedo.data[i].color
                albedo.data[i].color = (r * k, g * k, b * k, a)
        mesh.color_attributes.remove(ao)
        mesh.color_attributes.active_color = mesh.color_attributes[COLOR]

    for obj, was_hidden in hidden.items():
        obj.hide_render = was_hidden
    remove(plane)
