import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  WsResponse,
} from '@nestjs/websockets';
import { Match } from '@prisma/client';
import { from, Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { Server, Socket } from 'socket.io';

@WebSocketGateway({
  cors: {
    origin: '*',
  },
})
export class EventsGateway {
  @WebSocketServer()
  server: Server;

  @SubscribeMessage('events')
  findAll(@MessageBody() data: any): Observable<WsResponse<number>> {
    return from([1, 2, 33]).pipe(
      map((item) => ({ event: 'events', data: item })),
    );
  }

  @SubscribeMessage('identity')
  async identity(@MessageBody() data: number): Promise<number> {
    return data;
  }

  @SubscribeMessage('time')
  async time(@MessageBody() data: any): Promise<WsResponse<string>> {
    return { event: 'time', data: new Date().toISOString() };
  }

  @SubscribeMessage('connect')
  async connect(
    @MessageBody() data: { matchId: Match['id'] },
  ): Promise<WsResponse<string>> {
    return { event: 'time', data: new Date().toISOString() };
  }

  @SubscribeMessage('join')
  async join(
    @MessageBody() data: { id: string; userId: string; matchId: string },
    @ConnectedSocket() client: Socket,
  ): Promise<void | unknown> {
    try {
      await client.join(data.matchId);
      return { event: 'joined', data: true };
    } catch (error: unknown) {
      console.log(error);
      return { event: 'join', data: error };
    }
  }
}
//     console.log("fetching match");
//   const matchWithPlayers = await prisma.match.findUnique({
//     where: { id: data.matchId },
//     include: { players: true },
//   });

//   if (!matchWithPlayers) {
//       throw new Error('Match not found');
//     }
//     console.log("got match");
//     const { players, maxPlayers } = matchWithPlayers;
//     if (players.find((player) => player.userId === data.userId)) {
//         await client.join(data.matchId);
//         return;
//     }
//     console.log("player not aler");
//   if (players.length > maxPlayers) {
//     throw new Error('Game full');
//   }
//   await prisma.match.update({
//     where: { id: data.matchId },
//     data: {
//       players: {
//         create: { userId: data.userId, playerNumber: players.length },
//       },
//     },
//   });
//   this.server.to(data.matchId).emit('joined', data.userId);
