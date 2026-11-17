/** Normalises an Indian mobile number to E.164 (+91XXXXXXXXXX). Returns null if invalid. */
export function normalizeIndianMobile(input: string): string | null {
  const cleaned = (input ?? '').replace(/[\s-]/g, '');
  const m = cleaned.match(/^(?:\+91|91|0)?([6-9]\d{9})$/);
  return m ? `+91${m[1]}` : null;
}
