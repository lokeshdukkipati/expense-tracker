import { IconName } from '../../shared/ui/icon.component';

export interface DashboardBlock {
  id: string;
  label: string;
  icon: IconName;
}

/** The dashboard's blocks, in their default order. */
export const DASHBOARD_BLOCKS: readonly DashboardBlock[] = [
  { id: 'story', label: 'Money story', icon: 'play' },
  { id: 'kpis', label: 'Key numbers', icon: 'activity' },
  { id: 'cashflow', label: 'Cash flow & categories', icon: 'chart' },
  { id: 'pace', label: 'Pace, health & safe to spend', icon: 'target' },
  { id: 'budgets', label: 'Budgets, insights & bills', icon: 'wallet' },
  { id: 'wealth', label: 'Net worth, goals & habits', icon: 'landmark' },
  { id: 'recent', label: 'Recent transactions', icon: 'list' },
];

const IDS: readonly string[] = DASHBOARD_BLOCKS.map((b) => b.id);

export const isBlockId = (id: string): boolean => IDS.includes(id);

export function blockInfo(id: string): DashboardBlock {
  return DASHBOARD_BLOCKS.find((b) => b.id === id) ?? DASHBOARD_BLOCKS[0]!;
}

/**
 * The saved order with unknown blocks dropped and any block the user has never seen (for example one added in a
 * later release) placed at its default position, so new blocks always appear.
 */
export function mergeOrder(saved: readonly string[] | undefined): string[] {
  const result = (saved ?? []).filter(
    (id, index, all) => isBlockId(id) && all.indexOf(id) === index,
  );
  DASHBOARD_BLOCKS.forEach((block, index) => {
    if (!result.includes(block.id))
      result.splice(Math.min(index, result.length), 0, block.id);
  });
  return result;
}
