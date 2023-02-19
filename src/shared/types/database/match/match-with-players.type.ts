import { Prisma } from '@prisma/client';

const matchWithPlayers = Prisma.validator<Prisma.MatchArgs>()({
  include: { players: true },
});

export type MatchWithPlayers = Prisma.MatchGetPayload<typeof matchWithPlayers>;
