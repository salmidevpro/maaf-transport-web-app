import type { MetadataRoute } from "next";

const siteUrl = "https://maafnigerialtd.com";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: siteUrl, changeFrequency: "weekly", priority: 1 },
    { url: `${siteUrl}/security`, changeFrequency: "monthly", priority: 0.7 },
  ];
}
