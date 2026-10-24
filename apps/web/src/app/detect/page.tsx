import type { Metadata } from "next";
import { ReducedMotion } from "@/components/ReducedMotion";
import { DetectClient } from "@/features/detection/DetectClient";

export const metadata: Metadata = {
  title: "SafeFrame — analyze a video",
};

export default function DetectPage() {
  return (
    <ReducedMotion>
      <DetectClient />
    </ReducedMotion>
  );
}
