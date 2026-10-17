import { BackSide, Mesh, ShaderMaterial, SphereGeometry, type IUniform } from 'three';
import { haze, noise } from './glsl';

/**
 * Painted sunset sky: a stroked gradient, a big stepped sun halo, and stratified cloud
 * decks in three quantised tones. Drawn last at the far plane so the ground occludes it.
 */
export function createSky(uniforms: Record<string, IUniform>): Mesh {
  const mat = new ShaderMaterial({
    uniforms,
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = position;
        vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_Position = p.xyww;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uSkyLow;
      uniform vec3 uSkyMid;
      uniform vec3 uSkyTop;
      uniform vec3 uSunColor;
      uniform vec3 uHalo;
      uniform vec3 uCloudCore;
      uniform vec3 uCloudBody;
      uniform vec3 uCloudEdge;
      uniform float uTime;
      varying vec3 vDir;
      ${noise}
      ${haze}

      void main() {
        vec3 d = normalize(vDir);
        float h = d.y;
        float az = atan(d.x, -d.z);

        float stroke = vnoise2(vec2(az * 7.0, h * 160.0)) - 0.5;
        float hj = h + stroke * 0.014;
        vec3 col = horizonTint(d, uHorizon);
        col = mix(col, uSkyLow, smoothstep(0.015, 0.11, hj));
        col = mix(col, uSkyMid, smoothstep(0.09, 0.3, hj));
        col = mix(col, uSkyTop, smoothstep(0.26, 0.8, hj));

        float s = max(dot(d, uSunDir), 0.0);
        float halo = pow(s, 2.5) * 0.34 + pow(s, 10.0) * 0.3 + smoothstep(0.95, 0.985, s) * 0.18 + smoothstep(0.985, 0.996, s) * 0.25;
        col = mix(col, uHalo, clamp(halo, 0.0, 1.0));

        vec2 p = d.xz / (max(h, 0.0) + 0.07);
        p = vec2(p.x * 0.17, p.y * 0.62) + vec2(uTime * 0.012, 0.0);
        float n = fbm2(p);
        float deck = 0.13 * exp(-pow((h - 0.06) / 0.035, 2.0))
                   + 0.11 * exp(-pow((h - 0.16) / 0.05, 2.0))
                   + 0.14 * exp(-pow((h - 0.36) / 0.11, 2.0));
        float dens = n + deck - 0.6;
        float cover = smoothstep(0.0, 0.04, dens) * smoothstep(0.004, 0.035, h);
        float body = smoothstep(0.06, 0.09, dens);
        float core = smoothstep(0.13, 0.16, dens);
        float sunNear = pow(s, 6.0);
        vec3 edge = mix(uCloudEdge, uHalo * 1.15, sunNear);
        vec3 cloud = mix(edge, mix(uCloudBody, uCloudEdge, sunNear * 0.6), body);
        cloud = mix(cloud, mix(uCloudCore, uCloudBody, sunNear * 0.5), core);
        col = mix(col, cloud, cover);

        float wisp = vnoise2(vec2(az * 2.2 + 3.0, h * 26.0)) * 0.7 + vnoise2(vec2(az * 7.0, h * 70.0)) * 0.3;
        float high = smoothstep(0.2, 0.32, h) * (1.0 - smoothstep(0.62, 0.8, h));
        col = mix(col, mix(uCloudBody, uCloudEdge, 0.5), smoothstep(0.6, 0.7, wisp) * high * 0.45);

        float disc = smoothstep(0.9993, 0.99965, s);
        col = mix(col, vec3(1.0, 0.96, 0.86), disc * (1.0 - cover * 0.7));
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }`,
    side: BackSide,
    depthWrite: false,
  });
  const mesh = new Mesh(new SphereGeometry(100, 16, 10), mat);
  mesh.renderOrder = 1000;
  mesh.frustumCulled = false;
  return mesh;
}
