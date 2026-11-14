// All money is integer cents. Never use floats for amounts.
export type Cents = number;

export const cents = (dollars: number): Cents => Math.round(dollars * 100);

/** Round half up to the nearest cent from a fractional cent value. */
export const roundCents = (value: number): Cents => Math.round(value);

export const formatUSD = (c: Cents): string =>
  (c / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
