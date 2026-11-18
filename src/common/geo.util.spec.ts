import { boundingBox, haversineM } from './geo.util';

describe('geo.util', () => {
  it('0.01 degree of latitude is about 1.1 km', () => {
    const d = haversineM(28.55, 77.3, 28.56, 77.3);
    expect(d).toBeGreaterThan(1100);
    expect(d).toBeLessThan(1125);
  });

  it('distance to the same point is 0', () => {
    expect(haversineM(28.55, 77.3, 28.55, 77.3)).toBeCloseTo(0, 5);
  });

  it('bounding box contains every point within the radius', () => {
    const box = boundingBox(28.55, 77.3, 3000);
    const p = { lat: 28.55 + 0.02, lng: 77.3 + 0.02 }; // about 3.1 km diagonal, edges inside
    expect(p.lat).toBeLessThan(box.maxLat);
    expect(p.lng).toBeLessThan(box.maxLng);
    expect(box.minLat).toBeLessThan(28.55);
    expect(box.maxLng).toBeGreaterThan(77.3);
  });
});
