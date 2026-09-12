import { Module } from '@nestjs/common';
import { RemindersService } from './reminders.service';
import { RemindersController } from './reminders.controller';
import { AuthModule } from '../../auth/auth.module';
import { SystemPrismaService } from 'src/prisma/system-prisma.service';
import { WhatsappService } from './whatsapp.service';

@Module({ imports: [AuthModule], controllers: [RemindersController], providers: [RemindersService, SystemPrismaService, WhatsappService] })
export class RemindersModule {}
