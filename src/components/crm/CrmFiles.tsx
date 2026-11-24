"use client";

// Documentos e anexos of a contact, a company or an active client: the list
// (download), attach (up to 4 MB: PDF, Office, images, text) and archive.

import { useEffect, useRef, useState } from "react";
import { CRM_ALERT, CRM_LABEL, CRM_LINK_BTN } from "./crm-styles";
import { dateTime } from "./crm-format";

type CrmFileRow = { id: string; name: string; mime: string; sizeBytes: number; uploadedByName: string | null; createdAt: string; archivedAt: string | null };

const ACCEPT = ".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv";
const size = (b: number) => (b >= 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1).replace(".", ",")} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

export default function CrmFiles({
  target,
  canEdit,
  title = "Documentos e anexos",
}: {
  /** Exactly one of them. */
  target: { contactId?: string; companyId?: string; clientId?: string };
  canEdit: boolean;
  title?: string;
}) {
  const query = new URLSearchParams(Object.entries(target).filter(([, v]) => v) as [string, string][]).toString();
  const [files, setFiles] = useState<CrmFileRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const [version, setVersion] = useState(0);
  const load = () => setVersion((v) => v + 1);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/crm/files/?${query}`)
      .then(async (res) => {
        const body = (await res.json().catch(() => null)) as { files?: CrmFileRow[]; error?: string } | null;
        if (cancelled) return;
        setFiles(body?.files ?? []);
        if (!res.ok) setError(body?.error ?? "Não foi possível carregar os documentos.");
      })
      .catch(() => !cancelled && setError("Não foi possível falar com o CRM agora."));
    return () => {
      cancelled = true;
    };
  }, [query, version]);

  async function upload(file: File) {
    if (file.size > 4 * 1024 * 1024) return setError("Arquivo grande demais: o limite é 4 MB.");
    setBusy(true);
    setError(null);
    const form = new FormData();
    for (const [k, v] of Object.entries(target)) if (v) form.set(k, v);
    form.set("file", file);
    const res = await fetch("/api/crm/files/", { method: "POST", body: form });
    setBusy(false);
    if (!res.ok) return setError(((await res.json().catch(() => null)) as { error?: string } | null)?.error ?? "Não foi possível anexar.");
    setError(null);
    load();
  }

  return (
    <section aria-label={title} className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className={CRM_LABEL}>{title}</h3>
        {canEdit && (
          <>
            <button type="button" disabled={busy} onClick={() => input.current?.click()} className={CRM_LINK_BTN}>
              {busy ? "Enviando..." : "+ Anexar"}
            </button>
            <input
              ref={input}
              type="file"
              accept={ACCEPT}
              aria-label={`Anexar arquivo — ${title}`}
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) void upload(f);
              }}
            />
          </>
        )}
      </div>
      {error && <p className={CRM_ALERT}>{error}</p>}
      {files === null ? (
        <p className="text-[12px] text-crm-faint">Carregando...</p>
      ) : files.length === 0 ? (
        <p className="text-[12.5px] text-crm-dim">Nenhum documento ainda.{canEdit ? " PDF, Word, Excel, PowerPoint, imagens ou texto, até 4 MB." : ""}</p>
      ) : (
        <ul className="divide-y divide-crm-line rounded-xl border border-crm-line bg-crm-card" aria-label={`Arquivos — ${title}`}>
          {files.map((f) => (
            <li key={f.id} className="flex items-center gap-2 px-3 py-2">
              <span
                aria-hidden="true"
                className="shrink-0 text-[10px] font-bold uppercase rounded bg-crm-sunken border border-crm-line px-1.5 py-0.5 text-crm-dim"
              >
                {f.name.split(".").pop()?.slice(0, 4)}
              </span>
              <span className="min-w-0 flex-1">
                <a href={`/api/crm/files/${f.id}/`} download className="block text-[13px] font-medium text-crm-text hover:text-crm-accent truncate">
                  {f.name}
                </a>
                <span className="block text-[11px] text-crm-faint">
                  {size(f.sizeBytes)} · {f.uploadedByName ?? "—"} · {dateTime(f.createdAt)}
                </span>
              </span>
              {canEdit && (
                <button
                  type="button"
                  aria-label={`Arquivar ${f.name}`}
                  className="text-[11.5px] text-crm-dim hover:text-crm-red"
                  onClick={async () => {
                    const res = await fetch(`/api/crm/files/${f.id}/`, { method: "DELETE" });
                    if (!res.ok) return setError(((await res.json().catch(() => null)) as { error?: string } | null)?.error ?? "Não foi possível arquivar.");
                    load();
                  }}
                >
                  Arquivar
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
