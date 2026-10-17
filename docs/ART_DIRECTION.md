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

The palette is small and fixed. Every material of the look picks from it. Both quality tiers take their sun, shadow tint, rim and sky colours from it. The high tier's hemisphere fill is tuned separately in `src/render/look/tune.ts`. Placeholder props and vehicles carry their own colours until the Blender assets replace them, and the terrain paints a few shading variations of these bases in `src/render/world/highway.ts`: lighter and darker sand, roadside gravel, and the mesa strata. These are the final values from the phase-1 look development. `src/render/palette.ts` holds the same values, and a test fails when this table and the code drift apart.

### Sky and atmosphere

| Role | Value | Notes |
| --- | --- | --- |
| Sky top | `#5b8fd9` | Deep, warm blue at the zenith |
| Sky mid | `#b9a9dd` | Lilac band between the blue and the sunset |
| Sky low | `#f6b4a6` | Rose sunset band above the horizon |
| Sky horizon | `#ffc89a` | Peach haze at golden hour. Distant objects fade to it. |
| Haze toward the sun | `#ffd9a8` | The horizon warms where the sun sits |
| Sun light | `#ffe3b0` | Warm key light |
| Sun core | `#fff2d8` | Sun disc and halo. Blooms on the default tier. |
| Shadow tint | `#6a5acd` | Cool violet, never grey |
| Rim light | `#ffb46e` | Warm edge on the Roadster and the police car |
| Cloud top | `#fff6ec` | Sunlit tops of the 3D cloud puffs |
| Cloud base | `#e6dcf0` | Lilac undersides of the cloud puffs |
| Cloud deck core | `#a88cbf` | Dark core of the painted sunset decks |
| Cloud deck body | `#f2a4a2` | Rose body of the painted sunset decks |
| Cloud deck edge | `#ffd2a4` | Gold edge of the painted sunset decks |
| Haze, near mesas | `#d98a8a` | First haze plane |
| Haze, mid mesas | `#c595b4` | Second haze plane |
| Haze, far mesas | `#b4a2d4` | Third haze plane |
| Haze, far ridge | `#cdb8e0` | Last plane, almost flat lilac |

### Ground and scenery

| Role | Value | Notes |
| --- | --- | --- |
| Desert sand | `#e8a565` | Main ground color |
| Mesas | `#c8664a` | Red rock, fades to its haze plane with distance |
| Far ridge | `#b86a5a` | Rock under the last haze plane |
| Asphalt | `#4a4458` | Warm dark violet, not black |
| Lane paint | `#fff4d6` | Off-white |

### Cars and lights

| Role | Value | Notes |
| --- | --- | --- |
| Roadster | `#d9d6d0` | Pale silver-grey upper body. The warm key light turns its top golden. |
| Roadster lower | `#1f1d24` | Satin black lower band and sills |
| Roadster red | `#e8322e` | The old signature red, kept as a later player color option |
| Police blue | `#2f6bff` | Light bar, emissive |
| Police red | `#ff3048` | Light bar and the Roadster's tail bar, emissive |
| Thruster gas | `#eaf6ff` | Cold, white-blue nozzle glow and gas puffs |

## The Roadster

The Roadster is the star of every frame. It is the only model that gets extra polish. It is a stylized fan take on the car shown on 15 October 2026, built from a few chunky forms. It is not a copy of it.

- **Body.** Two-tone: pale silver-grey upper body over a satin black lower band and sills. A faceted wedge of flat panels with crisp creases, bevelled softly so the toon light reads each panel. Long, low, and wide.
- **Glass.** A dark tinted glasshouse, set back, with a flat sloping roofline. The car drives itself, so no driver model is needed.
- **Rear.** The chase camera sees the rear most, so the rear carries the identity:
  - one full-width red light bar
  - a big rear wing on two struts
  - a dark diffuser with four round nozzles in a row
  - one downward nozzle at each rear corner
  - a plate with our own text, `ESC4PE`
- **Ten thruster nozzles.** Four in the diffuser, one at each rear corner pointing down, and two low on each side. They glow white-blue and emit white gas puffs when they fire.
- **Wheels.** Dark star-style rims of our own design. Wheels spin. The body leans into lane changes and squashes slightly on landing.
- **How it pops.** The silver body takes violet shadows on its flat panels and a golden top from the warm key light. The red tail bar and the white-blue nozzle glow are the signature accents.
- It must read as "a fast electric sports car" in under 20 by 20 pixels.
- No logos, no badges, no wordmarks, and none of the real car's plate text. Do not copy the real wheel or light-bar shapes one for one.

## Police and traffic

- Police cars are chunky, friendly sedans in black and cream, with a large light bar. They should look a little goofy, never threatening. The game is a comedy chase. Their black panels are large and their white is pushed toward cream, so they never blend with the silver Roadster.
- Traffic has four or five silhouettes: a hatchback, a sedan, an SUV, a pickup, and a semi truck. Each uses one body color from a muted set, so the Roadster and the police lights pop.
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
- Keep one combined post-processing pass, with bloom, color grading, and vignette merged.
- Ship two quality tiers. The default tier renders into a half-float target and runs that post pass. The low tier draws one toon shader straight to the screen, with no render target and no bloom. Phones that cannot render to half-float targets get the low tier automatically, and `?tier=low` forces it.
- Keep the triangle count under about 60,000 on screen. The Roadster may use 6,000 to 10,000 of those.
- Merge or instance traffic, props, and roadside scenery, so each kind costs one draw call.

## Asset pipeline

Every 3D asset is made by a Python script that runs in Blender without a window, under `art/`. The script exports a compressed `.glb` into the game's assets. Anyone can rerun a script to rebuild or change an asset. Contributors never need to edit a binary `.blend` file by hand.

```bash
blender -b --factory-startup --python art/roadster.py -- --out public/models/roadster.glb
```

Blender 5.2 is installed on the build box at `~/.local/bin/blender`. A render script makes a preview image of each asset, so a reviewer can check the model without opening Blender.
