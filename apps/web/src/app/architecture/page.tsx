import type { Metadata } from "next";
import { ArchitectureClient } from "@/features/architecture/ArchitectureClient";

export const metadata: Metadata = {
  title: "SafeFrame — architecture",
  description:
    "How SafeFrame decides: the pipeline, the two-tier model cascade, the fallback chains, and the tradeoffs taken on purpose.",
};

export default function ArchitecturePage() {
  return <ArchitectureClient />;
}
