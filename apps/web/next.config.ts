import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["192.168.1.36", "localhost:3000"],
  async redirects() {
    const legacyHost = process.env.LEGACY_WEB_HOST;
    const canonical = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "");
    if (!process.env.API_PROXY_TARGET || !legacyHost || !canonical) return [];
    if (new URL(canonical).hostname === legacyHost) return [];
    return [
      {
        source: "/:path*",
        has: [{ type: "host" as const, value: legacyHost }],
        destination: `${canonical}/:path*`,
        permanent: true,
      },
    ];
  },
  async rewrites() {
    // Optional same-origin API proxy for hosting without a shared custom domain.
    const target = process.env.API_PROXY_TARGET?.replace(/\/$/, "");
    if (!target) return [];
    return [
      { source: "/backend/:path*", destination: `${target}/:path*` },
      { source: "/api/auth/:path*", destination: `${target}/api/auth/:path*` },
    ];
  },
};

export default nextConfig;
