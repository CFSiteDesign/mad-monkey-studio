import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pptxgenjs is kept external so the deck-export route requires it from
  // node_modules at runtime instead of Turbopack trying to bundle it. (No
  // native image deps here anymore — slides are rasterised + JPEG-encoded in
  // Convex; the route only assembles the pptx.)
  serverExternalPackages: ["pptxgenjs"],
};

export default nextConfig;
