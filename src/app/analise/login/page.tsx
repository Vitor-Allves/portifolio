import type { Metadata } from "next";
import { Suspense } from "react";
import LoginForm from "@/components/analise/LoginForm";
import Logo from "@/components/Logo";

export const metadata: Metadata = {
  title: "Acesso — Legado Intelligence",
  robots: { index: false, follow: false },
};

// Titan and Legacy ship as single portrait renders (character + their own
// embedded data-visualization holograms baked into the same file) — full
// image, never cropped, per the brief's explicit "avoid important cuts"
// requirement. Width-only sizing keeps the natural aspect ratio at every
// breakpoint, so nothing behind them ever needs a guessed crop window.
const TITAN_SRC = "/login/titan-720.webp";
const TITAN_SRCSET = "/login/titan-480.webp 480w, /login/titan-720.webp 720w, /login/titan-960.webp 960w";
const LEGACY_SRC = "/login/legacy-720.webp";
const LEGACY_SRCSET = "/login/legacy-480.webp 480w, /login/legacy-720.webp 720w, /login/legacy-960.webp 960w";
const CHARACTER_SIZES = "(min-width: 1024px) 300px, (min-width: 640px) 210px, 34vw";

export default function AnaliseLoginPage() {
  return (
    <main className="relative min-h-screen overflow-x-hidden bg-intel-ambient bg-intel-grid lg:flex">
      {/* ---------------------------------------------------------------
          Brand / visual panel — ~60% of the desktop viewport, integrated
          with the login panel on one continuous navy canvas (no hard
          divider) so the two halves read as one scene, not two screens
          glued together.
      --------------------------------------------------------------- */}
      <section className="relative flex flex-col items-center overflow-hidden px-6 pb-10 pt-12 sm:pt-14 lg:w-[60%] lg:justify-center lg:px-12 lg:py-16 xl:px-16">
        {/* Soft background lighting behind the characters — navy + silver
            glow, blurred well past any hard edge, kept faint so it never
            competes with the artwork or the copy. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute left-1/2 top-[38%] h-[420px] w-[420px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-navy-500/35 blur-[110px] sm:h-[560px] sm:w-[560px] lg:h-[680px] lg:w-[680px]"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute left-[28%] top-[30%] h-[260px] w-[260px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-silver-400/[0.08] blur-[90px] sm:h-[360px] sm:w-[360px]"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute left-[72%] top-[34%] h-[260px] w-[260px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-silver-400/[0.06] blur-[90px] sm:h-[360px] sm:w-[360px]"
        />

        <div
          aria-hidden="true"
          className="pointer-events-none absolute left-1/2 top-[7%] h-[160px] w-[320px] -translate-x-1/2 rounded-full bg-silver-400/[0.12] blur-[70px] sm:h-[200px] sm:w-[400px]"
        />
        <div className="relative z-10 animate-intel-in">
          <Logo variant="onDark" size="lg" className="!h-16 sm:!h-20 lg:!h-28 xl:!h-32" />
        </div>

        <div className="relative z-10 mt-8 flex items-end justify-center gap-4 sm:mt-10 sm:gap-6 lg:mt-12 lg:gap-10 [animation-delay:100ms] animate-intel-in">
          <img
            src={TITAN_SRC}
            srcSet={TITAN_SRCSET}
            sizes={CHARACTER_SIZES}
            width={1121}
            height={1403}
            alt="Titan, mascote analista da Legado Enterprise, em terno azul-marinho segurando um tablet ao lado de gráficos de desempenho"
            className="h-auto w-[36vw] max-w-[160px] object-contain drop-shadow-[0_28px_46px_rgba(4,7,12,0.55)] sm:max-w-[210px] lg:max-w-[290px] xl:max-w-[330px]"
          />
          <img
            src={LEGACY_SRC}
            srcSet={LEGACY_SRCSET}
            sizes={CHARACTER_SIZES}
            width={1121}
            height={1403}
            alt="Legacy, mascote analista da Legado Enterprise, em terno azul-marinho segurando um tablet ao lado de ícones de dados conectados"
            className="h-auto w-[36vw] max-w-[160px] object-contain drop-shadow-[0_28px_46px_rgba(4,7,12,0.55)] sm:max-w-[210px] lg:max-w-[290px] xl:max-w-[330px]"
          />
        </div>

        {/* Headline — hidden on phones to get the form on screen faster,
            shown (progressively larger) from small tablets up. */}
        <div className="relative z-10 mt-8 hidden max-w-md text-center sm:mt-10 sm:block lg:mt-12 lg:max-w-lg [animation-delay:200ms] animate-intel-in">
          <h1 className="font-serif text-xl leading-tight text-white sm:text-2xl lg:text-[28px] xl:text-3xl">
            Inteligência para decidir. Estratégia para crescer.
          </h1>
          <p className="mt-3 text-[13px] leading-relaxed text-silver-400 sm:text-sm">
            Acesse seu ambiente de análise e acompanhe os resultados do seu negócio.
          </p>
        </div>
      </section>

      {/* ---------------------------------------------------------------
          Login panel — ~40% of the desktop viewport.
      --------------------------------------------------------------- */}
      <section className="relative z-10 flex flex-1 items-center justify-center px-6 pb-14 pt-4 sm:pb-16 lg:w-[40%] lg:px-10 lg:py-16 xl:px-14">
        <div className="w-full max-w-sm rounded-2xl border border-white/[0.12] bg-white/[0.05] p-7 shadow-[0_24px_70px_-24px_rgba(4,7,12,0.65)] backdrop-blur-md sm:p-9 [animation-delay:150ms] animate-intel-in">
          <h2 className="text-center font-serif text-2xl text-white sm:text-[26px]">Bem-vindo à Legado Intelligence</h2>
          <p className="mt-2 text-center text-sm text-silver-400">Acesse sua conta para continuar.</p>
          <div className="mt-8">
            <Suspense fallback={null}>
              <LoginForm />
            </Suspense>
          </div>
        </div>
      </section>
    </main>
  );
}
