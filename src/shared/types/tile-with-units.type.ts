import { Prisma } from "@prisma/client"

const tileRich = Prisma.validator<Prisma.TileArgs>()({
  include: {
    unit: true,
  },
})

export type TileWithUnits = Prisma.TileGetPayload<typeof tileRich>
