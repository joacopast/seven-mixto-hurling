import type { MetadataRoute } from "next";
import { APP_URL } from "@/lib/config";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return ["", "/torneo", "/reglamento", "/inscripcion"].map((path) => ({
    url: `${APP_URL}${path}`,
    lastModified: now,
    changeFrequency: path === "/torneo" ? "hourly" : "weekly",
    priority: path === "" ? 1 : 0.7,
  }));
}
