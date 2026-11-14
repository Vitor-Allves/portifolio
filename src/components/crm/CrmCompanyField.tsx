"use client";

import { useEffect, useId, useState } from "react";
import { CRM_INPUT } from "./crm-styles";

/**
 * Free-text company name with suggestions from the companies already in the
 * CRM. Typing a name that already exists (any accent/case) links to that
 * company on save — the server does the matching, this only helps the user
 * pick the same spelling.
 */
export default function CrmCompanyField({
  value,
  onChange,
  id,
  placeholder = "Ex.: Clínica Ribeiro",
  ariaLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  id?: string;
  placeholder?: string;
  ariaLabel?: string;
}) {
  const listId = useId();
  const [options, setOptions] = useState<string[]>([]);

  useEffect(() => {
    const q = value.trim();
    if (q.length < 2) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      fetch(`/api/crm/companies/suggest/?q=${encodeURIComponent(q)}`, { signal: controller.signal })
        .then((res) => (res.ok ? res.json() : { companies: [] }))
        .then((body: { companies: { name: string }[] }) => setOptions(body.companies.map((c) => c.name)))
        .catch(() => {});
    }, 200);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [value]);

  return (
    <>
      <input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        list={listId}
        autoComplete="off"
        placeholder={placeholder}
        aria-label={ariaLabel}
        className={CRM_INPUT}
      />
      <datalist id={listId}>
        {options.map((o) => (
          <option key={o} value={o} />
        ))}
      </datalist>
    </>
  );
}
