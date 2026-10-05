// Centralized site content configuration.

export const SITE_URL = "https://www.legadoenterprise.com.br";

// Official brand marks.
export const BRAND = {
  // Navy mark + wordmark on a transparent background, drawn in dark ink —
  // legible on light surfaces, needs a light plate behind it when placed
  // on a dark surface like the header/footer.
  logo: "/brand/logo-legado.png",
  // Pre-sized WebP variants of the same mark, for the small header/footer
  // lockup — never displayed past ~96px tall, so there's no reason to ship
  // the 1024px/195KB master there.
  logoSmall160: "/brand/logo-legado-160.webp",
  logoSmall320: "/brand/logo-legado-320.webp",
  // Same mark redrawn in white on a transparent background — for direct,
  // plate-free use as a watermark/background element on dark surfaces
  // (e.g. the hero), where a boxed light plate would compete for attention.
  logoWhite: "/brand/logo-legado-white.png",
};

export const CONTACT = {
  whatsapp: "5515991928585", // +55 15 99192-8585
  email: "vitor.santos@legadoenterprisemkt.com",
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
    imageBase: "joao-guilherme",
    imageObjectPosition: "50% 15%",
    quote:
      "Eu acredito que grandes conquistas começam com pessoas, boas escolhas e constância. Busco evoluir todos os dias, tanto como profissional quanto como pessoa, construindo algo que gere valor hoje e que faça sentido lembrar amanhã.",
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
    imageBase: "vitor-santos",
    imageObjectPosition: "50% 10%",
    quote:
      "Eu acredito que crescer é uma consequência de fazer as coisas com propósito, disciplina e verdade. Gosto de transformar ideias em movimento, construir relações de confiança e saber que, de alguma forma, o meu trabalho contribuiu para a história de alguém.",
    bio: [
      "Trajetória profissional que combina liderança, gestão operacional, estratégia, análise de dados, performance e gestão de pessoas.",
      "Passou por diferentes níveis de operação e gestão, construindo uma visão orientada a processos, indicadores, pessoas, estratégia e resultado.",
      "Na Legado Enterprise, como CGO, sua atuação está diretamente conectada ao crescimento da empresa, estratégia, inteligência de negócios, desenvolvimento de oportunidades e evolução das operações.",
    ],
  },
};

// Rotas do site v2 (Parte 1 do briefing). O painel /intelligence é uma
// aplicação separada que não muda — só a tela de login ganha um bloco novo.
export const ROUTES = {
  home: "/",
  metodo: "/metodo",
  duo: "/titan-e-legacy",
  privacy: "/privacidade",
  intelligenceLogin: "/intelligence/login",
};

export const NAV_ITEMS = [
  { label: "Método", href: ROUTES.metodo },
  { label: "Soluções", href: "/#solucoes" },
  { label: "Intelligence", href: "/#intelligence" },
  { label: "Titan & Legacy", href: ROUTES.duo },
  { label: "Sobre", href: "/#sobre" },
  { label: "Contato", href: "/#contato" },
];

// wa.me links nunca mostram o número como texto visível (Parte 8) — só em
// atributos href, atrás de ícones.
export function waLink(message: string) {
  return `https://wa.me/${CONTACT.whatsapp}?text=${encodeURIComponent(message)}`;
}

export const WA_MESSAGES = {
  contactForm: "Olá! Vim pelo site e quero conversar sobre minha empresa.",
  loginPreamble: "Olá! Vim pela página do Legado Intelligence e quero conhecer a Legado.",
};
