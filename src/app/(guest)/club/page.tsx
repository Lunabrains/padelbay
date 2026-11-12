import type { Metadata } from "next";
import Club from "@/components/guest/Club";

export const metadata: Metadata = { title: "The Club" };

export default function ClubPage() {
  return <Club />;
}
