import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/admin/", "/agent/", "/dashboard", "/api/", "/verify/"],
    },
    sitemap: "https://maafnigerialtd.com/sitemap.xml",
  };
}
