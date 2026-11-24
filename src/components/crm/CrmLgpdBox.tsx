"use client";

// LGPD (evolução v1.0, item 13), in the contact's details, for an
// Administrador: download everything the CRM keeps about the titular, and
// anonymize their personal data at their request (irreversible; reason and
// the Administrador's password).

import { useState, type FormEvent } from "react";
import { CRM_BTN_OUTLINE, CRM_INPUT, CRM_LABEL, CRM_LINK_BTN } from "./crm-styles";
import { dateTime } from "./crm-format";

export default function CrmLgpdBox({ contactId, anonymizedAt, onAnonymized }: { contactId: string; anonymizedAt: string | null; onAnonymized: () => void }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    const res = await fetch(`/api/crm/contacts/${contactId}/lgpd/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "anonymize", reason, password }),
    });
    setBusy(false);
    if (!res.ok) {
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      setError(data?.error ?? "Não foi possível anonimizar.");
      return;
    }
    setError(null);
    setOpen(false);
    setPassword("");
    onAnonymized();
  }

  return (
    <section aria-label="LGPD" className="space-y-2">
      <h3 className={CRM_LABEL}>LGPD (dados do titular)</h3>
      {anonymizedAt ? (
        <p className="text-[12.5px] text-crm-dim">
          Dados pessoais anonimizados em {dateTime(anonymizedAt)}, a pedido do titular. O histórico comercial (datas, etapas, valores) foi mantido.
        </p>
      ) : (
        <p className="text-[12px] text-crm-dim">Atenda os pedidos do titular: baixe tudo o que o CRM guarda sobre ele ou apague os dados pessoais.</p>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <a href={`/api/crm/contacts/${contactId}/lgpd/`} download className={CRM_LINK_BTN}>
          Baixar dados do titular
        </a>
        {!anonymizedAt && !open && (
          <button type="button" onClick={() => setOpen(true)} className={`${CRM_BTN_OUTLINE} hover:!text-crm-red hover:!border-crm-red/40`}>
            Anonimizar…
          </button>
        )}
      </div>
      {open && (
        <form onSubmit={submit} aria-label="Anonimizar titular" className="space-y-2 rounded-xl border border-crm-red/40 p-3">
          <p className="text-[12.5px] text-crm-red">
            Não dá para desfazer: nome, telefone, e-mail, textos das mensagens, notas, documentos e diagnósticos deste contato são apagados; ele é arquivado e
            descadastrado. Ficam datas, etapas e valores (os números do CRM continuam batendo) e o aceite de proposta, se houver (comprova o contrato).
          </p>
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Motivo (ex.: pedido do titular por e-mail em 24/11)"
            aria-label="Motivo da anonimização"
            className={CRM_INPUT}
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Sua senha"
            aria-label="Sua senha para confirmar"
            autoComplete="current-password"
            className={CRM_INPUT}
          />
          {error && <p className="text-[12px] text-crm-red">{error}</p>}
          <div className="flex items-center gap-3">
            <button type="submit" disabled={busy || reason.trim().length < 5 || !password} className={`${CRM_BTN_OUTLINE} !text-crm-red !border-crm-red/50`}>
              {busy ? "Anonimizando..." : "Anonimizar de vez"}
            </button>
            <button type="button" onClick={() => setOpen(false)} className="text-[12px] text-crm-dim hover:text-crm-text">
              Cancelar
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
