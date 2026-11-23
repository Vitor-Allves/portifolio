// CRM profiles (Fase 3) — pure, so the server enforces them and the screens
// use the same table to hide what a profile can't do. The server is the
// authority: every /api/crm route checks these before acting.

import type { StaffRole } from "./session-scope";

export type CrmRole = "administrador" | "gestor" | "comercial" | "marketing";
/** What is stored per person: a profile, or no access to the CRM at all. */
export type CrmAccess = CrmRole | "sem_acesso";

export const CRM_ACCESS_OPTIONS: { id: CrmAccess; label: string; description: string }[] = [
  { id: "administrador", label: "Administrador", description: "Tudo, inclusive definir o perfil de cada pessoa da equipe." },
  { id: "gestor", label: "Gestor", description: "Vê e mexe em todos os leads, troca responsáveis, importa, exporta e dispara campanhas." },
  { id: "comercial", label: "Comercial", description: "Vê e trabalha só os próprios leads e os sem responsável." },
  { id: "marketing", label: "Marketing", description: "Cadastra, importa e exporta contatos; monta campanhas para o Gestor disparar; vê o funil sem mexer nele." },
  { id: "sem_acesso", label: "Sem acesso", description: "Não entra no CRM." },
];

export function isCrmAccess(v: unknown): v is CrmAccess {
  return typeof v === "string" && CRM_ACCESS_OPTIONS.some((o) => o.id === v);
}

export function crmAccessLabel(v: CrmAccess): string {
  return CRM_ACCESS_OPTIONS.find((o) => o.id === v)?.label ?? v;
}

/** Default for someone whose CRM profile was never set: follows the Intelligence role. */
export function defaultCrmAccess(staffRole: StaffRole): CrmAccess {
  if (staffRole === "administrador_geral" || staffRole === "administrador") return "administrador";
  if (staffRole === "gestor") return "gestor";
  return "comercial";
}

/** The profile in force. A general administrator is always a CRM administrator, so nobody can be locked out. */
export function effectiveCrmAccess(stored: string | null, staffRole: StaffRole): CrmAccess {
  if (staffRole === "administrador_geral") return "administrador";
  return isCrmAccess(stored) ? stored : defaultCrmAccess(staffRole);
}

export type CrmCapabilities = {
  /** false = only leads they own or that have no owner (Comercial). */
  seeAllLeads: boolean;
  /** Move stages, create/edit opportunities, create/finish tasks. */
  editPipeline: boolean;
  sendWhatsApp: boolean;
  /** Give a lead/opportunity/task to anyone. Without it: only to oneself or no one. */
  assignAnyOwner: boolean;
  /** Create/edit contacts and companies, notes, consent, opt-out, archive. */
  editContacts: boolean;
  importContacts: boolean;
  exportContacts: boolean;
  manageTeam: boolean;
  /** See campaigns and their results, create and edit drafts (Fase 5). */
  editCampaigns: boolean;
  /** Start, pause, resume and cancel a campaign's sending. */
  sendCampaigns: boolean;
  /** Personalização do CRM: lists, tags (Administrador). */
  customize: boolean;
};

const CAPS: Record<CrmRole, CrmCapabilities> = {
  administrador: { seeAllLeads: true, editPipeline: true, sendWhatsApp: true, assignAnyOwner: true, editContacts: true, importContacts: true, exportContacts: true, manageTeam: true, editCampaigns: true, sendCampaigns: true, customize: true },
  gestor: { seeAllLeads: true, editPipeline: true, sendWhatsApp: true, assignAnyOwner: true, editContacts: true, importContacts: true, exportContacts: true, manageTeam: false, editCampaigns: true, sendCampaigns: true, customize: false },
  comercial: { seeAllLeads: false, editPipeline: true, sendWhatsApp: true, assignAnyOwner: false, editContacts: true, importContacts: false, exportContacts: false, manageTeam: false, editCampaigns: false, sendCampaigns: false, customize: false },
  marketing: { seeAllLeads: true, editPipeline: false, sendWhatsApp: false, assignAnyOwner: false, editContacts: true, importContacts: true, exportContacts: true, manageTeam: false, editCampaigns: true, sendCampaigns: false, customize: false },
};

export function crmCapabilities(role: CrmRole): CrmCapabilities {
  return CAPS[role];
}

/** Whether `userId` may give a record to `ownerId` (null = no owner) when it currently belongs to `currentOwnerId`. */
export function canAssignOwner(caps: CrmCapabilities, userId: string, ownerId: string | null, currentOwnerId: string | null): boolean {
  if (caps.assignAnyOwner) return true;
  if (ownerId === currentOwnerId) return true;
  // Without the right to reassign: take an unowned lead, or let go of one's own.
  return (ownerId === userId && currentOwnerId === null) || (ownerId === null && currentOwnerId === userId);
}
