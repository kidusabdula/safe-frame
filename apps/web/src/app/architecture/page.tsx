import type { Metadata } from "next";
import { Architecture } from "@/features/architecture/Architecture";

export const metadata: Metadata = {
  title: "SafeFrame — architecture",
  description:
    "How SafeFrame decides: the pipeline, the two-tier model cascade, the fallback chains, and the tradeoffs taken on purpose.",
};

export default function ArchitecturePage() {
  return <Architecture />;
}
