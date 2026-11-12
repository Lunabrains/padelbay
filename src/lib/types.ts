// Domain model shared by the customer experience and the Command Center.
// Every timestamp is epoch milliseconds so the seed can be shifted to "today" in one pass.

export type ID = string;

export type TierId = "rookie" | "challenger" | "elite" | "legend";

export type Actor =
  | { type: "customer"; id: ID }
  | { type: "staff"; id: ID }
  | { type: "system" }
  | { type: "ai" };

export interface Customer {
  id: ID;
  name: string;
  phone: string;
  email: string;
  hue: number; // avatar colour
  createdAt: number;
  lastVisitAt: number;
  skill: { rating: number; matches: number; wins: number; side: "left" | "right" | "both"; style: "attacking" | "defensive" | "all-round" };
  loyalty: { points: number; lifetime: number };
  achievements: { id: string; at: number }[];
  marketingOptIn: boolean;
  tags: string[];
  favoriteItems: ID[];
  preferredHour?: number;
  preferredDay?: number; // 0 = Sunday
  notes?: string;
  isDemoGuest?: boolean;
  credit: number; // club credit in USD
  enrolledAt?: number; // joined the Padel Bay Club loyalty program
  hideFromLeaderboard?: boolean;
  referredBy?: ID;
}

export interface Redemption {
  id: ID;
  customerId: ID;
  rewardId: string;
  name: string;
  points: number;
  code: string;
  at: number;
  status: "issued" | "used";
  usedAt?: number;
}

export type CourtType = "indoor" | "outdoor";

export interface Court {
  id: ID;
  name: string;
  short: string;
  type: CourtType;
  zone: string;
  status: "open" | "maintenance";
  maintenanceNote?: string;
  maintenanceLog: { at: number; note: string; by: string }[];
  lastServicedAt: number;
}

export type BookingStatus = "confirmed" | "cancelled";

export interface InvitedPlayer {
  customerId?: ID;
  name: string;
  phone?: string;
  status: "pending" | "accepted" | "declined";
}

export interface Booking {
  id: ID;
  courtId: ID;
  customerId: ID;
  start: number;
  durationMin: number;
  status: BookingStatus;
  price: number; // what the customer paid in total
  listPrice: number;
  discountLabel?: string;
  players: InvitedPlayer[];
  splitPayment: boolean;
  recurringGroupId?: ID;
  createdAt: number;
  source: "app" | "concierge" | "desk" | "waitlist" | "tournament";
  payment: { method: string; status: "paid" | "refunded" | "partial-refund" | "pay-at-venue"; refunded: number };
  passId?: ID;
  lockerId?: ID;
  openMatchId?: ID;
  cancelledAt?: number;
  checkedInAt?: number;
  kind?: "play" | "coaching" | "maintenance" | "tournament";
}

export interface Hold {
  id: ID;
  courtId: ID;
  start: number;
  durationMin: number;
  ownerKey: string; // browser session that placed the hold
  expiresAt: number;
}

export interface WaitlistEntry {
  id: ID;
  customerId: ID;
  courtId: ID | null; // null = any court
  start: number;
  durationMin: number;
  createdAt: number;
  status: "waiting" | "offered" | "converted" | "expired";
  offeredAt?: number;
}

export interface AccessPass {
  id: ID;
  holderId: ID;
  kind: "court";
  refId: ID; // booking id
  lockerId?: ID;
  label: string;
  door: string;
  code: string;
  validFrom: number;
  validTo: number;
  status: "active" | "revoked";
  issuedAt: number;
}

export interface AccessLog {
  id: ID;
  at: number;
  passId: ID | null;
  holderId: ID | null;
  door: string;
  method: "QR" | "BLE" | "NFC" | "desk" | "Card";
  result: "granted" | "denied";
  reason?: string;
}

export type MenuCategory = "coffee" | "matcha" | "smoothies" | "recovery" | "bowls" | "bites" | "kids";

export interface OptionGroup {
  id: string;
  label: string;
  type: "single" | "multi";
  choices: { id: string; label: string; price: number }[];
  defaultId?: string;
}

export interface MenuItem {
  id: ID;
  category: MenuCategory;
  name: string;
  description: string;
  price: number;
  tags: string[];
  options: string[]; // option group ids
  available: boolean;
  prepMinutes: number;
  uses: { inventoryId: ID; qty: number }[];
  hue: number;
  emoji: string;
}

export interface InventoryItem {
  id: ID;
  name: string;
  unit: string;
  qty: number;
  par: number;
  reorderAt: number;
  costPerUnit: number;
}

export type OrderStage = "received" | "preparing" | "ready" | "delivering" | "delivered" | "cancelled";

export interface OrderLine {
  itemId: ID;
  name: string;
  qty: number;
  unitPrice: number;
  options: { groupId: string; choiceIds: string[] }[];
  optionsLabel: string;
}

export interface Order {
  id: ID;
  number: number;
  customerId: ID;
  lines: OrderLine[];
  total: number;
  deliverTo: { kind: "court" | "pickup"; refId?: ID; label: string };
  createdAt: number;
  autoFlow: boolean;
  stage: OrderStage; // used when autoFlow is false
  history: { stage: OrderStage; at: number; by?: string }[];
  payment: { method: string; status: "paid" | "refunded" };
  note?: string;
}

/** Smart kit locker: rackets and balls for one session, opened with the booking's digital key. */
export interface Locker {
  id: ID;
  number: string; // "07"
  bank: "Hall" | "Sea side";
  status: "ready" | "check" | "maintenance";
  kit: { rackets: number; balls: number };
  lastCheckedAt: number;
  note?: string;
}

export interface OpenMatch {
  id: ID;
  courtId: ID;
  start: number;
  durationMin: number;
  hostId: ID;
  playerIds: ID[];
  level: [number, number];
  pricePerPlayer: number;
  note?: string;
  bookingId?: ID;
  createdAt: number;
}

export interface Tournament {
  id: ID;
  name: string;
  format: "Americano" | "Mexicano" | "Knockout" | "Round robin";
  start: number;
  level: [number, number];
  entryFee: number;
  maxTeams: number;
  teams: { id: ID; players: [ID, ID]; seed?: number }[];
  status: "registration" | "scheduled" | "live" | "done";
  prize: string;
  plan?: { generatedAt: number; groups: { name: string; teamIds: ID[] }[]; slots: { courtId: ID; start: number; label: string }[]; notes: string[] };
}

export interface Invitation {
  id: ID;
  fromId: ID;
  toId: ID;
  matchId?: ID;
  bookingId?: ID;
  message: string;
  createdAt: number;
  status: "pending" | "accepted" | "declined";
}

export type StaffRole = "gm" | "frontdesk" | "cafe" | "housekeeping" | "marketing";

export interface Staff {
  id: ID;
  name: string;
  role: StaffRole;
  pin: string;
  hue: number;
}

export interface Task {
  id: ID;
  title: string;
  area: "courts" | "cafe" | "lockers" | "front" | "marketing";
  refId?: ID;
  assigneeId?: ID;
  due: number;
  status: "todo" | "doing" | "done";
  priority: "low" | "normal" | "high";
  createdBy: "ai" | "system" | string;
  createdAt: number;
}

export interface Campaign {
  id: ID;
  name: string;
  kind: "reactivation" | "off-peak" | "tournament" | "cafe" | "stay";
  segmentId: string;
  channel: "WhatsApp" | "SMS" | "Email" | "Push";
  message: string;
  offer?: string;
  status: "draft" | "scheduled" | "sent";
  createdBy: "ai" | string;
  createdAt: number;
  sentAt?: number;
  stats: { audience: number; delivered: number; opened: number; converted: number; revenue: number };
}

export interface AutomationRule {
  id: ID;
  name: string;
  trigger: string;
  action: string;
  enabled: boolean;
  runs: number;
  lastRunAt?: number;
}

export interface Promo {
  id: ID;
  label: string;
  courtIds: ID[] | "all";
  days: number[]; // weekdays
  fromHour: number;
  toHour: number;
  discount: number; // 0.2 = 20%
  createdBy: "ai" | string;
  active: boolean;
  createdAt: number;
  until: number;
}

export interface Notice {
  id: ID;
  at: number;
  kind: "booking" | "order" | "locker" | "access" | "loyalty" | "alert" | "ai" | "community" | "system";
  title: string;
  body: string;
  severity: "info" | "success" | "warning" | "critical";
  read: boolean;
  audience: "staff" | "customer";
  customerId?: ID;
  ref?: { kind: string; id: ID };
}

export interface AuditEntry {
  id: ID;
  at: number;
  actor: Actor;
  action: string;
  entity: string;
  entityId?: ID;
  summary: string;
}

export interface DB {
  version: number;
  seededDay: number;
  orderSeq: number;
  customers: Customer[];
  courts: Court[];
  bookings: Booking[];
  holds: Hold[];
  waitlist: WaitlistEntry[];
  passes: AccessPass[];
  accessLogs: AccessLog[];
  menu: MenuItem[];
  inventory: InventoryItem[];
  orders: Order[];
  lockers: Locker[];
  matches: OpenMatch[];
  tournaments: Tournament[];
  invitations: Invitation[];
  staff: Staff[];
  tasks: Task[];
  campaigns: Campaign[];
  automations: AutomationRule[];
  promos: Promo[];
  notices: Notice[];
  audit: AuditEntry[];
  redemptions: Redemption[];
  settings: { aiPricing: boolean };
}
