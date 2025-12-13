import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Transpile problematic packages to fix Turbopack compatibility issues
  transpilePackages: [
    "date-fns",
    "@radix-ui/react-primitive",
    "@radix-ui/react-roving-focus",
  ],
};

export default nextConfig;
