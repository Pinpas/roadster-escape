# Roadster Escape

A flying roadster, a Texas highway, and every cop in the state. Barrel-roll out of PIT maneuvers, hop over traffic on cold-gas thrusters, and see how long you last before they bust you.

Roadster Escape runs in any browser on a phone, tablet, or computer. No install, no account.

> Status: in development. The first playable build is not live yet.

## Play

The game will be live at a public URL once phase 3 of the [roadmap](docs/ROADMAP.md) lands.

| Action | Touch | Keyboard |
| --- | --- | --- |
| Change lane | Swipe left or right | `A` `D` or arrow keys |
| Hop | Swipe up | `W` or `Space` |
| Barrel roll | Swipe diagonally up | `Q` `E` |

## How it is made

- [Game design](docs/GAME_DESIGN.md) explains the chase, the air tank, the police, and the share moment.
- [Art direction](docs/ART_DIRECTION.md) explains the soft toon look and the rendering rules for phones.
- [Roadmap](docs/ROADMAP.md) lists the phases of version 1.

The game uses Three.js and TypeScript. Every 3D model is built by a Python script that runs in Blender without a window, so you can rebuild or change any asset from source.

## Develop

Dev-poorten: 5100–5109

The dev server runs on port 5100. Setup instructions arrive with the scaffold in phase 0.

## Disclaimer

Roadster Escape is an unofficial fan game. It is not affiliated with, endorsed by, or sponsored by Tesla, Inc. or SpaceX. All names and models in the game are original or generic.

## License

[MIT](LICENSE)
