import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { AuthModule } from 'src/auth/auth.module';


@Module({
  imports: [AuthModule], // para inyectar PasswordService
  controllers: [UsersController],
  providers: [UsersService],
})
export class UsersModule {}