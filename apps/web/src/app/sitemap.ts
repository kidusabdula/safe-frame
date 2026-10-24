import type { MetadataRoute } from "next";
import { SITE_URL } from "@/site";

export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  return ["", "/detect", "/architecture"].map((path) => ({
    url: `${SITE_URL}${path}`,
  }));
}
