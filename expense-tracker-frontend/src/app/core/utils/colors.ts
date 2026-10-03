export const CHART_COLORS = [
  '#7c6cff', '#22d3ee', '#f472b6', '#34d399', '#fbbf24', '#fb7185',
  '#60a5fa', '#a78bfa', '#f97316', '#2dd4bf', '#e879f9', '#84cc16',
];

export const CATEGORY_SWATCHES = [
  '#F97316', '#EF4444', '#EC4899', '#A855F7', '#7C6CFF', '#3B82F6',
  '#06B6D4', '#14B8A6', '#22C55E', '#84CC16', '#EAB308', '#64748B',
];

export const colorAt = (index: number): string => CHART_COLORS[index % CHART_COLORS.length];

/** Stable colour for an arbitrary label, so the same name always gets the same colour. */
export function colorForLabel(label: string): string {
  let hash = 0;
  for (let i = 0; i < label.length; i++) hash = (hash * 31 + label.charCodeAt(i)) | 0;
  return colorAt(Math.abs(hash));
}
