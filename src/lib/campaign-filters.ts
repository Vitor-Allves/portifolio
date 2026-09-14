// Pure filtering helpers shared between the live dashboard (Dashboard.tsx)
// and the isolated report-template generation flow (ReportsPanel.tsx) —
// keeping them in one place guarantees a generated report's campaign
// selection behaves identically to what the same filters would show on
// screen.

import type { CampaignInsight, AdSetInsight } from "./meta-ads-types";

/** Sentinel key for "no objective set" (Meta's `objective` is nullable) — a Set<string> can't hold null, so this stands in for it consistently everywhere objectives are filtered or stored. */
export const OBJECTIVE_NONE_KEY = "__none__";

export type CampaignFilterIds = {
  accountIds: Set<string>;
  campaignIds: Set<string>;
  adSetIds: Set<string>;
  objectiveIds: Set<string>;
  statusIds: Set<string>;
};

/**
 * Resolves a saved filter selection (`null` meaning "everything, no
 * restriction" — the default when a filter was left untouched) against
 * whatever's actually available right now. A saved id that no longer
 * exists (a deleted campaign, an account the viewer can't see) is dropped
 * silently rather than erroring — the same as if that option simply
 * weren't in the list to begin with.
 */
export function resolveIdFilter(saved: string[] | null, available: Iterable<string>): Set<string> {
  const availableArr = [...available];
  if (saved === null) return new Set(availableArr);
  const savedSet = new Set(saved);
  return new Set(availableArr.filter((id) => savedSet.has(id)));
}

/** Inverse of resolveIdFilter, for persisting the current UI selection: "everything selected" collapses to `null` so it keeps meaning "no restriction" for whoever/whenever the template is applied next, rather than freezing today's exact id list. */
export function toSavedIdFilter(selected: Set<string>, available: { id: string }[]): string[] | null {
  if (available.length > 0 && selected.size === available.length) return null;
  return [...selected];
}

/**
 * Filters campaigns by every dimension at once, including the one subtlety
 * that isn't a simple per-campaign field match: the ad-set filter narrows
 * campaigns to only those with at least one matching ad set, but only once
 * that filter has actually been narrowed away from "all ad sets" — left a
 * no-op otherwise, so a campaign whose ad sets failed to load isn't hidden
 * just because the filter technically "requires" a match it never got the
 * data to make.
 */
export function filterCampaignsByIds(
  campaigns: CampaignInsight[],
  adSets: AdSetInsight[],
  filters: CampaignFilterIds
): CampaignInsight[] {
  const allAdSetIds = new Set(adSets.map((a) => a.adSetId));
  const adSetFilterActive = allAdSetIds.size > 0 && filters.adSetIds.size !== allAdSetIds.size;
  const campaignIdsWithSelectedAdSet = adSetFilterActive
    ? new Set(adSets.filter((a) => filters.adSetIds.has(a.adSetId)).map((a) => a.campaignId))
    : null;

  return campaigns.filter(
    (c) =>
      filters.accountIds.has(c.accountId) &&
      filters.campaignIds.has(c.campaignId) &&
      filters.objectiveIds.has(c.objective ?? OBJECTIVE_NONE_KEY) &&
      filters.statusIds.has(c.status) &&
      (campaignIdsWithSelectedAdSet === null || campaignIdsWithSelectedAdSet.has(c.campaignId))
  );
}
