import { describe, expect, it } from 'vitest';
import doc from '../../docs/ART_DIRECTION.md?raw';
import { palette } from './palette';

const section = doc.slice(
  doc.indexOf('## Palette'),
  doc.indexOf('\n## ', doc.indexOf('## Palette') + 1),
);
const documented = [...section.matchAll(/^\|[^|]+\|\s*`(#[0-9a-f]{6})`/gim)].map((m) => m[1]);

describe('palette', () => {
  it('matches the palette table in docs/ART_DIRECTION.md, value for value', () => {
    expect(documented.length, 'rows found in the doc table').toBeGreaterThan(0);
    expect([...documented].sort()).toEqual(Object.values(palette).sort());
  });
});
