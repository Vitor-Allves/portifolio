// Centralized site content configuration.
// Update CONTACT.whatsapp / CONTACT.email / CONTACT.phone with the real
// Legado Enterprise channels before this site goes live.

export const SITE_URL = "https://www.legadoenterprise.com.br";

// Official brand mark. Drop the real files at these paths under /public —
// a light-on-dark version (used in the header/footer, which are always on
// a dark background) and, if available, a dark-on-light version for any
// spot the mark sits on a light background. Falls back gracefully to the
// wordmark-only treatment in Logo.tsx if a file is missing.
export const BRAND = {
  logoLight: "/brand/legado-logo-light.png",
  logoDark: "/brand/legado-logo-dark.png",
};

export const CONTACT = {
  whatsapp: "5511999999999", // TODO: replace with the real Legado Enterprise WhatsApp number (digits only, country code first)
  email: "contato@legadoenterprise.com.br", // TODO: confirm real inbox
  whatsappMessage:
    "Olá! Quero entender onde estão as próximas oportunidades de crescimento da minha empresa.",
};

export const SOCIAL = {
  linkedinCompany: "https://www.linkedin.com/company/legado-enterprise/", // TODO: confirm company page
  instagramCompany: "https://www.instagram.com/legadoenterprise/", // TODO: confirm handle
};

export const FOUNDERS = {
  joao: {
    name: "João Guilherme Rodrigues do Nascimento",
    shortName: "João Guilherme",
    role: "Sócio-Fundador & CEO",
    roleLong: "Chief Executive Officer",
    linkedin:
      "https://www.linkedin.com/in/jo%C3%A3o-guilherme-rodrigues-do-nascimento-7a5440127/",
    instagram: "https://www.instagram.com/joaoo.guilherme/",
    initials: "JG",
    bio: [
      "Formado em Administração de Empresas, com atuação relacionada a marketing digital e gestão de tráfego.",
      "Sua perspectiva combina administração, marketing, aquisição, performance, gestão e visão empresarial.",
      "Na Legado Enterprise, como CEO, sua atuação está diretamente conectada ao direcionamento estratégico da empresa, gestão, marketing, posicionamento e crescimento.",
    ],
  },
  vitor: {
    name: "Vitor Santos",
    shortName: "Vitor Santos",
    role: "Sócio-Fundador & CGO",
    roleLong: "Chief Growth Officer",
    linkedin: "https://www.linkedin.com/in/vitor-santos-b58196164/",
    instagram: "https://www.instagram.com/vittor.saantos/",
    initials: "VS",
    bio: [
      "Trajetória profissional que combina liderança, gestão operacional, estratégia, análise de dados, performance e gestão de pessoas.",
      "Passou por diferentes níveis de operação e gestão, construindo uma visão orientada a processos, indicadores, pessoas, estratégia e resultado.",
      "Na Legado Enterprise, como CGO, sua atuação está diretamente conectada ao crescimento da empresa, estratégia, inteligência de negócios, desenvolvimento de oportunidades e evolução das operações.",
    ],
  },
};

export const NAV_ITEMS = [
  { label: "Início", href: "#inicio" },
  { label: "Legado", href: "#legado" },
  { label: "Match Point", href: "#match-point" },
  { label: "Soluções", href: "#solucoes" },
  { label: "Resultados", href: "#resultados" },
  { label: "Sócios", href: "#socios" },
  { label: "Contato", href: "#contato" },
];
