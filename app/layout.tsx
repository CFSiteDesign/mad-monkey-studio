import type { Metadata, Viewport } from "next";
import { Fraunces, DM_Sans } from "next/font/google";
import { ConvexAuthNextjsServerProvider } from "@convex-dev/auth/nextjs/server";
import { ConvexClientProvider } from "@/components/convex-client-provider";
import "./globals.css";

const fraunces = Fraunces({
  variable: "--font-display",
  subsets: ["latin"],
  axes: ["SOFT", "WONK", "opsz"],
});

const dmSans = DM_Sans({
  variable: "--font-body",
  subsets: ["latin"],
  weight: ["300", "400", "500"],
});

export const metadata: Metadata = {
  title: "Mad Monkey Studio",
  description: "AI-first design system for on-brand marketing assets.",
};

// Fit the device width and tint the browser chrome / safe-area to the app's
// charcoal. Note: NOT viewport-fit:cover — covering would extend the page under
// a notch and leave headers with asymmetric top safe-area padding (content
// pushed down, black band on top), especially in desktop fullscreen.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#1C1A18",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ConvexAuthNextjsServerProvider>
      <html
        lang="en"
        className={`${fraunces.variable} ${dmSans.variable} dark h-full antialiased`}
      >
        <body className="min-h-full flex flex-col bg-background text-foreground">
          <ConvexClientProvider>{children}</ConvexClientProvider>
        </body>
      </html>
    </ConvexAuthNextjsServerProvider>
  );
}
