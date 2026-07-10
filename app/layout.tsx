import type { Metadata } from "next";
import "./globals.css";
import Nav from "@/components/Nav";
import Footer from "@/components/Footer";
import DevBanner from "@/components/DevBanner";

export const metadata: Metadata = {
  metadataBase: new URL("https://getreknock.com"),
  title: {
    default: "ReKnock - automatic follow-up texts for contractor quotes",
    template: "%s",
  },
  description:
    "ReKnock texts homeowners after every quote - in your voice - and hands you the conversation the second they reply. For roofers, painters, and every quoted trade.",
  openGraph: {
    title: "ReKnock - quotes that chase themselves",
    description:
      "Automatic follow-up texts for contractor quotes. Stops the second the homeowner replies.",
    url: "https://getreknock.com",
    siteName: "ReKnock",
    images: ["/brand/og.png"],
  },
  twitter: {
    card: "summary_large_image",
    title: "ReKnock - quotes that chase themselves",
    description:
      "Automatic follow-up texts for contractor quotes. $1 first week.",
    images: ["/brand/og.png"],
  },
};

const orgJsonLd = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "ReKnock",
  url: "https://getreknock.com",
  logo: "https://getreknock.com/brand/reknock-icon-blue.svg",
  email: "hello@getreknock.com",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700&family=Inter:wght@400;500;600;700&family=IBM+Plex+Mono:wght@500&display=swap"
          rel="stylesheet"
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(orgJsonLd) }}
        />
      </head>
      <body>
        <DevBanner />
        <Nav />
        {children}
        <Footer />
      </body>
    </html>
  );
}
