"use client";

import clsx from "clsx";
import Link from "next/link";
import { useState } from "react";
import { Bell, LogOut, RotateCcw } from "lucide-react";
import { POSES } from "@/components/three/rig";
import { Avatar, Button, JoinCard, Label, PassCard, Tabs, ZonePanel, useZone } from "@/components/ui/kit";
import { bookCourt, cancelBooking, markNoticesRead, refundFor, signOutCustomer, upcomingFor } from "@/lib/actions";
import { skillLabel, tierFor } from "@/lib/catalog";
import { useFx } from "@/lib/fx";
import { useCustomer, useNow } from "@/lib/hooks";
import { useStore } from "@/lib/store";
import { fmtAgo, fmtDayLabel, fmtRange } from "@/lib/time";

type Tab = "passes" | "bookings" | "inbox";

export default function Me() {
  useZone("overview", POSES.overview);
  const db = useStore((s) => s.db);
  const resetDemo = useStore((s) => s.resetDemo);
  const customer = useCustomer();
  const now = useNow(15_000);
  const toast = useFx((s) => s.toast);
  const celebrate = useFx((s) => s.celebrate);
  const [tab, setTab] = useState<Tab>("passes");
  const [confirmCancel, setConfirmCancel] = useState<string | null>(null);

  if (!customer) {
    return (
      <ZonePanel kicker="Your Padel Bay" title="welcome.">
        <JoinCard reason="to see your passes" />
      </ZonePanel>
    );
  }
  const tier = tierFor(customer.loyalty.lifetime);
  const passes = db.passes.filter((p) => p.holderId === customer.id && p.status === "active" && p.validTo > now);
  const upcoming = upcomingFor(db, customer.id, now);
  const offers = db.waitlist.filter((w) => w.customerId === customer.id && (w.status === "offered" || w.status === "waiting"));
  const inbox = db.notices.filter((n) => n.audience === "customer" && n.customerId === customer.id);
  const unread = inbox.filter((n) => !n.read).length;

  return (
    <ZonePanel
      kicker="Your Padel Bay"
      title={<>hi, {customer.name.split(" ")[0].toLowerCase()}.</>}
      tabs={
        <Tabs
          value={tab}
          onChange={(t) => {
            setTab(t);
            if (t === "inbox") markNoticesRead("customer", customer.id);
          }}
          items={[
            { id: "passes", label: "Passes", badge: passes.length },
            { id: "bookings", label: "Bookings", badge: upcoming.length },
            { id: "inbox", label: "Inbox", badge: unread },
          ]}
        />
      }
      footer={
        <div className="flex gap-2">
          <Button variant="ghost" className="h-10 flex-1 text-[12.5px]" onClick={() => signOutCustomer()}><LogOut size={14} /> Sign out</Button>
          <Button
            variant="ghost"
            className="h-10 flex-1 text-[12.5px]"
            onClick={() => {
              resetDemo();
              toast({ tone: "info", title: "Demo data reset", body: "Fresh seed for a new walkthrough" });
            }}
          >
            <RotateCcw size={14} /> Reset demo
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="flex items-center gap-3 rounded-[22px] bg-white/5 p-3">
          <Avatar name={customer.name} hue={customer.hue} size={44} ring={tier.color} />
          <div className="flex-1">
            <p className="text-[14px] font-semibold text-white">{customer.name}</p>
            <p className="text-[11.5px] text-white/55">{tier.name} · {customer.loyalty.points} pts · skill {customer.skill.rating.toFixed(1)} {skillLabel(customer.skill.rating)}</p>
          </div>
          <Link href="/club" className="rounded-full bg-white/10 px-3 py-1.5 text-[11.5px] font-semibold text-white hover:bg-white/20">Club</Link>
        </div>

        {tab === "passes" && (
          <>
            {passes.length === 0 && <p className="rounded-2xl bg-white/5 p-4 text-[13px] text-white/60">No active passes. Book a court and your gate pass appears here.</p>}
            {passes.map((p) => <PassCard key={p.id} pass={p} />)}
          </>
        )}

        {tab === "bookings" && (
          <>
            {offers.length > 0 && (
              <div className="space-y-1.5">
                <Label>Waitlist</Label>
                {offers.map((w) => {
                  const court = db.courts.find((c) => c.id === w.courtId);
                  return (
                    <div key={w.id} className={clsx("flex items-center justify-between rounded-2xl px-3.5 py-2.5", w.status === "offered" ? "bg-sage/15 ring-1 ring-sage/40" : "bg-white/5")}>
                      <span>
                        <span className="block text-[13px] font-semibold text-white">{court?.short ?? "Any court"} · {fmtDayLabel(w.start, now)} {fmtRange(w.start, w.durationMin)}</span>
                        <span className="block text-[11px] text-white/55">{w.status === "offered" ? "A spot opened up for you!" : "Waiting for a cancellation"}</span>
                      </span>
                      {w.status === "offered" && (
                        <Button
                          variant="sage"
                          className="h-9 px-4 text-[12px]"
                          onClick={() => {
                            const res = bookCourt({ customerId: customer.id, courtId: w.courtId ?? "c1", start: w.start, durationMin: w.durationMin, players: [], splitPayment: false, weeks: 1, paymentMethod: "Apple Pay", openMatch: false, source: "waitlist" });
                            if (!res.ok) return toast({ tone: "error", title: res.error });
                            useStore.getState().commit((d) => {
                              const x = d.waitlist.find((y) => y.id === w.id);
                              if (x) x.status = "converted";
                            });
                            toast({ tone: "success", title: "Booked from the waitlist" });
                            celebrate(res.reward);
                          }}
                        >
                          Take it
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
            <Label>Upcoming</Label>
            {upcoming.length === 0 && <p className="rounded-2xl bg-white/5 p-4 text-[13px] text-white/60">Nothing booked yet.</p>}
            {upcoming.map((b) => {
              const court = db.courts.find((c) => c.id === b.courtId)!;
              const refund = refundFor(b, now, tier.freeCancelHours);
              return (
                <div key={b.id} className="rounded-[22px] bg-white/5 p-3.5">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-[14px] font-semibold text-white">{court.short} · {fmtDayLabel(b.start, now)} {fmtRange(b.start, b.durationMin)}</p>
                      <p className="text-[11.5px] text-white/55">${b.price.toFixed(2)} · {b.payment.method}{b.recurringGroupId ? " · weekly" : ""}{b.openMatchId ? " · open match" : ""}</p>
                    </div>
                    {b.start < now && <span className="rounded-full bg-sunset/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-sunset">In play</span>}
                  </div>
                  {confirmCancel === b.id ? (
                    <div className="mt-3 rounded-2xl bg-danger/10 p-3">
                      <p className="text-[12px] text-white/85">{refund.label}{refund.rate > 0 ? ` · $${(b.price * refund.rate).toFixed(2)} back` : ""}. Cancel this session?</p>
                      <div className="mt-2 flex gap-2">
                        <Button variant="ghost" className="h-9 flex-1 text-[12px]" onClick={() => setConfirmCancel(null)}>Keep it</Button>
                        <Button
                          variant="danger"
                          className="h-9 flex-1 text-[12px]"
                          onClick={() => {
                            const res = cancelBooking(b.id, { type: "customer", id: customer.id });
                            setConfirmCancel(null);
                            if (!res.ok) return toast({ tone: "error", title: res.error });
                            toast({ tone: "info", title: "Booking cancelled", body: `$${res.value.refund.toFixed(2)} refunded${res.value.offeredTo ? `. The slot was offered to ${res.value.offeredTo}.` : ""}` });
                          }}
                        >
                          Cancel session
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-3 flex gap-2">
                      <Link href={`/cafe?deliver=${b.id}`} className="flex h-9 flex-1 items-center justify-center rounded-full bg-white/10 text-[12px] font-semibold text-white hover:bg-white/18">Order Sip</Link>
                      <Button variant="ghost" className="h-9 flex-1 text-[12px]" onClick={() => setConfirmCancel(b.id)}>Cancel</Button>
                    </div>
                  )}
                </div>
              );
            })}
          </>
        )}

        {tab === "inbox" && (
          <>
            {inbox.length === 0 && <p className="rounded-2xl bg-white/5 p-4 text-[13px] text-white/60">No messages yet.</p>}
            {inbox.map((n) => (
              <div key={n.id} className="flex gap-3 rounded-2xl bg-white/5 p-3">
                <Bell size={15} className="mt-0.5 shrink-0 text-sage" />
                <div>
                  <p className="text-[13px] font-semibold text-white">{n.title}</p>
                  <p className="text-[12px] text-white/65">{n.body}</p>
                  <p className="mt-0.5 text-[10.5px] text-white/40">{fmtAgo(n.at, now)}</p>
                </div>
              </div>
            ))}
          </>
        )}
      </div>
    </ZonePanel>
  );
}
