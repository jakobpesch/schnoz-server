import { Injectable, NotFoundException } from '@nestjs/common';
import { Participant, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ParticipantsService {
  constructor(private prisma: PrismaService) {}

  async findOne(
    participantWhereUniqueInput: Prisma.ParticipantWhereUniqueInput,
  ) {
    const participant = await this.prisma.participant.findUnique({
      where: participantWhereUniqueInput,
    });
    if (!participant) {
      throw new NotFoundException();
    }
    return participant;
  }

  async findMany(params: {
    skip?: number;
    take?: number;
    cursor?: Prisma.ParticipantWhereUniqueInput;
    where?: Prisma.ParticipantWhereInput;
    orderBy?: Prisma.ParticipantOrderByWithRelationInput;
  }) {
    const { skip, take, cursor, where, orderBy } = params;
    return this.prisma.participant.findMany({
      skip,
      take,
      cursor,
      where,
      orderBy,
    });
  }

  async create(data: Prisma.ParticipantCreateInput) {
    return this.prisma.participant.create({
      data,
    });
  }

  async update(params: {
    where: Prisma.ParticipantWhereUniqueInput;
    data: Prisma.ParticipantUncheckedUpdateInput;
  }) {
    const { where, data } = params;
    return this.prisma.participant.update({
      data,
      where,
    });
  }

  async delete(where: Prisma.ParticipantWhereUniqueInput) {
    return this.prisma.participant.delete({
      where,
    });
  }
}
