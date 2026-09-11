"use client";

import { useState, type FormEvent } from "react";
import { CONTACT } from "@/lib/site-config";

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

const fieldClass =
  "w-full rounded-lg border border-navy-700/20 bg-white px-4 py-3.5 text-sm text-navy-950 placeholder:text-navy-400 focus:border-navy-600 focus:outline-none transition-colors";
const labelClass = "block text-[11px] tracking-[0.14em] uppercase text-navy-600 mb-2";

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
    `Empresa: ${fallback(data.get("empresa"))}`,
    "",
    `Cargo: ${fallback(data.get("cargo"))}`,
    "",
    `E-mail: ${fallback(data.get("email"))}`,
    "",
    `WhatsApp: ${fallback(data.get("whatsapp"))}`,
    "",
    `Site / Instagram: ${fallback(data.get("site"))}`,
    "",
    `Faturamento aproximado: ${fallback(data.get("faturamento"))}`,
    "",
    `Principal objetivo: ${fallback(data.get("objetivo"))}`,
    "",
    "Mensagem:",
    fallback(data.get("mensagem")),
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
    const empresa = String(data.get("empresa") || "").trim();
    const email = String(data.get("email") || "").trim();
    const whatsapp = String(data.get("whatsapp") || "").trim();

    if (!nome || !empresa || !email || !whatsapp) {
      setErrorMessage("Preencha nome, empresa, e-mail e WhatsApp antes de enviar.");
      return;
    }

    setErrorMessage(null);

    const message = buildWhatsAppMessage(data);
    const url = `https://wa.me/${CONTACT.whatsapp}?text=${encodeURIComponent(message)}`;
    window.open(url, "_blank", "noopener,noreferrer");

    setSubmitted(true);
    form.reset();
  }

  if (submitted) {
    return (
      <div className="rounded-2xl border border-navy-700/15 bg-white p-10 sm:p-14 text-center">
        <p className="font-serif text-2xl sm:text-3xl text-navy-950">
          Agradecemos seu interesse e entraremos em contato.
        </p>
        <p className="mt-3 text-navy-700/80 font-light">
          Seu WhatsApp deve abrir com a mensagem pronta para envio — se isso não
          acontecer, escreva diretamente para{" "}
          <a
            href={`https://wa.me/${CONTACT.whatsapp}`}
            target="_blank"
            rel="noopener noreferrer"
            className="underline"
          >
            +55 15 99192-8585
          </a>
          .
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="grid sm:grid-cols-2 gap-5" noValidate>
      <div className="sm:col-span-1">
        <label htmlFor="nome" className={labelClass}>
          Nome
        </label>
        <input id="nome" name="nome" type="text" required className={fieldClass} />
      </div>
      <div className="sm:col-span-1">
        <label htmlFor="empresa" className={labelClass}>
          Empresa
        </label>
        <input id="empresa" name="empresa" type="text" required className={fieldClass} />
      </div>
      <div className="sm:col-span-1">
        <label htmlFor="cargo" className={labelClass}>
          Cargo
        </label>
        <input id="cargo" name="cargo" type="text" className={fieldClass} />
      </div>
      <div className="sm:col-span-1">
        <label htmlFor="email" className={labelClass}>
          E-mail
        </label>
        <input id="email" name="email" type="email" required className={fieldClass} />
      </div>
      <div className="sm:col-span-1">
        <label htmlFor="whatsapp" className={labelClass}>
          WhatsApp
        </label>
        <input id="whatsapp" name="whatsapp" type="tel" required className={fieldClass} />
      </div>
      <div className="sm:col-span-1">
        <label htmlFor="site" className={labelClass}>
          Site / Instagram da empresa
        </label>
        <input id="site" name="site" type="text" className={fieldClass} />
      </div>
      <div className="sm:col-span-1">
        <label htmlFor="faturamento" className={labelClass}>
          Faturamento aproximado
        </label>
        <select id="faturamento" name="faturamento" className={fieldClass} defaultValue="">
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
      <div className="sm:col-span-1">
        <label htmlFor="objetivo" className={labelClass}>
          Principal objetivo
        </label>
        <select id="objetivo" name="objetivo" className={fieldClass} defaultValue="">
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
      <div className="sm:col-span-2">
        <label htmlFor="mensagem" className={labelClass}>
          Mensagem
        </label>
        <textarea
          id="mensagem"
          name="mensagem"
          rows={4}
          className={fieldClass}
          placeholder="Conte um pouco sobre o momento atual da sua empresa."
        />
      </div>

      {errorMessage && (
        <div className="sm:col-span-2">
          <p className="text-sm text-red-700">{errorMessage}</p>
        </div>
      )}

      <div className="sm:col-span-2 mt-2">
        <button
          type="submit"
          className="w-full sm:w-auto inline-flex items-center justify-center bg-navy-950 text-white text-sm tracking-[0.12em] uppercase font-medium px-10 py-4 rounded-full hover:bg-navy-800 transition-colors duration-300"
        >
          Quero conversar sobre minha empresa
        </button>
      </div>
    </form>
  );
}
