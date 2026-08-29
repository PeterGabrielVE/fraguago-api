import { Module } from '@nestjs/common';
import { ConceptsService } from './concepts.service';
import { ConceptsController } from './concepts.controller';
import { AuthModule } from '../../auth/auth.module';

@Module({ imports: [AuthModule], controllers: [ConceptsController], providers: [ConceptsService] })
export class ConceptsModule {}
