// Resumo legível da segmentação de um conjunto (formato `targeting` da Graph API). Só descreve o que existe;
// campo ausente = não informado (não "sem restrição").
export type TargetingSummary = { age: string | null; genders: string | null; places: string | null; interests: string | null; placements: string | null };

const GENDER: Record<number, string> = { 1: "Homens", 2: "Mulheres" };

export function summarizeTargeting(t: Record<string, unknown> | null | undefined): TargetingSummary {
  if (!t) return { age: null, genders: null, places: null, interests: null, placements: null };
  const g = (t.geo_locations ?? {}) as { countries?: string[]; regions?: { name?: string }[]; cities?: { name?: string }[] };
  const places = [...(g.countries ?? []), ...(g.regions ?? []).map((r) => r.name ?? ""), ...(g.cities ?? []).map((c) => c.name ?? "")].filter(Boolean);
  const genders = Array.isArray(t.genders) && t.genders.length ? (t.genders as number[]).map((x) => GENDER[x] ?? "").filter(Boolean).join(" e ") : null;
  const interests = Array.isArray(t.interests) ? (t.interests as { name?: string }[]).map((i) => i.name ?? "").filter(Boolean) : [];
  const plats = Array.isArray(t.publisher_platforms) ? (t.publisher_platforms as string[]) : [];
  const age = t.age_min || t.age_max ? `${t.age_min ?? "?"}–${t.age_max ?? "?"} anos` : null;
  return { age, genders, places: places.length ? places.join(", ") : null, interests: interests.length ? interests.join(", ") : null, placements: plats.length ? plats.join(", ") : null };
}
