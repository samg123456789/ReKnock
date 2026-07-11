// Matches the companies.trade CHECK constraint in the initial schema migration.
export const TRADES = [
  { value: "roofing", label: "Roofing" },
  { value: "painting", label: "Painting" },
  { value: "landscaping", label: "Landscaping" },
  { value: "hvac", label: "HVAC" },
  { value: "plumbing", label: "Plumbing" },
  { value: "electrical", label: "Electrical" },
  { value: "remodeling", label: "Remodeling" },
  { value: "fencing", label: "Fencing" },
  { value: "concrete", label: "Concrete" },
  { value: "gutters", label: "Gutters" },
  { value: "windows_doors", label: "Windows & doors" },
  { value: "other", label: "Other" },
] as const;

export const TRADE_VALUES = TRADES.map((t) => t.value);
