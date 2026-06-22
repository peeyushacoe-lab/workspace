import type { Metadata, Viewport } from "next";
import { DM_Sans, Inter, Plus_Jakarta_Sans, JetBrains_Mono } from "next/font/google";
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

// Design system fonts (Nexus dark theme)
const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-jakarta",
  display: "swap",
});

const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains",
  display: "swap",
});


const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://mail.cybersage.uk";

export const metadata: Metadata = {
  metadataBase: new URL(APP_URL),
  title: {
    default: "CyberSage Workspace",
    template: "%s · CyberSage",
  },
  description: "The secure, unified workspace for your team — email, chat, drive, calendar, meet, and AI in one place.",
  keywords: ["email", "workspace", "secure email", "team chat", "enterprise", "CyberSage"],
  authors: [{ name: "CyberSage", url: APP_URL }],
  creator: "CyberSage",
  publisher: "CyberSage",
  manifest: "/manifest.json",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any", type: "image/x-icon" },
      { url: "/icon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    shortcut: "/favicon.ico",
    apple: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "CyberSage",
  },
  openGraph: {
    type: "website",
    url: APP_URL,
    title: "CyberSage Workspace",
    description: "The secure, unified workspace for your team — email, chat, drive, calendar, meet, and AI.",
    siteName: "CyberSage Workspace",
    images: [{ url: "/og-image.png", width: 1200, height: 630, alt: "CyberSage Workspace" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "CyberSage Workspace",
    description: "Secure, unified workspace for modern teams.",
    images: ["/og-image.png"],
  },
  robots: { index: false, follow: false }, // app is behind auth
};

export const viewport: Viewport = {
  themeColor: "#0B0D12",
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
    <html lang="en" className={`${dmSans.variable} ${inter.variable} ${jakarta.variable} ${jetbrains.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        {/* Apply saved theme before first paint — prevents flash of wrong theme */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('theme');var dark=t==='dark'||(!t)||(t==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',dark);}catch(e){}})();`,
          }}
        />
      </head>
      <body className="min-h-full bg-[#0B0D12] text-[#E6E9F0] font-sans" suppressHydrationWarning>
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
