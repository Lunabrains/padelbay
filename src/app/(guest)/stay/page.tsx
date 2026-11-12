import type { Metadata } from "next";
import Stay from "@/components/guest/Stay";

export const metadata: Metadata = { title: "Bay Suites" };

export default function StayPage() {
  return <Stay />;
}
