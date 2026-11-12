import type { Metadata } from "next";
import Me from "@/components/guest/Me";

export const metadata: Metadata = { title: "My Padel Bay" };

export default function MePage() {
  return <Me />;
}
