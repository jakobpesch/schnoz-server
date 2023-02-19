import { Coordinate } from './coordinate.type';
import { MatchRich } from './match-rich.type';

export type PlacementRule = (
  constellation: Coordinate[],
  // @todo consider replaceing with tile lookup
  map: Exclude<MatchRich['map'], null>,
  playerId: string,
) => boolean;
