import { GameSettings, Match } from '@prisma/client';
import { MatchRich } from 'src/shared/types/database/match/match-rich.type';

export function isLastTurn(match: Match, gameSettings: GameSettings) {
  return match.turn >= (gameSettings.maxTurns ?? 0);
}
