"use client";

import clsx from "clsx";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowUp, Check, Loader2, Sparkles, X } from "lucide-react";
import { JoinCard, SimBadge } from "@/components/ui/kit";
import { bookCourt, placeOrder, recordConcierge, upcomingFor } from "@/lib/actions";
import { matchmaking, recommendSlots, stayPackageFor } from "@/lib/ai";
import { CANCELLATION, TIERS, VENUE, nextTier, tierFor } from "@/lib/catalog";
import { slotStatus } from "@/lib/engine/availability";
import { quote } from "@/lib/engine/pricing";
import { useFx } from "@/lib/fx";
import { useCustomer } from "@/lib/hooks";
import { getDB } from "@/lib/store";
import type { Customer, DB, MenuItem, OrderLine } from "@/lib/types";
import { CLOSE_HOUR, OPEN_HOUR, addDays, atHour, fmtDayLabel, fmtRange, fmtTime, startOfDay } from "@/lib/time";

// "Ask the bay": a simulated concierge. Intent detection and planning are deterministic demo
// logic over the live shared data; every booking or payment waits for an explicit tap.

interface PreparedBooking {
  courtId: string;
  start: number;
  durationMin: number;
  players: number;
  price: number;
  listPrice: number;
  breakdown: { label: string; amount: number }[];
}

interface PreparedOrder {
  lines: OrderLine[];
  total: number;
}

type Card =
  | { kind: "booking"; booking: PreparedBooking; order?: PreparedOrder; state: "pending" | "done" | "cancelled"; passId?: string }
  | { kind: "order"; order: PreparedOrder; deliver: { kind: "court" | "pickup"; refId?: string; label: string }; state: "pending" | "done" | "cancelled" }
  | { kind: "slots"; options: { courtId: string; start: number; durationMin: number; price: number; reason?: string }[] }
  | { kind: "tier" }
  | { kind: "package"; id: string; reason: string }
  | { kind: "matches" }
  | { kind: "join" }
  | { kind: "links"; links: { href: string; label: string }[] };

interface Msg {
  id: string;
  role: "user" | "bay";
  text: string;
  steps?: string[];
  cards?: Card[];
}

const NUM: Record<string, number> = { one: 1, a: 1, an: 1, two: 2, three: 3, four: 4, five: 5, six: 6, couple: 2 };
const DAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

const ITEM_ALIASES: [RegExp, string][] = [
  [/flat ?whites?/, "flat-white"],
  [/spanish ?lattes?/, "spanish-latte"],
  [/iced ?lattes?|lattes?/, "iced-latte"],
  [/cortados?/, "cortado"],
  [/espressos?/, "espresso"],
  [/cold ?brews?/, "cold-brew"],
  [/v60|pour.?over/, "v60"],
  [/strawberry matcha/, "strawberry-matcha"],
  [/matcha/, "matcha-latte"],
  [/chai/, "chai"],
  [/smoothies?|tropical|sunset smoothie/, "tropical-sunset"],
  [/detox|green juice/, "green-detox"],
  [/orange juice|fresh orange|oj/, "fresh-orange"],
  [/protein|shake/, "protein-shake"],
  [/electrolytes?|coconut/, "electrolyte"],
  [/a[cç]a[ií]/, "acai-bowl"],
  [/avocado|toast/, "avocado-toast"],
  [/halloumi|wrap/, "halloumi-wrap"],
  [/quiche/, "quiche"],
  [/banana bread/, "banana-bread"],
  [/water|coffees?(?! by)/, "flat-white"],
];

function parseItems(text: string, menu: MenuItem[]): OrderLine[] {
  const lines: OrderLine[] = [];
  const seen = new Set<string>();
  for (const [re, id] of ITEM_ALIASES) {
    const m = text.match(new RegExp(`(?:(\\d+|one|two|three|four|five|six|a|an|couple of)\\s+(?:x\\s*)?)?(?:\\w+\\s)?${re.source}`));
    if (!m || seen.has(id)) continue;
    if (id === "flat-white" && /water/.test(m[0]) && !/coffee/.test(text)) continue;
    const item = menu.find((x) => x.id === id && x.available);
    if (!item) continue;
    seen.add(id);
    const q = m[1] ? (Number(m[1]) || NUM[m[1].replace(" of", "")] || 1) : 1;
    lines.push({ itemId: item.id, name: item.name, qty: Math.min(8, q), unitPrice: item.price, options: [], optionsLabel: "" });
  }
  return lines;
}

function parseWhen(text: string, now: number): { day?: number; hour?: number } {
  const today = startOfDay(now);
  let day: number | undefined;
  if (/\btoday\b|\btonight\b|\bthis (evening|afternoon|morning)\b/.test(text)) day = today;
  if (/\btomorrow\b|\btmrw\b/.test(text)) day = addDays(today, 1);
  DAYS.forEach((d, i) => {
    if (new RegExp(`\\b(${d}|${d.slice(0, 3)})\\b`).test(text)) {
      let diff = (i - new Date(today).getDay() + 7) % 7;
      if (diff === 0 && !/today|tonight/.test(text)) diff = 7;
      day = addDays(today, diff);
    }
  });
  if (/\bweekend\b/.test(text) && day === undefined) day = addDays(today, (6 - new Date(today).getDay() + 7) % 7 || 7);
  let hour: number | undefined;
  // the first number that reads like a time: "8pm", "at 8", "20:00" (not "for 4")
  const hm = [...text.matchAll(/\b(at\s*)?(\d{1,2})(?:[:.h](\d{2}))?\s*(am|pm)?\b/g)]
    .map((m) => [m[0], m[2], m[3], m[4], m[1]] as const)
    .find((m) => m[3] || m[4] || m[2]);
  if (hm) {
    let h = Number(hm[1]);
    const mins = hm[2] ? Number(hm[2]) : 0;
    if (h > 23) h = 20;
    if (hm[3] === "pm" && h < 12) h += 12;
    if (hm[3] === "am" && h === 12) h = 0;
    if (!hm[3] && h >= 1 && h <= 6) h += 12; // "at 8" for padel means the evening
    if (!hm[3] && h === 7 && /tonight|evening/.test(text)) h += 12;
    if (!hm[3] && h >= 8 && h <= 11 && /tonight|evening|night/.test(text)) h += 12;
    hour = h + (mins >= 30 ? 0.5 : 0);
  } else if (/\bsunset\b|golden hour/.test(text)) hour = 16.5;
  else if (/\bmorning\b/.test(text)) hour = 9;
  else if (/\bafternoon\b/.test(text)) hour = 15;
  else if (/\bevening\b|tonight/.test(text)) hour = 19;
  if (hour !== undefined && day === undefined) day = atHour(today, hour) > now ? today : addDays(today, 1);
  return { day, hour };
}

function parseDuration(text: string): number | undefined {
  if (/\b(120|2\s*h(ours?)?|two hours)\b/.test(text)) return 120;
  if (/\b(90|1[.,]5\s*h(ours?)?|hour and a half|an hour and a half)\b/.test(text)) return 90;
  if (/\b(60|1\s*h(our)?|an hour|one hour)\b/.test(text)) return 60;
  return undefined;
}

function parsePlayers(text: string): number | undefined {
  const m = text.match(/\bfor\s+(\d|two|three|four|couple)\b|\b(\d|two|three|four)\s+(?:of us|players|people|friends)\b/);
  const raw = m?.[1] ?? m?.[2];
  if (!raw) return undefined;
  const n = Number(raw) || NUM[raw] || 4;
  return /friends/.test(text) && !/of us/.test(text) ? Math.min(4, n + 1) : Math.min(4, n);
}

function bestCourt(db: DB, text: string, start: number, dur: number, now: number) {
  const prefer = /court\s*([1-4])/.exec(text)?.[1];
  const indoor = /\bindoor|hall|inside\b/.test(text);
  const outdoor = /\boutdoor|sea|outside|beach\b/.test(text);
  let order = db.courts.map((c) => c.id);
  if (prefer) order = [`c${prefer}`, ...order.filter((id) => id !== `c${prefer}`)];
  else if (indoor) order = ["c1", "c2", "c3", "c4"];
  else if (outdoor) order = ["c3", "c4", "c1", "c2"];
  else order = ["c3", "c4", "c1", "c2"];
  return order.find((id) => slotStatus(db, id, start, dur, now) === "free");
}

function prepare(db: DB, customer: Customer | undefined, courtId: string, start: number, dur: number, players: number): PreparedBooking {
  const court = db.courts.find((c) => c.id === courtId)!;
  const q = quote(court, start, dur, { customer, promos: db.promos });
  return { courtId, start, durationMin: dur, players, price: q.price, listPrice: q.listPrice, breakdown: q.breakdown };
}

function respond(input: string, ctx: { db: DB; customer?: Customer; now: number; pending?: PreparedBooking }): Omit<Msg, "id" | "role"> {
  const { db, customer, now } = ctx;
  const text = input.toLowerCase();
  const first = customer?.name.split(" ")[0];
  const items = parseItems(text, db.menu);
  const when = parseWhen(text, now);
  const dur = parseDuration(text);
  const players = parsePlayers(text);
  const wantsBook = /\b(book|reserve|court for|get (us )?a court|play)\b/.test(text) || (when.hour !== undefined && /court|play|game|match/.test(text));
  const wantsAvail = /\b(available|availability|free|slots?|open courts?|when can)\b/.test(text);
  const steps: string[] = [];

  // tweak a pending booking: "make it 9pm", "indoor instead", "2 hours"
  if (ctx.pending && !wantsBook && (when.hour !== undefined || dur || /indoor|outdoor|sea|hall/.test(text))) {
    const p = ctx.pending;
    const start = when.hour !== undefined ? atHour(when.day ?? startOfDay(p.start), Math.floor(when.hour), (when.hour % 1) * 60) : p.start;
    const d = dur ?? p.durationMin;
    steps.push(`Re-checking ${fmtDayLabel(start, now)} ${fmtTime(start)} for ${d} min`);
    const cid = /indoor|outdoor|sea|hall|court\s*[1-4]/.test(text) ? bestCourt(db, text, start, d, now) : slotStatus(db, p.courtId, start, d, now) === "free" ? p.courtId : bestCourt(db, text, start, d, now);
    if (!cid) return { text: `That one's taken. Here's what I can do around then:`, steps, cards: [{ kind: "slots", options: alternatives(db, customer, start, d, now) }] };
    const b = prepare(db, customer, cid, start, d, p.players);
    return { text: `Updated. ${db.courts.find((c) => c.id === cid)?.short}, ${fmtDayLabel(start, now).toLowerCase()} ${fmtRange(start, d)}. Still waiting for your yes.`, steps, cards: [{ kind: "booking", booking: b, state: "pending" }] };
  }

  if (wantsBook || (wantsAvail && when.day !== undefined)) {
    const d = dur ?? 90;
    if (when.hour === undefined) {
      steps.push(`Scanning all 4 courts${when.day !== undefined ? ` for ${fmtDayLabel(when.day, now).toLowerCase()}` : ""}`);
      const options = when.day !== undefined ? alternatives(db, customer, atHour(when.day, 18), d, now) : recommendSlots(db, customer, now).map((r) => ({ ...r, reason: r.reason }));
      return { text: `Here are the best ${d}-minute options${first ? ` for you, ${first}` : ""}. Tap one and I'll prepare it.`, steps, cards: [{ kind: "slots", options }] };
    }
    const start = atHour(when.day ?? startOfDay(now), Math.floor(when.hour), (when.hour % 1) * 60);
    steps.push(`Checking ${fmtDayLabel(start, now).toLowerCase()} ${fmtTime(start)}–${fmtTime(start + d * 60000)} across 4 courts`);
    if (start < now) return { text: "That time has already passed. Want the next free slot instead?", steps, cards: [{ kind: "slots", options: alternatives(db, customer, now, d, now) }] };
    const h = new Date(start).getHours();
    if (h < OPEN_HOUR || h + d / 60 > CLOSE_HOUR) return { text: `We're open ${OPEN_HOUR}:00 to midnight. Here's what's closest:`, steps, cards: [{ kind: "slots", options: alternatives(db, customer, atHour(startOfDay(start), 20), d, now) }] };
    const cid = bestCourt(db, text, start, d, now);
    if (!cid) {
      steps.push("All courts taken, looking at nearby times");
      return { text: `Every court is booked at ${fmtTime(start)}. Closest alternatives:`, steps, cards: [{ kind: "slots", options: alternatives(db, customer, start, d, now) }] };
    }
    const b = prepare(db, customer, cid, start, d, players ?? 4);
    const court = db.courts.find((c) => c.id === cid)!;
    if (b.price < b.listPrice) steps.push(`Applied ${b.breakdown.slice(1).map((x) => x.label.split(" (")[0]).join(" + ")}`);
    let order: PreparedOrder | undefined;
    if (items.length) {
      steps.push(`Lining up ${items.map((l) => `${l.qty}× ${l.name}`).join(", ")} for the ${court.short} gate`);
      order = { lines: items, total: Math.round(items.reduce((s, l) => s + l.qty * l.unitPrice, 0) * 100) / 100 };
    }
    const msg = `${court.short} is free ${fmtDayLabel(start, now).toLowerCase()} ${fmtRange(start, d)}, ${court.type === "indoor" ? "inside the hall" : "on the sea side"}, $${b.price.toFixed(2)}${order ? `. I'll have ${order.lines.map((l) => `${l.qty} ${l.name.toLowerCase()}${l.qty > 1 ? "s" : ""}`).join(" and ")} waiting at the gate when you arrive` : ""}. Nothing is booked until you confirm.`;
    return { text: msg, steps, cards: [...(customer ? [] : [{ kind: "join" } as Card]), { kind: "booking", booking: b, order, state: "pending" }] };
  }

  if (items.length) {
    const next = customer ? upcomingFor(db, customer.id, now)[0] : undefined;
    const court = next ? db.courts.find((c) => c.id === next.courtId) : undefined;
    const order = { lines: items, total: Math.round(items.reduce((s, l) => s + l.qty * l.unitPrice, 0) * 100) / 100 };
    steps.push("Checking the Sip kitchen queue");
    return {
      text: `${items.map((l) => `${l.qty}× ${l.name}`).join(", ")}, $${order.total.toFixed(2)}. ${court ? `I can send it to the ${court.short} gate for your ${fmtTime(next!.start)} session.` : "Ready for pickup at Sip in about 5 minutes."}`,
      steps,
      cards: [...(customer ? [] : [{ kind: "join" } as Card]), { kind: "order", order, deliver: court ? { kind: "court", refId: court.id, label: court.short } : { kind: "pickup", label: "Pickup at Sip" }, state: "pending" }],
    };
  }

  if (wantsAvail) {
    steps.push("Scanning the next 36 hours");
    return { text: "Here's what's open soonest:", steps, cards: [{ kind: "slots", options: alternatives(db, customer, now, dur ?? 90, now) }] };
  }

  if (/\b(level|points?|tier|loyalty|benefits?|perks?|rookie|challenger|elite|legend|member(ship)?)\b/.test(text)) {
    const tier = customer ? tierFor(customer.loyalty.lifetime) : TIERS[0];
    const next = customer ? nextTier(customer.loyalty.lifetime) : TIERS[1];
    const named = TIERS.find((t) => text.includes(t.id));
    const t = named ?? tier;
    const text2 = named
      ? `${named.name} (${named.character}) starts at ${named.min.toLocaleString()} points: ${named.privileges.join(", ").toLowerCase()}.`
      : customer
        ? `You're ${tier.name} with ${customer.loyalty.points} points.${next ? ` ${next.min - customer.loyalty.lifetime} more to ${next.name}, which unlocks ${next.privileges[0].toLowerCase()}.` : " You're at the top: Legend."} Quickest route: order from Sip (double points) and book a weekly session.`
        : `There are four levels: Rookie, Challenger, Elite and Legend. You start as a Rookie with 150 welcome points. ${t.privileges[0]}.`;
    return { text: text2, cards: [{ kind: "tier" }, { kind: "links", links: [{ href: "/club", label: "Open the Club" }] }] };
  }

  if (/\b(stay|suite|pod|villa|loft|night|sleep|hotel|package|weekend away)\b/.test(text)) {
    const rec = stayPackageFor(db, customer);
    steps.push("Matching your play pattern to a stay");
    return { text: `Bay Suites are a planned addition, so this is a preview. My pick: ${rec.pkg.name}. ${rec.reason}.`, steps, cards: [{ kind: "package", id: rec.pkg.id, reason: rec.reason }] };
  }

  if (/\b(partner|opponent|match(es)?|tournament|americano|who can i play|players?|find (me )?(a )?(game|four))\b/.test(text)) {
    steps.push("Running matchmaking on level, side and play style");
    const top = matchmaking(db, customer, 3);
    return {
      text: customer && top.length ? `Your strongest fits right now: ${top.map((m) => `${m.customer.name.split(" ")[0]} (${m.score}%)`).join(", ")}. There are also open matches you can join.` : "There are open matches around every level this week. Join one or host your own.",
      steps,
      cards: [{ kind: "matches" }, { kind: "links", links: [{ href: "/community", label: "Open Community" }, { href: "/community?tab=tournaments", label: "Tournaments" }] }],
    };
  }

  if (/\b(cancel|refund|policy|reschedul)\b/.test(text)) return { text: CANCELLATION.summary + (customer ? ` As ${tierFor(customer.loyalty.lifetime).name}, your free window is ${tierFor(customer.loyalty.lifetime).freeCancelHours}h.` : ""), cards: [{ kind: "links", links: [{ href: "/me", label: "My bookings" }] }] };

  if (/\b(where|address|location|directions|open|hours|contact|phone|email|instagram)\b/.test(text))
    return { text: `${VENUE.address}. Open daily 07:00 to midnight. ${VENUE.phone} · ${VENUE.email} · @padelbaycourts on Instagram.` };

  if (/\b(recommend|suggest|what should|plan|bored|surprise|ideas?)\b/.test(text)) {
    steps.push("Looking at your history, live availability and today's offers");
    const recs = recommendSlots(db, customer, now);
    return { text: `${first ? `${first}, h` : "H"}ere's my plan: a ${recs[0] ? `${fmtTime(recs[0].start)} session (${recs[0].reason.toLowerCase()})` : "sunset session"}, then refuel at Sip. Double points on every Sip order this week.`, steps, cards: [{ kind: "slots", options: recs }] };
  }

  if (/^(hi|hey|hello|salut|marhaba|ahla|bonjour)\b/.test(text)) return { text: `Ahla${first ? ` ${first}` : ""}! I can book courts, send Sip to your court, plan a stay or find you a four. What's the plan?` };

  return { text: "I can help with courts, Sip orders, Bay Suites, the Club and finding players. Try “court for 4 tomorrow at 8pm”, “two flat whites to my court” or “what do I get at Elite?”." };
}

function alternatives(db: DB, customer: Customer | undefined, around: number, dur: number, now: number) {
  const out: { courtId: string; start: number; durationMin: number; price: number; reason?: string }[] = [];
  const offsets = [0, 30, -30, 60, -60, 90, -90, 120, -120, 150, 180, -180, 210, 240, -240, 270, 300, -300, 360, -360, 420, -420, 480, -480];
  for (const o of offsets) {
    const t = around + o * 60000;
    if (t < now) continue;
    const h = new Date(t).getHours() + new Date(t).getMinutes() / 60;
    if (h < OPEN_HOUR || h + dur / 60 > CLOSE_HOUR) continue;
    for (const c of ["c3", "c4", "c1", "c2"]) {
      if (out.length >= 4 || out.some((x) => x.start === t)) break;
      if (slotStatus(db, c, t, dur, now) === "free") {
        const court = db.courts.find((x) => x.id === c)!;
        out.push({ courtId: c, start: t, durationMin: dur, price: quote(court, t, dur, { customer, promos: db.promos, now }).price });
      }
    }
  }
  return out;
}

const SUGGESTIONS = ["Court for 4 tomorrow at 8pm + 2 flat whites", "What's free tonight?", "What do I get at Elite?", "Plan me a stay & play weekend", "Find me a partner at my level"];

export default function Concierge() {
  const open = useFx((s) => s.conciergeOpen);
  const seed = useFx((s) => s.conciergeSeed);
  const close = useFx((s) => s.closeConcierge);
  const celebrate = useFx((s) => s.celebrate);
  const customer = useCustomer();
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState<string[] | null>(null);
  const [busyCard, setBusyCard] = useState<string | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const seeded = useRef<string | null>(null);

  const pending = (() => {
    for (let i = msgs.length - 1; i >= 0; i--) {
      const c = msgs[i].cards?.find((x) => x.kind === "booking" && x.state === "pending");
      if (c && c.kind === "booking") return c.booking;
    }
    return undefined;
  })();

  const send = (text: string) => {
    const t = text.trim();
    if (!t) return;
    const user: Msg = { id: Math.random().toString(36).slice(2), role: "user", text: t };
    setMsgs((m) => [...m, user]);
    setInput("");
    const reply = respond(t, { db: getDB(), customer, now: Date.now(), pending });
    setThinking(reply.steps?.length ? reply.steps : ["Thinking"]);
    setTimeout(() => {
      setThinking(null);
      setMsgs((m) => [...m, { ...reply, id: Math.random().toString(36).slice(2), role: "bay" }]);
    }, 650 + (reply.steps?.length ?? 0) * 450);
  };

  useEffect(() => {
    if (open && seed && seeded.current !== seed) {
      seeded.current = seed;
      setTimeout(() => send(seed), 350);
    }
    if (!open) seeded.current = null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, seed]);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [msgs, thinking]);

  const updateCard = (msgId: string, idx: number, patch: Partial<Card>) =>
    setMsgs((m) => m.map((x) => (x.id === msgId ? { ...x, cards: x.cards?.map((c, i) => (i === idx ? ({ ...c, ...patch } as Card) : c)) } : x)));

  const confirmBooking = (msgId: string, idx: number, card: Extract<Card, { kind: "booking" }>) => {
    if (!customer) return;
    setBusyCard(`${msgId}-${idx}`);
    setTimeout(() => {
      const b = card.booking;
      const res = bookCourt({ customerId: customer.id, courtId: b.courtId, start: b.start, durationMin: b.durationMin, players: [], splitPayment: false, weeks: 1, paymentMethod: "Apple Pay", openMatch: false, source: "concierge" });
      if (!res.ok) {
        setBusyCard(null);
        setMsgs((m) => [...m, { id: Math.random().toString(36).slice(2), role: "bay", text: `Couldn't confirm: ${res.error}. Want me to look for another time?` }]);
        return;
      }
      let orderReward;
      if (card.order) {
        const court = getDB().courts.find((c) => c.id === b.courtId)!;
        const o = placeOrder({ customerId: customer.id, lines: card.order.lines, deliverTo: { kind: "court", refId: court.id, label: court.short }, method: "Apple Pay" });
        if (o.ok) orderReward = o.reward;
      }
      recordConcierge(customer.id, `Concierge booked ${getDB().courts.find((c) => c.id === b.courtId)?.short} ${fmtRange(b.start, b.durationMin)}${card.order ? " with a Sip order" : ""} after customer confirmation`);
      setBusyCard(null);
      updateCard(msgId, idx, { state: "done", passId: res.value.passId });
      celebrate(res.reward);
      if (orderReward) setTimeout(() => celebrate(orderReward), 600);
      setMsgs((m) => [...m, { id: Math.random().toString(36).slice(2), role: "bay", text: `Done. Your Padel Bay Club card now opens the ${getDB().courts.find((c) => c.id === card.booking.courtId)?.short} gate${card.order ? " and Sip has your order" : ""}. See you on court!`, cards: [{ kind: "links", links: [{ href: "/me", label: "Open my club card" }, ...(card.order ? [{ href: "/cafe", label: "Track the order" }] : [])] }] }]);
    }, 1100);
  };

  const confirmOrder = (msgId: string, idx: number, card: Extract<Card, { kind: "order" }>) => {
    if (!customer) return;
    setBusyCard(`${msgId}-${idx}`);
    setTimeout(() => {
      const res = placeOrder({ customerId: customer.id, lines: card.order.lines, deliverTo: card.deliver, method: "Apple Pay" });
      setBusyCard(null);
      if (!res.ok) return;
      recordConcierge(customer.id, `Concierge placed Sip order #${res.value.number} after customer confirmation`);
      updateCard(msgId, idx, { state: "done" });
      celebrate(res.reward);
    }, 900);
  };

  if (!open) return null;
  const db = getDB();

  return (
    <div className="fixed inset-0 z-[55] flex items-end justify-end p-0 md:inset-auto md:bottom-5 md:right-5 md:p-0">
      <button className="absolute inset-0 bg-ink/50 md:hidden" onClick={close} aria-label="Close concierge" />
      <div className="glass-dark animate-rise relative flex h-[88dvh] w-full flex-col overflow-hidden rounded-t-[30px] md:h-[640px] md:w-[410px] md:rounded-[30px]">
        <header className="flex items-center gap-3 border-b border-white/10 px-5 py-4">
          <span className="relative flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-sage to-teal">
            <span className="absolute inset-0 animate-pulse-ring rounded-full border-2 border-sage" />
            <Sparkles size={18} className="text-white" />
          </span>
          <div className="flex-1">
            <p className="font-display text-[20px] font-bold lowercase leading-none text-white">ask the bay</p>
            <div className="mt-1"><SimBadge>Simulated AI · demo logic</SimBadge></div>
          </div>
          <button onClick={close} className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20" aria-label="Close"><X size={16} /></button>
        </header>
        <div ref={scroller} className="thin-scrollbar flex-1 space-y-3 overflow-y-auto px-4 py-4">
          {msgs.length === 0 && (
            <div className="space-y-3">
              <div className="w-fit max-w-[90%] rounded-[20px] rounded-bl-md bg-white/10 px-4 py-3 text-[13.5px] text-white/90">
                Ahla{customer ? ` ${customer.name.split(" ")[0]}` : ""}! I&apos;m the Padel Bay concierge. I check live courts, Sip and Bay Suites, prepare everything, and only book when you say yes.
              </div>
              <div className="flex flex-wrap gap-1.5">
                {SUGGESTIONS.map((s) => (
                  <button key={s} onClick={() => send(s)} className="rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-[12px] text-white/85 transition hover:bg-white/12">{s}</button>
                ))}
              </div>
            </div>
          )}
          {msgs.map((m) => (
            <div key={m.id} className={clsx("flex flex-col gap-2", m.role === "user" ? "items-end" : "items-start")}>
              {m.steps && m.role === "bay" && (
                <div className="space-y-0.5 pl-1">
                  {m.steps.map((s) => <p key={s} className="flex items-center gap-1.5 text-[10.5px] text-white/40"><Check size={10} className="text-sage" /> {s}</p>)}
                </div>
              )}
              <div className={clsx("max-w-[88%] rounded-[20px] px-4 py-2.5 text-[13.5px] leading-relaxed", m.role === "user" ? "rounded-br-md bg-white text-ink" : "rounded-bl-md bg-white/10 text-white/90")}>{m.text}</div>
              {m.cards?.map((c, i) => (
                <CardView
                  key={i}
                  card={c}
                  db={db}
                  customer={customer}
                  busy={busyCard === `${m.id}-${i}`}
                  onPickSlot={(o) => {
                    const b = prepare(getDB(), customer, o.courtId, o.start, o.durationMin, 4);
                    setMsgs((mm) => [...mm, { id: Math.random().toString(36).slice(2), role: "bay", text: `${getDB().courts.find((x) => x.id === o.courtId)?.short}, ${fmtDayLabel(o.start, Date.now()).toLowerCase()} ${fmtRange(o.start, o.durationMin)}. Confirm when ready.`, cards: [...(customer ? [] : [{ kind: "join" } as Card]), { kind: "booking", booking: b, state: "pending" }] }]);
                  }}
                  onConfirm={() => (c.kind === "booking" ? confirmBooking(m.id, i, c) : c.kind === "order" ? confirmOrder(m.id, i, c) : undefined)}
                  onCancel={() => updateCard(m.id, i, { state: "cancelled" })}
                />
              ))}
            </div>
          ))}
          {thinking && (
            <div className="space-y-1 pl-1">
              {thinking.map((s, i) => (
                <p key={s} className="flex items-center gap-1.5 text-[11px] text-white/55" style={{ animation: `pb-rise 0.4s ${i * 0.35}s both` }}>
                  <Loader2 size={11} className="animate-spin text-sage" /> {s}…
                </p>
              ))}
            </div>
          )}
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
          className="flex items-center gap-2 border-t border-white/10 p-3"
        >
          <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Court for 4 tomorrow at 8pm…" className="h-12 flex-1 rounded-full border border-white/12 bg-white/6 px-4 text-[14px] text-white placeholder:text-white/35 outline-none focus:border-sage/60" />
          <button type="submit" className="flex h-12 w-12 items-center justify-center rounded-full bg-sage text-ink transition hover:bg-white disabled:opacity-40" disabled={!input.trim()} aria-label="Send">
            <ArrowUp size={18} strokeWidth={2.5} />
          </button>
        </form>
      </div>
    </div>
  );
}

function CardView({
  card,
  db,
  customer,
  busy,
  onPickSlot,
  onConfirm,
  onCancel,
}: {
  card: Card;
  db: DB;
  customer?: Customer;
  busy: boolean;
  onPickSlot: (o: { courtId: string; start: number; durationMin: number }) => void;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const now = Date.now();
  if (card.kind === "join") return !customer ? <div className="w-full"><JoinCard reason="so I can book for you" /></div> : null;
  if (card.kind === "links")
    return (
      <div className="flex flex-wrap gap-1.5">
        {card.links.map((l) => (
          <Link key={l.href} href={l.href} className="rounded-full bg-white px-3.5 py-1.5 text-[12px] font-semibold text-ink transition hover:bg-sage">{l.label} →</Link>
        ))}
      </div>
    );
  if (card.kind === "slots")
    return (
      <div className="grid w-full grid-cols-2 gap-1.5">
        {card.options.map((o) => (
          <button key={`${o.courtId}-${o.start}`} onClick={() => onPickSlot(o)} className="rounded-2xl border border-white/12 bg-white/6 px-3 py-2 text-left transition hover:border-sage/60 hover:bg-sage/15">
            <span className="block text-[11px] text-white/55">{db.courts.find((c) => c.id === o.courtId)?.short} · {fmtDayLabel(o.start, now)}</span>
            <span className="flex items-baseline justify-between"><span className="text-[15px] font-semibold tabular text-white">{fmtTime(o.start)}</span><span className="text-[12px] tabular text-sage">${o.price.toFixed(0)}</span></span>
            {o.reason && <span className="mt-0.5 block text-[10px] leading-snug text-white/45">{o.reason}</span>}
          </button>
        ))}
        {card.options.length === 0 && <p className="col-span-2 text-[12px] text-white/55">Nothing free in that window.</p>}
      </div>
    );
  if (card.kind === "tier") {
    const t = customer ? tierFor(customer.loyalty.lifetime) : TIERS[0];
    return (
      <div className="grid w-full grid-cols-4 gap-1.5">
        {TIERS.map((x) => (
          <div key={x.id} className={clsx("rounded-2xl p-2 text-center", x.id === t.id ? "bg-white/15 ring-1 ring-white/40" : "bg-white/5")}>
            <span className="mx-auto block h-6 w-6 rounded-full" style={{ background: x.color }} />
            <span className="mt-1 block text-[10.5px] font-semibold text-white">{x.name}</span>
            <span className="block text-[9.5px] tabular text-white/50">{x.min ? `${x.min}` : "0"} pts</span>
          </div>
        ))}
      </div>
    );
  }
  if (card.kind === "package") {
    const p = db.packages.find((x) => x.id === card.id)!;
    return (
      <Link href={`/stay?package=${p.id}`} className="block w-full rounded-[22px] bg-gradient-to-br from-sunset/80 to-ember/70 p-3.5 text-white">
        <span className="block font-display text-[19px] font-bold lowercase leading-none">{p.name}</span>
        <span className="mt-1 block text-[11.5px] text-white/85">{p.perks.join(" · ")}</span>
        <span className="mt-1.5 block text-[14px] font-semibold tabular">${p.price} · see the suites →</span>
      </Link>
    );
  }
  if (card.kind === "matches") {
    const list = db.matches.filter((m) => m.start > now && m.playerIds.length < 4).sort((a, b) => a.start - b.start).slice(0, 3);
    return (
      <div className="w-full space-y-1.5">
        {list.map((m) => (
          <Link key={m.id} href="/community" className="flex items-center justify-between rounded-2xl bg-white/6 px-3 py-2 text-[12px] text-white transition hover:bg-white/12">
            <span>{fmtDayLabel(m.start, now)} {fmtTime(m.start)} · {db.courts.find((c) => c.id === m.courtId)?.short}</span>
            <span className="text-white/55">lvl {m.level[0].toFixed(1)}–{m.level[1].toFixed(1)} · {4 - m.playerIds.length} spots</span>
          </Link>
        ))}
      </div>
    );
  }
  if (card.kind === "order") {
    return (
      <div className={clsx("w-full rounded-[22px] border p-3.5", card.state === "done" ? "border-sage/50 bg-sage/12" : "border-white/15 bg-ink/40")}>
        <p className="text-[11px] text-white/55">{card.state === "done" ? "Order placed" : card.state === "cancelled" ? "Cancelled" : "Prepared · waiting for your confirmation"}</p>
        {card.order.lines.map((l) => <p key={l.itemId} className="text-[13px] font-semibold text-white">{l.qty}× {l.name}</p>)}
        <p className="text-[12px] text-white/65">→ {card.deliver.label} · ${card.order.total.toFixed(2)}</p>
        {card.state === "pending" && customer && (
          <div className="mt-2.5 flex gap-2">
            <button onClick={onConfirm} disabled={busy} className="flex items-center gap-1.5 rounded-full bg-sage px-3.5 py-2 text-[12px] font-semibold text-ink">{busy && <Loader2 size={12} className="animate-spin" />} Confirm & pay ${card.order.total.toFixed(2)}</button>
            <button onClick={onCancel} className="rounded-full border border-white/20 px-3.5 py-2 text-[12px] text-white">Not now</button>
          </div>
        )}
      </div>
    );
  }
  // booking
  const court = db.courts.find((c) => c.id === card.booking.courtId)!;
  const total = card.booking.price + (card.order?.total ?? 0);
  const pass = card.passId ? db.passes.find((p) => p.id === card.passId) : undefined;
  return (
    <div className={clsx("w-full rounded-[22px] border p-3.5", card.state === "done" ? "border-sage/50 bg-sage/12" : card.state === "cancelled" ? "border-white/10 bg-white/4 opacity-60" : "border-white/15 bg-ink/40")}>
      <p className="text-[11px] text-white/55">{card.state === "done" ? "Booked & paid" : card.state === "cancelled" ? "Not booked" : "Prepared · waiting for your confirmation"}</p>
      <p className="mt-0.5 text-[14px] font-semibold text-white">{court.name}</p>
      <p className="text-[12px] text-white/70">{fmtDayLabel(card.booking.start, now)} · {fmtRange(card.booking.start, card.booking.durationMin)} · {card.booking.players} players</p>
      <div className="mt-2 space-y-0.5 text-[11.5px] text-white/60">
        {card.booking.breakdown.map((b) => <p key={b.label} className="flex justify-between"><span>{b.label}</span><span className="tabular">{b.amount < 0 ? "−" : ""}${Math.abs(b.amount).toFixed(2)}</span></p>)}
        {card.order && <p className="flex justify-between"><span>{card.order.lines.map((l) => `${l.qty}× ${l.name}`).join(", ")} → {court.short}</span><span className="tabular">${card.order.total.toFixed(2)}</span></p>}
      </div>
      {card.state === "pending" && customer && (
        <div className="mt-3 flex gap-2">
          <button onClick={onConfirm} disabled={busy} className="flex items-center gap-1.5 rounded-full bg-sage px-3.5 py-2 text-[12px] font-semibold text-ink">{busy && <Loader2 size={12} className="animate-spin" />} Confirm & pay ${total.toFixed(2)}</button>
          <button onClick={onCancel} className="rounded-full border border-white/20 px-3.5 py-2 text-[12px] text-white">Not now</button>
        </div>
      )}
      {card.state === "pending" && !customer && <p className="mt-2 text-[11px] text-gold">Create your profile above, then confirm.</p>}
      {pass && <p className="mt-2 text-[11.5px] text-sage">Gate pass {pass.code} issued for {pass.door}</p>}
    </div>
  );
}
