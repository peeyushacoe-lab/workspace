import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://mail.cybersage.uk";
  const now = new Date();
  return [
    { url: appUrl, lastModified: now, changeFrequency: "monthly", priority: 1 },
    { url: `${appUrl}/login`, lastModified: now, changeFrequency: "yearly", priority: 0.8 },
  ];
}
