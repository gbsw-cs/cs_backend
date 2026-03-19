import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { ApiErrorResponse } from '../dto/api-response.dto';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    //default 500
    let statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = '서버 내부 오류가 발생했습니다.';
    let error = 'Internal Server Error';
    let validationErrors: string[] | undefined;

    if (exception instanceof HttpException) {
      statusCode = exception.getStatus(); //error code
      const exceptionResponse = exception.getResponse();

      if (typeof exceptionResponse === 'string') {
        message = exceptionResponse;
      } else if (typeof exceptionResponse === 'object') {
        const res = exceptionResponse as Record<string, unknown>;

        // ValidationPipe
        if (Array.isArray(res.message)) {
          validationErrors = res.message as string[];
          message = '입력값이 올바르지 않습니다.';
        } else {
          message = (res.message as string) ?? message;
        }

        error = (res.error as string) ?? error;
      }
    } else if (exception instanceof Error) {
      message = exception.message;
      this.logger.error(
        `Unhandled Error: ${exception.message}`,
        exception.stack,
      );
    }

    const errorBody = new ApiErrorResponse(
      statusCode,
      message,
      request.url,
      error,
      validationErrors,
    );

    this.logger.error(
      `[${request.method}] ${request.url} → ${statusCode}: ${message}`,
    );

    response.status(statusCode).json(errorBody);
  }
}
