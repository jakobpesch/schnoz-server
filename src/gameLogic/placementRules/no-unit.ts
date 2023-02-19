import { PlacementRule } from 'src/shared/types/placement-rule.type';

export const noUnit: PlacementRule = (constellation, map) => {
  const hasUnit = constellation.some(
    ([row, col]) =>
      !!map.tiles.find((tile) => tile.row === row && tile.col === col)?.unit,
  );
  return !hasUnit;
};
