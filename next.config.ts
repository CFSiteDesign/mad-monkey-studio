import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Bundle everything (incl. pptxgenjs) into the route — do NOT externalize it.
  // Externalizing made the Node serverless function load pptxgenjs's ESM build
  // (pptxgen.es.js) via require(), which threw "Cannot use import statement
  // outside a module" → FUNCTION_INVOCATION_FAILED → a bare 500 on every export.
  // The only native deps (resvg) now live in Convex, so nothing here needs to
  // stay external.
};

export default nextConfig;
