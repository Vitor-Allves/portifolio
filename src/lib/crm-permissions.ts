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
  /** Create/edit contacts and companies, notes, consent, opt-out, tags. */
  editContacts: boolean;
  /** Archive and restore contacts (the CRM never deletes). Needs editContacts. */
  archiveContacts: boolean;
  importContacts: boolean;
  exportContacts: boolean;
  manageTeam: boolean;
  /** See campaigns and their results, create and edit drafts (Fase 5). */
  editCampaigns: boolean;
  /** Start, pause, resume and cancel a campaign's sending. */
  sendCampaigns: boolean;
  /** Personalização do CRM: lists, tags (Administrador). */
  customize: boolean;
  /** Automações: turn on, pause, adjust, run now, see the run history (Administrador). */
  manageAutomations: boolean;
  /** Clientes ativos (Fase 5): see the clients — all of them with seeAllLeads, else the ones they're responsible for (and the unassigned). */
  viewClients: boolean;
  /** Create clients, edit them, add and edit contracts, write in their history. Needs viewClients. */
  editClients: boolean;
  /** See contract values (hidden by the server otherwise). Needs viewClients. */
  seeContractValues: boolean;
  /** Export the Painel and its lists (CSV) — Fase 6. */
  exportReports: boolean;
  /** Set the monthly goals of the team and of each person (Fase 6). */
  manageGoals: boolean;
  /** Link an active client to its client in Legado Intelligence (Fase 7). Needs viewClients. */
  linkIntelligence: boolean;
};

const CAPS: Record<CrmRole, CrmCapabilities> = {
  administrador: { seeAllLeads: true, editPipeline: true, sendWhatsApp: true, assignAnyOwner: true, editContacts: true, archiveContacts: true, importContacts: true, exportContacts: true, manageTeam: true, editCampaigns: true, sendCampaigns: true, customize: true, manageAutomations: true, viewClients: true, editClients: true, seeContractValues: true, exportReports: true, manageGoals: true, linkIntelligence: true },
  gestor: { seeAllLeads: true, editPipeline: true, sendWhatsApp: true, assignAnyOwner: true, editContacts: true, archiveContacts: true, importContacts: true, exportContacts: true, manageTeam: false, editCampaigns: true, sendCampaigns: true, customize: false, manageAutomations: false, viewClients: true, editClients: true, seeContractValues: true, exportReports: true, manageGoals: true, linkIntelligence: true },
  comercial: { seeAllLeads: false, editPipeline: true, sendWhatsApp: true, assignAnyOwner: false, editContacts: true, archiveContacts: true, importContacts: false, exportContacts: false, manageTeam: false, editCampaigns: false, sendCampaigns: false, customize: false, manageAutomations: false, viewClients: true, editClients: true, seeContractValues: true, exportReports: false, manageGoals: false, linkIntelligence: false },
  marketing: { seeAllLeads: true, editPipeline: false, sendWhatsApp: false, assignAnyOwner: false, editContacts: true, archiveContacts: true, importContacts: true, exportContacts: true, manageTeam: false, editCampaigns: true, sendCampaigns: false, customize: false, manageAutomations: false, viewClients: true, editClients: false, seeContractValues: false, exportReports: true, manageGoals: false, linkIntelligence: false },
};

export type CrmCap = keyof CrmCapabilities;

/** The profile's own permissions (the template), without anyone's exceptions. */
export function crmCapabilities(role: CrmRole): CrmCapabilities {
  return CAPS[role];
}

/**
 * Permissões por módulo e ação (especificação v1.0, Fase 2): every
 * capability, grouped the way the Usuários e permissões screen shows it.
 * A profile is the template; a person may have exceptions on top of it.
 */
export const CRM_PERMISSION_MODULES: {
  id: string;
  label: string;
  items: { cap: CrmCap; action: "Visualizar" | "Criar e editar" | "Excluir" | "Exportar" | "Administrar"; label: string }[];
}[] = [
  {
    id: "contatos",
    label: "Contatos e empresas",
    items: [
      { cap: "seeAllLeads", action: "Visualizar", label: "Ver todos os leads (sem isso: só os seus e os sem responsável)" },
      { cap: "editContacts", action: "Criar e editar", label: "Cadastrar e editar contatos e empresas, notas, consentimento e etiquetas" },
      { cap: "archiveContacts", action: "Excluir", label: "Arquivar e restaurar contatos (nada é apagado)" },
      { cap: "importContacts", action: "Criar e editar", label: "Importar planilhas e desfazer importações" },
      { cap: "exportContacts", action: "Exportar", label: "Exportar contatos em CSV" },
    ],
  },
  {
    id: "funil",
    label: "Funil, tarefas e carteiras",
    items: [
      { cap: "editPipeline", action: "Criar e editar", label: "Criar e mover oportunidades, criar e concluir tarefas" },
      { cap: "assignAnyOwner", action: "Administrar", label: "Trocar o responsável de qualquer lead (sem isso: só assumir os sem dono e soltar os seus)" },
    ],
  },
  { id: "conversas", label: "Conversas", items: [{ cap: "sendWhatsApp", action: "Criar e editar", label: "Enviar mensagens pelo WhatsApp" }] },
  {
    id: "campanhas",
    label: "Campanhas",
    items: [
      { cap: "editCampaigns", action: "Visualizar", label: "Ver campanhas e resultados, montar rascunhos" },
      { cap: "sendCampaigns", action: "Administrar", label: "Disparar, pausar e cancelar campanhas" },
    ],
  },
  {
    id: "painel",
    label: "Painel e relatórios",
    items: [
      { cap: "exportReports", action: "Exportar", label: "Exportar o Painel, as listas dos indicadores, as metas e a produtividade (CSV)" },
      { cap: "manageGoals", action: "Criar e editar", label: "Definir as metas do mês da equipe e de cada pessoa" },
    ],
  },
  {
    id: "clientes",
    label: "Clientes ativos",
    items: [
      { cap: "viewClients", action: "Visualizar", label: "Ver os clientes ativos (sem \"ver todos os leads\": só os seus e os sem responsável)" },
      { cap: "editClients", action: "Criar e editar", label: "Cadastrar clientes, editar, registrar contratos e histórico" },
      { cap: "seeContractValues", action: "Visualizar", label: "Ver os valores dos contratos (e o investimento em mídia)" },
      { cap: "linkIntelligence", action: "Administrar", label: "Ligar clientes ativos ao Legado Intelligence" },
    ],
  },
  {
    id: "administracao",
    label: "Administração",
    items: [
      { cap: "customize", action: "Administrar", label: "Personalização (listas e etiquetas)" },
      { cap: "manageAutomations", action: "Administrar", label: "Automações (ativar, pausar, ajustar, rodar e ver o histórico)" },
      { cap: "manageTeam", action: "Administrar", label: "Usuários e permissões (só pelo perfil Administrador)" },
    ],
  },
];

export const CRM_CAPS: CrmCap[] = CRM_PERMISSION_MODULES.flatMap((m) => m.items.map((i) => i.cap));

/** Managing the team comes only with the Administrador profile — never as an exception, so nobody grants it around the profile rule. */
export const FIXED_CAPS: readonly CrmCap[] = ["manageTeam"];

/** Individual exceptions: cap → true (granted) / false (removed). */
export type CrmPermissionOverrides = Partial<Record<CrmCap, boolean>>;

/** Keeps only real, overridable capabilities that differ from the profile. */
export function sanitizeOverrides(raw: unknown, role: CrmRole): CrmPermissionOverrides {
  const out: CrmPermissionOverrides = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  for (const cap of CRM_CAPS) {
    if (FIXED_CAPS.includes(cap)) continue;
    const v = (raw as Record<string, unknown>)[cap];
    if (typeof v === "boolean" && v !== CAPS[role][cap]) out[cap] = v;
  }
  return out;
}

/**
 * What a person may do: the profile, then their exceptions. Capabilities
 * that only make sense together are kept consistent (dispatching campaigns
 * needs the campaigns screen; archiving and importing need contact editing;
 * editing clients and seeing contract values need the clients screen).
 */
export function effectiveCapabilities(role: CrmRole, overrides: unknown): CrmCapabilities {
  const caps: CrmCapabilities = { ...CAPS[role], ...sanitizeOverrides(overrides, role) };
  if (!caps.editCampaigns) caps.sendCampaigns = false;
  if (!caps.viewClients) {
    caps.editClients = false;
    caps.seeContractValues = false;
    caps.linkIntelligence = false;
  }
  if (!caps.editContacts) {
    caps.archiveContacts = false;
    caps.importContacts = false;
  }
  return caps;
}

/** Whether `userId` may give a record to `ownerId` (null = no owner) when it currently belongs to `currentOwnerId`. */
export function canAssignOwner(caps: CrmCapabilities, userId: string, ownerId: string | null, currentOwnerId: string | null): boolean {
  if (caps.assignAnyOwner) return true;
  if (ownerId === currentOwnerId) return true;
  // Without the right to reassign: take an unowned lead, or let go of one's own.
  return (ownerId === userId && currentOwnerId === null) || (ownerId === null && currentOwnerId === userId);
}

/** One person on the Usuários e permissões screen. */
export type CrmTeamRow = {
  id: string;
  name: string;
  username: string;
  email: string | null;
  staffRole: StaffRole;
  access: CrmAccess;
  /** A general administrator is always a CRM administrator. */
  locked: boolean;
  jobTitle: string | null;
  /** crm_options id, kind "department". */
  department: string | null;
  /** Individual exceptions on top of the profile. */
  overrides: CrmPermissionOverrides;
  /** What the person may do (profile + exceptions); null without CRM access. */
  caps: CrmCapabilities | null;
  /** A login with no Intelligence access (analista with no companies): created and managed from the CRM. */
  crmOnly: boolean;
  active: boolean;
  totpEnabled: boolean;
};
