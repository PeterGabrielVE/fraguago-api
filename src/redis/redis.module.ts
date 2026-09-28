import { Global, Module } from '@nestjs/common';
import { PubSubService } from './pubsub.service';

// Global: cualquier módulo puede inyectar PubSubService sin importarlo.
@Global()
@Module({
  providers: [PubSubService],
  exports: [PubSubService],
})
export class RedisModule {}
