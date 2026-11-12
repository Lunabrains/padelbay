import GuestShell from "@/components/guest/GuestShell";

// The experience is rendered in the browser (WebGL + local demo data), so instant-navigation
// validation has nothing to check here.
export const instant = false;

export default function GuestLayout({ children }: LayoutProps<"/">) {
  return <GuestShell>{children}</GuestShell>;
}
