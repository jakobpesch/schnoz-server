import { Match } from '@prisma/client';

export type EvaluationCondition = (turn: Match['turn']) => boolean;
