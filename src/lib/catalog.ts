import type { OptionGroup, StaffRole, TierId } from "./types";

// ----------------------------------------------------------------------------
// Loyalty universe: commercial levels, kept separate from player skill rating.
// ----------------------------------------------------------------------------

export interface Tier {
  id: TierId;
  name: string;
  character: string;
  min: number;
  color: string;
  accent: string;
  tagline: string;
  courtDiscount: number;
  bookAheadDays: number;
  freeCancelHours: number;
  privileges: string[];
}

export const TIERS: Tier[] = [
  {
    id: "rookie",
    name: "Rookie",
    character: "Sprout",
    min: 0,
    color: "#8cc63f",
    accent: "#d7ecdf",
    tagline: "Fresh off the sea. Every rally counts.",
    courtDiscount: 0,
    bookAheadDays: 7,
    freeCancelHours: 24,
    privileges: ["Book up to 7 days ahead", "Welcome Sip on the house", "Open match access", "Points on every court and café spend"],
  },
  {
    id: "challenger",
    name: "Challenger",
    character: "Rally",
    min: 300,
    color: "#3fb6a8",
    accent: "#82be9d",
    tagline: "You found your rhythm. Now chase the next level.",
    courtDiscount: 0.05,
    bookAheadDays: 8,
    freeCancelHours: 12,
    privileges: ["5% off every court booking", "Free cancellation up to 12h", "Priority waitlist offers", "A free cortado every month"],
  },
  {
    id: "elite",
    name: "Elite",
    character: "Nova",
    min: 1200,
    color: "#f28a3b",
    accent: "#f6b26b",
    tagline: "Sunset sessions, priority courts, the inner circle.",
    courtDiscount: 0.1,
    bookAheadDays: 10,
    freeCancelHours: 6,
    privileges: ["10% off every court booking", "Book up to 10 days ahead", "Free racket and ball rental", "Members-only tournaments"],
  },
  {
    id: "legend",
    name: "Legend",
    character: "Solis",
    min: 3000,
    color: "#f3cf7a",
    accent: "#fff1c9",
    tagline: "The bay knows your name.",
    courtDiscount: 0.15,
    bookAheadDays: 14,
    freeCancelHours: 3,
    privileges: ["15% off every court booking", "Book up to 14 days ahead", "Two guest passes every month", "A pro racket reserved in your locker", "Legend lounge on the club deck"],
  },
];

export function tierFor(lifetime: number): Tier {
  let t = TIERS[0];
  for (const tier of TIERS) if (lifetime >= tier.min) t = tier;
  return t;
}

export function nextTier(lifetime: number): Tier | null {
  return TIERS.find((t) => t.min > lifetime) ?? null;
}

export const WELCOME_POINTS = 150;
export const REFERRAL_POINTS = 100;

export interface RewardDef {
  id: string;
  name: string;
  description: string;
  points: number;
  minTier?: TierId;
  where: "Sip" | "Front desk" | "Courts" | "Lockers";
  emoji: string;
}

export const REWARDS: RewardDef[] = [
  { id: "rw-cortado", name: "Free cortado", description: "Any day, any time at Sip", points: 120, where: "Sip", emoji: "☕" },
  { id: "rw-rental", name: "Racket & balls rental", description: "One session's kit, on us", points: 180, where: "Front desk", emoji: "🎾" },
  { id: "rw-smoothie", name: "Smoothie of your choice", description: "Cold-pressed, any size", points: 220, where: "Sip", emoji: "🥭" },
  { id: "rw-grip", name: "Padel Bay grip pack", description: "Three overgrips in club colours", points: 260, where: "Front desk", emoji: "🧢" },
  { id: "rw-extension", name: "30 min court extension", description: "Add half an hour to any off-peak booking", points: 300, where: "Courts", emoji: "⏱️" },
  { id: "rw-guest", name: "Guest pass", description: "Bring a friend to one session free", points: 450, minTier: "challenger", where: "Front desk", emoji: "🎟️" },
  { id: "rw-tumbler", name: "Sip tumbler", description: "Insulated, refills 10% off forever", points: 600, minTier: "challenger", where: "Sip", emoji: "🥤" },
  { id: "rw-clinic", name: "Private sunset clinic", description: "60 min with a coach for you and three friends", points: 2400, minTier: "elite", where: "Courts", emoji: "🌅" },
  { id: "rw-pro", name: "Pro racket week", description: "A pro-level racket waiting in your locker all week", points: 3200, minTier: "legend", where: "Lockers", emoji: "🏆" },
];

/** Stable, human-friendly member number from an id. */
export function memberNumber(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return `PB-${String(10000 + (h % 90000))}`;
}

export function referralCode(name: string, id: string) {
  return `${name.split(" ")[0].toUpperCase().replace(/[^A-Z]/g, "").slice(0, 6)}${memberNumber(id).slice(-3)}`;
}

export function tierRank(t: TierId) {
  return ["rookie", "challenger", "elite", "legend"].indexOf(t);
}
export const POINTS_PER_DOLLAR = { courts: 1, cafe: 2 } as const;

/** The digital key for a paid booking opens its kit locker and court gate from 10 minutes before until 10 minutes after the session. */
export const KEY_WINDOW_MIN = 10;
export const LOCKER_COUNT = 24;

export interface AchievementDef {
  id: string;
  name: string;
  description: string;
  points: number;
  icon: string; // lucide icon name, resolved in UI
}

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: "first-serve", name: "First Serve", description: "Book your first court at Padel Bay", points: 50, icon: "Sparkles" },
  { id: "sip-and-play", name: "Sip & Play", description: "Order from Sip straight to your court", points: 50, icon: "Coffee" },
  { id: "key-holder", name: "Key Holder", description: "Open your kit locker with your digital key", points: 30, icon: "KeyRound" },
  { id: "ask-the-bay", name: "Ask the Bay", description: "Plan something with the AI concierge", points: 30, icon: "MessageCircle" },
  { id: "squad-up", name: "Squad Up", description: "Invite three players to one booking", points: 60, icon: "Users" },
  { id: "open-court", name: "Open Court", description: "Host or join an open match", points: 60, icon: "Swords" },
  { id: "early-bird", name: "Early Bird", description: "Play a session before 9am", points: 40, icon: "Sunrise" },
  { id: "night-owl", name: "Night Owl", description: "Play a session after 9pm", points: 40, icon: "Moon" },
  { id: "regular", name: "The Regular", description: "Set up a weekly recurring booking", points: 120, icon: "Repeat" },
  { id: "bracket-ready", name: "Bracket Ready", description: "Register for a Padel Bay tournament", points: 80, icon: "Trophy" },
  { id: "on-time", name: "Right On Time", description: "Open your locker within its 10-minute key window", points: 40, icon: "Timer" },
];

export const SEASON = {
  name: "Winter Tides",
  code: "W'26",
  rewards: [
    { tier: "rookie" as TierId, reward: "Padel Bay grip pack" },
    { tier: "challenger" as TierId, reward: "Sip tumbler + 2 free smoothies" },
    { tier: "elite" as TierId, reward: "Private sunset clinic for four" },
    { tier: "legend" as TierId, reward: "Signed racket + a season of free kit" },
  ],
};

export interface ChallengeDef {
  id: string;
  name: string;
  description: string;
  goal: number;
  points: number;
  metric: "bookings-week" | "cafe-week" | "players-week" | "early-week";
}

export const CHALLENGES: ChallengeDef[] = [
  { id: "c-twice", name: "Double Session", description: "Play twice this week", goal: 2, points: 80, metric: "bookings-week" },
  { id: "c-sip", name: "Refuel Ritual", description: "Order three times from Sip this week", goal: 3, points: 60, metric: "cafe-week" },
  { id: "c-social", name: "New Faces", description: "Play with four different players this week", goal: 4, points: 70, metric: "players-week" },
];

// ----------------------------------------------------------------------------
// Skill rating (1.0 – 7.0), independent from loyalty.
// ----------------------------------------------------------------------------

export function skillLabel(r: number): string {
  if (r < 2) return "Beginner";
  if (r < 3) return "Improver";
  if (r < 4) return "Intermediate";
  if (r < 5) return "Advanced";
  if (r < 6) return "Competitive";
  return "Pro";
}

export const SKILL_ONBOARDING = [
  { id: "new", label: "First time", rating: 1.2, hint: "Never held a padel racket" },
  { id: "casual", label: "Casual", rating: 2.3, hint: "Played a few times" },
  { id: "regular", label: "Regular", rating: 3.4, hint: "Comfortable with walls" },
  { id: "competitive", label: "Competitive", rating: 4.6, hint: "Tournaments, bandejas, vibora" },
];

// ----------------------------------------------------------------------------
// Courts pricing and policy
// ----------------------------------------------------------------------------

export const PRICING = {
  indoor: { peak: 48, offPeak: 36 },
  outdoor: { peak: 40, offPeak: 30 },
};

export function isPeak(dayOfWeek: number, hour: number): boolean {
  const weekend = dayOfWeek === 0 || dayOfWeek === 6;
  return weekend ? hour >= 10 && hour < 23 : hour >= 17 && hour < 23;
}

export const CANCELLATION = {
  fullRefundHours: 24,
  partialRefundHours: 6,
  partialRate: 0.5,
  recoveryRate: 0.8,
  summary:
    "Free cancellation up to 24h before play (or your level's window). 50% back between 24h and 6h. Inside 6h there is no refund, but if the slot is re-booked through the waitlist you get 80% back as club credit.",
};

export const DURATIONS = [60, 90, 120] as const;

// ----------------------------------------------------------------------------
// Café option groups (Sip specialty coffee)
// ----------------------------------------------------------------------------

export const OPTION_GROUPS: Record<string, OptionGroup> = {
  size: {
    id: "size",
    label: "Size",
    type: "single",
    defaultId: "m",
    choices: [
      { id: "s", label: "Small", price: 0 },
      { id: "m", label: "Regular", price: 0.5 },
      { id: "l", label: "Large", price: 1 },
    ],
  },
  milk: {
    id: "milk",
    label: "Milk",
    type: "single",
    defaultId: "whole",
    choices: [
      { id: "whole", label: "Whole", price: 0 },
      { id: "oat", label: "Oat", price: 0.6 },
      { id: "almond", label: "Almond", price: 0.6 },
      { id: "lactose-free", label: "Lactose-free", price: 0.4 },
    ],
  },
  shot: {
    id: "shot",
    label: "Espresso",
    type: "single",
    defaultId: "std",
    choices: [
      { id: "std", label: "Standard", price: 0 },
      { id: "extra", label: "+1 shot", price: 0.8 },
      { id: "decaf", label: "Decaf", price: 0 },
    ],
  },
  sweet: {
    id: "sweet",
    label: "Sweetness",
    type: "single",
    defaultId: "none",
    choices: [
      { id: "none", label: "None", price: 0 },
      { id: "light", label: "Light", price: 0 },
      { id: "regular", label: "Regular", price: 0 },
      { id: "date", label: "Date syrup", price: 0.4 },
    ],
  },
  temp: {
    id: "temp",
    label: "Serve",
    type: "single",
    defaultId: "iced",
    choices: [
      { id: "hot", label: "Hot", price: 0 },
      { id: "iced", label: "Iced", price: 0 },
    ],
  },
  boost: {
    id: "boost",
    label: "Boosts",
    type: "multi",
    choices: [
      { id: "protein", label: "Whey protein", price: 1.5 },
      { id: "collagen", label: "Collagen", price: 1.5 },
      { id: "chia", label: "Chia", price: 0.5 },
      { id: "electrolytes", label: "Electrolytes", price: 0.8 },
    ],
  },
  bread: {
    id: "bread",
    label: "Bread",
    type: "single",
    defaultId: "sourdough",
    choices: [
      { id: "sourdough", label: "Sourdough", price: 0 },
      { id: "gf", label: "Gluten-free", price: 1 },
    ],
  },
  extras: {
    id: "extras",
    label: "Add",
    type: "multi",
    choices: [
      { id: "egg", label: "Poached egg", price: 1.5 },
      { id: "halloumi", label: "Grilled halloumi", price: 2 },
      { id: "avocado", label: "Avocado", price: 2 },
    ],
  },
};

export const MENU_CATEGORIES: { id: import("./types").MenuCategory; label: string; blurb: string }[] = [
  { id: "coffee", label: "Specialty coffee", blurb: "Single-origin beans, pulled by Sip" },
  { id: "matcha", label: "Matcha & tea", blurb: "Ceremonial grade, whisked to order" },
  { id: "smoothies", label: "Smoothies & juices", blurb: "Cold-pressed every morning" },
  { id: "recovery", label: "Recovery", blurb: "Built for the walk back from court" },
  { id: "bowls", label: "Bowls & plates", blurb: "Refuel your energy" },
  { id: "bites", label: "Bites", blurb: "Because the best breaks are worth savoring" },
  { id: "kids", label: "Little ones", blurb: "Little ones play. You sip." },
];

// ----------------------------------------------------------------------------
// Staff roles and permissions (RBAC)
// ----------------------------------------------------------------------------

export const PERMISSIONS = [
  "courts:read",
  "courts:write",
  "cafe:read",
  "cafe:write",
  "menu:write",
  "inventory:write",
  "lockers:read",
  "lockers:write",
  "kit:write",
  "guests:pii",
  "access:manage",
  "crm:read",
  "marketing:write",
  "analytics:read",
  "finance:read",
  "membership:write",
  "tasks:write",
  "team:manage",
  "ai:apply",
  "audit:read",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export const ROLE_LABEL: Record<StaffRole, string> = {
  gm: "Owner · General Manager",
  frontdesk: "Front Desk",
  cafe: "Sip Café Lead",
  housekeeping: "Facilities & Kit",
  marketing: "Marketing & CRM",
};

export const ROLE_PERMISSIONS: Record<StaffRole, Permission[]> = {
  gm: [...PERMISSIONS],
  frontdesk: [
    "courts:read",
    "courts:write",
    "cafe:read",
    "lockers:read",
    "lockers:write",
    "guests:pii",
    "access:manage",
    "crm:read",
    "tasks:write",
    "analytics:read",
  ],
  cafe: ["cafe:read", "cafe:write", "menu:write", "inventory:write", "courts:read", "tasks:write"],
  housekeeping: ["lockers:read", "lockers:write", "kit:write", "tasks:write"],
  marketing: ["crm:read", "marketing:write", "analytics:read", "membership:write", "courts:read", "cafe:read", "ai:apply"],
};

export function can(role: StaffRole | undefined, p: Permission): boolean {
  if (!role) return false;
  return ROLE_PERMISSIONS[role].includes(p);
}

// ----------------------------------------------------------------------------
// Venue facts (verified from padelbaycourts.com and @padelbaycourts)
// ----------------------------------------------------------------------------

export const VENUE = {
  name: "Padel Bay",
  tagline: "be the vibe",
  motto: "Play hard. Sip slow.",
  address: "Farid Trad Street, Ramlet El Baida, Beirut, Lebanon",
  email: "info@padelbaycourts.com",
  phone: "+961 71 418 997",
  instagram: "https://www.instagram.com/padelbaycourts/",
  website: "https://padelbaycourts.com/",
  cafe: "Sip",
};
