import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://mail.cybersage.uk";
  return {
    rules: [
      {
        userAgent: "*",
        disallow: ["/", "/api/", "/inbox", "/chat", "/meet", "/drive", "/calendar", "/notes", "/docs", "/ai", "/admin", "/settings"],
      },
    ],
    sitemap: `${appUrl}/sitemap.xml`,
  };
}
