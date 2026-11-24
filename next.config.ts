import type { NextConfig } from "next";

/**
 * Fully static build (`out/`) served by Firebase Hosting.
 * No server runtime is used: every Firebase call happens in the browser,
 * which is what makes the field flow work offline.
 */
const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  images: { unoptimized: true },
  reactStrictMode: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
