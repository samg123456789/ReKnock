// Trades a residential contractor might select. Multi-select in onboarding;
// trades[0] mirrors into companies.trade (the single-enum CHECK was dropped in
// the onboarding_v2 migration, so values are controlled here).
export const TRADES = [
  { value: "general_contractor", label: "General contractor" },
  { value: "roofing", label: "Roofing" },
  { value: "painting", label: "Painting" },
  { value: "landscaping", label: "Landscaping" },
  { value: "hvac", label: "HVAC" },
  { value: "plumbing", label: "Plumbing" },
  { value: "electrical", label: "Electrical" },
  { value: "remodeling", label: "Remodeling" },
  { value: "kitchen_bath", label: "Kitchen & bath" },
  { value: "fencing", label: "Fencing" },
  { value: "concrete", label: "Concrete" },
  { value: "gutters", label: "Gutters" },
  { value: "windows_doors", label: "Windows & doors" },
  { value: "siding", label: "Siding" },
  { value: "decks", label: "Decks & patios" },
  { value: "flooring", label: "Flooring" },
  { value: "drywall", label: "Drywall" },
  { value: "masonry", label: "Masonry" },
  { value: "insulation", label: "Insulation" },
  { value: "solar", label: "Solar" },
  { value: "garage_doors", label: "Garage doors" },
  { value: "pools_spas", label: "Pools & spas" },
  { value: "tree_service", label: "Tree service" },
  { value: "pest_control", label: "Pest control" },
  { value: "pressure_washing", label: "Pressure washing" },
  { value: "junk_removal", label: "Junk removal" },
  { value: "handyman", label: "Handyman" },
  { value: "foundation", label: "Foundation" },
  { value: "excavation", label: "Excavation" },
  { value: "paving_asphalt", label: "Paving & asphalt" },
  { value: "well_septic", label: "Well & septic" },
  { value: "chimney", label: "Chimney" },
  { value: "other", label: "Other" },
] as const;

export const TRADE_VALUES = TRADES.map((t) => t.value);

export function tradeLabel(value: string): string {
  return TRADES.find((t) => t.value === value)?.label ?? value;
}
