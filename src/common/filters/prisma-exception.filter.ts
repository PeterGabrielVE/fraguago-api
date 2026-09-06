import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { Prisma } from '@prisma/client';
import { Request } from 'express';
import { ErrorResponse } from '../interfaces/error-response.interface';

@Catch(
  Prisma.PrismaClientKnownRequestError,
  Prisma.PrismaClientValidationError,
)
export class PrismaExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(PrismaExceptionFilter.name);

  constructor(private readonly httpAdapterHost: HttpAdapterHost) {}

  catch(
    exception:
      | Prisma.PrismaClientKnownRequestError
      | Prisma.PrismaClientValidationError,
    host: ArgumentsHost,
  ): void {
    const { httpAdapter } = this.httpAdapterHost;
    const ctx = host.switchToHttp();
    const request = ctx.getRequest<Request>();

    let httpStatus = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Error de base de datos';
    let error = 'PrismaError';

    // Query mal formada: falta un campo o el tipo no coincide.
    if (exception instanceof Prisma.PrismaClientValidationError) {
      httpStatus = HttpStatus.BAD_REQUEST;
      message = 'Datos inválidos o incompletos en la petición';
      error = 'Prisma:ValidationError';

      this.logger.error(
        `${request.method} ${request.url} -> ValidationError`,
        exception.stack,
      );

      const body: ErrorResponse = {
        statusCode: httpStatus,
        timestamp: new Date().toISOString(),
        path: request.url,
        method: request.method,
        error,
        message,
      };
      httpAdapter.reply(ctx.getResponse(), body, httpStatus);
      return;
    }

    // A partir de aquí: PrismaClientKnownRequestError (P2xxx)
    switch (exception.code) {
      case 'P2002': {
        httpStatus = HttpStatus.CONFLICT;
        const fields = (exception.meta?.target as string[])?.join(', ');
        message = `Ya existe un registro con ${fields ?? 'ese valor'}`;
        break;
      }
      case 'P2025': {
        httpStatus = HttpStatus.NOT_FOUND;
        message =
          (exception.meta?.cause as string) ?? 'Registro no encontrado';
        break;
      }
      case 'P2003': {
        httpStatus = HttpStatus.BAD_REQUEST;
        message = 'El registro relacionado no existe';
        break;
      }
      case 'P2011': {
        httpStatus = HttpStatus.BAD_REQUEST;
        message = 'Faltan campos obligatorios';
        break;
      }
      case 'P2014': {
        httpStatus = HttpStatus.BAD_REQUEST;
        message = 'La operación viola una relación requerida';
        break;
      }
      default: {
        httpStatus = HttpStatus.INTERNAL_SERVER_ERROR;
        message = 'Error inesperado de base de datos';
      }
    }

    const body: ErrorResponse = {
      statusCode: httpStatus,
      timestamp: new Date().toISOString(),
      path: request.url,
      method: request.method,
      error: `Prisma:${exception.code}`,
      message,
    };

    this.logger.error(
      `${request.method} ${request.url} -> ${exception.code}`,
      exception.stack,
    );

    httpAdapter.reply(ctx.getResponse(), body, httpStatus);
  }
}