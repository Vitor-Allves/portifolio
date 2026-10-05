// Shared by every "Falar com meu consultor" button placement (header,
// sidebar, error/empty states) so the link/message text is built exactly
// once, never re-derived slightly differently per spot.

/** Legado's own general WhatsApp number — used whenever a client has no named consultant configured. */
export const GENERAL_WHATSAPP_NUMBER = "5515991928585";

function digitsOnly(value: string): string {
  return value.replace(/\D/g, "");
}

export type ConsultantInfo = {
  consultantName: string | null;
  consultantWhatsapp: string | null;
};

/**
 * Resolves the wa.me link + button label for one viewer: a named
 * consultant's own number when the client has one configured, otherwise
 * Legado's general number — never a stored conversation, just the link.
 *
 * `clientLabel` must be the actual business this message is ABOUT (a
 * client's own company, or whichever client the current account/report
 * scope resolves to) — never the viewer's own display identity. A staff
 * session viewing its own name here is exactly the bug this parameter's
 * naming guards against; see resolveReportClients in client-access.ts for
 * how that resolution is computed from account ids rather than from who's
 * logged in. `isMultiClient` overrides clientLabel entirely with "múltiplas
 * contas" — the two are mutually exclusive, never combined.
 */
export function buildConsultantWhatsAppLink(
  consultant: ConsultantInfo | null,
  clientLabel: string | null,
  periodLabel: string,
  isMultiClient: boolean = false
): { href: string; label: string } {
  const number = consultant?.consultantWhatsapp ? digitsOnly(consultant.consultantWhatsapp) : GENERAL_WHATSAPP_NUMBER;
  const label = consultant?.consultantName ? `Falar com ${consultant.consultantName}` : "Falar com meu consultor";
  const clientPart = isMultiClient ? "múltiplas contas" : clientLabel ?? "minha empresa";
  const message = `Olá! Estou no Legado Intelligence e quero conversar sobre os resultados de ${clientPart} no período ${periodLabel}.`;
  return { href: `https://wa.me/${number}?text=${encodeURIComponent(message)}`, label };
}
