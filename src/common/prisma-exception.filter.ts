import {
  ArgumentsHost,
  Catch,
  ConflictException,
  ExceptionFilter,
  HttpException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Response } from 'express';

@Catch(Prisma.PrismaClientKnownRequestError)
export class PrismaExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(PrismaExceptionFilter.name);

  catch(exception: Prisma.PrismaClientKnownRequestError, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();

    let httpError: HttpException;

    switch (exception.code) {
      case 'P2002': {
        // Unique constraint violation
        const fields = (exception.meta?.target as string[])?.join(', ') ?? 'field';
        httpError = new ConflictException(
          `A record with this ${fields} already exists`,
        );
        break;
      }
      case 'P2025': {
        // Record not found (para update/delete de algo inexistente)
        httpError = new NotFoundException('Record not found');
        break;
      }
      case 'P2003': {
        // Foreign key constraint
        httpError = new ConflictException('Related record constraint failed');
        break;
      }
      default: {
        // Error de Prisma no mapeado → lo dejamos como 500 pero lo LOGUEAMOS
        this.logger.error(
          `Unhandled Prisma error ${exception.code}: ${exception.message}`,
        );
        res.status(500).json({
          statusCode: 500,
          message: 'Internal server error',
        });
        return;
      }
    }

    const status = httpError.getStatus();
    res.status(status).json({
      statusCode: status,
      message: httpError.message,
      error: httpError.name,
    });
  }
}