"use client";

import { useEffect, useState, type FormEvent } from "react";
import { CRM_SOURCES, type CrmSource, type CrmTeamMember } from "@/lib/crm-types";
import { CRM_ALERT, CRM_BTN_PRIMARY, CRM_INPUT, CRM_LABEL } from "./crm-styles";
import { Mascot } from "./crm-brand";

type CrmNewContactDialogProps = {
  open: boolean;
  team: CrmTeamMember[];
  currentUserId: string;
  onClose: () => void;
  onCreated: (id: string) => void;
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className={CRM_LABEL}>{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

// Mounted only while open, so every opening starts from a clean form.
function DialogBody({ team, currentUserId, onClose, onCreated }: Omit<CrmNewContactDialogProps, "open">) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [company, setCompany] = useState("");
  const [source, setSource] = useState<CrmSource>("indicacao");
  const [referredBy, setReferredBy] = useState("");
  const [consentSource, setConsentSource] = useState("");
  const [ownerId, setOwnerId] = useState(team.some((m) => m.id === currentUserId) ? currentUserId : "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function onKey(e: globalThis.KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const res = await fetch("/api/crm/contacts/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, phone, company, source, referredBy, consentSource, ownerId: ownerId || null }),
    });
    setSaving(false);
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      setError(body?.error ?? "Não foi possível criar o contato.");
      return;
    }
    const { id } = (await res.json()) as { id: string };
    onCreated(id);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center bg-black/50 px-4 py-10 overflow-y-auto" onClick={onClose}>
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="crm-new-contact-title"
        className="w-full max-w-lg rounded-2xl border border-crm-line bg-crm-raised text-crm-text p-6 shadow-[var(--crm-shadow-lg)] space-y-4"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <Mascot name="titanWelcome" decorative className="h-16 w-auto -my-1 shrink-0" />
            <div>
              <h2 id="crm-new-contact-title" className="crm-display text-[18px] text-crm-text">
                Novo contato
              </h2>
              <p className="text-[12px] text-crm-dim mt-0.5">Quem chega pelo WhatsApp entra sozinho; aqui é para prospecção ativa.</p>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Fechar" className="text-crm-dim hover:text-crm-text text-[20px] leading-none px-1">
            ×
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Nome *">
            <input value={name} onChange={(e) => setName(e.target.value)} required autoFocus placeholder="Ex.: Ana Ribeiro" className={CRM_INPUT} />
          </Field>
          <Field label="WhatsApp *">
            <input value={phone} onChange={(e) => setPhone(e.target.value)} required inputMode="tel" placeholder="(15) 99999-8888" className={CRM_INPUT} />
          </Field>
          <Field label="Empresa">
            <input value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Ex.: Clínica Ribeiro" className={CRM_INPUT} />
          </Field>
          <Field label="Origem">
            <select value={source} onChange={(e) => setSource(e.target.value as CrmSource)} className={`${CRM_INPUT}`}>
              {CRM_SOURCES.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Indicado por">
            <input value={referredBy} onChange={(e) => setReferredBy(e.target.value)} placeholder="Ex.: Carlos (BNI)" className={CRM_INPUT} />
          </Field>
          <Field label="Responsável">
            <select value={ownerId} onChange={(e) => setOwnerId(e.target.value)} className={`${CRM_INPUT}`}>
              <option value="">Sem responsável</option>
              {team.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <Field label="Como aceitou ser contatado">
          <input
            value={consentSource}
            onChange={(e) => setConsentSource(e.target.value)}
            placeholder="Ex.: pediu contato no evento, formulário do site"
            className={CRM_INPUT}
          />
        </Field>
        <p className="text-[11.5px] text-crm-dim leading-relaxed">
          O WhatsApp só permite iniciar conversa com quem aceitou ser contatado, e a primeira mensagem precisa ser um modelo aprovado.
        </p>

        {error && (
          <p className={CRM_ALERT} role="alert">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="text-[12.5px] px-4 py-2 rounded-full text-crm-dim hover:text-crm-text">
            Cancelar
          </button>
          <button
            type="submit"
            disabled={saving}
            className={`${CRM_BTN_PRIMARY} !px-5`}
          >
            {saving ? "Salvando..." : "Criar contato"}
          </button>
        </div>
      </form>
    </div>
  );
}

export default function CrmNewContactDialog({ open, ...rest }: CrmNewContactDialogProps) {
  if (!open) return null;
  return <DialogBody {...rest} />;
}
