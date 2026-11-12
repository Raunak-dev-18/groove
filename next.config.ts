import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Media is streamed through /api/cdn/files/* proxy — no remote image domains needed.
  // Allow large audio uploads (the app caps at 150MB in the route handler).
  experimental: {
    serverActions: {
      bodySizeLimit: "150mb",
    },
  },
  // Keep ffmpeg-static external so its binary path resolves correctly
  serverExternalPackages: ["ffmpeg-static"],
};

export default nextConfig;
