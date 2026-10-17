"""Render a flat-lit Workbench contact sheet of an asset, so a reviewer can check it without Blender."""

import tempfile
from dataclasses import dataclass
from pathlib import Path

import bpy
import numpy as np
from mathutils import Vector

from .mesh import ground, link

TILE = (400, 250)
MAX_BYTES = 400 * 1024


@dataclass
class View:
    eye: tuple
    target: tuple
    lens: float = 50.0
    # Render at pixels x pixels and scale up with hard pixels, to check how the asset
    # reads when it is that small on screen.
    pixels: int | None = None


def _setup(scene, ground_rgba, sky_rgba):
    scene.render.engine = "BLENDER_WORKBENCH"
    scene.render.resolution_percentage = 100
    scene.render.film_transparent = False
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGB"
    scene.view_settings.view_transform = "Standard"
    scene.display.render_aa = "16"
    # Flat light shows the albedo and baked AO exactly as every look receives them.
    shading = scene.display.shading
    shading.light = "FLAT"
    shading.color_type = "VERTEX"
    scene.world.color = sky_rgba[:3]
    for leftover in ("preview_ground", "preview_camera"):
        if leftover in bpy.data.objects:
            bpy.data.objects.remove(bpy.data.objects[leftover])
    # Large enough that its far edge sits on the horizon, not across the frame.
    ground("preview_ground", 4000, ground_rgba)

    cam = link("preview_camera", bpy.data.cameras.new("preview_camera"))
    cam.data.clip_end = 3000
    scene.camera = cam
    return cam


def _render(scene, cam, view, path):
    eye = Vector(view.eye)
    cam.location = eye
    cam.rotation_euler = (Vector(view.target) - eye).to_track_quat("-Z", "Y").to_euler()
    cam.data.lens = view.lens
    w, h = (view.pixels, view.pixels) if view.pixels else TILE
    scene.render.resolution_x, scene.render.resolution_y = w, h
    scene.render.filepath = str(path)
    bpy.ops.render.render(write_still=True)
    img = bpy.data.images.load(str(path))
    px = np.empty(w * h * 4, dtype=np.float32)
    img.pixels.foreach_get(px)
    bpy.data.images.remove(img)
    px = px.reshape(h, w, 4)
    if view.pixels:
        k = TILE[1] // view.pixels
        px = px.repeat(k, axis=0).repeat(k, axis=1)
        tile = np.empty((TILE[1], TILE[0], 4), dtype=np.float32)
        tile[:] = px[0, 0]
        x0, y0 = (TILE[0] - px.shape[1]) // 2, (TILE[1] - px.shape[0]) // 2
        tile[y0 : y0 + px.shape[0], x0 : x0 + px.shape[1]] = px
        px = tile
    return px


def render_preview(path, views, ground_rgba, sky_rgba, columns=2):
    """Render each view into one PNG grid at `path`, left to right, top to bottom."""
    scene = bpy.context.scene
    cam = _setup(scene, ground_rgba, sky_rgba)
    rows = -(-len(views) // columns)
    sheet = np.ones((rows * TILE[1], columns * TILE[0], 4), dtype=np.float32)
    with tempfile.TemporaryDirectory() as tmp:
        for i, view in enumerate(views):
            r, c = divmod(i, columns)
            # Blender stores image rows bottom to top.
            y0 = (rows - 1 - r) * TILE[1]
            sheet[y0 : y0 + TILE[1], c * TILE[0] : (c + 1) * TILE[0]] = _render(
                scene, cam, view, Path(tmp) / f"view{i}.png"
            )
    path.parent.mkdir(parents=True, exist_ok=True)
    img = bpy.data.images.new("preview_sheet", sheet.shape[1], sheet.shape[0])
    img.pixels.foreach_set(sheet.ravel())
    img.filepath_raw = str(path)
    img.file_format = "PNG"
    img.save()
    size = path.stat().st_size
    if size > MAX_BYTES:
        raise ValueError(f"{path} is {size} bytes, over the {MAX_BYTES} byte preview limit")
    return path
