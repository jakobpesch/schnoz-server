import { UnitType } from '@prisma/client';
import { TileWithUnits } from 'src/shared/types/database/tile-with-units.type';
import { PlacementRule } from 'src/shared/types/placementRule/placement-rule.type';
import {
  coordinatesAreEqual,
  getAdjacentCoordinatesOfConstellation,
} from 'src/utils/coordinateUtils';

export const adjacentToAllyFactory: (
  buildRadius: 1 | 2 | 3,
) => PlacementRule = (buildRadius) => {
  return (constellation, map, playerId) => {
    let adjacentCoordinates =
      getAdjacentCoordinatesOfConstellation(constellation);
    for (let index = 1; index < buildRadius; index++) {
      adjacentCoordinates = [
        ...adjacentCoordinates,
        ...getAdjacentCoordinatesOfConstellation(adjacentCoordinates),
      ];
    }

    const adjacentTiles = adjacentCoordinates
      .map((coordinate) =>
        map.tiles.find((tile) =>
          coordinatesAreEqual([tile.row, tile.col], coordinate),
        ),
      )
      .filter((tile): tile is TileWithUnits => !!tile);

    const isAdjacentToAlly = adjacentTiles.some(
      (tile) =>
        tile.unit?.ownerId === playerId ||
        tile.unit?.type === UnitType.MAIN_BUILDING,
    );
    return isAdjacentToAlly;
  };
};

// /** Adjacent to ally rule with a build radius of 1 */
// export const adjacentToAlly: PlacementRule = (constellation, map, playerId) => {
//   const adjacentCoordinates =
//     getAdjacentCoordinatesOfConstellation(constellation);

//   const adjacentTiles = adjacentCoordinates
//     .map((coordinate) =>
//       map.tiles.find((tile) =>
//         coordinatesAreEqual([tile.row, tile.col], coordinate),
//       ),
//     )
//     .filter((tile): tile is TileWithUnits => !!tile);

//   const isAdjacentToAlly = adjacentTiles.some(
//     (tile) =>
//       tile.unit?.ownerId === playerId ||
//       tile.unit?.type === UnitType.MAIN_BUILDING,
//   );
//   return isAdjacentToAlly;
// };
// /** Adjacent to ally rule with a build radius of 2 */
// export const adjacentToAlly2: PlacementRule = (
//   constellation,
//   map,
//   playerId,
// ) => {
//   let adjacentCoordinates =
//     getAdjacentCoordinatesOfConstellation(constellation);
//   adjacentCoordinates = [
//     ...adjacentCoordinates,
//     ...getAdjacentCoordinatesOfConstellation(adjacentCoordinates),
//   ];
//   const adjacentTiles2 = adjacentCoordinates
//     .map((coordinate) =>
//       map.tiles.find((tile) =>
//         coordinatesAreEqual([tile.row, tile.col], coordinate),
//       ),
//     )
//     .filter((tile): tile is TileWithUnits => !!tile);

//   const isAdjacentToAlly2 = adjacentTiles2.some(
//     (tile) =>
//       tile.unit?.ownerId === playerId ||
//       tile.unit?.type === UnitType.MAIN_BUILDING,
//   );
//   return isAdjacentToAlly2;
// };
