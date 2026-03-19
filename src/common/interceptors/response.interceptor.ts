import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Response } from 'express';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { ApiResponse } from '../dto/api-response.dto';

interface DataWithMessage {
  message: string;
  data: unknown;
}

function isDataWithMessage(value: unknown): value is DataWithMessage {
  return (
    typeof value === 'object' &&
    value !== null &&
    'message' in value &&
    'data' in value &&
    typeof (value as Record<string, unknown>).message === 'string'
  );
}

@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<
  T,
  ApiResponse<T>
> {
  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<ApiResponse<T>> {
    const ctx = context.switchToHttp();
    const response = ctx.getResponse<Response>();

    return next.handle().pipe(
      map((data: T) => {
        if (data instanceof ApiResponse) {
          return data;
        }

        // ex) return { message: '생성되었습니다.', data: user }
        if (isDataWithMessage(data)) {
          return new ApiResponse<T>(
            data.data as T,
            data.message,
            response.statusCode,
          );
        }

        return new ApiResponse<T>(
          data,
          '요청이 성공적으로 처리되었습니다.',
          response.statusCode,
        );
      }),
    );
  }
}
