import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Geist } from "next/font/google";
import { ConvexAuthNextjsServerProvider } from "@convex-dev/auth/nextjs/server";
import { ConvexClientProvider } from "@/components/convex-client-provider";
import "./globals.css";

// Spotted design system: Bricolage Grotesque does the shouting (headlines,
// 24px and up), Geist does the explaining (body and UI).
const bricolage = Bricolage_Grotesque({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["600", "700", "800"],
});

const geist = Geist({
  variable: "--font-body",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "Mad Monkey Studio",
  description: "AI-first design system for on-brand marketing assets.",
};

// Fit the device width and tint the browser chrome / safe-area to the app's
// warm white paper. Note: NOT viewport-fit:cover — covering would extend the page under
// a notch and leave headers with asymmetric top safe-area padding (content
// pushed down, black band on top), especially in desktop fullscreen.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#F7F3EC",
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
        className={`${bricolage.variable} ${geist.variable} h-full antialiased`}
      >
        <body className="min-h-full flex flex-col bg-background text-foreground">
          <ConvexClientProvider>{children}</ConvexClientProvider>
        </body>
      </html>
    </ConvexAuthNextjsServerProvider>
  );
}
