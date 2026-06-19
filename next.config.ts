import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // @resvg/resvg-js and sharp ship platform-specific native binaries that
  // Turbopack can't bundle — keep them (and pptxgenjs) external so the
  // deck-export route requires them from node_modules at runtime instead of
  // trying to bundle them.
  serverExternalPackages: ["@resvg/resvg-js", "pptxgenjs", "sharp"],
};

export default nextConfig;
