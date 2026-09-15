// Shared by Dashboard.tsx (live view) and ReportsPanel.tsx (template-based
// PDF generation, which re-fetches its own fresh dataset rather than reusing
// the live one) so both compute "has a campaign/ad set/objective/status
// filter narrowed this account's campaign set" the exact same way — the
// trigger for switching from the whole-account reach number to a
// campaign-scoped, Meta-deduplicated one (see fetchScopedReach).
export function computeNarrowedCampaignIdsByAccount(
  fullCampaigns: { accountId: string; campaignId: string }[],
  filteredCampaigns: { accountId: string; campaignId: string }[],
  accountIds: Iterable<string>
): Record<string, string[]> {
  const fullByAccount = new Map<string, Set<string>>();
  for (const c of fullCampaigns) {
    const set = fullByAccount.get(c.accountId) ?? new Set<string>();
    set.add(c.campaignId);
    fullByAccount.set(c.accountId, set);
  }
  const filteredByAccount = new Map<string, Set<string>>();
  for (const c of filteredCampaigns) {
    const set = filteredByAccount.get(c.accountId) ?? new Set<string>();
    set.add(c.campaignId);
    filteredByAccount.set(c.accountId, set);
  }
  const result: Record<string, string[]> = {};
  for (const accountId of accountIds) {
    const full = fullByAccount.get(accountId);
    if (!full) continue; // this account has no campaigns at all this period — nothing to narrow
    const filtered = filteredByAccount.get(accountId) ?? new Set<string>();
    if (filtered.size < full.size) result[accountId] = [...filtered];
  }
  return result;
}
