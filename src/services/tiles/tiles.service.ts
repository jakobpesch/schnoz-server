import { Injectable, NotFoundException } from '@nestjs/common';
import { Tile, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class TilesService {
  constructor(private prisma: PrismaService) {}

  async findOne(tileWhereUniqueInput: Prisma.TileWhereUniqueInput) {
    const tile = await this.prisma.tile.findUnique({
      where: tileWhereUniqueInput,
    });
    if (!tile) {
      throw new NotFoundException();
    }
    return tile;
  }

  async findMany(params: {
    skip?: number;
    take?: number;
    cursor?: Prisma.TileWhereUniqueInput;
    where?: Prisma.TileWhereInput;
    orderBy?: Prisma.TileOrderByWithRelationInput;
  }) {
    const { skip, take, cursor, where, orderBy } = params;
    const tilesWithUnits = await this.prisma.tile.findMany({
      skip,
      take,
      cursor,
      where,
      orderBy,
      include: { unit: true },
    });
    if (tilesWithUnits.length === 0) {
      throw new Error(`No tiles in map with id ${where?.mapId}`);
    }
    return tilesWithUnits;
  }

  async create(data: Prisma.TileCreateInput) {
    return await this.prisma.tile.create({
      data,
    });
  }

  async update(params: {
    where: Prisma.TileWhereUniqueInput;
    data: Prisma.TileUncheckedUpdateInput;
  }) {
    const { where, data } = params;
    return this.prisma.tile.update({
      data,
      where,
      include: { unit: true },
    });
  }

  async deleteTile(where: Prisma.TileWhereUniqueInput) {
    return await this.prisma.tile.delete({
      where,
    });
  }
}
