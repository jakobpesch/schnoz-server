import { EventEmitter2 } from '@nestjs/event-emitter';
import { GameSettings, Match } from '@prisma/client';
import { Socket } from 'socket.io';
import { MatchInstanceEvent } from 'src/shared/types/match-instance-event.enum';
import { matchRich } from 'src/shared/types/match-rich.const';
import { MatchRich } from 'src/shared/types/match-rich.type';
import { prisma } from '../../../prisma/client';

export class MatchInstance {
  private match: MatchRich;
  private sockets = new Map<Socket['id'], Socket>();
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

  private async sync() {
    // only get changing columns
  }

  /** Participant connects to match instance */
  public connect(socket: Socket) {
    socket.join(this.id);
    this.sockets.set(socket.id, socket);
    if (this.sockets.size === 2) {
      this.nextTurn();
    }
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

  public disconnect(socket: Socket) {
    socket.leave(this.id);
    this.sockets.delete(socket.id);
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
