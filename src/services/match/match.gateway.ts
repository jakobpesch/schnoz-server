import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import {
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Match, User } from '@prisma/client';
import { Server, Socket } from 'socket.io';
import { ClientEvent } from 'src/shared/types/events/client-event.enum';
import { MatchInstanceEvent } from 'src/shared/types/events/match-instance-event.enum';
import { ServerEvent } from 'src/shared/types/events/server-event.enum';
import { AppLoggerService } from '../logger/logger.service';
import { MatchInstance } from './match-instance';

@WebSocketGateway({ cors: { origin: '*' } })
export class MatchGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private logger = new AppLoggerService(MatchGateway.name);

  @WebSocketServer()
  server: Server;
  private clients = new Map<
    Socket['id'],
    { userId: User['id']; matchInstance: MatchInstance }
  >();
  private matches = new Map<MatchInstance['id'], MatchInstance>();

  constructor(private readonly eventEmitter: EventEmitter2) {}

  private getUserIdForClient(clientId: Socket['id']) {
    return this.clients.get(clientId)?.userId;
  }

  private getMatchInstanceForClient(clientId: Socket['id']) {
    return this.clients.get(clientId)?.matchInstance;
  }

  async handleConnection(client: Socket) {
    const { matchId, userId } = client.handshake.query;
    if (typeof matchId !== 'string' || typeof userId !== 'string') {
      this.logger.error(
        `Incomplete connection query. userId: "${userId}", match: "${matchId}"`,
      );
      client.disconnect();
      return;
    }
    this.logger.verbose(
      `Incoming connection from "${userId}" to match "${matchId}"`,
    );

    let matchInstance = this.matches.get(matchId);
    if (!matchInstance) {
      matchInstance = new MatchInstance(matchId, this.eventEmitter);
      await matchInstance.init();
    }

    this.matches.set(matchId, matchInstance);
    this.clients.set(client.id, { userId, matchInstance });
    try {
      await matchInstance.connect(client, userId);
      await this.cleanup();
    } catch (e) {
      this.logger.error(e);
      client.disconnect();
    }
    this.server
      .to(matchId)
      .emit(ServerEvent.PLAYER_CONNECTED_TO_MATCH, matchInstance.Match);
    this.logger.verbose(`Client connected to match "${matchId}"`);
    this.logger.verbose(
      `Current clients in match "${matchId}": ${Array.from(
        Array.from(matchInstance.sockets.values()).map((v) => v.id),
      )}`,
    );
    this.logger.verbose(`Current clients: ${Array.from(this.clients.keys())}`);
  }

  handleDisconnect(client: Socket) {
    const { matchInstance } = this.clients.get(client.id) ?? {};
    const { matchId, userId } = client.handshake.query;
    if (typeof userId !== 'string') {
      return;
    }
    if (matchInstance) {
      matchInstance.disconnect(client, userId);
    }
    this.clients.delete(client.id);
    this.logger.verbose(`Client "${client.id}" disconnected`);
    this.logger.verbose(`Current clients: ${Array.from(this.clients.keys())}`);
  }

  async cleanup() {
    const sockets = await this.server.sockets.fetchSockets();
    const socketIds: string[] = [];
    for (const socket of sockets) {
      socketIds.push(socket.id);
    }
    Array.from(this.clients.keys()).forEach((clientId) => {
      if (!socketIds.includes(clientId)) {
        this.clients.delete(clientId);
      }
    });
  }

  @SubscribeMessage(ClientEvent.DISCONNECT_FROM_MATCH)
  handleDisconnectFromMatch(
    client: Socket,
    data: { userId: string; matchId: string },
  ) {
    // Handle leave match request
    const { matchId, userId } = data;
    console.log('Leave match:', matchId);

    const matchInstance = this.matches.get(matchId);
    if (matchInstance) {
      matchInstance.disconnect(client, userId);
      this.server.to(matchId).emit('disconnectedFromMatch', matchId);
    } else {
      client.emit('matchNotFound', matchId);
    }
  }
  @SubscribeMessage(ClientEvent.UPDATE_GAME_SETTINGS)
  async handleUpdateGameSettings(client: Socket, data: { [x: string]: any }) {
    const matchInstance = this.getMatchInstanceForClient(client.id);

    if (!matchInstance) {
      this.logger.error(`No connection for client ${client.id} found`);
      return;
    }

    try {
      const updatedGameSettings = await matchInstance.setGameSettings(data);
      this.server
        .to(matchInstance.Match.id)
        .emit(ServerEvent.UPDATED_GAME_SETTINGS, updatedGameSettings);
    } catch (e) {
      this.logger.error(e);
      client.disconnect();
    }

    console.log('success');
    console.log(this.getUserIdForClient(client.id));

    // const matchInstance = this.matches.get(matchId);
    // if (matchInstance) {
    //   matchInstance.disconnect(client, userId);
    //   this.server.to(matchId).emit('disconnectedFromMatch', matchId);
    // } else {
    //   client.emit('matchNotFound', matchId);
    // }
  }

  @OnEvent(MatchInstanceEvent.END_TURN)
  handleTimer(id: Match['id'], remainingTime: number) {
    console.log('handleTimer', id, remainingTime);
    this.server.to(id).emit(ServerEvent.TIME_REMAINING, remainingTime);
  }
}
