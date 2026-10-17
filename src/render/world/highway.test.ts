import { Box3, Mesh, Object3D, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { chaseCamera, createHighway, LANE } from './highway';

const triangles = (mesh: {
  geometry: { index: { count: number } | null; getAttribute(name: 'position'): { count: number } };
}) => (mesh.geometry.index?.count ?? mesh.geometry.getAttribute('position').count) / 3;

describe('highway scene', () => {
  const highway = createHighway();

  it('stays inside the phone triangle budget', () => {
    const total = highway.parts.reduce((sum, part) => sum + triangles(part.mesh), 0);
    expect(total, 'all world triangles, before culling and the shadow pass').toBeLessThan(40_000);
  });

  it('carries albedo in vertex colours on every part', () => {
    for (const part of highway.parts)
      expect(part.mesh.geometry.getAttribute('color')).toBeDefined();
  });

  it('puts backdrop meshes on all four haze planes', () => {
    const layers = highway.parts.flatMap((part) => (part.role === 'mesa' ? [part.layer] : []));
    expect([...new Set(layers)].sort()).toEqual([0, 1, 2, 3]);
  });

  it('keeps the backdrop ahead of the camera through an hour of play', () => {
    const camera = { position: new Vector3(), target: new Vector3() };
    for (const t of [0, 600, 3600]) {
      highway.update(t);
      chaseCamera(highway.hero, t, 0, camera);
      for (const part of highway.parts) {
        if (part.role !== 'mesa') continue;
        part.mesh.updateWorldMatrix(true, false);
        const box = new Box3().setFromObject(part.mesh);
        expect(box.max.z, `haze layer ${String(part.layer)} at t=${String(t)}`).toBeLessThan(
          camera.position.z - 300,
        );
      }
    }
  });

  it('never lets two cars in one lane drive through each other or the hero cars', () => {
    const bodies = new Map<Object3D, Mesh[]>();
    for (const part of highway.parts) {
      if (part.role !== 'body' || !part.mesh.parent) continue;
      bodies.set(part.mesh.parent, [...(bodies.get(part.mesh.parent) ?? []), part.mesh]);
    }
    expect(bodies.size, 'seven traffic cars, the Roadster and the police car').toBe(9);
    for (let t = 0; t < 600; t += 0.5) {
      highway.update(t);
      const placed = [...bodies.values()].map((meshes) => {
        const box = new Box3();
        for (const mesh of meshes) {
          mesh.updateWorldMatrix(true, false);
          box.union(new Box3().setFromObject(mesh));
        }
        return {
          lane: Math.round((box.min.x + box.max.x) / 2 / LANE),
          min: box.min.z,
          max: box.max.z,
        };
      });
      for (const a of placed) {
        for (const b of placed) {
          if (a === b || a.lane !== b.lane) continue;
          const overlap = Math.min(a.max, b.max) - Math.max(a.min, b.min);
          expect(overlap, `lane ${String(a.lane)} overlap at t=${String(t)}`).toBeLessThan(0);
        }
      }
    }
  });

  it('poses the same frame for the same time', () => {
    highway.update(12);
    const first = highway.focus.clone();
    highway.update(3);
    highway.update(12);
    expect(highway.focus.toArray()).toEqual(first.toArray());
  });
});
