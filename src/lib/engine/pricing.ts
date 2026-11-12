import { PRICING, isPeak, tierFor } from "../catalog";
import type { Court, Customer, Promo } from "../types";
import { MIN, hourOf, weekday } from "../time";

export interface Quote {
  listPrice: number;
  price: number;
  peak: boolean;
  promo?: Promo;
  tierDiscount: number;
  label?: string;
  breakdown: { label: string; amount: number }[];
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

/** Price one court session. Off-peak AI promos stack with the member's level discount. */
export function quote(
  court: Pick<Court, "id" | "type">,
  start: number,
  durationMin: number,
  opts: { customer?: Pick<Customer, "loyalty"> | null; promos?: Promo[]; now?: number } = {},
): Quote {
  const hourly = PRICING[court.type];
  // Price each half hour at its own rate so a session crossing into peak is billed fairly.
  let list = 0;
  let peakHalves = 0;
  const halves = Math.round(durationMin / 30);
  for (let i = 0; i < halves; i++) {
    const t = start + i * 30 * MIN;
    const peak = isPeak(weekday(t), hourOf(t));
    if (peak) peakHalves++;
    list += (peak ? hourly.peak : hourly.offPeak) / 2;
  }
  list = round2(list);
  const peak = peakHalves > halves / 2;

  const now = opts.now ?? Date.now();
  const h = hourOf(start);
  const promo = (opts.promos ?? []).find(
    (p) =>
      p.active &&
      p.until > now &&
      (p.courtIds === "all" || p.courtIds.includes(court.id)) &&
      p.days.includes(weekday(start)) &&
      h >= p.fromHour &&
      h < p.toHour,
  );

  const breakdown: Quote["breakdown"] = [{ label: `${durationMin} min · ${peak ? "peak" : "off-peak"} rate`, amount: list }];
  let price = list;
  if (promo) {
    const off = round2(price * promo.discount);
    price -= off;
    breakdown.push({ label: `${promo.label} (−${Math.round(promo.discount * 100)}%)`, amount: -off });
  }
  const tier = opts.customer ? tierFor(opts.customer.loyalty.lifetime) : null;
  const tierDiscount = tier?.courtDiscount ?? 0;
  if (tier && tierDiscount > 0) {
    const off = round2(price * tierDiscount);
    price -= off;
    breakdown.push({ label: `${tier.name} member (−${Math.round(tierDiscount * 100)}%)`, amount: -off });
  }
  price = round2(price);
  const label = promo ? promo.label : tierDiscount ? `${tier?.name} price` : undefined;
  return { listPrice: list, price, peak, promo, tierDiscount, label, breakdown };
}
