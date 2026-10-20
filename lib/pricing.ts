/** Pure pricing rules (no database) so they can be unit-tested. The server re-runs these on every confirmed order. */
export type PriceSource = 'CUSTOMER' | 'STANDARD';

export interface Tier {
  id: string;
  minQuantity: number;
  price: string;
  effectiveFrom: Date;
  active: boolean;
  updatedAt: Date;
}

/**
 * Picks the customer-specific tier that applies to `qty`: active, already effective, minQuantity satisfied.
 * Highest satisfied minQuantity wins (most specific rule); ties go to the most recently updated row.
 * Buying more never triggers a discount unless a tier with that minQuantity was explicitly configured.
 */
export function pickTier(tiers: Tier[], qty: number, now = new Date()): Tier | null {
  const ok = tiers.filter((t) => t.active && t.effectiveFrom <= now && t.minQuantity <= qty);
  if (!ok.length) return null;
  return ok.sort((a, b) => b.minQuantity - a.minQuantity || b.updatedAt.getTime() - a.updatedAt.getTime())[0];
}

/**
 * Priority: 1) active customer price for this package, 2) active standard package price, 3) nothing (caller must
 * reject, or use the authorised custom-price workflow). `standard` is null when the package has no active standard price.
 */
export function resolveUnitPrice(args: { standard: string | null; tiers: Tier[]; qty: number; now?: Date }): { price: string; source: PriceSource; tierId?: string } | null {
  const tier = pickTier(args.tiers, args.qty, args.now);
  if (tier) return { price: tier.price, source: 'CUSTOMER', tierId: tier.id };
  if (args.standard !== null) return { price: args.standard, source: 'STANDARD' };
  return null;
}

/** Client-side preview of the same rule using the tiers the API returned (already filtered to active + effective). Server revalidates. */
export function unitForQty(standard: string | null, tiers: { minQuantity: number; price: string }[], qty: number): { price: string; source: PriceSource } | null {
  const t = tiers.filter((x) => x.minQuantity <= qty).sort((a, b) => b.minQuantity - a.minQuantity)[0];
  if (t) return { price: t.price, source: 'CUSTOMER' };
  return standard !== null ? { price: standard, source: 'STANDARD' } : null;
}
