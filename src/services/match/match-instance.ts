import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  GameSettings,
  Map as SchnozMap,
  Match,
  MatchStatus,
  Participant,
  Prisma,
  UnitConstellation,
  UnitType,
  User,
} from '@prisma/client';
import { Socket } from 'socket.io';
import { determineWinner } from 'src/gameLogic/determineWinner';
import { createCustomGame } from 'src/gameLogic/GameVariants';
import { isLastTurn } from 'src/gameLogic/isLastTurn';
import { checkConditionsForUnitConstellationPlacement } from 'src/gameLogic/PlacementRule';
import { Coordinate } from 'src/shared/types/coordinate.type';
import { matchRich } from 'src/shared/types/database/match/match-rich.const';
import { TileWithUnit } from 'src/shared/types/database/tile-with-units.type';
import { Error } from 'src/shared/types/error.interface';
import { MatchInstanceEvent } from 'src/shared/types/events/match-instance-event.enum';
import { PlacementRuleName } from 'src/shared/types/placementRule/placement-rule-name.type';
import { Special } from 'src/shared/types/special/special.interface';
import { IUnitConstellation } from 'src/shared/types/unit-constellation.interface';
import { shuffleArray } from 'src/utils/arrayUtils';
import {
  buildTileLookupId,
  getNewlyRevealedTiles,
  getTileLookup,
} from 'src/utils/coordinateUtils';
import { prisma } from '../../../prisma/client';

export class MatchInstance {
  private match: Match;
  get Match() {
    return this.match;
  }
  private players: Participant[] | null = null;
  get Players() {
    return this.players;
  }
  private map: SchnozMap | null = null;
  get Map() {
    return this.map;
  }
  private tilesWithUnits: TileWithUnit[] | null = null;
  get TilesWithUnits() {
    return this.tilesWithUnits;
  }
  private gameSettings: GameSettings;
  get GameSettings() {
    return this.gameSettings;
  }

  get activePlayer() {
    return this.players?.find(
      (player) => player.id === this.match.activePlayerId,
    );
  }

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

  public getOpponentByUserId(userId: User['id']) {
    return this.players?.find((player) => player.userId !== userId);
  }

  private async fetch() {
    const match = await prisma.match.findUnique({
      where: { id: this.id },
    });
    if (!match) {
      throw new Error(`Could not find match with id ${this.id}`);
    }
    this.match = match;

    const gameSettings = await prisma.gameSettings.findUnique({
      where: { matchId: this.id },
    });
    if (!gameSettings) {
      throw new Error(
        `Could not find gameSettings in match with id ${this.id}`,
      );
    }
    this.gameSettings = gameSettings;

    this.map = await prisma.map.findUnique({
      where: { matchId: this.id },
    });

    const players = await prisma.participant.findMany({
      where: { matchId: this.id },
    });
    if (players.length === 0) {
      throw new Error(`No player in match with id ${this.id}`);
    }
    this.players = players;

    if (this.map) {
      const tilesWithUnits = await prisma.tile.findMany({
        where: { mapId: this.map.id },
        include: { unit: true },
      });
      if (tilesWithUnits.length === 0) {
        throw new Error(`No in tiles in map with id ${this.map.id}`);
      }
      this.tilesWithUnits = tilesWithUnits;
    }
  }

  private async sync() {
    await this.fetch();
  }

  /** Participant connects to match instance */
  public async connect(socket: Socket, userId: User['id']) {
    await this.fetch();

    if (!this.players) {
      throw new Error(
        `User with id ${userId} is no participant in match ${this.id}`,
      );
    }
    const userIsParticipant = this.players.some(
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

  public async setGameSettings(
    settings: Omit<Partial<GameSettings>, 'id' | 'matchId'>,
  ) {
    this.gameSettings = await prisma.gameSettings.update({
      where: { matchId: this.id },
      data: settings,
    });
    return this.gameSettings;
  }

  private checkConditionsForCreation(userId: string): { error?: Error } {
    if (this.match.status === MatchStatus.STARTED) {
      return {
        error: { message: 'Match has already started', statusCode: 400 },
      };
    }
    if (this.match.createdById !== userId) {
      return {
        error: {
          message: "Only the match's creator can start the match",
          statusCode: 400,
        },
      };
    }
    if (!this.map) {
      return { error: { message: 'No map', statusCode: 500 } };
    }
    if (!this.players) {
      return { error: { message: 'Players array is null', statusCode: 500 } };
    }
    if (this.players.length < 2) {
      return { error: { message: 'Match is not full yet', statusCode: 400 } };
    }
    if (!this.gameSettings) {
      return { error: { message: 'No game settings', statusCode: 500 } };
    }

    const isMapSizeEven = this.gameSettings.mapSize % 2 === 0;
    if (isMapSizeEven) {
      return {
        error: {
          message: 'mapSize needs to be an odd integer',
          statusCode: 400,
        },
      };
    }

    return {};
  }

  public async startMatch(userId: User['id']) {
    await this.sync();
    const { error: startError } = this.checkConditionsForCreation(userId);

    if (startError) {
      return startError;
    }

    const status = MatchStatus.STARTED;
    const startedAt = new Date();

    const activePlayerId = this.players!.find(
      (player) => player.userId === userId,
    )?.id;

    const openCards = shuffleArray<UnitConstellation>(
      Object.values({ ...UnitConstellation }),
    ).slice(0, 3);

    const turn = 1;

    this.match = await prisma.match.update({
      where: { id: this.match.id },
      data: {
        openCards,
        status,
        startedAt,
        activePlayerId,
        turn,
      },
    });

    return this.match;
  }

  public async makeMove(
    participantId: Participant['id'],
    targetRow: Coordinate[0],
    targetCol: Coordinate[1],
    ignoredRules: PlacementRuleName[],
    unitConstellation: IUnitConstellation,
    specials: Special[],
  ): Promise<
    | {
        updatedMatch: Match;
        updatedTilesWithUnits: TileWithUnit[];
        updatedPlayers: Participant[];
      }
    | Error
  > {
    await this.sync();

    if (!this.map) {
      return { message: 'Map is missing', statusCode: 500 };
    }

    if (!this.activePlayer) {
      return { message: 'Active player is not set', statusCode: 500 };
    }

    if (!this.tilesWithUnits) {
      return { message: 'No tiles', statusCode: 500 };
    }

    const currentBonusPoints =
      this.activePlayer.bonusPoints + unitConstellation.value;

    const canAffordSpecials =
      currentBonusPoints >=
      specials.reduce((totalCost, special) => {
        return totalCost + special.cost;
      }, 0);

    if (!canAffordSpecials) {
      return {
        message: 'Not enough bonus points for specials',
        statusCode: 400,
      };
    }

    const tileLookup = getTileLookup(this.tilesWithUnits);
    const { translatedCoordinates, error } =
      checkConditionsForUnitConstellationPlacement(
        [targetRow, targetCol],
        unitConstellation,
        this.match,
        this.activePlayer,
        this.map,
        this.tilesWithUnits,
        tileLookup,
        ignoredRules,
        participantId,
        specials,
      );

    if (error) {
      return error;
    }

    const { tiles: revealedTiles, error: revealedError } =
      getNewlyRevealedTiles(tileLookup, translatedCoordinates);

    if (revealedError) {
      return revealedError;
    }

    const updateTilesPromises: Prisma.Prisma__TileClient<
      TileWithUnit,
      never
    >[] = [];
    translatedCoordinates.forEach((coordinate) => {
      const { mapId, row, col } = tileLookup[buildTileLookupId(coordinate)];
      updateTilesPromises.push(
        prisma.tile.update({
          where: { mapId_row_col: { mapId, row, col } },
          data: {
            unit: { create: { type: UnitType.UNIT, ownerId: participantId } },
          },
          include: { unit: true },
        }),
      );
    });
    revealedTiles.forEach(({ mapId, row, col }) => {
      updateTilesPromises.push(
        prisma.tile.update({
          where: {
            mapId_row_col: { mapId, row, col },
          },
          data: {
            visible: true,
          },
          include: { unit: true },
        }),
      );
    });
    const updatedTilesWithUnits = await Promise.all(updateTilesPromises);
    const matchWithPlacedTiles = await prisma.match.findUnique({
      where: { id: this.match.id },
      ...matchRich,
    });

    if (
      !matchWithPlacedTiles ||
      !matchWithPlacedTiles.activePlayer ||
      !matchWithPlacedTiles.map
    ) {
      return { message: 'Match could not be fetched', statusCode: 500 };
    }

    if (!this.activePlayer) {
      return { message: 'Error while placing', statusCode: 500 };
    }
    const gameType = createCustomGame(this.gameSettings?.rules ?? null);
    const playersWithUpdatedScore = gameType.evaluate(matchWithPlacedTiles);

    const updatedPlayers: Participant[] = [];
    for (let i = 0; i < playersWithUpdatedScore.length; i++) {
      const player = playersWithUpdatedScore[i];

      const bonusPointsFromCard = unitConstellation.value;

      const usedPointsFromSpecials = specials.reduce((totalCost, special) => {
        return totalCost + special.cost;
      }, 0);

      updatedPlayers.push(
        await prisma.participant.update({
          where: { id: player.id },
          data: {
            score: player.score,
            ...(player.id === this.activePlayer.id
              ? {
                  bonusPoints:
                    this.activePlayer.bonusPoints +
                    bonusPointsFromCard -
                    usedPointsFromSpecials,
                }
              : {}),
          },
        }),
      );
    }
    this.players = updatedPlayers;

    const winnerId =
      determineWinner(this.match, this.gameSettings, playersWithUpdatedScore)
        ?.id ?? null;

    const shouldChangeActivePlayer = gameType.shouldChangeActivePlayer(
      this.match.turn,
    );

    const shouldChangeCards = gameType.shouldChangeCards(this.match.turn);

    const openCards = shouldChangeCards
      ? gameType.changedCards()
      : matchWithPlacedTiles.openCards;

    const nextActivePlayerId = shouldChangeActivePlayer
      ? matchWithPlacedTiles.players.find(
          (player) => player.id !== matchWithPlacedTiles.activePlayerId,
        )?.id
      : matchWithPlacedTiles.activePlayerId;

    if (!nextActivePlayerId) {
      return { message: 'Error while changing turns', statusCode: 500 };
    }

    this.match = await prisma.match.update({
      where: { id: this.match.id },
      data: {
        openCards,
        activePlayerId: nextActivePlayerId,
        turn: { increment: 1 },
        ...(isLastTurn(this.match, this.gameSettings) || winnerId
          ? { winnerId, status: MatchStatus.FINISHED, finishedAt: new Date() }
          : {}),
      },
    });
    return { updatedMatch: this.match, updatedTilesWithUnits, updatedPlayers };
  }

  private async changeTurn(args: any) {
    const turnTime = 30; // @todo
    const nextPlayerId = this.players?.find(
      (p) => p.playerNumber !== this.activePlayer?.playerNumber,
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
