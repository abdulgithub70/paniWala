import { calculatePrice } from './pricing';

describe('calculatePrice', () => {
  it('multiplies unit price by quantity', () => {
    const r = calculatePrice({ unitPricePaise: 2000, quantity: 2, floor: 3 });
    expect(r.subtotalPaise).toBe(4000);
    expect(r.totalPaise).toBe(4000);
  });

  it('does not charge for floors yet', () => {
    expect(calculatePrice({ unitPricePaise: 2000, quantity: 1, floor: 0 }).totalPaise).toBe(
      calculatePrice({ unitPricePaise: 2000, quantity: 1, floor: 9 }).totalPaise,
    );
  });

  it('rejects invalid input', () => {
    expect(() => calculatePrice({ unitPricePaise: 0, quantity: 1, floor: 0 })).toThrow();
    expect(() => calculatePrice({ unitPricePaise: 2000, quantity: 0, floor: 0 })).toThrow();
    expect(() => calculatePrice({ unitPricePaise: 2000, quantity: 1.5, floor: 0 })).toThrow();
    expect(() => calculatePrice({ unitPricePaise: 2000, quantity: 1, floor: -1 })).toThrow();
  });
});
