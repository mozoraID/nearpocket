import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      { source: "/app", destination: "/home", permanent: true },
      { source: "/app/:path*", destination: "/home/:path*", permanent: true },
      { source: "/belanja", destination: "/shop", permanent: true },
      { source: "/aktivitas", destination: "/activity", permanent: true },
    ];
  },
  turbopack: {
    root: path.join(__dirname),
  },
  transpilePackages: ["@privy-io/react-auth", "@privy-io/js-sdk-core"],
  webpack: (config) => {
    config.resolve = config.resolve || {};
    config.resolve.alias = {
      ...(config.resolve.alias || {}),
      // Privy pulls Solana funding UI we don't use — stub optional modules
      "@solana-program/system": false,
      "@solana-program/token": false,
      "@farcaster/mini-app-solana": false,
      "@solana-program/memo": false,
    };
    config.externals = config.externals || [];
    return config;
  },
};

export default nextConfig;
