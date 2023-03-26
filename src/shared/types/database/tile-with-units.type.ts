import { Prisma } from '@prisma/client';

const tileRich = Prisma.validator<Prisma.TileArgs>()({
  include: {
    unit: true,
  },
});

export type TileWithUnit = Prisma.TileGetPayload<typeof tileRich>;
