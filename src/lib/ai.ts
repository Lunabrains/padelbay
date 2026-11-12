import { TIERS, tierFor } from "./catalog";
import { nextFreeSlots, slotStatus, utilization } from "./engine/availability";
import { quote } from "./engine/pricing";
import type { Customer, DB, Tournament } from "./types";
import { DAY, HOUR, MIN, addDays, atHour, fmtDate, fmtHour, fmtTime, fmtWeekday, startOfDay } from "./time";

// Simulated AI. Every output here is deterministic demo logic over the shared data and is
// labelled "Simulated AI" wherever it appears. No model or external service is called.

export interface SlotRecommendation {
  courtId: string;
  start: number;
  durationMin: number;
  price: number;
  reason: string;
}

export function recommendSlots(db: DB, customer: Customer | undefined | null, now: number): SlotRecommendation[] {
  const recs: SlotRecommendation[] = [];
  const dur = 90;
  // 1) the member's usual slot this week
  if (customer?.preferredHour !== undefined && customer.preferredDay !== undefined) {
    for (let d = 0; d < 7; d++) {
      const day = addDays(startOfDay(now), d);
      if (new Date(day).getDay() !== customer.preferredDay) continue;
      const start = atHour(day, customer.preferredHour);
      if (start < now) continue;
      const court = db.courts.find((c) => slotStatus(db, c.id, start, dur, now) === "free");
      if (court) {
        const q = quote(court, start, dur, { customer, promos: db.promos, now });
        recs.push({ courtId: court.id, start, durationMin: dur, price: q.price, reason: `Your usual ${fmtWeekday(start, true)} ${fmtTime(start)} slot is open` });
      }
    }
  }
  // 2) the best value slot: an off-peak promo window
  const promo = db.promos.find((p) => p.active && p.until > now);
  if (promo) {
    for (let d = 0; d < 7 && recs.length < 2; d++) {
      const day = addDays(startOfDay(now), d);
      if (!promo.days.includes(new Date(day).getDay())) continue;
      const start = atHour(day, promo.fromHour);
      if (start < now) continue;
      const courtIds = promo.courtIds === "all" ? db.courts.map((c) => c.id) : promo.courtIds;
      const cid = courtIds.find((id) => slotStatus(db, id, start, dur, now) === "free");
      if (cid) {
        const court = db.courts.find((c) => c.id === cid)!;
        const q = quote(court, start, dur, { customer, promos: db.promos, now });
        recs.push({ courtId: cid, start, durationMin: dur, price: q.price, reason: `${promo.label}: ${Math.round(promo.discount * 100)}% off, quietest courts of the day` });
        break;
      }
    }
  }
  // 3) soonest sunset session on the sea side
  const sunset = nextFreeSlots(db, now, dur, 12, customer).find((s) => {
    const h = new Date(s.start).getHours();
    return (s.courtId === "c3" || s.courtId === "c4") && h >= 16 && h <= 18;
  });
  if (sunset && recs.length < 3) recs.push({ courtId: sunset.courtId, start: sunset.start, durationMin: dur, price: sunset.price, reason: "Golden-hour session on the sea side" });
  if (!recs.length) {
    const s = nextFreeSlots(db, now, dur, 1, customer)[0];
    if (s) recs.push({ courtId: s.courtId, start: s.start, durationMin: dur, price: s.price, reason: "Next free court" });
  }
  return recs.slice(0, 3);
}

export interface Match {
  customer: Customer;
  score: number;
  reasons: string[];
}

export function matchmaking(db: DB, me: Customer | undefined | null, limit = 6): Match[] {
  if (!me) return [];
  const myHours = me.preferredHour ?? 19;
  return db.customers
    .filter((c) => c.id !== me.id && !c.isDemoGuest)
    .map((c) => {
      const skillGap = Math.abs(c.skill.rating - me.skill.rating);
      const sideFit = me.skill.side === "both" || c.skill.side === "both" || c.skill.side !== me.skill.side;
      const hourFit = Math.abs((c.preferredHour ?? 19) - myHours) <= 2;
      const styleFit = c.skill.style !== me.skill.style || c.skill.style === "all-round";
      let score = 100 - skillGap * 28;
      if (sideFit) score += 8;
      if (hourFit) score += 10;
      if (styleFit) score += 6;
      score = Math.max(5, Math.min(99, Math.round(score)));
      const reasons = [
        skillGap < 0.5 ? `Same level (${c.skill.rating.toFixed(1)})` : `Level ${c.skill.rating.toFixed(1)}, a stretch match`,
        ...(sideFit ? [`Plays the ${c.skill.side === "both" ? "either" : c.skill.side} side`] : []),
        ...(hourFit ? [`Also plays around ${fmtHour(c.preferredHour ?? 19)}`] : []),
        ...(styleFit ? [`${c.skill.style} style complements yours`] : []),
      ];
      return { customer: c, score, reasons };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

export function churnRisk(db: DB, c: Customer, now: number) {
  const days = (now - c.lastVisitAt) / DAY;
  const recent = db.bookings.filter((b) => b.customerId === c.id && b.status === "confirmed" && b.start > now - 28 * DAY && b.start < now).length;
  const previous = db.bookings.filter((b) => b.customerId === c.id && b.status === "confirmed" && b.start > now - 56 * DAY && b.start < now - 28 * DAY).length;
  let score = Math.min(1, days / 45);
  if (previous > 0 && recent < previous) score += 0.2 * ((previous - recent) / previous);
  if (db.bookings.some((b) => b.customerId === c.id && b.status === "confirmed" && b.start > now)) score -= 0.4;
  score = Math.max(0, Math.min(1, score));
  const label = score > 0.66 ? "High" : score > 0.36 ? "Medium" : "Low";
  const reasons = [
    `Last visit ${Math.round(days)} days ago`,
    previous ? `${recent} sessions in the last 4 weeks vs ${previous} before` : `${recent} sessions in the last 4 weeks`,
  ];
  return { score, label, reasons };
}

export function forecast(db: DB, now: number) {
  // Demand per hour for the next 7 days: booked share + a learned pattern for what usually fills.
  const days = Array.from({ length: 7 }, (_, d) => addDays(startOfDay(now), d));
  const hours = Array.from({ length: 17 }, (_, i) => 7 + i);
  return days.map((day) => {
    const dow = new Date(day).getDay();
    const weekend = dow === 0 || dow === 6;
    return {
      day,
      cells: hours.map((h) => {
        const from = atHour(day, h);
        const booked = utilization(db, null, from, from + HOUR);
        const pattern = h < 9 ? 0.4 : h < 13 ? (weekend ? 0.65 : 0.3) : h < 17 ? (weekend ? 0.7 : 0.25) : 0.9;
        const predicted = Math.min(1, Math.max(booked, booked * 0.5 + pattern * 0.6));
        return { hour: h, booked, predicted, confidence: 0.72 + (day === startOfDay(now) ? 0.2 : 0) };
      }),
    };
  });
}

export interface BriefingItem {
  id: string;
  title: string;
  detail: string;
  impact: string;
  action?: "promo" | "reactivation" | "restock" | "staffing" | "tournament";
}

export function briefing(db: DB, now: number) {
  const today = startOfDay(now);
  const todayBookings = db.bookings.filter((b) => b.status === "confirmed" && b.kind !== "maintenance" && b.start >= today && b.start < today + DAY);
  const revenueToday = todayBookings.reduce((s, b) => s + b.price, 0) + db.orders.filter((o) => o.createdAt >= today).reduce((s, o) => s + o.total, 0);
  const lastWeek = db.bookings.filter((b) => b.status === "confirmed" && b.kind !== "maintenance" && b.start >= today - 7 * DAY && b.start < today - 6 * DAY).reduce((s, b) => s + b.price, 0);
  const util = utilization(db, null, atHour(today, 7), atHour(today, 24));
  const f = forecast(db, now);
  // the weakest weekday afternoon block on the sea-side courts
  const weak = f.slice(1).map((d) => ({ day: d.day, v: d.cells.filter((c) => c.hour >= 13 && c.hour < 17).reduce((s, c) => s + c.predicted, 0) / 4 })).sort((a, b) => a.v - b.v)[0];
  const lapsed = db.customers.filter((c) => churnRisk(db, c, now).label === "High");
  const lowStock = db.inventory.filter((i) => i.qty <= i.reorderAt);
  const peakTonight = f[0].cells.filter((c) => c.hour >= 18 && c.hour < 23 && c.predicted > 0.85).length;
  const items: BriefingItem[] = [];
  if (weak) items.push({ id: "promo", title: `Fill ${fmtWeekday(weak.day, true)} afternoon`, detail: `Courts 3–4 are forecast at ${Math.round(weak.v * 100)}% between 13:00 and 16:00. A 20% Sea Breeze promo to the weekday-flex segment converted 12% last time.`, impact: "+$310 est.", action: "promo" });
  const names = [...new Set(lapsed.map((c) => c.name.split(" ")[0]))];
  if (lapsed.length) items.push({ id: "reactivation", title: `${lapsed.length} regulars at high churn risk`, detail: `${names.slice(0, 3).join(", ")}${lapsed.length > 3 ? " and others" : ""} haven't played in 3+ weeks. A personalised WhatsApp win-back is drafted.`, impact: `${Math.round(lapsed.length * 0.24)} returns est.`, action: "reactivation" });
  if (lowStock.length) items.push({ id: "restock", title: `Restock ${lowStock.map((i) => i.name.toLowerCase()).slice(0, 2).join(" and ")}`, detail: `At today's pace ${lowStock[0].name.toLowerCase()} runs out before the evening rush.`, impact: "Avoid sold-outs", action: "restock" });
  if (peakTonight >= 3) items.push({ id: "staffing", title: "Busy evening ahead", detail: `${peakTonight} peak hours above 85% tonight. Put a second barista on 18:00–22:00 for court deliveries.`, impact: "−4 min delivery", action: "staffing" });
  const t = db.tournaments.find((x) => x.status === "registration" && !x.plan);
  if (t) items.push({ id: "tournament", title: `${t.name}: ${t.teams.length}/${t.maxTeams} teams`, detail: "AI can seed groups by rating and slot matches onto free courts without touching paying bookings.", impact: "Saves ~2h of admin", action: "tournament" });
  const delta = lastWeek ? (revenueToday - lastWeek) / lastWeek : 0;
  return {
    greeting: new Date(now).getHours() < 12 ? "Good morning" : new Date(now).getHours() < 18 ? "Good afternoon" : "Good evening",
    headline: `${todayBookings.length} sessions today, ${Math.round(util * 100)}% of court hours booked.`,
    revenueToday,
    delta,
    items,
  };
}

export function tournamentPlan(db: DB, t: Tournament, now: number) {
  const rated = t.teams
    .map((tm) => ({ id: tm.id, rating: tm.players.reduce((s, p) => s + (db.customers.find((c) => c.id === p)?.skill.rating ?? 3), 0) / 2 }))
    .sort((a, b) => b.rating - a.rating);
  const groupCount = Math.max(2, Math.round(rated.length / 4));
  const groups = Array.from({ length: groupCount }, (_, i) => ({ name: `Group ${String.fromCharCode(65 + i)}`, teamIds: [] as string[] }));
  // snake seeding keeps groups balanced by average rating
  rated.forEach((r, i) => {
    const round = Math.floor(i / groupCount);
    const idx = round % 2 === 0 ? i % groupCount : groupCount - 1 - (i % groupCount);
    groups[idx].teamIds.push(r.id);
  });
  const slots: { courtId: string; start: number; label: string }[] = [];
  let t0 = t.start;
  let round = 1;
  while (slots.length < groupCount * 3 && round < 8) {
    for (const c of db.courts) {
      if (slots.length >= groupCount * 3) break;
      if (slotStatus(db, c.id, t0, 45, now) === "free") slots.push({ courtId: c.id, start: t0, label: `Round ${round}` });
    }
    t0 += 45 * MIN;
    round++;
  }
  const avg = groups.map((g) => g.teamIds.reduce((s, id) => s + (rated.find((r) => r.id === id)?.rating ?? 0), 0) / Math.max(1, g.teamIds.length));
  return {
    generatedAt: now,
    groups,
    slots,
    notes: [
      `Snake-seeded by average team rating: groups average ${avg.map((a) => a.toFixed(2)).join(" / ")}.`,
      `${slots.length} matches placed on free courts from ${fmtDate(t.start)} ${fmtTime(t.start)}, no paying bookings moved.`,
      "Players get an automatic WhatsApp with their group and first match time.",
    ],
  };
}

export function tierDistribution(db: DB) {
  return TIERS.map((t, i) => ({
    tier: t,
    count: db.customers.filter((c) => {
      const lt = c.loyalty.lifetime;
      const next = TIERS[i + 1];
      return lt >= t.min && (!next || lt < next.min);
    }).length,
  }));
}
