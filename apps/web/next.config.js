/** @type {import('next').NextConfig} */
const isMobileBuild = process.env.NEXT_PUBLIC_IS_MOBILE === "true";

const nextConfig = {
  // Static export when building for mobile (Capacitor needs static files)
  ...(isMobileBuild && { output: "export", trailingSlash: true }),

  images: {
    // The image optimizer is a server-side attack surface (several Next.js advisories target it)
    // and the app serves listing photos as-is, so it stays off in every build.
    unoptimized: true,
  },

  poweredByHeader: false,

  env: {
    NEXT_PUBLIC_IS_MOBILE: process.env.NEXT_PUBLIC_IS_MOBILE ?? "false",
  },
};

module.exports = nextConfig;
