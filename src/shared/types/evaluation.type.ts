import { Participant } from '@prisma/client';
import { MatchRich } from './match-rich.type';

export type Evaluation = (match: MatchRich) => Participant[];
