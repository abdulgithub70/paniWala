export interface PriceInput {
  unitPricePaise: number;
  quantity: number;
  floor: number;
}

export interface PriceBreakdown {
  unitPricePaise: number;
  quantity: number;
  floor: number;
  subtotalPaise: number;
  floorChargePaise: number;
  totalPaise: number;
}

/**
 * Pure pricing function. All money is integer paise.
 * Floor charges are not applied yet (MVP): when they are introduced, only this function changes,
 * every caller (quote, order creation, vendor accept) already passes the floor.
 */
export function calculatePrice(input: PriceInput): PriceBreakdown {
  const { unitPricePaise, quantity, floor } = input;
  if (!Number.isInteger(unitPricePaise) || unitPricePaise <= 0) throw new RangeError('invalid unit price');
  if (!Number.isInteger(quantity) || quantity <= 0) throw new RangeError('invalid quantity');
  if (!Number.isInteger(floor) || floor < 0) throw new RangeError('invalid floor');

  const subtotalPaise = unitPricePaise * quantity;
  const floorChargePaise = 0;
  return {
    unitPricePaise,
    quantity,
    floor,
    subtotalPaise,
    floorChargePaise,
    totalPaise: subtotalPaise + floorChargePaise,
  };
}
