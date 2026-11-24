"use client";

import { useEffect, useMemo, useState, type ChangeEvent, type DragEvent } from "react";
import {
  CRM_CONSENT,
  CRM_IMPORT_FIELDS,
  CRM_IMPORT_MAX_ROWS,
  type CrmImportField,
  type CrmImportPreview,
  type CrmImportRow,
  type CrmImportSummary,
  type CrmTeamMember,
} from "@/lib/crm-types";
import { CRM_ALERT, CRM_BTN_OUTLINE, CRM_BTN_PRIMARY, CRM_INPUT, CRM_LABEL, CRM_TD, CRM_TH } from "./crm-styles";
import { guessMapping, lineNumbers, readSheet, type Sheet } from "./crm-sheet";
import { dateTime } from "./crm-format";
import { Mascot } from "./crm-brand";
import { useCatalog } from "./crm-catalog-context";

type Step = "file" | "map" | "preview" | "done";

async function errorFrom(res: Response, fallback: string): Promise<string> {
  const body = (await res.json().catch(() => null)) as { error?: string } | null;
  return body?.error ?? fallback;
}

const STATUS_TONE = {
  novo: "text-crm-green",
  duplicado: "text-crm-amber",
  erro: "text-crm-red",
} as const;

function Tile({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="rounded-xl border border-crm-line bg-crm-sunken px-3.5 py-2.5">
      <p className={CRM_LABEL}>{label}</p>
      <p className={`mt-0.5 text-[22px] leading-none font-semibold tabular-nums ${tone}`}>{value}</p>
    </div>
  );
}

function ImportHistory({ refreshKey, onUndone }: { refreshKey: number; onUndone: () => void }) {
  const [imports, setImports] = useState<CrmImportSummary[] | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/crm/import/")
      .then((res) => (res.ok ? res.json() : { imports: [] }))
      .then((body: { imports: CrmImportSummary[] }) => !cancelled && setImports(body.imports))
      .catch(() => !cancelled && setImports([]));
    return () => {
      cancelled = true;
    };
  }, [refreshKey, reload]);

  async function undo(imp: CrmImportSummary) {
    if (!window.confirm(`Desfazer a importação "${imp.fileName}"? Os contatos que ninguém mexeu desde então serão removidos.`)) return;
    setBusy(imp.id);
    const res = await fetch(`/api/crm/import/${imp.id}/undo/`, { method: "POST" });
    setBusy(null);
    if (!res.ok) return setMessage(await errorFrom(res, "Não foi possível desfazer."));
    const r = (await res.json()) as { removed: number; kept: number };
    setMessage(`${r.removed} contato(s) removido(s)${r.kept ? `; ${r.kept} mantido(s) porque já tinham sido trabalhados` : ""}.`);
    setReload((n) => n + 1);
    onUndone();
  }

  if (!imports || imports.length === 0) return null;
  return (
    <section className="space-y-2">
      <h3 className={CRM_LABEL}>Importações recentes</h3>
      {message && <p className="text-[12px] text-crm-dim">{message}</p>}
      <ul className="divide-y divide-crm-line rounded-xl border border-crm-line">
        {imports.slice(0, 6).map((imp) => (
          <li key={imp.id} className="flex items-center gap-3 px-3 py-2 text-[12.5px]">
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium text-crm-text">{imp.fileName}</p>
              <p className="text-[11.5px] text-crm-faint">
                {dateTime(imp.createdAt)} · {imp.createdByName} · {imp.createdCount} novo(s), {imp.skippedCount} duplicado(s), {imp.errorCount} com erro
              </p>
            </div>
            {imp.undoneAt ? (
              <span className="text-[11.5px] text-crm-faint">Desfeita</span>
            ) : imp.createdCount > 0 ? (
              <button type="button" disabled={busy === imp.id} onClick={() => void undo(imp)} className={CRM_BTN_OUTLINE}>
                {busy === imp.id ? "Desfazendo..." : "Desfazer"}
              </button>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

function DialogBody({
  team,
  currentUserId,
  onClose,
  onImported,
}: {
  team: CrmTeamMember[];
  currentUserId: string;
  onClose: () => void;
  onImported: () => void;
}) {
  const { options } = useCatalog();
  const [step, setStep] = useState<Step>("file");
  const [fileName, setFileName] = useState("");
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [mapping, setMapping] = useState<(CrmImportField | null)[]>([]);
  const [defaultSource, setDefaultSource] = useState("outro");
  const [ownerId, setOwnerId] = useState(team.some((m) => m.id === currentUserId) ? currentUserId : "");
  const [consentStatus, setConsentStatus] = useState("nao_informado");
  const [consentSource, setConsentSource] = useState("");
  const [createDeals, setCreateDeals] = useState(true);
  const [preview, setPreview] = useState<CrmImportPreview | null>(null);
  const [done, setDone] = useState<(CrmImportPreview & { importId: string }) | null>(null);
  const [undoResult, setUndoResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [historyKey, setHistoryKey] = useState(0);

  useEffect(() => {
    function onKey(e: globalThis.KeyboardEvent) {
      if (e.key === "Escape" && !busy) onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, busy]);

  async function openFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    try {
      const parsed = await readSheet(file);
      if (parsed.rows.length > CRM_IMPORT_MAX_ROWS) {
        throw new Error(`A planilha tem ${parsed.rows.length} linhas; o limite por importação é ${CRM_IMPORT_MAX_ROWS}. Divida em partes.`);
      }
      setFileName(file.name);
      setSheet(parsed);
      setMapping(guessMapping(parsed.headers));
      setStep("map");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível ler o arquivo.");
    }
  }

  const rows: CrmImportRow[] = useMemo(() => {
    if (!sheet) return [];
    const lines = lineNumbers(sheet);
    return sheet.rows.map((cells, i) => {
      const row: CrmImportRow = { line: lines[i] };
      mapping.forEach((field, col) => {
        if (field && cells[col]?.trim()) row[field] = cells[col].trim();
      });
      return row;
    });
  }, [sheet, mapping]);

  const mapped = new Set(mapping.filter(Boolean));
  const mappingProblem = !mapped.has("name")
    ? "Indique qual coluna tem o nome."
    : !mapped.has("phone") && !mapped.has("email")
      ? "Indique a coluna de WhatsApp ou de e-mail."
      : null;
  const defaults = { source: defaultSource, ownerId: ownerId || null, consentStatus, consentSource, createDeals };

  async function runPreview() {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/crm/import/preview/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rows, defaults }),
    });
    setBusy(false);
    if (!res.ok) return setError(await errorFrom(res, "Não foi possível conferir a planilha."));
    setPreview((await res.json()) as CrmImportPreview);
    setStep("preview");
  }

  async function runImport() {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/crm/import/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fileName, rows, defaults }),
    });
    setBusy(false);
    if (!res.ok) return setError(await errorFrom(res, "Não foi possível importar."));
    setDone((await res.json()) as CrmImportPreview & { importId: string });
    setStep("done");
    setHistoryKey((n) => n + 1);
    onImported();
  }

  async function undoNow() {
    if (!done) return;
    setBusy(true);
    const res = await fetch(`/api/crm/import/${done.importId}/undo/`, { method: "POST" });
    setBusy(false);
    if (!res.ok) return setError(await errorFrom(res, "Não foi possível desfazer."));
    const r = (await res.json()) as { removed: number; kept: number };
    setUndoResult(`Importação desfeita: ${r.removed} contato(s) removido(s).`);
    setHistoryKey((n) => n + 1);
    onImported();
  }

  const issues = preview?.results.filter((r) => r.status !== "novo") ?? [];

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 px-3 sm:px-4 py-6 sm:py-10 overflow-y-auto" onClick={() => !busy && onClose()}>
      <div
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="crm-import-title"
        className="w-full max-w-3xl rounded-2xl border border-crm-line bg-crm-raised text-crm-text p-5 sm:p-6 shadow-[var(--crm-shadow-lg)] space-y-5"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <Mascot name="titanWelcome" decorative className="h-14 w-auto -my-1 shrink-0" />
            <div>
              <h2 id="crm-import-title" className="crm-display text-[18px]">
                Importar planilha
              </h2>
              <p className="text-[12px] text-crm-dim mt-0.5">
                {step === "file" && "Arquivo .xlsx ou .csv, com uma linha de títulos."}
                {step === "map" && `${fileName} · ${sheet?.rows.length ?? 0} linha(s). Confira o que é cada coluna.`}
                {step === "preview" && "Prévia: nada foi gravado ainda."}
                {step === "done" && "Importação concluída."}
              </p>
            </div>
          </div>
          <button type="button" onClick={() => !busy && onClose()} aria-label="Fechar" className="text-crm-dim hover:text-crm-text text-[20px] leading-none px-1">
            ×
          </button>
        </div>

        {error && (
          <p className={CRM_ALERT} role="alert">
            {error}
          </p>
        )}

        {step === "file" && (
          <>
            <label
              onDragOver={(e: DragEvent) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e: DragEvent) => {
                e.preventDefault();
                setDragging(false);
                void openFile(e.dataTransfer.files[0]);
              }}
              className={`flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-6 py-10 text-center cursor-pointer transition-colors ${
                dragging ? "border-crm-accent bg-crm-accent/[0.06]" : "border-crm-line-strong hover:border-crm-accent"
              }`}
            >
              <span className="text-[14px] font-semibold">Arraste a planilha aqui ou clique para escolher</span>
              <span className="text-[12px] text-crm-dim">
                Até {CRM_IMPORT_MAX_ROWS.toLocaleString("pt-BR")} contatos por vez · .xlsx ou .csv (Excel, Google Planilhas)
              </span>
              <input
                type="file"
                accept=".xlsx,.csv,.txt,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                aria-label="Escolher planilha"
                className="sr-only"
                onChange={(e: ChangeEvent<HTMLInputElement>) => void openFile(e.target.files?.[0])}
              />
            </label>
            <p className="text-[12px] text-crm-dim leading-relaxed">
              Ninguém é duplicado: quem já está no CRM (mesmo WhatsApp, com ou sem o 9, ou mesmo e-mail) é pulado, e você vê a lista antes
              de confirmar. Toda importação pode ser desfeita depois.
            </p>
            <ImportHistory refreshKey={historyKey} onUndone={onImported} />
          </>
        )}

        {step === "map" && sheet && (
          <>
            <div className="overflow-x-auto rounded-xl border border-crm-line">
              <table className="w-full text-[12.5px]">
                <thead className="bg-crm-sunken">
                  <tr>
                    <th className={CRM_TH}>Coluna da planilha</th>
                    <th className={CRM_TH}>Exemplos</th>
                    <th className={CRM_TH}>Vai para</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-crm-line">
                  {sheet.headers.map((h, col) => {
                    const samples = sheet.rows.map((r) => r[col]).filter((v) => v?.trim()).slice(0, 2);
                    return (
                      <tr key={col}>
                        <td className={`${CRM_TD} font-medium`}>{h}</td>
                        <td className={`${CRM_TD} text-crm-dim max-w-[220px]`}>
                          <span className="block truncate">{samples.join(" · ") || "—"}</span>
                        </td>
                        <td className={CRM_TD}>
                          <select
                            value={mapping[col] ?? ""}
                            aria-label={`Campo para a coluna ${h}`}
                            onChange={(e) => {
                              const value = (e.target.value || null) as CrmImportField | null;
                              setMapping((m) => m.map((f, i) => (i === col ? value : f === value ? null : f)));
                            }}
                            className={`${CRM_INPUT} !py-1.5 min-w-[190px]`}
                          >
                            <option value="">Ignorar</option>
                            {CRM_IMPORT_FIELDS.map((f) => (
                              <option key={f.id} value={f.id}>
                                {f.label}
                              </option>
                            ))}
                          </select>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <section className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="block">
                <span className={CRM_LABEL}>Origem (quando a planilha não diz)</span>
                <select value={defaultSource} onChange={(e) => setDefaultSource(e.target.value)} className={`${CRM_INPUT} mt-1`}>
                  {options("source").map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className={CRM_LABEL}>Responsável pelos novos contatos</span>
                <select value={ownerId} onChange={(e) => setOwnerId(e.target.value)} className={`${CRM_INPUT} mt-1`}>
                  <option value="">Sem responsável</option>
                  {team.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className={CRM_LABEL}>Consentimento (quando a planilha não diz)</span>
                <select value={consentStatus} onChange={(e) => setConsentStatus(e.target.value)} className={`${CRM_INPUT} mt-1`}>
                  {CRM_CONSENT.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </label>
              {consentStatus === "sim" && (
                <label className="block">
                  <span className={CRM_LABEL}>Como aceitaram</span>
                  <input
                    value={consentSource}
                    onChange={(e) => setConsentSource(e.target.value)}
                    placeholder="Ex.: inscritos no evento X"
                    className={`${CRM_INPUT} mt-1`}
                  />
                </label>
              )}
              <label className="sm:col-span-2 flex items-center gap-2.5 text-[13px] cursor-pointer">
                <input
                  type="checkbox"
                  checked={createDeals}
                  onChange={(e) => setCreateDeals(e.target.checked)}
                  className="h-4 w-4 accent-[var(--crm-accent)]"
                />
                Criar uma oportunidade no funil (coluna Novo lead) para cada contato novo
              </label>
            </section>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <button type="button" onClick={() => setStep("file")} className="text-[12.5px] text-crm-dim hover:text-crm-text">
                ← Outro arquivo
              </button>
              <div className="flex items-center gap-3">
                {mappingProblem && <span className="text-[12px] text-crm-amber">{mappingProblem}</span>}
                <button type="button" disabled={!!mappingProblem || busy} onClick={() => void runPreview()} className={CRM_BTN_PRIMARY}>
                  {busy ? "Conferindo..." : "Ver prévia"}
                </button>
              </div>
            </div>
          </>
        )}

        {step === "preview" && preview && (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <Tile label="Novos" value={preview.counts.novo} tone="text-crm-green" />
              <Tile label="Duplicados" value={preview.counts.duplicado} tone="text-crm-amber" />
              <Tile label="Com erro" value={preview.counts.erro} tone="text-crm-red" />
              <Tile label="Empresas novas" value={preview.newCompanies} tone="text-crm-accent" />
            </div>
            {preview.newSegments.length > 0 && (
              <p className="text-[12.5px] text-crm-dim">
                Segmentos novos que entram na lista da Personalização: <strong className="text-crm-text">{preview.newSegments.join(", ")}</strong>.
              </p>
            )}
            {preview.unknownTags.length > 0 && (
              <p className="text-[12.5px] text-crm-amber">
                Etiquetas que não existem e serão ignoradas: <strong>{preview.unknownTags.slice(0, 20).join(", ")}</strong>
                {preview.unknownTags.length > 20 ? "…" : ""}. Para usar, o Administrador cria em Personalização antes de importar.
              </p>
            )}
            {issues.length > 0 ? (
              <div className="space-y-2">
                <p className="text-[12.5px] text-crm-dim">Estas linhas não entram (o resto entra normalmente):</p>
                <div className="max-h-72 overflow-y-auto rounded-xl border border-crm-line">
                  <table className="w-full text-[12.5px]">
                    <thead className="bg-crm-sunken sticky top-0">
                      <tr>
                        <th className={CRM_TH}>Linha</th>
                        <th className={CRM_TH}>Nome</th>
                        <th className={CRM_TH}>Motivo</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-crm-line">
                      {issues.slice(0, 300).map((r) => (
                        <tr key={r.line}>
                          <td className={`${CRM_TD} tabular-nums text-crm-faint`}>{r.line}</td>
                          <td className={CRM_TD}>{r.name ?? "—"}</td>
                          <td className={`${CRM_TD} ${STATUS_TONE[r.status]}`}>{r.message}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {issues.length > 300 && <p className="text-[11.5px] text-crm-faint">Mostrando 300 de {issues.length}.</p>}
              </div>
            ) : (
              <p className="text-[12.5px] text-crm-green font-medium">Todas as linhas estão prontas para entrar.</p>
            )}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <button type="button" onClick={() => setStep("map")} className="text-[12.5px] text-crm-dim hover:text-crm-text">
                ← Ajustar colunas
              </button>
              <button type="button" disabled={busy || preview.counts.novo === 0} onClick={() => void runImport()} className={CRM_BTN_PRIMARY}>
                {busy ? "Importando..." : `Importar ${preview.counts.novo} contato${preview.counts.novo === 1 ? "" : "s"}`}
              </button>
            </div>
          </>
        )}

        {step === "done" && done && (
          <div className="flex items-end gap-4">
            <Mascot name="legacyWin" decorative className="h-28 w-auto shrink-0" />
            <div className="space-y-3 pb-2 min-w-0">
              <p className="crm-display text-[18px] text-crm-text">
                {done.counts.novo} contato{done.counts.novo === 1 ? "" : "s"} importado{done.counts.novo === 1 ? "" : "s"}
              </p>
              <p className="text-[12.5px] text-crm-dim">
                {done.counts.duplicado} já estavam no CRM ou repetidos e {done.counts.erro} tinham erro — esses ficaram de fora. Os novos estão
                na coluna Novo lead do funil e na aba Contatos.
              </p>
              {undoResult ? (
                <p className="text-[12.5px] text-crm-dim">{undoResult}</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={onClose} className={CRM_BTN_PRIMARY}>
                    Ver contatos
                  </button>
                  <button type="button" disabled={busy} onClick={() => void undoNow()} className={CRM_BTN_OUTLINE}>
                    {busy ? "Desfazendo..." : "Desfazer esta importação"}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function CrmImportDialog({
  open,
  ...rest
}: {
  open: boolean;
  team: CrmTeamMember[];
  currentUserId: string;
  onClose: () => void;
  onImported: () => void;
}) {
  if (!open) return null;
  return <DialogBody {...rest} />;
}
