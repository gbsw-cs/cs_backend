import { applyDecorators, Type } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiCreatedResponse,
  ApiBadRequestResponse,
  ApiUnauthorizedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiInternalServerErrorResponse,
  getSchemaPath,
  ApiExtraModels,
} from '@nestjs/swagger';
import { ApiResponse, ApiErrorResponse } from '../dto/api-response.dto';

/**
 * 공통 응답 형식을 포함한 Swagger 문서 데코레이터
 *
 * 사용법:
 * @ApiCommonResponse({ type: UserDto })               // 200 OK
 * @ApiCommonResponse({ type: UserDto, isArray: true }) // 200 OK (배열)
 * @ApiCommonResponse({ type: UserDto, status: 201 })  // 201 Created
 */
export function ApiCommonResponse<T extends Type<unknown>>(options: {
  type?: T;
  isArray?: boolean;
  status?: 200 | 201;
  description?: string;
}) {
  const { type, isArray = false, status = 200, description } = options;

  const dataSchema = type
    ? isArray
      ? { type: 'array', items: { $ref: getSchemaPath(type) } }
      : { $ref: getSchemaPath(type) }
    : { nullable: true, example: null };

  const successSchema = {
    allOf: [
      { $ref: getSchemaPath(ApiResponse) },
      {
        properties: {
          data: dataSchema,
        },
      },
    ],
  };

  const successDecorator =
    status === 201
      ? ApiCreatedResponse({
          description: description ?? '생성 성공',
          schema: successSchema,
        })
      : ApiOkResponse({
          description: description ?? '요청 성공',
          schema: successSchema,
        });

  const extras = [
    type ? ApiExtraModels(ApiResponse, type) : ApiExtraModels(ApiResponse),
    successDecorator,
    ApiBadRequestResponse({
      description: '잘못된 요청',
      type: ApiErrorResponse,
    }),
    ApiUnauthorizedResponse({
      description: '인증 실패',
      type: ApiErrorResponse,
    }),
    ApiForbiddenResponse({ description: '권한 없음', type: ApiErrorResponse }),
    ApiNotFoundResponse({ description: '리소스 없음', type: ApiErrorResponse }),
    ApiInternalServerErrorResponse({
      description: '서버 오류',
      type: ApiErrorResponse,
    }),
  ];

  return applyDecorators(...extras);
}
