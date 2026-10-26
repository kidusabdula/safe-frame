import type { Metadata } from "next";
import { Toaster } from "sonner";
import { DetectClient } from "@/features/detection/DetectClient";

export const metadata: Metadata = {
  title: "SafeFrame — analyze a video",
};

// Toasts are raised only by the detector, so the landing and architecture
// pages don't ship the toast library.
export default function DetectPage() {
  return (
    <>
      <DetectClient />
      <Toaster position="bottom-right" richColors />
    </>
  );
}
