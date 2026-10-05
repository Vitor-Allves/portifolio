"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { ROUTES, WA_MESSAGES, waLink } from "@/lib/site-config";

const revenueOptions = [
  "Até R$ 50 mil/mês",
  "R$ 50 mil a R$ 200 mil/mês",
  "R$ 200 mil a R$ 500 mil/mês",
  "Acima de R$ 500 mil/mês",
  "Prefiro não informar",
];

const objectiveOptions = [
  "Aumentar previsibilidade de vendas",
  "Estruturar aquisição de clientes",
  "Reposicionar a marca",
  "Organizar dados e indicadores",
  "Conectar marketing e comercial",
  "Outro",
];

function fallback(value: FormDataEntryValue | null) {
  const text = typeof value === "string" ? value.trim() : "";
  return text.length > 0 ? text : "Não informado";
}

function buildWhatsAppMessage(data: FormData) {
  const now = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date());

  return [
    "NOVO CONTATO — SITE LEGADO ENTERPRISE",
    "",
    `Nome: ${fallback(data.get("nome"))}`,
    "",
    `WhatsApp: ${fallback(data.get("whatsapp"))}`,
    "",
    `Empresa: ${fallback(data.get("empresa"))}`,
    "",
    `Faturamento aproximado: ${fallback(data.get("faturamento"))}`,
    "",
    `Principal objetivo: ${fallback(data.get("objetivo"))}`,
    "",
    "Origem:",
    "www.legadoenterprise.com.br",
    "",
    "Data:",
    now,
  ].join("\n");
}

export default function ContactForm() {
  const [submitted, setSubmitted] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);

    const nome = String(data.get("nome") || "").trim();
    const whatsapp = String(data.get("whatsapp") || "").trim();
    const empresa = String(data.get("empresa") || "").trim();

    if (!nome || !whatsapp || !empresa) {
      setErrorMessage("Preencha nome, WhatsApp e empresa antes de enviar.");
      return;
    }

    setErrorMessage(null);

    const message = buildWhatsAppMessage(data);
    window.open(waLink(message), "_blank", "noopener,noreferrer");

    setSubmitted(true);
    form.reset();
  }

  if (submitted) {
    return (
      <div className="lg-ok lg-card-look">
        <div className="lg-pair">
          <img
            src="/site/home/form-enviado-titan.webp"
            alt="Titan comemorando"
            loading="lazy"
          />
          <img
            src="/site/home/form-enviado-legacy.webp"
            alt="Legacy comemorando"
            loading="lazy"
          />
        </div>
        <div>
          <h3>Recebemos. Agora é com a gente.</h3>
          <p>A equipe da Legado vai entrar em contato pelo WhatsApp informado.</p>
          <button
            type="button"
            className="lg-btn lg-btn-line mt-4"
            onClick={() => setSubmitted(false)}
          >
            Voltar ao formulário
          </button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="lg-form lg-card-look" noValidate>
      <div className="lg-fld">
        <label htmlFor="nome">Nome</label>
        <input id="nome" name="nome" type="text" autoComplete="name" placeholder="Seu nome" />
      </div>
      <div className="lg-fld">
        <label htmlFor="whatsapp">WhatsApp</label>
        <input
          id="whatsapp"
          name="whatsapp"
          type="tel"
          inputMode="tel"
          placeholder="(15) 99999-9999"
        />
      </div>
      <div className="lg-fld lg-fld-full">
        <label htmlFor="empresa">Empresa</label>
        <input id="empresa" name="empresa" type="text" placeholder="Nome da empresa" />
      </div>
      <div className="lg-fld">
        <label htmlFor="faturamento">Faturamento aproximado</label>
        <select id="faturamento" name="faturamento" defaultValue="">
          <option value="" disabled>
            Selecione uma faixa
          </option>
          {revenueOptions.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </div>
      <div className="lg-fld">
        <label htmlFor="objetivo">Principal objetivo</label>
        <select id="objetivo" name="objetivo" defaultValue="">
          <option value="" disabled>
            Selecione um objetivo
          </option>
          {objectiveOptions.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </div>

      <p className="lg-consent">
        Ao enviar, você concorda com a{" "}
        <Link href={ROUTES.privacy}>Política de privacidade</Link>.
      </p>

      {errorMessage && (
        <p className="lg-fld-full text-sm text-red-700">{errorMessage}</p>
      )}

      <div className="lg-send">
        <button type="submit" className="lg-btn lg-btn-navy">
          Quero conversar sobre minha empresa
        </button>
        <a
          className="lg-wa-ico"
          href={waLink(WA_MESSAGES.contactForm)}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Falar no WhatsApp"
          title="Falar no WhatsApp"
        >
          <svg viewBox="0 0 24 24" fill="#FFFFFF" aria-hidden="true">
            <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8s-.4-.1-.6.1-.7.8-.8 1-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.3-.4.7-1.3a.5.5 0 0 0 0-.5l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.8 11.9 11.9 0 0 0 4.6 4c1.7.7 2.4.8 3.2.7a2.8 2.8 0 0 0 1.8-1.3 2.3 2.3 0 0 0 .2-1.3c-.1-.1-.3-.2-.5-.3z" />
          </svg>
        </a>
      </div>
    </form>
  );
}
