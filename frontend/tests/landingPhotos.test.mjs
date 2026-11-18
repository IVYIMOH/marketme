import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { existsSync } from 'node:fs';
import { filterWildlifePhotos as filterPhotographs, wildlifePhotos as photographs, stepWildlifePhoto as stepPhoto } from '../lib/wildlifeSamples.ts';

describe('NatuVara photo discovery', () => {
  it('shows eight credited previews with local images and license links', () => {
    const photos = filterPhotographs('All photos', '');
    assert.equal(photos.length, 8);
    for (const photo of photos) {
      assert.equal(new URL(photo.sourceUrl).protocol, 'https:');
      assert.equal(new URL(photo.licenseUrl).protocol, 'https:');
      assert.ok(photo.author);
      assert.ok(existsSync(new URL(`../public${photo.src}`, import.meta.url)));
    }
  });

  it('finds photographs by wildlife or place, ignoring case and outer whitespace', () => {
    assert.deepEqual(filterPhotographs('All photos', '  LAKE MANYARA ').map((photo) => photo.species), ['Giraffe']);
    assert.deepEqual(filterPhotographs('All photos', 'leopard').map((photo) => photo.id), ['leopard']);
  });

  it('finds photographs by the credited photographer', () => {
    assert.deepEqual(filterPhotographs('All photos', 'Giles Laurent').map((photo) => photo.id), ['lion', 'giraffe']);
  });

  it('uses the existing wildlife categories for birds, big cats, and large mammals', () => {
    assert.deepEqual(filterPhotographs('Birds', '').map((photo) => photo.id), ['roller']);
    assert.deepEqual(filterPhotographs('Big cats', '').map((photo) => photo.id), ['lion', 'cheetah', 'leopard']);
    assert.deepEqual(filterPhotographs('Large mammals', '').map((photo) => photo.id), ['elephant', 'giraffe', 'zebra', 'rhino']);
  });

  it('combines search and collection filters and returns an empty result when nothing matches', () => {
    assert.deepEqual(filterPhotographs('Big cats', 'Kruger').map((photo) => photo.id), ['leopard']);
    assert.deepEqual(filterPhotographs('Birds', 'lion'), []);
    assert.deepEqual(filterPhotographs('All photos', 'not a wildlife photograph'), []);
  });

  it('wraps photo preview navigation in both directions', () => {
    assert.equal(stepPhoto(photographs[0], -1).id, 'rhino');
    assert.equal(stepPhoto(photographs[photographs.length - 1], 1).id, 'lion');
  });
});
