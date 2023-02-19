import { PlacementRule } from 'src/shared/types/placement-rule.type';

export const noTerrain: PlacementRule = (constellation, map) => {
  const hasTerrain = constellation.some(
    ([row, col]) =>
      !!map.tiles.find((tile) => tile.row === row && tile.col === col)?.terrain,
  );
  return !hasTerrain;
};
