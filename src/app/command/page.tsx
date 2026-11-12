import type { Metadata } from "next";
import CommandShell from "@/components/command/CommandShell";

export const metadata: Metadata = { title: "Command Center" };

export default function CommandPage() {
  return <CommandShell />;
}
