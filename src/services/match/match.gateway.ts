import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Match, Participant, User } from '@prisma/client';
import { Server, Socket } from 'socket.io';
import { Coordinate } from 'src/shared/types/coordinate.type';
import { ClientEvent } from 'src/shared/types/events/client-event.enum';
import { MatchInstanceEvent } from 'src/shared/types/events/match-instance-event.enum';
import { ServerEvent } from 'src/shared/types/events/server-event.enum';
import { PlacementRuleName } from 'src/shared/types/placementRule/placement-rule-name.type';
import { Special } from 'src/shared/types/special/special.interface';
import { isSpecial } from 'src/shared/types/special/special.type-guard';
import { IUnitConstellation } from 'src/shared/types/unit-constellation.interface';
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
      this.logger.verbose(
        `No match instance found for match "${matchId}". Creating new...`,
      );
      matchInstance = new MatchInstance(matchId, this.eventEmitter);
      this.clients.set(client.id, { userId, matchInstance });
      this.matches.set(matchId, matchInstance);
      await matchInstance.init();
    } else {
      this.logger.verbose(
        `Match instance for client "${client.id}" found. Reusing...`,
      );
      this.clients.set(client.id, { userId, matchInstance });
    }
    try {
      await matchInstance.connect(client, userId);
      await this.cleanup();
    } catch (e) {
      this.logger.error("Couldn't connect client to match");
      this.logger.error(e);
      client.disconnect();
    }
    this.server.to(matchId).emit(ServerEvent.PLAYER_CONNECTED_TO_MATCH, {
      match: matchInstance.Match,
      map: matchInstance.Map,
      tilesWithUnits: matchInstance.TilesWithUnits,
      gameSettings: matchInstance.GameSettings,
      players: matchInstance.Players,
    });
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
  handleDisconnectFromMatch(client: Socket, data: { userId: User['id'] }) {
    const { userId } = data;
    const matchInstance = this.getMatchInstanceForClient(client.id);
    if (!matchInstance) {
      this.logger.error(`No match for client ${client.id} found`);
      return;
    }
    matchInstance.disconnect(client, userId);
    this.server
      .to(matchInstance.Match.id)
      .emit(ServerEvent.DISCONNECTED_FROM_MATCH, matchInstance.Match.id);
  }
  @SubscribeMessage(ClientEvent.START_MATCH)
  async handleStartMatch(client: Socket, data: { userId: User['id'] }) {
    const { userId } = data;
    const matchInstance = this.getMatchInstanceForClient(client.id);
    if (!matchInstance) {
      this.logger.error(`No match for client ${client.id} found`);
      return;
    }
    try {
      await matchInstance.startMatch(userId);
      this.server.to(matchInstance.Match.id).emit(ServerEvent.STARTED_MATCH, {
        match: matchInstance.Match,
        map: matchInstance.Map,
        tilesWithUnits: matchInstance.TilesWithUnits,
        players: matchInstance.Players,
      });
    } catch (e) {
      this.logger.error(e);
      client.disconnect();
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
  @SubscribeMessage(ClientEvent.MAKE_MOVE)
  async handleMove(
    client: Socket,
    data: {
      participantId: Participant['id'];
      row: Coordinate[0];
      col: Coordinate[1];
      ignoredRules: PlacementRuleName[];
      specials: Special[];
      unitConstellation: IUnitConstellation;
    },
  ) {
    const {
      participantId,
      row: targetRow,
      col: targetCol,
      ignoredRules,
      specials,
      unitConstellation,
    } = data;

    if (
      !participantId ||
      typeof targetRow !== 'number' ||
      typeof targetCol !== 'number'
    ) {
      this.logger.error('Query is not complete');
      return;
    }

    if (!(Array.isArray(specials) && specials.every(isSpecial))) {
      this.logger.error('Invalid query param value for specials.');
      return;
    }

    if (!Array.isArray(ignoredRules)) {
      this.logger.error(
        'ignoredRules must be an Array. Received: ' + ignoredRules,
      );
      return;
    }

    const matchInstance = this.getMatchInstanceForClient(client.id);

    if (!matchInstance) {
      this.logger.error(`No connection for client ${client.id} found`);
      return;
    }

    try {
      const updates = await matchInstance.makeMove(
        participantId,
        targetRow,
        targetCol,
        ignoredRules,
        unitConstellation,
        specials,
      );
      this.server
        .to(matchInstance.Match.id)
        .emit(ServerEvent.MADE_MOVE, updates);
    } catch (e) {
      this.logger.error('update match failed');
      this.logger.error(e);
      client.disconnect();
    }
  }
  @SubscribeMessage(ClientEvent.HOVER)
  async handleOpponentHover(client: Socket, data: { [x: string]: any }) {
    const matchInstance = this.getMatchInstanceForClient(client.id);

    if (!matchInstance) {
      this.logger.error(`No connection for client ${client.id} found`);
      return;
    }

    const hoveringPlayerUserId = this.getUserIdForClient(client.id);
    if (!hoveringPlayerUserId) {
      this.logger.error(
        `Could not find client for hovering player ${client.id}`,
      );
      return;
    }

    const opponent = matchInstance.getOpponentByUserId(hoveringPlayerUserId);
    if (!opponent) {
      this.logger.error('Could not find opponent in match instance');
      return;
    }

    const opponentClient = matchInstance.sockets.get(opponent.userId);
    if (!opponentClient) {
      // this.logger.error('Could not find opponent client');
      return;
    }

    try {
      this.server.to(opponentClient.id).emit(ServerEvent.HOVERED, data);
    } catch (e) {
      this.logger.error(e);
      client.disconnect();
    }
  }

  @OnEvent(MatchInstanceEvent.END_TURN)
  handleTimer(id: Match['id'], remainingTime: number) {
    console.log('handleTimer', id, remainingTime);
    this.server.to(id).emit(ServerEvent.TIME_REMAINING, remainingTime);
  }
}
