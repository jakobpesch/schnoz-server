import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import {
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Match } from '@prisma/client';
import { Server, Socket } from 'socket.io';
import { MatchInstanceEvent } from 'src/shared/types/events/match-instance-event.enum';
import { ServerEvent } from 'src/shared/types/events/server-event.enum';
import { MatchInstance } from './match-instance';

@WebSocketGateway({ cors: { origin: '*' } })
export class MatchGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private matches: Map<MatchInstance['id'], MatchInstance> = new Map();

  constructor(private readonly eventEmitter: EventEmitter2) {}

  handleConnection(client: Socket, ...args: any[]) {
    // Handle client connection
    console.log('Client connected:', client.id);
  }

  handleDisconnect(client: Socket) {
    // Handle client disconnection
    console.log('Client disconnected:', client.id);
  }

  @SubscribeMessage('connectToMatch')
  handleConnectToMatch(
    client: Socket,
    data: { userId: string; matchId: string },
  ) {
    console.log(this.matches);

    // Handle join match request
    const { matchId } = data;
    console.log('Connect to match:', matchId);

    const matchInstance =
      this.matches.get(matchId) ??
      new MatchInstance(matchId, this.eventEmitter);
    this.matches.set(matchId, matchInstance);
    matchInstance.connect(client);
    this.server.to(matchId).emit('connectedToMatch', matchId, client.id);
  }

  @SubscribeMessage('disconnectFromMatch')
  handleDisconnectFromMatch(client: Socket, data: { matchId: string }) {
    // Handle leave match request
    const { matchId } = data;
    console.log('Leave match:', matchId);

    const matchInstance = this.matches.get(matchId);
    if (matchInstance) {
      matchInstance.disconnect(client);
      this.server.to(matchId).emit('disconnectedFromMatch', matchId);
    } else {
      client.emit('matchNotFound', matchId);
    }
  }

  @OnEvent(MatchInstanceEvent.END_TURN)
  handleTimer(id: Match['id'], remainingTime: number) {
    console.log('handleTimer', id, remainingTime);
    this.server.to(id).emit(ServerEvent.TIME_REMAINING, remainingTime);
  }
}
