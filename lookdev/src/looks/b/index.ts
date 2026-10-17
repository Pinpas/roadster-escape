import { Color, FogExp2, HemisphereLight } from 'three';
import { assignMaterials, type Look } from '../../common/look';
import { createPost } from './post';
import { materialPicker } from './shading';
import { clouds, skyDome } from './sky';
import { tune } from './tune';

/**
 * Look B, "graded lit": stock three lighting (toon ramp, hemisphere fill, one shadowed sun)
 * with small onBeforeCompile patches, a 3D cloud sky, and one combined post pass.
 */
export const lookB: Look = {
  id: 'b',
  title: 'Graded lit',
  canvasAntialias: false,
  build(renderer, world) {
    assignMaterials(world, materialPicker());
    world.sun.color.set(tune.sun);
    world.sun.intensity = tune.sunIntensity;
    world.scene.add(new HemisphereLight(new Color(tune.hemiSky), new Color(tune.hemiGround), tune.hemiIntensity));
    world.scene.fog = new FogExp2(new Color(tune.haze), tune.fogDensity);
    world.scene.background = null;

    const dome = skyDome();
    const sky = clouds();
    world.scene.add(dome, sky);

    const params = new URLSearchParams(location.search);
    const post = createPost(renderer, params.get('tier') === 'low');

    return {
      update(t) {
        const cam = world.camera.position;
        dome.position.copy(cam);
        sky.position.set(cam.x, 0, cam.z);
        sky.rotation.y = t * 0.0015;
      },
      render: () => post.render(world.scene, world.camera),
      resize: (w, h, dpr) => post.resize(w, h, dpr),
    };
  },
};
