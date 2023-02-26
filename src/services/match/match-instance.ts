import { EventEmitter2 } from '@nestjs/event-emitter';
import { GameSettings, Match, User } from '@prisma/client';
import { Socket } from 'socket.io';
import { matchRich } from 'src/shared/types/database/match/match-rich.const';
import { MatchRich } from 'src/shared/types/database/match/match-rich.type';
import { MatchInstanceEvent } from 'src/shared/types/events/match-instance-event.enum';
import { prisma } from '../../../prisma/client';

export class MatchInstance {
  private match: MatchRich;
  public sockets = new Map<User['id'], Socket>();
  private endTurnTime: number;
  private readonly turnTime = 30_000;
  private turnTimer: NodeJS.Timeout;

  constructor(
    private readonly id: Match['id'],
    private readonly eventEmitter: EventEmitter2,
  ) {}

  public async init() {
    await this.fetch();
  }

  private async fetch() {
    const match = await prisma.match.findUnique({
      where: { id: this.id },
      ...matchRich,
    });
    if (!match) {
      throw new Error(`Could not find match with id ${this.id}`);
    }
    this.match = match;
  }

  private async sync() {}

  /** Participant connects to match instance */
  public async connect(socket: Socket, userId: User['id']) {
    await this.fetch();
    const userIsParticipant = this.match.players.some(
      (player) => player.userId === userId,
    );
    if (!userIsParticipant) {
      throw new Error(
        `User with id ${userId} is no participant in match ${this.id}`,
      );
    }
    const existingSocket = this.sockets.get(userId);
    if (existingSocket) {
      existingSocket.disconnect();
    }
    socket.join(this.id);
    this.sockets.set(userId, socket);
    // console.log(this.sockets.keys());
    // if (this.sockets.size === 2) {
    //   this.nextTurn();
    // }
  }

  private nextTurn() {
    if (this.turnTimer) {
      clearTimeout(this.turnTimer);
    }
    this.endTurnTime = Date.now() + this.turnTime;
    this.eventEmitter.emit(
      MatchInstanceEvent.START_TURN,
      this.match.activePlayerId,
      this.endTurnTime,
    );
    this.turnTimer = setTimeout(() => {
      this.nextTurn();
    }, this.turnTime);
  }

  public disconnect(socket: Socket, userId: User['id']) {
    socket.leave(this.id);
    this.sockets.delete(userId);
  }

  public async setGameSettings(settings: Omit<Partial<GameSettings>, 'id'>) {
    this.match = await prisma.match.update({
      where: { id: this.id },
      data: { gameSettings: { update: { ...settings } } },
      ...matchRich,
    });
  }

  public async makeMove(
    targetCoordinate: [row: number, column: number],
    unitConstellation: any,
  ) {
    await this.sync();
  }

  private async changeTurn(args: any) {
    const turnTime = 30; // @todo
    const nextPlayerId = this.match.players.find(
      (p) => p.playerNumber !== this.match.activePlayer?.playerNumber,
    )?.id;
    if (!nextPlayerId) {
      return;
    }
    const now = new Date();
    const nextTurnEndTimestamp = now.setSeconds(now.getSeconds() + turnTime);
    await prisma.match.update({
      where: { id: this.match.id },
      data: {
        activePlayerId: nextPlayerId,
        // nextTurnEndTimestamp
      },
    });
  }

  public hover(coordinate: any, unitConstellation: any) {}
}
