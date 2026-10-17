"""Export a hierarchy to GLB, then compress it with gltf-transform and meshopt."""

import subprocess
import tempfile
from pathlib import Path

import bpy

GLTF_TRANSFORM = Path(__file__).resolve().parent.parent / "node_modules" / ".bin" / "gltf-transform"

# The material names a look may swap by role (art/README.md).
ROLES = {"body", "glass", "lights", "wheel", "nozzle", "thruster_mouth", "lightbar_red", "lightbar_blue"}


def export_glb(root, out):
    """Write `root` and its descendants to `out` as a meshopt-compressed GLB.

    Returns the byte sizes before and after compression.
    """
    names = {m.name for o in [root, *root.children_recursive] if o.type == "MESH" for m in o.data.materials}
    if not names <= ROLES:
        raise ValueError(f"materials {sorted(names - ROLES)} are not role names {sorted(ROLES)}")
    for obj in bpy.context.scene.objects:
        obj.select_set(False)
    for obj in [root, *root.children_recursive]:
        obj.select_set(True)
    out.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp:
        raw = Path(tmp) / out.name
        bpy.ops.export_scene.gltf(
            filepath=str(raw),
            export_format="GLB",
            use_selection=True,
            export_yup=True,
            export_apply=True,
            export_texcoords=False,
            export_normals=True,
            export_tangents=False,
            export_vertex_color="ACTIVE",
            export_all_vertex_colors=False,
            export_materials="EXPORT",
            export_image_format="NONE",
            export_animations=False,
            export_cameras=False,
            export_lights=False,
            export_extras=False,
        )
        # Colours are linear, so 8 bits would leave dark trims with a handful of codes.
        subprocess.run(
            [str(GLTF_TRANSFORM), "meshopt", str(raw), str(out), "--quantize-color", "16"],
            check=True,
        )
        return raw.stat().st_size, out.stat().st_size
