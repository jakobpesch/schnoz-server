import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { EventsModule } from './events/events.module';
import { MatchModule } from './services/match/match.module';
import { EventEmitterModule } from '@nestjs/event-emitter';

@Module({
  imports: [EventEmitterModule.forRoot(), MatchModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
