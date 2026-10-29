import { Suspense } from "react";
import { Shell } from "@/components/shell";
import { ListSkeleton } from "@/components/ui";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  // Suspense: pages read ?tab= etc. with useSearchParams
  return (
    <Shell>
      <Suspense fallback={<ListSkeleton />}>{children}</Suspense>
    </Shell>
  );
}
