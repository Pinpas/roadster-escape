# Art pipeline

Every 3D model in Roadster Escape comes from a Python script in this folder. The script runs in Blender without a window. It builds the model from code, bakes ambient occlusion into vertex colours, exports a GLB, compresses it, and renders a preview image. The generated GLB is committed, so the game builds without Blender.

## Rebuild a model

Install the compression tool once:

```bash
cd art && ~/projects/agentbox/scripts/heavy npm ci
```

Then run the model's script from the repository root:

```bash
~/projects/agentbox/scripts/heavy ~/.local/bin/blender -b --factory-startup \
  --python art/roadster.py -- --out public/models/roadster.glb
```

The run writes `public/models/roadster.glb` and `art/previews/roadster.png`, and prints the triangle count, the size in metres, and the file sizes. It exits non-zero and writes no GLB if the model leaves its triangle budget or its real-world size. On the same Blender build and machine, a rerun writes the same bytes. Another machine can produce a slightly different bake.

## Files

- `palette.py` holds the palette from `docs/ART_DIRECTION.md` and converts its sRGB hex values to linear colours.
- `lib/mesh.py` builds rounded boxes and cylinders, lofts, booleans and flat materials, and paints vertex colours.
- `lib/bake.py` bakes Cycles ambient occlusion and multiplies it into the albedo.
- `lib/export.py` exports the GLB and compresses it with gltf-transform.
- `lib/preview.py` renders a flat-lit Workbench contact sheet under 400 KB.
- `lib/cli.py` parses the script arguments and turns any error into a non-zero exit.

## What a look receives

The models stay look-agnostic, so any look-dev prototype can shade them.

- `COLOR_0` holds the linear albedo with the ambient occlusion baked in, at 16 bits per channel. The base colour factor is 1. There are no textures and no UVs.
- The material name tells the look which role a surface plays. A look swaps in its own material per role.
- Every material is opaque and single-sided.
- A mesh that several nodes share, such as a wheel, carries only its own occlusion, so every copy looks the same.

## Compression and the decoder

`lib/export.py` runs `gltf-transform meshopt`, which writes `EXT_meshopt_compression` with `KHR_mesh_quantization`. The game must register the meshopt decoder that ships with three.js:

```ts
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
```

Meshopt was chosen over Draco for decode speed and setup. The meshopt decoder is a module of about 29 KB (8 KB gzipped) inside three.js, and it needs no worker. The Draco glTF decoder is a WebAssembly file of about 184 KB plus a JavaScript wrapper, which the game would host and run in a worker. Draco packs geometry tighter. When this pipeline landed, the Roadster was 92 KB (67 KB gzipped) with meshopt and 58 KB (47 KB gzipped) with Draco, both with 16-bit colour.

Colours keep 16 bits because they are linear. At 8 bits, the dark trims and their baked occlusion fall into a handful of codes.

Quantization rescales and offsets each node that owns a mesh. So every node whose transform the game reads is a socket: an empty node with a clean transform, whose mesh sits in a child node named `<socket>_mesh`. Do not read or animate the transform of a mesh node.

## The Roadster

`roadster.py` builds the Roadster within 6,000 to 10,000 triangles, at about 4.4 m long, 2.0 m wide and 1.15 m high. In three.js, +Y is up and the nose points to -Z. The origin is on the ground under the centre of the car.

```text
roadster                   root: move it to drive and hop
├── chassis                pivot on the ground under the car centre: rotate about Z to lean, scale Y to squash
│   ├── body               material body
│   ├── glass              material glass: windshield and cabin
│   ├── lights             material lights: head lights and tail lights
│   ├── thruster_rear_1-4  socket, left to right across the tail
│   ├── thruster_left_1-3  socket, front to back under the left sill
│   └── thruster_right_1-3 socket, front to back under the right sill
├── wheel_fl               socket, front left
├── wheel_fr               socket, front right
├── wheel_rl               socket, rear left
└── wheel_rr               socket, rear right
```

The six materials are `body`, `glass`, `lights`, `wheel`, `nozzle` and `thruster_mouth`.

- **Thrusters.** The socket origin is at the nozzle mouth. Its local -Z points the way the gas leaves. Rear thrusters fire backwards (+Z). Side thrusters fire down and 25 degrees outwards. The nozzle mesh has two materials: `nozzle` for the shell and `thruster_mouth` for the mouth disc. The mouth disc has no baked occlusion, so a look can make it glow. All ten thrusters share one mesh and one `thruster_mouth` material, so glow per thruster needs a cloned material or a per-instance uniform.
- **Wheels.** The socket origin is on the axle. The wheel spins about local X with a radius of 0.36 m. Driving forward, `rotation.x` decreases by distance / 0.36. The four wheels share one mesh.
- **Lights.** Head lights use lane paint `#fff4d6` and tail lights use police red `#ff3048`. They have no baked occlusion. The file sets no emissive colour, so a look drives the glow from the `lights` material.
- **Body.** The body is roadster red `#e8322e`. Dark trim is painted on the underside, the wheel wells, the tail panel around the rear thrusters, the chin and the sills.

![The Roadster contact sheet](previews/roadster.png)

The contact sheet shows, from top left: a front three-quarter view, a rear three-quarter view with the four lit thruster mouths, the side profile, the plan view, and two renders at 20 by 20 pixels scaled up, from the front three-quarter angle and from the chase camera.
