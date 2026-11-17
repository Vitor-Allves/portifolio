"use client";

import { useEffect, useState } from "react";
import { CRM_ACCESS_OPTIONS, type CrmAccess } from "@/lib/crm-permissions";
import { STAFF_ROLE_LABELS, type StaffRole } from "@/lib/session-scope";
import { CRM_ALERT, CRM_FILTER, CRM_TD, CRM_TH } from "./crm-styles";
import { initials } from "./crm-format";

type Member = { id: string; name: string; username: string; staffRole: StaffRole; access: CrmAccess; locked: boolean };

const ACCESS_TONE: Record<CrmAccess, string> = {
  administrador: "bg-crm-accent/10 text-crm-accent border-crm-accent/25",
  gestor: "bg-crm-violet/10 text-crm-violet border-crm-violet/25",
  comercial: "bg-crm-green/10 text-crm-green border-crm-green/25",
  marketing: "bg-crm-amber/10 text-crm-amber border-crm-amber/25",
  sem_acesso: "bg-crm-sunken text-crm-dim border-crm-line",
};

/** Administrador only: each person's CRM profile. Logins and passwords stay in the Intelligence. */
export default function CrmTeamView({ currentUserId, onChanged }: { currentUserId: string; onChanged: () => void }) {
  const [team, setTeam] = useState<Member[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/crm/team/")
      .then(async (res) => {
        const data = (await res.json().catch(() => null)) as { team?: Member[]; error?: string } | null;
        if (cancelled) return;
        if (!res.ok || !data?.team) setError(data?.error ?? "Não foi possível carregar a equipe.");
        else setTeam(data.team);
      })
      .catch(() => !cancelled && setError("Não foi possível carregar a equipe."));
    return () => {
      cancelled = true;
    };
  }, [version]);

  async function change(m: Member, access: CrmAccess) {
    setBusy(m.id);
    setSaved(null);
    const res = await fetch(`/api/crm/team/${m.id}/`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ access }),
    });
    setBusy(null);
    if (!res.ok) {
      setError(((await res.json().catch(() => null)) as { error?: string } | null)?.error ?? "Não foi possível salvar.");
      return;
    }
    setError(null);
    setSaved(`${m.name}: agora ${CRM_ACCESS_OPTIONS.find((o) => o.id === access)?.label ?? access}.`);
    setVersion((v) => v + 1);
    onChanged();
  }

  return (
    <section aria-label="Equipe" className="space-y-4 max-w-5xl">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
        {CRM_ACCESS_OPTIONS.filter((o) => o.id !== "sem_acesso").map((o) => (
          <div key={o.id} className="rounded-xl border border-crm-line bg-crm-card px-3.5 py-3 shadow-[var(--crm-shadow)]">
            <span className={`inline-block rounded-full border px-2 py-0.5 text-[11px] font-semibold ${ACCESS_TONE[o.id]}`}>{o.label}</span>
            <p className="mt-1.5 text-[12px] text-crm-dim leading-snug">{o.description}</p>
          </div>
        ))}
      </div>

      {error && (
        <p className={CRM_ALERT} role="alert">
          {error}
        </p>
      )}
      {saved && (
        <p className="rounded-lg border border-crm-green/30 bg-crm-green/[0.07] px-3 py-2 text-[12px] text-crm-green" role="status">
          {saved} A mudança vale na próxima ação dessa pessoa e ficou registrada na auditoria.
        </p>
      )}

      <div className="rounded-2xl border border-crm-line bg-crm-card shadow-[var(--crm-shadow)] overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead className="border-b border-crm-line">
            <tr>
              <th className={CRM_TH}>Pessoa</th>
              <th className={CRM_TH}>Perfil no Intelligence</th>
              <th className={CRM_TH}>Perfil no CRM</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-crm-line">
            {!team ? (
              <tr>
                <td colSpan={3} className={`${CRM_TD} text-crm-dim`}>
                  {error ? "—" : "Carregando equipe..."}
                </td>
              </tr>
            ) : (
              team.map((m) => {
                const self = m.id === currentUserId;
                return (
                  <tr key={m.id}>
                    <td className={CRM_TD}>
                      <span className="flex items-center gap-2.5">
                        <span className="h-8 w-8 shrink-0 rounded-full bg-crm-navy text-white text-[11px] font-semibold flex items-center justify-center">{initials(m.name)}</span>
                        <span className="min-w-0">
                          <span className="block font-semibold truncate">
                            {m.name}
                            {self && <span className="font-normal text-crm-dim"> (você)</span>}
                          </span>
                          <span className="block text-[11.5px] text-crm-dim">{m.username}</span>
                        </span>
                      </span>
                    </td>
                    <td className={`${CRM_TD} text-crm-dim whitespace-nowrap`}>{STAFF_ROLE_LABELS[m.staffRole]}</td>
                    <td className={CRM_TD}>
                      {m.locked || self ? (
                        <span className="flex flex-wrap items-center gap-2">
                          <span className={`inline-block rounded-full border px-2 py-0.5 text-[11px] font-semibold ${ACCESS_TONE[m.access]}`}>
                            {CRM_ACCESS_OPTIONS.find((o) => o.id === m.access)?.label}
                          </span>
                          <span className="text-[11.5px] text-crm-faint">
                            {m.locked ? "Administrador geral é sempre Administrador." : "Seu próprio perfil não muda por aqui."}
                          </span>
                        </span>
                      ) : (
                        <select
                          value={m.access}
                          disabled={busy === m.id}
                          onChange={(e) => void change(m, e.target.value as CrmAccess)}
                          aria-label={`Perfil no CRM de ${m.name}`}
                          className={CRM_FILTER}
                        >
                          {CRM_ACCESS_OPTIONS.map((o) => (
                            <option key={o.id} value={o.id}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      <p className="text-[11.5px] text-crm-faint">
        Para criar um login, trocar senha ou desativar alguém, use o Intelligence (Acessos). Quem foi desativado lá sai daqui também.
      </p>
    </section>
  );
}
