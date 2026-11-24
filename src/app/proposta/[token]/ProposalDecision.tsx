"use client";

// The client's side of a proposal: tells the CRM the page was really opened
// (only a browser runs this — link previews don't), offers the PDF, and the
// approve / refuse form with what the approval records.

import { useEffect, useState, type FormEvent } from "react";

const INPUT = "w-full rounded-xl border border-line bg-white px-3.5 py-2.5 text-[15px] text-ink outline-none focus:border-navy focus:ring-2 focus:ring-navy/15";

export default function ProposalDecision({
  token,
  version,
  contentHash,
  canDecide,
}: {
  token: string;
  version: number;
  contentHash: string;
  canDecide: boolean;
}) {
  const [mode, setMode] = useState<"aprovar" | "recusar" | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [document, setDocument] = useState("");
  const [comment, setComment] = useState("");
  const [accept, setAccept] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<"aprovada" | "recusada" | null>(null);

  useEffect(() => {
    // Visualizada: sent once the page is on screen.
    void fetch(`/api/proposta/${encodeURIComponent(token)}/view/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ version }),
      keepalive: true,
    }).catch(() => {});
  }, [token, version]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!mode) return;
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/proposta/${encodeURIComponent(token)}/decision/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision: mode, name, email, document, comment, version, contentHash, accept }),
    }).catch(() => null);
    setBusy(false);
    const body = (await res?.json().catch(() => null)) as { status?: "aprovada" | "recusada"; error?: string } | null;
    if (!res?.ok || !body?.status) return setError(body?.error ?? "Não foi possível registrar agora. Tente de novo.");
    setDone(body.status);
  }

  const pdf = (
    <a
      href={`/api/proposta/${encodeURIComponent(token)}/pdf/`}
      className="inline-flex items-center rounded-full border border-line bg-white px-4 py-2 text-[14px] font-semibold text-navy hover:border-navy"
    >
      Baixar PDF
    </a>
  );

  if (done) {
    return (
      <section aria-live="polite" className={`rounded-2xl border p-6 text-[15px] ${done === "aprovada" ? "border-wa/40 bg-wa/5" : "border-line bg-card"}`}>
        <p className="font-semibold text-navy">{done === "aprovada" ? "Obrigado! Sua aprovação foi registrada." : "Sua resposta foi registrada."}</p>
        <p className="text-muted mt-1">
          {done === "aprovada"
            ? "A equipe da Legado foi avisada e vai entrar em contato com os próximos passos."
            : "A equipe da Legado foi avisada. Se mudar de ideia, fale com a gente."}
        </p>
        <div className="mt-4">{pdf}</div>
      </section>
    );
  }

  return (
    <section aria-label="Sua resposta" className="rounded-2xl border border-line bg-card p-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-xl text-navy">{canDecide ? "Sua resposta" : "Documento"}</h2>
        {pdf}
      </div>
      {canDecide && !mode && (
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => setMode("aprovar")}
            className="rounded-full bg-navy px-5 py-2.5 text-[15px] font-semibold text-white hover:opacity-90"
          >
            Aprovar proposta
          </button>
          <button
            type="button"
            onClick={() => setMode("recusar")}
            className="rounded-full border border-line px-5 py-2.5 text-[15px] font-semibold text-ink hover:border-navy"
          >
            Recusar
          </button>
        </div>
      )}
      {canDecide && mode && (
        <form onSubmit={submit} className="space-y-3" aria-label={mode === "aprovar" ? "Aprovar proposta" : "Recusar proposta"}>
          <label className="block">
            <span className="text-[13px] text-muted">Nome completo *</span>
            <input value={name} onChange={(e) => setName(e.target.value)} required minLength={3} autoComplete="name" className={`${INPUT} mt-1`} />
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="block">
              <span className="text-[13px] text-muted">E-mail{mode === "aprovar" ? " *" : ""}</span>
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                type="email"
                required={mode === "aprovar"}
                autoComplete="email"
                className={`${INPUT} mt-1`}
              />
            </label>
            <label className="block">
              <span className="text-[13px] text-muted">CPF ou CNPJ (opcional)</span>
              <input value={document} onChange={(e) => setDocument(e.target.value)} inputMode="numeric" className={`${INPUT} mt-1`} />
            </label>
          </div>
          <label className="block">
            <span className="text-[13px] text-muted">{mode === "aprovar" ? "Comentário (opcional)" : "Se puder, conte o motivo (opcional)"}</span>
            <textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={3} className={`${INPUT} mt-1 resize-y`} />
          </label>
          {mode === "aprovar" && (
            <label className="flex items-start gap-2.5 text-[14px]">
              <input type="checkbox" checked={accept} onChange={(e) => setAccept(e.target.checked)} className="mt-1 h-4 w-4 accent-[#1f3a63]" />
              <span>
                Li esta proposta (versão {version}) e aprovo os serviços, valores e condições descritos. Sei que a aprovação será registrada com meu nome,
                e-mail, data e endereço de acesso.
              </span>
            </label>
          )}
          {error && (
            <p role="alert" className="rounded-xl bg-red-50 text-red-800 px-4 py-2.5 text-[14px]">
              {error}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="submit"
              disabled={busy || (mode === "aprovar" && !accept)}
              className={`rounded-full px-5 py-2.5 text-[15px] font-semibold disabled:opacity-50 ${mode === "aprovar" ? "bg-navy text-white" : "bg-ink text-white"}`}
            >
              {busy ? "Registrando..." : mode === "aprovar" ? "Confirmar aprovação" : "Confirmar recusa"}
            </button>
            <button type="button" onClick={() => setMode(null)} className="text-[14px] text-muted hover:text-ink">
              Voltar
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
