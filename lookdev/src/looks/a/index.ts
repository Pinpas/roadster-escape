import { Color, Fog, HemisphereLight, MeshBasicMaterial, MeshLambertMaterial } from 'three';
import { assignMaterials, type Look } from '../../common/look';
import { palette } from '../../common/palette';

/** Placeholder until look A lands: plain Lambert, so the shared scene can be checked. */
export const lookA: Look = {
  id: 'a',
  title: 'stub',
  canvasAntialias: true,
  build(renderer, world) {
    const lit = new MeshLambertMaterial({ vertexColors: true });
    const flat = new MeshBasicMaterial({ vertexColors: true });
    assignMaterials(world, (p) => (p.role === 'emissive' ? flat : lit));
    world.scene.add(new HemisphereLight(new Color(palette.skyTop), new Color(palette.sand), 1.2));
    world.scene.background = new Color(palette.skyHorizon);
    world.scene.fog = new Fog(new Color(palette.skyHorizon), 200, 3000);
    return {
      render: () => renderer.render(world.scene, world.camera),
      resize: () => {},
    };
  },
};
