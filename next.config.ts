import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // @resvg/resvg-js ships a platform-specific native binary that Turbopack can't
  // bundle — keep it (and pptxgenjs) external so the deck-export route requires
  // them from node_modules at runtime instead of trying to bundle them.
  serverExternalPackages: ["@resvg/resvg-js", "pptxgenjs"],
};

export default nextConfig;
