import type { Metadata, Viewport } from "next";
import { DM_Sans, Inter } from "next/font/google";
import { Toaster } from "sonner";
import "./globals.css";
import { ServiceWorkerRegistration } from "@/components/ServiceWorkerRegistration";
import { InstallPrompt } from "@/components/InstallPrompt";
import { OfflineIndicator } from "@/components/OfflineIndicator";
import { OfflineComposeBanner } from "@/components/OfflineComposeBanner";

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-dm",
  display: "swap",
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});


export const metadata: Metadata = {
  title: “Nexus by CyberSage”,
  description: "Your unified workspace for email, chat, drive, and calendar.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Nexus",
  },
};

export const viewport: Viewport = {
  themeColor: "#00d2ff",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${dmSans.variable} ${inter.variable} dark h-full antialiased`} suppressHydrationWarning>
      <head>
        {/* Inline script to set dark class before first paint â€” prevents flash */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('theme');var d=window.matchMedia('(prefers-color-scheme: dark)').matches;if(t==='dark'||(t===null&&d)){document.documentElement.classList.add('dark');}}catch(e){}})();`,
          }}
        />
      </head>
      <body className="min-h-full bg-[#0f1321] text-[#dfe1f6] font-sans" suppressHydrationWarning>
        <div className="min-h-screen flex flex-col">
          {children}
        </div>
        <Toaster richColors position="top-right" />
        <OfflineIndicator />
        <OfflineComposeBanner />
        <ServiceWorkerRegistration />
        <InstallPrompt />
      </body>
    </html>
  );
}
