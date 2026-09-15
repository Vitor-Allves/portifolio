"use client";

import { useState } from "react";

/** Shows a freshly created/reset password exactly once, with an explicit copy action — once the caller unmounts/closes this (onClose), the password is gone from the page and can never be shown again (the backend never returns it a second time either). */
export default function PasswordRevealBox({
  title,
  hint,
  password,
  onClose,
}: {
  title: string;
  hint: string;
  password: string;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(password);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard permission denied — the password stays visible for manual copy
    }
  }

  return (
    <div className="mt-5 rounded-xl border border-white/10 bg-intel-surface-2 p-4">
      <p className="text-[13px] font-medium text-intel-text">{title}</p>
      <p className="text-xs text-intel-text-dim mt-1 mb-3">{hint}</p>
      <div className="flex items-center gap-2">
        <code className="flex-1 text-sm bg-intel-surface-1 border border-white/10 rounded-lg px-3 py-2 break-all text-intel-text">
          {password}
        </code>
        <button
          type="button"
          onClick={copy}
          className="shrink-0 text-[12px] tracking-[0.08em] uppercase bg-intel-cyan text-[#04121a] font-medium px-3 py-2 rounded-lg hover:brightness-110 transition-[filter] duration-200"
        >
          {copied ? "Copiado" : "Copiar"}
        </button>
      </div>
      <button type="button" onClick={onClose} className="mt-3 text-xs text-intel-text-dim hover:text-intel-text transition-colors duration-200">
        Fechar
      </button>
    </div>
  );
}
