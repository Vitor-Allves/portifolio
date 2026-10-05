import type { Metadata } from "next";
import { Cinzel, Cormorant_Garamond, Manrope, Montserrat } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import "./legado-v2.css";
import { SITE_URL } from "@/lib/site-config";
import MotionProvider from "@/components/MotionProvider";
import WhatsAppFloatButton from "@/components/WhatsAppFloatButton";

// Cormorant/Manrope stay loaded for the existing Legado Intelligence panel
// (Part 10 of the v2 spec: the panel itself does not change). The public
// marketing site below uses Cinzel/Montserrat exclusively.
const cormorant = Cormorant_Garamond({
  variable: "--font-cormorant",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
  display: "swap",
});

const cinzel = Cinzel({
  variable: "--font-cinzel",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  display: "swap",
});

const montserrat = Montserrat({
  variable: "--font-montserrat",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
});

const title =
  "Legado Enterprise | Estratégia, Inteligência e Crescimento Empresarial";
const description =
  "A Legado Enterprise conecta estratégia, posicionamento, aquisição e inteligência de dados em um único sistema de crescimento. Descubra onde agir antes de fazer mais.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: title,
    template: "%s | Legado Enterprise",
  },
  description,
  keywords: [
    "estratégia de marketing",
    "consultoria de marketing",
    "estratégia empresarial",
    "marketing estratégico",
    "crescimento empresarial",
    "geração de demanda",
    "aquisição de clientes",
    "gestão de tráfego",
    "inteligência de dados",
    "posicionamento de marca",
    "marketing B2B",
    "consultoria estratégica",
    "Legado Enterprise",
  ],
  authors: [{ name: "Legado Enterprise" }],
  creator: "Legado Enterprise",
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    locale: "pt_BR",
    url: SITE_URL,
    siteName: "Legado Enterprise",
    title,
    description,
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "Legado Enterprise — Estratégia, Inteligência e Crescimento",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
    images: ["/og-image.png"],
  },
  robots: {
    index: true,
    follow: true,
  },
};

const organizationSchema = {
  "@context": "https://schema.org",
  "@type": "ProfessionalService",
  name: "Legado Enterprise",
  description,
  url: SITE_URL,
  areaServed: "BR",
  sameAs: [
    "https://www.linkedin.com/company/legado-enterprise/",
    "https://www.instagram.com/legadoenterprise/",
  ],
  founder: [
    {
      "@type": "Person",
      name: "João Guilherme Rodrigues do Nascimento",
      jobTitle: "CEO",
    },
    {
      "@type": "Person",
      name: "Vitor Santos",
      jobTitle: "CGO",
    },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="pt-BR"
      className={`${cormorant.variable} ${manrope.variable} ${cinzel.variable} ${montserrat.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-paper text-ink font-body">
        <MotionProvider>{children}</MotionProvider>
        <WhatsAppFloatButton />
        <Script
          id="organization-schema"
          type="application/ld+json"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationSchema) }}
        />
      </body>
    </html>
  );
}
