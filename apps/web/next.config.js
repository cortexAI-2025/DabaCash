/** @type {import('next').NextConfig} */
const isMobileBuild = process.env.NEXT_PUBLIC_IS_MOBILE === "true";

const nextConfig = {
  // Static export when building for mobile (Capacitor needs static files)
  ...(isMobileBuild && { output: "export", trailingSlash: true }),

  images: {
    // Static export doesn't support Next.js Image optimization
    unoptimized: isMobileBuild,
    remotePatterns: [
      { protocol: "https", hostname: "**.supabase.co" },
      { protocol: "https", hostname: "images.unsplash.com" },
    ],
  },

  experimental: {
    serverActions: { allowedOrigins: ["localhost:3000"] },
  },

  env: {
    NEXT_PUBLIC_IS_MOBILE: process.env.NEXT_PUBLIC_IS_MOBILE ?? "false",
  },
};

module.exports = nextConfig;
