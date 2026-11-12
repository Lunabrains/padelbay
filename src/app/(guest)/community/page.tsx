import type { Metadata } from "next";
import Community from "@/components/guest/Community";

export const metadata: Metadata = { title: "Community" };

export default function CommunityPage() {
  return <Community />;
}
