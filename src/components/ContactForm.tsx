"use client";

import { useRef, useState, type FormEvent } from "react";

const GENERIC_ERROR =
  "Não foi possível enviar suas informações. Tente novamente em alguns instantes.";

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

export default function ContactForm() {
  const [submitted, setSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) return;

    const form = event.currentTarget;
    const data = new FormData(form);

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const res = await fetch("/api/lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nome: data.get("nome"),
          empresa: data.get("empresa"),
          cargo: data.get("cargo"),
          email: data.get("email"),
          whatsapp: data.get("whatsapp"),
          site: data.get("site"),
          faturamento: data.get("faturamento"),
          objetivo: data.get("objetivo"),
          mensagem: data.get("mensagem"),
          hp_field: data.get("hp_field"),
        }),
      });

      let result: { ok?: boolean; message?: string } = {};
      try {
        result = await res.json();
      } catch {
        result = {};
      }

      if (res.ok && result.ok) {
        setSubmitted(true);
        form.reset();
      } else {
        setErrorMessage(result.message || GENERIC_ERROR);
      }
    } catch {
      setErrorMessage(GENERIC_ERROR);
    } finally {
      setIsSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <div className="rounded-2xl border border-navy-700/15 bg-white p-10 sm:p-14 text-center">
        <p className="font-serif text-2xl sm:text-3xl text-navy-950">
          Agradecemos seu interesse e entraremos em contato.
        </p>
      </div>
    );
  }

  return (
    <form
      ref={formRef}
      onSubmit={handleSubmit}
      className="grid sm:grid-cols-2 gap-5"
      noValidate
    >
      <div className="hidden" aria-hidden="true">
        <label htmlFor="hp_field">Não preencher este campo</label>
        <input
          id="hp_field"
          name="hp_field"
          type="text"
          tabIndex={-1}
          autoComplete="off"
        />
      </div>
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
          disabled={isSubmitting}
          className="w-full sm:w-auto inline-flex items-center justify-center bg-navy-950 text-white text-sm tracking-[0.12em] uppercase font-medium px-10 py-4 rounded-full hover:bg-navy-800 transition-colors duration-300 disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {isSubmitting ? "Enviando..." : "Quero conversar sobre minha empresa"}
        </button>
      </div>
    </form>
  );
}
