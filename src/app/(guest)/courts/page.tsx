import type { Metadata } from "next";
import CourtsBooking from "@/components/guest/CourtsBooking";

export const metadata: Metadata = { title: "Book a court" };

export default function CourtsPage() {
  return <CourtsBooking />;
}
