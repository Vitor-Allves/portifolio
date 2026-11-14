"use client";

import { useCallback, useEffect, useState } from "react";
import { formatPhone, stageLabel, type CrmCompanyDetail } from "@/lib/crm-types";
import { CRM_ALERT, CRM_INPUT, CRM_LABEL, CRM_LINK_BTN, STAGE_DOT } from "./crm-styles";
import { OwnerAvatar } from "./CrmOwnerAvatar";
import { Mascot } from "./crm-brand";

type Form = { name: string; segment: string; city: string; website: string; notes: string };

export default function CrmCompanyPanel({
  companyId,
  onClose,
  onOpenContact,
  onChanged,
}: {
  companyId: string;
  onClose: () => void;
  onOpenContact: (id: string) => void;
  onChanged: () => void;
}) {
  const [company, setCompany] = useState<CrmCompanyDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/crm/companies/${companyId}/`);
    if (!res.ok) {
      setLoadError(((await res.json().catch(() => null)) as { error?: string } | null)?.error ?? "Não foi possível abrir a empresa.");
      return;
    }
    setCompany(((await res.json()) as { company: CrmCompanyDetail }).company);
  }, [companyId]);

  useEffect(() => {
    let cancelled = false;
    const run = () => {
      if (!cancelled) void load();
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [load]);

  useEffect(() => {
    function onKey(e: globalThis.KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const fields: Form | null =
    form ??
    (company
      ? { name: company.name, segment: company.segment ?? "", city: company.city ?? "", website: company.website ?? "", notes: company.notes ?? "" }
      : null);

  async function save() {
    if (!form) return;
    const res = await fetch(`/api/crm/companies/${companyId}/`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    if (!res.ok) {
      setError(((await res.json().catch(() => null)) as { error?: string } | null)?.error ?? "Não foi possível salvar.");
      return;
    }
    setError(null);
    setForm(null);
    setSaved(true);
    await load();
    onChanged();
  }

  return (
    <>
      <div className="fixed inset-0 z-30 bg-black/40" onClick={onClose} aria-hidden="true" />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={company ? `Empresa ${company.name}` : "Empresa"}
        className="fixed inset-y-0 right-0 z-40 w-full sm:w-[540px] bg-crm-raised text-crm-text border-l border-crm-line shadow-[var(--crm-shadow-lg)] flex flex-col"
      >
        {!company || !fields ? (
          <div className="p-6 flex-1 flex flex-col">
            <button type="button" onClick={onClose} className="self-start text-[12.5px] text-crm-dim hover:text-crm-text">
              ← Fechar
            </button>
            <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center">
              <Mascot name={loadError ? "titanDoubt" : "titanLoading"} decorative className={`h-36 w-auto ${loadError ? "" : "animate-pulse"}`} />
              <p className={`text-[13px] ${loadError ? "text-crm-red" : "text-crm-dim"}`}>{loadError ?? "Carregando empresa..."}</p>
            </div>
          </div>
        ) : (
          <>
            <header className="px-5 pt-4 pb-3 border-b border-crm-line flex items-start justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <span className="h-10 w-10 shrink-0 rounded-xl bg-crm-navy text-white flex items-center justify-center ring-2 ring-crm-silver/50" aria-hidden="true">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M4 21V5l8-3 8 3v16h-6v-5h-4v5H4Zm4-12h2V7H8v2Zm0 4h2v-2H8v2Zm6-4h2V7h-2v2Zm0 4h2v-2h-2v2Z" />
                  </svg>
                </span>
                <div className="min-w-0">
                  <h2 className="text-[16px] font-semibold truncate">{company.name}</h2>
                  <p className="text-[12px] text-crm-dim">
                    {company.contactCount} contato{company.contactCount === 1 ? "" : "s"} · {company.openCount} no funil
                    {company.wonCount ? ` · ${company.wonCount} ganho${company.wonCount === 1 ? "" : "s"}` : ""}
                  </p>
                </div>
              </div>
              <button type="button" onClick={onClose} aria-label="Fechar painel" className="text-crm-dim hover:text-crm-text text-[20px] leading-none px-1">
                ×
              </button>
            </header>
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-6">
              <section className="space-y-2">
                <h3 className={CRM_LABEL}>Dados da empresa</h3>
                <input value={fields.name} onChange={(e) => (setForm({ ...fields, name: e.target.value }), setSaved(false))} aria-label="Nome da empresa" placeholder="Nome" className={CRM_INPUT} />
                <div className="grid grid-cols-2 gap-2">
                  <input value={fields.segment} onChange={(e) => (setForm({ ...fields, segment: e.target.value }), setSaved(false))} aria-label="Segmento" placeholder="Segmento" className={CRM_INPUT} />
                  <input value={fields.city} onChange={(e) => (setForm({ ...fields, city: e.target.value }), setSaved(false))} aria-label="Cidade" placeholder="Cidade" className={CRM_INPUT} />
                </div>
                <input value={fields.website} onChange={(e) => (setForm({ ...fields, website: e.target.value }), setSaved(false))} aria-label="Site" placeholder="Site" className={CRM_INPUT} />
                <textarea value={fields.notes} onChange={(e) => (setForm({ ...fields, notes: e.target.value }), setSaved(false))} rows={3} aria-label="Observações da empresa" placeholder="Observações" className={CRM_INPUT} />
                {error && <p className={CRM_ALERT}>{error}</p>}
                <div className="flex items-center gap-3">
                  <button type="button" disabled={!form} onClick={() => void save()} className={CRM_LINK_BTN}>
                    Salvar empresa
                  </button>
                  {saved && <span className="text-[12px] text-crm-green">Salvo</span>}
                  {company.website && /^https?:\/\//i.test(company.website) && (
                    <a href={company.website} target="_blank" rel="noreferrer" className="ml-auto text-[12.5px] text-crm-accent underline">
                      Abrir site
                    </a>
                  )}
                </div>
                <p className="text-[11.5px] text-crm-faint">Segmento e cidade valem para todos os contatos desta empresa.</p>
              </section>

              <section className="space-y-2">
                <h3 className={CRM_LABEL}>Contatos</h3>
                {company.contacts.length === 0 ? (
                  <p className="text-[12.5px] text-crm-dim">Nenhum contato ativo nesta empresa.</p>
                ) : (
                  <ul className="divide-y divide-crm-line rounded-xl border border-crm-line">
                    {company.contacts.map((c) => (
                      <li key={c.id}>
                        <button type="button" onClick={() => onOpenContact(c.id)} className="w-full text-left flex items-center gap-3 px-3 py-2.5 hover:bg-crm-hover">
                          <OwnerAvatar name={c.ownerName} />
                          <span className="min-w-0 flex-1">
                            <span className="block text-[13px] font-semibold truncate">
                              {c.name}
                              {c.jobTitle ? <span className="font-normal text-crm-dim"> · {c.jobTitle}</span> : null}
                            </span>
                            <span className="block text-[11.5px] text-crm-faint truncate">{c.phone ? formatPhone(c.phone) : c.email}</span>
                          </span>
                          <span className="inline-flex items-center gap-1.5 text-[11.5px] text-crm-dim whitespace-nowrap">
                            <span className={`h-2 w-2 rounded-full ${STAGE_DOT[c.stage]}`} aria-hidden="true" />
                            {stageLabel(c.stage)}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          </>
        )}
      </aside>
    </>
  );
}
