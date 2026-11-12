import { WELCOME_POINTS } from "./catalog";
import { quote } from "./engine/pricing";
import type {
  AccessLog, Booking, Campaign, Court, Customer, DB, InventoryItem, MenuItem, Notice, OpenMatch, Order, Stay,
  StayPackage, Staff, Task, Tournament, Unit,
} from "./types";
import { DAY, HOUR, MIN, addDays, atHour, startOfDay } from "./time";

// Deterministic RNG so every fresh demo starts from the same believable world.
function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FIRST = ["Maya", "Karim", "Lara", "Rami", "Nour", "Hadi", "Yasmina", "Omar", "Tala", "Ziad", "Rania", "Fadi", "Lea", "Jad", "Sarah", "Ali", "Mira", "Elie", "Dana", "Samer", "Joelle", "Ahmad", "Celine", "Marwan", "Layal", "Georges", "Hiba", "Tarek", "Rita", "Nadim", "Zeina", "Bassel", "Christelle", "Wael", "Aya", "Charbel", "Lynn", "Hassan", "Perla", "Firas", "Nadine", "Rayan", "Yara", "Khalil", "Maria", "Sami", "Reem", "Anthony"];
const LAST = ["Haddad", "Khoury", "Saab", "Nassar", "Fakhoury", "Mansour", "Daher", "Karam", "Rizk", "Salameh", "Tannous", "Abi Nader", "Bou Khalil", "Hamdan", "Itani", "Yazbek", "Matar", "Azar", "Kassab", "Moussa", "Najjar", "Harb", "Ghanem", "Kanaan", "Zein", "Barakat", "Feghali", "Assaf", "Saliba", "Wehbe", "Rahal"];

export const COURTS: Court[] = [
  { id: "c1", name: "Court 1 · The Hall", short: "Court 1", type: "indoor", zone: "The Hall", status: "open", maintenanceLog: [], lastServicedAt: 0 },
  { id: "c2", name: "Court 2 · The Hall", short: "Court 2", type: "indoor", zone: "The Hall", status: "open", maintenanceLog: [], lastServicedAt: 0 },
  { id: "c3", name: "Court 3 · Sea Side", short: "Court 3", type: "outdoor", zone: "Sea Side", status: "open", maintenanceLog: [], lastServicedAt: 0 },
  { id: "c4", name: "Court 4 · Sea Side", short: "Court 4", type: "outdoor", zone: "Sea Side", status: "open", maintenanceLog: [], lastServicedAt: 0 },
];

function menu(): MenuItem[] {
  const m = (
    id: string, category: MenuItem["category"], name: string, description: string, price: number,
    options: string[], emoji: string, hue: number, tags: string[] = [], uses: MenuItem["uses"] = [], prepMinutes = 4,
  ): MenuItem => ({ id, category, name, description, price, options, emoji, hue, tags, uses, prepMinutes, available: true });
  const cup = { inventoryId: "inv-cups", qty: 1 };
  const beans = (q: number) => ({ inventoryId: "inv-beans", qty: q });
  const milk = (q: number) => ({ inventoryId: "inv-milk", qty: q });
  return [
    m("espresso", "coffee", "Espresso", "Double ristretto, house blend from Sip", 2.5, ["shot"], "☕", 28, [], [beans(0.018), cup], 2),
    m("cortado", "coffee", "Cortado", "Equal parts espresso and silky milk", 3.5, ["milk", "shot"], "☕", 30, [], [beans(0.018), milk(0.06), cup], 3),
    m("flat-white", "coffee", "Flat White", "Velvet micro-foam over a double shot", 4.5, ["milk", "shot"], "☕", 32, ["bestseller"], [beans(0.018), milk(0.15), cup], 3),
    m("spanish-latte", "coffee", "Spanish Latte", "Condensed-milk sweetness, served iced", 5.5, ["size", "milk", "temp", "shot"], "🧋", 36, ["bestseller"], [beans(0.018), milk(0.2), cup]),
    m("iced-latte", "coffee", "Iced Latte", "Double shot, cold milk, lots of ice", 5, ["size", "milk", "shot", "sweet"], "🧊", 34, [], [beans(0.018), milk(0.2), cup]),
    m("cold-brew", "coffee", "Cold Brew", "Steeped 18 hours, chocolate and citrus notes", 5, ["size", "sweet"], "🥤", 26, [], [beans(0.03), cup], 1),
    m("v60", "coffee", "V60 Pour-over", "Ethiopia Guji, washed. Jasmine, bergamot", 6, [], "🫖", 40, ["single origin"], [beans(0.02), cup], 6),
    m("matcha-latte", "matcha", "Matcha Latte", "Ceremonial grade, whisked to order", 5.5, ["size", "milk", "temp", "sweet"], "🍵", 120, ["bestseller"], [{ inventoryId: "inv-matcha", qty: 4 }, milk(0.2), cup]),
    m("strawberry-matcha", "matcha", "Strawberry Matcha", "Fresh strawberry purée under iced matcha", 6.5, ["milk", "sweet"], "🍓", 140, ["new"], [{ inventoryId: "inv-matcha", qty: 4 }, milk(0.18), cup]),
    m("chai", "matcha", "Dirty Chai", "Spiced chai with a shot of espresso", 5, ["milk", "temp"], "🫚", 22, [], [beans(0.009), milk(0.2), cup]),
    m("green-detox", "smoothies", "Green Detox", "Spinach, apple, cucumber, ginger, lemon", 6, ["boost"], "🥬", 100, ["vegan"], [cup], 4),
    m("tropical-sunset", "smoothies", "Tropical Sunset", "Mango, passion fruit, orange. Our sunset in a cup", 6.5, ["boost"], "🥭", 24, ["vegan", "bestseller"], [cup], 4),
    m("berry-blast", "smoothies", "Berry Blast", "Strawberry, blueberry, banana, oat milk", 6.5, ["boost"], "🫐", 330, ["vegan"], [{ inventoryId: "inv-berries", qty: 0.12 }, { inventoryId: "inv-oat", qty: 0.15 }, cup], 4),
    m("fresh-orange", "smoothies", "Fresh Orange", "Pressed to order", 4.5, [], "🍊", 30, ["vegan"], [cup], 2),
    m("protein-shake", "recovery", "Post-Match Protein", "Banana, peanut butter, whey, oat milk", 7, ["boost"], "💪", 45, ["high protein"], [{ inventoryId: "inv-whey", qty: 1 }, { inventoryId: "inv-oat", qty: 0.25 }, cup], 3),
    m("electrolyte", "recovery", "Electrolyte Cooler", "Coconut water, lime, mint, sea salt", 4, [], "🥥", 170, ["vegan"], [{ inventoryId: "inv-coconut", qty: 0.3 }, cup], 2),
    m("acai-bowl", "bowls", "Açaí Bowl", "Açaí, granola, banana, berries, honey", 9.5, ["boost"], "🍇", 290, ["bestseller"], [{ inventoryId: "inv-acai", qty: 1 }, { inventoryId: "inv-berries", qty: 0.05 }], 6),
    m("avocado-toast", "bowls", "Avocado Toast", "Sourdough, smashed avocado, chili, lemon", 8.5, ["bread", "extras"], "🥑", 90, [], [{ inventoryId: "inv-avocado", qty: 1 }, { inventoryId: "inv-bread", qty: 0.1 }], 7),
    m("halloumi-wrap", "bowls", "Halloumi Wrap", "Grilled halloumi, za'atar, tomato, mint", 8, ["extras"], "🌯", 48, [], [{ inventoryId: "inv-halloumi", qty: 0.08 }], 7),
    m("quinoa-bowl", "bowls", "Bay Quinoa Bowl", "Quinoa, roasted veg, labneh, pomegranate", 11, ["extras"], "🥗", 150, ["vegetarian"], [], 8),
    m("quiche", "bites", "Spinach Quiche", "Buttery crust, spinach and feta", 5.5, [], "🥧", 40, [], [], 3),
    m("banana-bread", "bites", "Banana Bread", "Warm slice with tahini butter", 3.5, [], "🍞", 35, [], [], 2),
    m("date-balls", "bites", "Date Energy Balls", "Dates, oats, cocoa, sea salt (3 pcs)", 3, [], "🟤", 25, ["vegan"], [], 1),
    m("babyccino", "kids", "Babyccino", "Warm frothed milk with cocoa dust", 1.5, [], "🍼", 20, ["kids"], [milk(0.1), cup], 2),
    m("kids-juice", "kids", "Little Sipper Juice", "Apple and carrot, no added sugar", 3, [], "🧃", 60, ["kids"], [cup], 2),
    m("mini-pancakes", "kids", "Mini Pancakes", "With banana and a drizzle of honey", 5, [], "🥞", 38, ["kids"], [], 6),
  ];
}

function inventory(): InventoryItem[] {
  return [
    { id: "inv-beans", name: "Sip house beans", unit: "kg", qty: 7.4, par: 12, reorderAt: 5, costPerUnit: 24 },
    { id: "inv-milk", name: "Whole milk", unit: "L", qty: 22, par: 40, reorderAt: 15, costPerUnit: 1.4 },
    { id: "inv-oat", name: "Oat milk", unit: "L", qty: 5.5, par: 24, reorderAt: 8, costPerUnit: 3.2 },
    { id: "inv-matcha", name: "Ceremonial matcha", unit: "g", qty: 410, par: 800, reorderAt: 250, costPerUnit: 0.12 },
    { id: "inv-acai", name: "Açaí packs", unit: "pcs", qty: 26, par: 60, reorderAt: 20, costPerUnit: 2.1 },
    { id: "inv-avocado", name: "Avocados", unit: "pcs", qty: 18, par: 30, reorderAt: 10, costPerUnit: 0.9 },
    { id: "inv-bread", name: "Sourdough loaves", unit: "loaf", qty: 6, par: 10, reorderAt: 3, costPerUnit: 4 },
    { id: "inv-halloumi", name: "Halloumi", unit: "kg", qty: 3.2, par: 6, reorderAt: 2, costPerUnit: 11 },
    { id: "inv-whey", name: "Whey protein", unit: "scoops", qty: 64, par: 150, reorderAt: 40, costPerUnit: 0.8 },
    { id: "inv-berries", name: "Mixed berries", unit: "kg", qty: 4.1, par: 8, reorderAt: 3, costPerUnit: 7.5 },
    { id: "inv-coconut", name: "Coconut water", unit: "L", qty: 12, par: 20, reorderAt: 6, costPerUnit: 2.6 },
    { id: "inv-cups", name: "Compostable cups", unit: "pcs", qty: 640, par: 1500, reorderAt: 400, costPerUnit: 0.09 },
  ];
}

const UNITS: Unit[] = [
  { id: "sp1", name: "Sea Pod 1", type: "sea-pod", typeLabel: "Sea Pod", capacity: 2, nightly: 140, sqm: 28, view: "Mediterranean, west-facing", features: ["Sunset deck", "Rain shower", "Smart lock", "Racket wall"], housekeeping: "clean" },
  { id: "sp2", name: "Sea Pod 2", type: "sea-pod", typeLabel: "Sea Pod", capacity: 2, nightly: 140, sqm: 28, view: "Mediterranean, west-facing", features: ["Sunset deck", "Rain shower", "Smart lock", "Racket wall"], housekeeping: "clean" },
  { id: "sp3", name: "Sea Pod 3", type: "sea-pod", typeLabel: "Sea Pod", capacity: 2, nightly: 150, sqm: 30, view: "Corner pod, beach and courts", features: ["Wrap-around deck", "Outdoor shower", "Smart lock"], housekeeping: "dirty" },
  { id: "sp4", name: "Sea Pod 4", type: "sea-pod", typeLabel: "Sea Pod", capacity: 2, nightly: 140, sqm: 28, view: "Mediterranean, west-facing", features: ["Sunset deck", "Rain shower", "Smart lock"], housekeeping: "clean" },
  { id: "l1", name: "Court-side Loft 1", type: "loft", typeLabel: "Court-side Loft", capacity: 3, nightly: 190, sqm: 42, view: "Overlooks Court 1 and the bay", features: ["Mezzanine bed", "Recovery corner", "Smart lock", "Espresso bar"], housekeeping: "clean" },
  { id: "l2", name: "Court-side Loft 2", type: "loft", typeLabel: "Court-side Loft", capacity: 3, nightly: 190, sqm: 42, view: "Overlooks Court 2 and the hall", features: ["Mezzanine bed", "Recovery corner", "Smart lock"], housekeeping: "inspecting" },
  { id: "v1", name: "Bay Villa", type: "villa", typeLabel: "Bay Villa", capacity: 5, nightly: 360, sqm: 96, view: "Private terrace on the sand", features: ["Plunge pool", "Two bedrooms", "Private chef option", "Smart lock"], housekeeping: "clean" },
];

const PACKAGES: StayPackage[] = [
  { id: "pk-weekend", name: "Play & Stay Weekend", tagline: "Two sunsets, three hours of padel", nights: 2, courtHours: 3, cafeCredit: 30, unitType: "sea-pod", price: 399, perks: ["2 nights in a Sea Pod", "3 court hours, any court", "$30 Sip credit", "Late checkout 13:00"] },
  { id: "pk-sunrise", name: "Sunrise Session", tagline: "Wake up, walk to court 1", nights: 1, courtHours: 1.5, cafeCredit: 20, unitType: "sea-pod", price: 219, perks: ["1 night in a Sea Pod", "07:00 court, 90 minutes", "Sip breakfast for two"] },
  { id: "pk-camp", name: "Coach Camp", tagline: "Three days to level up", nights: 3, courtHours: 4.5, cafeCredit: 45, unitType: "loft", price: 849, perks: ["3 nights in a Court-side Loft", "3 coached sessions", "Daily recovery shake", "Video analysis"] },
  { id: "pk-villa", name: "Villa Squad", tagline: "Bring the four. Own the weekend.", nights: 2, courtHours: 4, cafeCredit: 60, unitType: "villa", price: 990, perks: ["2 nights in the Bay Villa", "4 court hours", "Tournament entry for two", "Private sunset dinner"] },
];

const STAFF: Staff[] = [
  { id: "s-gm", name: "Nadine Khoury", role: "gm", pin: "2026", hue: 160 },
  { id: "s-desk", name: "Rami Saab", role: "frontdesk", pin: "1111", hue: 190 },
  { id: "s-cafe", name: "Lea Mansour", role: "cafe", pin: "2222", hue: 28 },
  { id: "s-house", name: "Hassan Itani", role: "housekeeping", pin: "3333", hue: 260 },
  { id: "s-mkt", name: "Yara Karam", role: "marketing", pin: "4444", hue: 330 },
  { id: "s-barista", name: "Joelle Daher", role: "cafe", pin: "5555", hue: 12 },
  { id: "s-coach", name: "Jad Rizk", role: "frontdesk", pin: "6666", hue: 210 },
];

export function createSeed(now: number = Date.now()): DB {
  const r = rng(20261112);
  const pick = <T,>(a: T[]) => a[Math.floor(r() * a.length)];
  const today = startOfDay(now);
  let idn = 0;
  const id = (p: string) => `${p}-${(++idn).toString(36)}`;

  // --- customers ---------------------------------------------------------------
  const customers: Customer[] = [];
  const used = new Set<string>();
  while (customers.length < 56) {
    const first = pick(FIRST);
    const last = pick(LAST);
    if (used.has(first + last)) continue;
    used.add(first + last);
    const rating = Math.round((1.4 + r() * 4.2) * 10) / 10;
    customers.push({
      id: id("cu"),
      name: `${first} ${last}`,
      phone: `+961 ${pick(["70", "71", "76", "78", "81", "03"])} ${String(100 + Math.floor(r() * 899))} ${String(100 + Math.floor(r() * 899))}`,
      email: `${first.toLowerCase()}.${last.toLowerCase().replace(/\s/g, "")}@example.com`,
      hue: Math.floor(r() * 360),
      createdAt: today - Math.floor(30 + r() * 300) * DAY,
      lastVisitAt: 0,
      skill: { rating, matches: Math.floor(r() * 80), wins: 0, side: pick(["left", "right", "both"] as const), style: pick(["attacking", "defensive", "all-round"] as const) },
      loyalty: { points: 0, lifetime: WELCOME_POINTS },
      achievements: [{ id: "first-serve", at: today - 40 * DAY }],
      marketingOptIn: r() > 0.2,
      tags: [],
      favoriteItems: [],
      preferredHour: pick([7, 8, 18, 19, 20, 21]),
      preferredDay: Math.floor(r() * 7),
      credit: 0,
    });
  }
  customers.forEach((c) => (c.skill.wins = Math.floor(c.skill.matches * (0.3 + r() * 0.4))));
  // Some regulars go quiet: they drive the churn and reactivation demos.
  const lapsed = new Set(customers.slice(40, 52).map((c) => c.id));
  const regulars = customers.filter((c) => !lapsed.has(c.id));

  // --- bookings ---------------------------------------------------------------
  const bookings: Booking[] = [];
  for (let d = -42; d <= 9; d++) {
    const day = addDays(today, d);
    const dow = new Date(day).getDay();
    const weekend = dow === 0 || dow === 6;
    for (const court of COURTS) {
      let h = 7;
      while (h < 23) {
        let p = h < 9 ? 0.35 : h < 13 ? (weekend ? 0.6 : 0.22) : h < 17 ? (weekend ? 0.65 : 0.18) : 0.85;
        if (court.id === "c4" && !weekend && h >= 13 && h < 17) p = 0.06; // the idle afternoon the AI will notice
        // keep tomorrow 20:00 on Court 3 open: the concierge demo ("court for 4 tomorrow at 8pm") lands there
        if (d === 1 && court.id === "c3" && h + 2 > 20 && h < 21.5) p = 0;
        if (court.type === "outdoor" && h >= 12 && h < 15) p *= 0.7;
        if (d > 0) p *= Math.max(0.25, 1 - d * 0.11);
        if (d === 0 && h < 9) p *= 0.8;
        const dur = pick([60, 90, 90, 90, 120]);
        if (r() < p && h + dur / 60 <= 24) {
          const customer = d < -21 ? pick(customers) : pick(regulars);
          const start = atHour(day, h);
          const q = quote(court, start, dur, { now: start - DAY });
          const players = [0, 1, 2]
            .filter(() => r() > 0.25)
            .map(() => {
              const p2 = pick(customers);
              return { customerId: p2.id, name: p2.name, status: "accepted" as const };
            });
          bookings.push({
            id: id("bk"),
            courtId: court.id,
            customerId: customer.id,
            start,
            durationMin: dur,
            status: r() < 0.04 ? "cancelled" : "confirmed",
            price: q.price,
            listPrice: q.listPrice,
            players,
            splitPayment: r() > 0.5,
            createdAt: Math.min(start - Math.floor(1 + r() * 6) * DAY, now - Math.floor(2 + r() * 70) * HOUR),
            source: pick(["app", "app", "app", "desk", "concierge"] as const),
            payment: { method: pick(["Apple Pay", "Card", "Card", "Pay at venue"]), status: "paid", refunded: 0 },
          });
          h += dur / 60;
        } else {
          h += 0.5;
        }
      }
    }
  }
  // Tomorrow morning: scheduled maintenance block on Court 4.
  bookings.push({
    id: id("bk"), courtId: "c4", customerId: "staff", start: atHour(addDays(today, 1), 7), durationMin: 60, status: "confirmed",
    price: 0, listPrice: 0, players: [], splitPayment: false, createdAt: today - DAY, source: "desk",
    payment: { method: "internal", status: "paid", refunded: 0 }, kind: "maintenance",
  });

  // --- loyalty from history -------------------------------------------------------
  const byCustomer = new Map<string, Booking[]>();
  for (const b of bookings) {
    if (b.status !== "confirmed" || b.kind === "maintenance") continue;
    const list = byCustomer.get(b.customerId) ?? [];
    list.push(b);
    byCustomer.set(b.customerId, list);
  }
  for (const c of customers) {
    const list = byCustomer.get(c.id) ?? [];
    const past = list.filter((b) => b.start < now);
    const spend = list.reduce((s, b) => s + b.price, 0);
    const bonus = Math.floor(r() * 2600);
    c.loyalty.lifetime = WELCOME_POINTS + Math.round(spend * 1.4) + bonus;
    c.loyalty.points = Math.round(c.loyalty.lifetime * (0.3 + r() * 0.4));
    c.lastVisitAt = past.length ? Math.max(...past.map((b) => b.start)) : c.createdAt;
    if (lapsed.has(c.id)) c.lastVisitAt = Math.min(c.lastVisitAt, today - (24 + Math.floor(r() * 40)) * DAY);
    c.tags = [
      ...(past.length > 12 ? ["regular"] : []),
      ...(past.filter((b) => new Date(b.start).getDay() % 6 === 0).length > past.length * 0.5 && past.length > 3 ? ["weekend"] : []),
      ...(r() > 0.75 ? ["parent"] : []),
    ];
  }

  // --- café orders (last 21 days + today) ----------------------------------------
  const MENU = menu();
  const orders: Order[] = [];
  let orderSeq = 1000;
  for (let d = -21; d <= 0; d++) {
    const day = addDays(today, d);
    const count = 22 + Math.floor(r() * 16);
    for (let i = 0; i < count; i++) {
      const hour = 7 + Math.floor(Math.pow(r(), 0.8) * 16);
      const createdAt = atHour(day, hour, Math.floor(r() * 60));
      if (createdAt > now - 20 * MIN) continue;
      const lines = [0, 1, 2]
        .filter((k) => k === 0 || r() > 0.55)
        .map(() => {
          const it = pick(MENU);
          return { itemId: it.id, name: it.name, qty: r() > 0.85 ? 2 : 1, unitPrice: it.price, options: [], optionsLabel: "" };
        });
      const total = Math.round(lines.reduce((s, l) => s + l.qty * l.unitPrice, 0) * 100) / 100;
      const courtB = bookings.find((b) => b.start <= createdAt && b.start + b.durationMin * MIN > createdAt);
      const toCourt = courtB && r() > 0.45;
      orders.push({
        id: id("or"),
        number: ++orderSeq,
        customerId: pick(customers).id,
        lines,
        total,
        deliverTo: toCourt ? { kind: "court", refId: courtB.courtId, label: COURTS.find((c) => c.id === courtB.courtId)!.short } : { kind: "pickup", label: "Pickup at Sip" },
        createdAt,
        autoFlow: false,
        stage: "delivered",
        history: [{ stage: "received", at: createdAt }, { stage: "delivered", at: createdAt + 9 * MIN }],
        payment: { method: "Apple Pay", status: "paid" },
      });
    }
  }
  // A few live orders so the kitchen queue is never empty in the demo.
  const live: [number, string, Order["stage"]][] = [[6, "flat-white", "preparing"], [3, "tropical-sunset", "received"], [11, "acai-bowl", "ready"]];
  for (const [ago, itemId, stage] of live) {
    const it = MENU.find((m) => m.id === itemId)!;
    const createdAt = now - ago * MIN;
    orders.push({
      id: id("or"), number: ++orderSeq, customerId: pick(regulars).id,
      lines: [{ itemId: it.id, name: it.name, qty: 1, unitPrice: it.price, options: [], optionsLabel: "" }],
      total: it.price, deliverTo: stage === "ready" ? { kind: "court", refId: "c2", label: "Court 2" } : { kind: "pickup", label: "Pickup at Sip" },
      createdAt, autoFlow: false, stage, history: [{ stage: "received", at: createdAt }], payment: { method: "Card", status: "paid" },
    });
  }

  // --- stays (Bay Suites concept, simulated reservations) -------------------------
  const stays: Stay[] = [];
  const stayPlan: [string, number, number, Stay["status"]][] = [
    ["sp1", -3, 2, "checked-out"], ["sp2", -1, 3, "checked-in"], ["l1", -2, 4, "checked-in"], ["v1", 2, 2, "reserved"],
    ["sp4", 1, 2, "reserved"], ["l2", 4, 3, "reserved"], ["sp1", 5, 2, "reserved"], ["sp3", 7, 3, "reserved"],
  ];
  for (const [unitId, startOffset, nights, status] of stayPlan) {
    const unit = UNITS.find((u) => u.id === unitId)!;
    const guest = pick(regulars);
    const checkIn = atHour(addDays(today, startOffset), 15);
    const checkOut = atHour(addDays(today, startOffset + nights), 11);
    stays.push({
      id: id("st"), unitId, customerId: guest.id, checkIn, checkOut,
      guests: [{ name: guest.name, email: guest.email, phone: guest.phone, adult: true }, ...(unit.capacity > 2 ? [{ name: pick(FIRST) + " " + guest.name.split(" ")[1], adult: true }] : [])],
      status, nightly: unit.nightly, total: unit.nightly * nights, createdAt: checkIn - 9 * DAY,
      registration: status !== "reserved" ? { completedAt: checkIn - DAY, arrivalTime: "16:00", idVerified: true, rulesAccepted: true } : undefined,
      checkedInAt: status !== "reserved" ? checkIn + HOUR : undefined,
      checkedOutAt: status === "checked-out" ? checkOut - HOUR : undefined,
      folio: [{ label: `${nights} nights · ${unit.name}`, amount: unit.nightly * nights, at: checkIn }],
    });
  }

  // --- open matches, tournaments, invitations -------------------------------------
  const matches: OpenMatch[] = [];
  const matchSlots: [number, number, string, [number, number]][] = [[0, 20.5, "c3", [2.5, 3.5]], [1, 8, "c1", [1.5, 2.5]], [1, 19, "c2", [3.5, 4.5]], [2, 18, "c4", [2, 3]], [2, 21, "c1", [4, 5.5]], [3, 9, "c3", [1, 2]]];
  for (const [d, h, courtId, level] of matchSlots) {
    const fits = regulars.filter((c) => c.skill.rating >= level[0] - 0.3 && c.skill.rating <= level[1] + 0.3);
    const host = fits[0] ?? regulars[0];
    const others = fits.slice(1, 1 + Math.floor(r() * 3));
    matches.push({
      id: id("mt"), courtId, start: atHour(addDays(today, d), Math.floor(h), (h % 1) * 60), durationMin: 90, hostId: host.id,
      playerIds: [host.id, ...others.map((o) => o.id)], level, pricePerPlayer: courtId === "c1" || courtId === "c2" ? 18 : 15,
      note: pick(["Friendly, good vibes only", "Competitive but fun", "Looking for a left-side player", "Post-work session, then Sip"]),
      createdAt: now - Math.floor(r() * 48) * HOUR,
    });
  }

  const team = (a: Customer, b: Customer) => ({ id: id("tm"), players: [a.id, b.id] as [string, string] });
  const tournaments: Tournament[] = [
    { id: "t-americano", name: "Winter Tides Americano", format: "Americano", start: atHour(addDays(today, 9), 17), level: [2.5, 4], entryFee: 25, maxTeams: 16, status: "registration", prize: "Sip tumblers + 3 months Challenger boost", teams: [] },
    { id: "t-mixed", name: "Sip × PB Mixed Doubles", format: "Round robin", start: atHour(addDays(today, 16), 16), level: [3, 5], entryFee: 35, maxTeams: 12, status: "registration", prize: "$600 in Bay credit", teams: [] },
    { id: "t-knockout", name: "Sunset Knockout", format: "Knockout", start: atHour(addDays(today, 5), 18), level: [4, 6], entryFee: 40, maxTeams: 8, status: "registration", prize: "Bay Villa weekend", teams: [] },
  ];
  const pool = [...regulars];
  for (const [t, n] of [[0, 11], [1, 7], [2, 6]] as const) {
    for (let i = 0; i < n; i++) {
      const a = pool[(i * 2 + t * 7) % pool.length];
      const b = pool[(i * 2 + 1 + t * 7) % pool.length];
      tournaments[t].teams.push(team(a, b));
    }
  }

  // --- operations ------------------------------------------------------------------
  const tasks: Task[] = [
    { id: id("tk"), title: "Net tension check and cable swap", area: "courts", refId: "c4", assigneeId: "s-desk", due: atHour(addDays(today, 1), 8), status: "todo", priority: "high", createdBy: "system", createdAt: now - 5 * HOUR },
    { id: id("tk"), title: "Squeegee and dry outdoor turf after the evening dew", area: "courts", refId: "c3", assigneeId: "s-coach", due: atHour(today, 17), status: "doing", priority: "normal", createdBy: "s-gm", createdAt: now - 7 * HOUR },
    { id: id("tk"), title: "Restock oat milk (below reorder point)", area: "cafe", assigneeId: "s-cafe", due: now + 2 * HOUR, status: "todo", priority: "high", createdBy: "ai", createdAt: now - HOUR },
    { id: id("tk"), title: "Turn over Sea Pod 3 after checkout", area: "suites", refId: "sp3", assigneeId: "s-house", due: now + 3 * HOUR, status: "todo", priority: "normal", createdBy: "system", createdAt: now - 2 * HOUR },
    { id: id("tk"), title: "Final inspection, Court-side Loft 2", area: "suites", refId: "l2", assigneeId: "s-house", due: now + 5 * HOUR, status: "doing", priority: "normal", createdBy: "s-gm", createdAt: now - 3 * HOUR },
    { id: id("tk"), title: "Post the Winter Tides Americano teaser", area: "marketing", assigneeId: "s-mkt", due: now + DAY, status: "todo", priority: "normal", createdBy: "s-gm", createdAt: now - DAY },
    { id: id("tk"), title: "Welcome kit for Bay Villa arrival", area: "suites", refId: "v1", assigneeId: "s-house", due: atHour(addDays(today, 2), 13), status: "todo", priority: "low", createdBy: "system", createdAt: now - DAY },
  ];

  const campaigns: Campaign[] = [
    { id: id("cp"), name: "Sea Breeze afternoons", kind: "off-peak", segmentId: "weekday-flex", channel: "WhatsApp", message: "The sea-side courts are calm between 1 and 4pm. Book any weekday afternoon this month and get 20% off.", offer: "−20% weekdays 13–16", status: "sent", createdBy: "ai", createdAt: today - 12 * DAY, sentAt: today - 12 * DAY, stats: { audience: 184, delivered: 179, opened: 141, converted: 23, revenue: 812 } },
    { id: id("cp"), name: "We miss your bandeja", kind: "reactivation", segmentId: "lapsed", channel: "WhatsApp", message: "It's been a while! Your court is waiting. Here's 25% off your next booking, valid 7 days.", offer: "−25% one booking", status: "sent", createdBy: "ai", createdAt: today - 6 * DAY, sentAt: today - 6 * DAY, stats: { audience: 38, delivered: 37, opened: 29, converted: 7, revenue: 294 } },
    { id: id("cp"), name: "Little ones play, you sip", kind: "cafe", segmentId: "parents", channel: "Push", message: "Kids' clinic on Saturday 10am, babyccinos on us while you watch.", status: "sent", createdBy: "s-mkt", createdAt: today - 3 * DAY, sentAt: today - 3 * DAY, stats: { audience: 61, delivered: 61, opened: 44, converted: 12, revenue: 186 } },
  ];

  const notices: Notice[] = [
    { id: id("nt"), at: now - 55 * MIN, kind: "alert", title: "Oat milk below reorder point", body: "5.5 L left, average use is 3.1 L a day. Restock task created for Lea.", severity: "warning", read: false, audience: "staff", ref: { kind: "inventory", id: "inv-oat" } },
    { id: id("nt"), at: now - 3 * HOUR, kind: "alert", title: "Court 4 net tension flagged", body: "Reported by an evening player. Maintenance block set for tomorrow 07:00.", severity: "warning", read: false, audience: "staff", ref: { kind: "court", id: "c4" } },
    { id: id("nt"), at: now - 5 * HOUR, kind: "ai", title: "12 regulars have gone quiet", body: "Churn-risk model flagged 12 members with no visit in 24+ days. A win-back draft is ready.", severity: "info", read: false, audience: "staff" },
  ];

  const accessLogs: AccessLog[] = [];
  for (const b of bookings.filter((b) => b.status === "confirmed" && b.start < now && b.start > now - 2 * DAY && b.kind !== "maintenance")) {
    accessLogs.push({ id: id("al"), at: b.start - 6 * MIN, passId: null, holderId: b.customerId, door: `${COURTS.find((c) => c.id === b.courtId)!.short} gate`, method: r() > 0.3 ? "QR" : "BLE", result: "granted" });
  }
  accessLogs.push({ id: id("al"), at: now - 80 * MIN, passId: null, holderId: null, door: "Court 2 gate", method: "QR", result: "denied", reason: "Pass outside its time window" });

  const db: DB = {
    version: 1,
    seededDay: today,
    orderSeq,
    customers,
    courts: COURTS.map((c) => ({
      ...c,
      lastServicedAt: today - (c.id === "c4" ? 19 : 6) * DAY,
      maintenanceNote: c.id === "c4" ? "Net tension check booked for tomorrow 07:00" : undefined,
      maintenanceLog: [
        { at: today - 6 * DAY, note: "Turf brushed and sand redistributed", by: "Jad Rizk" },
        ...(c.id === "c4" ? [{ at: now - 3 * HOUR, note: "Player reported low net tension", by: "Front desk" }] : []),
      ],
    })),
    bookings,
    holds: [],
    waitlist: [],
    passes: [],
    accessLogs,
    menu: MENU,
    inventory: inventory(),
    orders,
    units: UNITS,
    stays,
    packages: PACKAGES,
    matches,
    tournaments,
    invitations: [],
    staff: STAFF,
    tasks,
    campaigns,
    automations: [
      { id: "au-winback", name: "Win-back after 21 quiet days", trigger: "No booking in 21 days", action: "WhatsApp a 25% off-peak code", enabled: true, runs: 42, lastRunAt: now - 6 * DAY },
      { id: "au-waitlist", name: "Smart cancellation recovery", trigger: "A booking is cancelled", action: "Offer the slot to the waitlist, then to likely players", enabled: true, runs: 17, lastRunAt: now - 2 * DAY },
      { id: "au-sip", name: "Post-match Sip nudge", trigger: "A session ends", action: "Push: 10% off Sip for 30 minutes", enabled: true, runs: 318, lastRunAt: now - 2 * HOUR },
      { id: "au-tier", name: "Level-up celebration", trigger: "A member reaches a new level", action: "Animated card + season reward", enabled: true, runs: 26, lastRunAt: now - DAY },
      { id: "au-birthday", name: "Birthday court credit", trigger: "Member birthday", action: "$10 court credit", enabled: false, runs: 0 },
    ],
    promos: [
      { id: "pr-seabreeze", label: "Sea Breeze afternoon", courtIds: ["c3", "c4"], days: [1, 2, 3, 4, 5], fromHour: 13, toHour: 16, discount: 0.2, createdBy: "ai", active: true, createdAt: today - 12 * DAY, until: today + 18 * DAY },
    ],
    notices,
    audit: [
      { id: id("au"), at: now - 5 * HOUR, actor: { type: "ai" }, action: "churn.scan", entity: "customer", summary: "Churn-risk scan flagged 12 members" },
      { id: id("au"), at: now - 3 * HOUR, actor: { type: "staff", id: "s-desk" }, action: "maintenance.schedule", entity: "court", entityId: "c4", summary: "Maintenance block set on Court 4 for tomorrow 07:00" },
      { id: id("au"), at: now - 55 * MIN, actor: { type: "system" }, action: "inventory.low", entity: "inventory", entityId: "inv-oat", summary: "Oat milk dropped below its reorder point" },
    ],
    settings: { aiPricing: true },
  };
  return db;
}

/** Move every timestamp by whole days so a demo seeded yesterday still feels live today. */
const TIME_KEYS = new Set([
  "at", "start", "createdAt", "lastVisitAt", "validFrom", "validTo", "issuedAt", "checkIn", "checkOut", "due", "until", "sentAt",
  "lastRunAt", "cancelledAt", "checkedInAt", "checkedOutAt", "expiresAt", "offeredAt", "completedAt", "lastServicedAt", "generatedAt",
]);

export function shiftDB(db: DB, delta: number): DB {
  const walk = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === "object") {
      const out: Record<string, unknown> = {};
      for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
        out[k] = TIME_KEYS.has(k) && typeof val === "number" && val > 0 ? val + delta : walk(val);
      }
      return out;
    }
    return v;
  };
  const shifted = walk(db) as DB;
  shifted.seededDay = db.seededDay + delta;
  return shifted;
}
