# Art direction

The look is soft, stylized 3D in the spirit of PEAK by Aggro Crab and Landfall. A screenshot has to stop a thumb on a busy X timeline. That rules out the default look of a Three.js demo: flat grey lighting, hard black shadows, and a plain blue sky.

The setting is a Texas desert highway at golden hour, near where the real car was shown. Mesas sit on the horizon. The light is warm and low, and every police light bar glows against it.

## What makes the PEAK look

PEAK gets its look from a few choices that stack. Copy the choices, not the assets.

- **Chunky shapes.** Objects have few, large forms with rounded bevels. A car reads as three or four big volumes. Small details are left out or painted on.
- **Soft toon shading.** Light falls off in two or three soft bands instead of a smooth gradient. The band edges are soft, never a hard cel line.
- **Colored shadows.** Shadows are a cool, saturated tint of the sky, never grey or black. Sunlit sides are warm.
- **Thick atmosphere.** Distant objects fade into a colored haze. Haze carries more depth than detail does. Three or four depth layers stay readable at a glance.
- **A painted sky.** The sky is a gradient with large soft clouds, lit from the same sun as the scene.
- **Almost no textures.** Color comes from flat materials and a small palette. Surface interest comes from subtle noise and from the light, not from photo textures.
- **A warm rim light.** A thin bright edge separates the car from the background in every shot.

## Palette

The palette is small and fixed. Every material picks from it. The final values come from the look-dev prototype in phase 1. These starting values set the mood.

| Role | Starting value | Notes |
| --- | --- | --- |
| Sky top | `#5b8fd9` | Deep, warm blue |
| Sky horizon | `#ffc89a` | Peach haze at golden hour |
| Sun light | `#ffe3b0` | Warm key light |
| Shadow tint | `#6a5acd` | Cool violet, never grey |
| Desert sand | `#e8a565` | Main ground color |
| Mesas | `#c8664a` | Red rock, fades to haze with distance |
| Asphalt | `#4a4458` | Warm dark violet, not black |
| Lane paint | `#fff4d6` | Off-white |
| Roadster | `#e8322e` | Signature red. Player-selectable colors come later. |
| Police blue | `#2f6bff` | Light bar, emissive |
| Police red | `#ff3048` | Light bar, emissive |
| Thruster gas | `#eaf6ff` | Cold, white-blue puffs |

## The Roadster

The Roadster is the star of every frame. It is the only model that gets extra polish.

- Long, low, wide, with a smooth wedge silhouette and a small cabin set back. It should read as "a fast red electric sports car" in under 20 by 20 pixels.
- No logos and no badges. It must not copy any trademarked design detail one for one.
- Ten thruster nozzles: four at the rear, and three under each side. They glow and emit gas puffs when they fire.
- A visible windshield and a simple dark cabin. The car drives itself, so no driver model is needed.
- Wheels spin. The body leans into lane changes and squashes slightly on landing.

## Police and traffic

- Police cars are chunky, friendly sedans in black and white, with a large light bar. They should look a little goofy, never threatening. The game is a comedy chase.
- Traffic has four or five silhouettes: a hatchback, a sedan, an SUV, a pickup, and a semi truck. Each uses one body color from a muted set, so the red Roadster and the police lights pop.
- The level-5 interceptor is an oversized armored police truck with two light bars. It should make players laugh the first time it appears.

## Motion and effects

Effects carry most of the "game feel". They are cheap and they matter more than polygon count.

- **Thruster gas.** Soft, round puffs that expand and fade. No fire, because the real system is cold gas.
- **Barrel roll.** A spiral trail of gas, a short whoosh, and a camera that leans with the spin.
- **Perfect dodge.** About 0.4 seconds of slow motion, a slight color shift, and a small "PERFECT" stamp.
- **Wrecks.** Cop cars tumble with exaggerated physics, throw sparks, and lose hubcaps. Nobody is shown hurt.
- **Speed.** Wind lines and a field-of-view kick when speed rises.
- **Lights.** Light bars flash and bloom, and they color the road around them.

## Camera

A third-person chase camera sits behind and above the Roadster. It lags a little on lane changes and leans into rolls. It shakes briefly on near misses and wrecks. The replay uses different cameras: a low side shot, a drone orbit, and a slow-motion close-up.

## Rendering on a phone

The look has to survive a mid-range phone. These rules keep it cheap.

- Bake ambient occlusion and soft gradients into vertex colors in Blender, not into runtime passes.
- Use one shadow-casting light with a small shadow map that follows the car.
- Use fog for atmosphere instead of volumetrics.
- Keep one combined post-processing pass, with bloom, color grading, and vignette merged. The low quality tier drops bloom.
- Keep the triangle count under about 60,000 on screen. The Roadster may use 6,000 to 10,000 of those.
- Use instancing for traffic, props, and roadside scenery.

## Asset pipeline

Every 3D asset is made by a Python script that runs in Blender without a window, under `art/`. The script exports a compressed `.glb` into the game's assets. Anyone can rerun a script to rebuild or change an asset. Contributors never need to edit a binary `.blend` file by hand.

```bash
blender -b --factory-startup --python art/roadster.py -- --out public/models/roadster.glb
```

Blender 5.2 is installed on the build box at `~/.local/bin/blender`. A render script makes a preview image of each asset, so a reviewer can check the model without opening Blender.
