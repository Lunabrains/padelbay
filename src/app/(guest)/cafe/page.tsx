import type { Metadata } from "next";
import Cafe from "@/components/guest/Cafe";

export const metadata: Metadata = { title: "Sip café" };

export default function CafePage() {
  return <Cafe />;
}
