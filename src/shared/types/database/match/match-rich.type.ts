import { Prisma } from '@prisma/client';
import { matchRich } from './match-rich.const';

export type MatchRich = Prisma.MatchGetPayload<typeof matchRich>;
