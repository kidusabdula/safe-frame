import type { Metadata } from "next";
import { Landing } from "@/components/Landing";

export const metadata: Metadata = {
  title: "SafeFrame — video safety that never leaves the device",
  description:
    "A two-tier ML cascade detects inappropriate video content entirely in your browser. No server, no uploads, no account.",
};

export default function Home() {
  return <Landing />;
}
