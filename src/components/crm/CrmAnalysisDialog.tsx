"use client";

import { useEffect, useState } from "react";
import type { CrmAnalysis } from "@/lib/crm-types";
import { CRM_ALERT, CRM_BTN_OUTLINE, CRM_BTN_PRIMARY, CRM_LABEL } from "./crm-styles";
import { dateTime } from "./crm-format";

/** The AI's text: "## " headings and "- " items, as plain text (never HTML). */
function AiText({ text }: { text: string }) {
  const blocks: React.ReactNode[] = [];
  let items: string[] = [];
  const flush = () => {
    if (items.length) {
      blocks.push(
        <ul key={`ul${blocks.length}`} className="list-disc pl-5 space-y-1">
          {items.map((t, i) => (
            <li key={i}>{t}</li>
          ))}
        </ul>
      );
      items = [];
    }
  };
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith("## ")) {
      flush();
      blocks.push(
        <h4 key={`h${blocks.length}`} className="text-[13px] font-semibold text-crm-text pt-1">
          {line.slice(3)}
        </h4>
      );
    } else if (/^[-•*] /.test(line)) items.push(line.slice(2));
    else {
      flush();
      blocks.push(<p key={`p${blocks.length}`}>{line.replace(/^#+\s*/, "")}</p>);
    }
  }
  flush();
  return <div className="space-y-2 text-[13px] leading-relaxed">{blocks}</div>;
}

/**
 * Resumos e análises (Fase 7): the CRM's data, the system's calculations and —
 * only when asked — the AI's reading, kept visibly apart. `request` is the
 * analysis to run (kind + what it's about).
 */
export default function CrmAnalysisDialog({ request, onClose }: { request: Record<string, unknown>; onClose: () => void }) {
  const [a, setA] = useState<CrmAnalysis | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const body = JSON.stringify(request);

  async function run(generate: boolean) {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/crm/ai/analysis/", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...JSON.parse(body), generate }) }).catch(
      () => null
    );
    const data = (await res?.json().catch(() => null)) as { analysis?: CrmAnalysis; error?: string } | null;
    setBusy(false);
    if (!res?.ok || !data?.analysis) return setError(data?.error ?? "Não foi possível falar com o CRM agora.");
    setA(data.analysis);
  }

  useEffect(() => {
    let cancelled = false;
    fetch("/api/crm/ai/analysis/", { method: "POST", headers: { "Content-Type": "application/json" }, body })
      .then(async (res) => {
        const data = (await res.json().catch(() => null)) as { analysis?: CrmAnalysis; error?: string } | null;
        if (cancelled) return;
        if (!res.ok || !data?.analysis) setError(data?.error ?? "Não foi possível montar a análise.");
        else setA(data.analysis);
      })
      .catch(() => !cancelled && setError("Não foi possível falar com o CRM agora."));
    return () => {
      cancelled = true;
    };
  }, [body]);

  useEffect(() => {
    function onKey(e: globalThis.KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const title = a?.title ?? "Análise";
  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40" onClick={onClose} aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="fixed z-50 inset-x-3 top-[5vh] bottom-[5vh] sm:inset-x-auto sm:left-1/2 sm:-translate-x-1/2 sm:w-[720px] rounded-2xl border border-crm-line bg-crm-raised shadow-[var(--crm-shadow-lg)] flex flex-col"
      >
        <header className="px-5 py-3.5 border-b border-crm-line flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="text-[15px] font-semibold">{title}</h2>
            <p className="text-[12px] text-crm-dim">{a ? a.subtitle : "Carregando..."}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Fechar análise" className="text-crm-dim hover:text-crm-text text-[20px] leading-none px-1">
            ×
          </button>
        </header>
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {error && <p className={CRM_ALERT}>{error}</p>}
          {a && (
            <>
              <section aria-label="Leitura da IA" className="rounded-xl border border-crm-violet/40 bg-crm-violet/[0.05] p-3.5 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className={`${CRM_LABEL} mr-auto`}>Leitura da IA</h3>
                  {a.ai && <span className="text-[11px] px-2 py-0.5 rounded-full border border-crm-violet/40 text-crm-violet">Gerado por IA · Claude</span>}
                </div>
                {a.ai ? (
                  <>
                    <AiText text={a.ai.text} />
                    <p className="text-[11.5px] text-crm-faint">
                      Recomendações escritas por IA a partir dos dados e cálculos abaixo, em {dateTime(a.ai.generatedAt)}. Confira antes de usar ou enviar; nada disso fica salvo no CRM.
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          void navigator.clipboard?.writeText(a.ai!.text).then(() => setCopied(true));
                        }}
                        className={CRM_BTN_OUTLINE}
                      >
                        {copied ? "Copiado" : "Copiar texto"}
                      </button>
                      {a.remainingToday !== null && a.remainingToday > 0 && (
                        <button type="button" disabled={busy} onClick={() => run(true)} className={CRM_BTN_OUTLINE}>
                          {busy ? "Gerando..." : "Gerar de novo"}
                        </button>
                      )}
                    </div>
                  </>
                ) : (
                  <>
                    {a.aiMessage && <p className={`text-[12.5px] ${a.aiStatus === "error" || a.aiStatus === "refused" ? "text-crm-red" : "text-crm-dim"}`}>{a.aiMessage}</p>}
                    {a.aiStatus === "ready" || a.aiStatus === "error" || a.aiStatus === "refused" ? (
                      <div className="flex flex-wrap items-center gap-2">
                        <button type="button" disabled={busy} onClick={() => run(true)} className={CRM_BTN_PRIMARY}>
                          {busy ? "Gerando..." : a.aiStatus === "ready" ? "Gerar leitura com IA" : "Tentar de novo"}
                        </button>
                        {a.remainingToday !== null && (
                          <span className="text-[11.5px] text-crm-faint">
                            {a.remainingToday} {a.remainingToday === 1 ? "análise restante" : "análises restantes"} nas próximas 24 horas
                          </span>
                        )}
                      </div>
                    ) : null}
                    {a.aiStatus === "ready" && (
                      <p className="text-[11.5px] text-crm-faint">A IA recebe só os dados e cálculos abaixo (sem telefones nem e-mails).</p>
                    )}
                  </>
                )}
              </section>

              <section aria-label="Cálculos do sistema" className="space-y-2">
                <h3 className={CRM_LABEL}>Cálculos do sistema</h3>
                <ul className="rounded-xl border border-crm-line divide-y divide-crm-line">
                  {a.calculations.map((c) => (
                    <li key={c.label} className="px-3 py-2 flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
                      <span className="text-[12.5px] text-crm-dim min-w-0 flex-1">{c.label}</span>
                      <span className="text-[13px] font-semibold tabular-nums">{c.value}</span>
                      <span className="basis-full text-[11px] text-crm-faint">{c.how}</span>
                    </li>
                  ))}
                </ul>
              </section>

              <section aria-label="Dados do CRM" className="space-y-3">
                <h3 className={CRM_LABEL}>Dados do CRM</h3>
                {a.facts.map((f) => (
                  <div key={f.title} className="space-y-1">
                    <h4 className="text-[12.5px] font-semibold">{f.title}</h4>
                    <dl className="rounded-xl border border-crm-line divide-y divide-crm-line">
                      {f.items.map((i, n) => (
                        <div key={n} className="px-3 py-1.5 grid grid-cols-1 sm:grid-cols-[minmax(0,12rem)_1fr] gap-x-3">
                          <dt className="text-[12px] text-crm-dim break-words">{i.label}</dt>
                          <dd className="text-[12.5px] break-words whitespace-pre-line">{i.value}</dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                ))}
              </section>
            </>
          )}
        </div>
      </div>
    </>
  );
}
