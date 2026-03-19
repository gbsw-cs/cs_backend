import { ApiProperty } from '@nestjs/swagger';

export class ApiResponse<T> {
  @ApiProperty({ example: true })
  success: boolean;

  @ApiProperty({ example: 200 })
  statusCode: number;

  @ApiProperty({ example: '요청이 성공적으로 처리되었습니다.' })
  message: string;

  @ApiProperty()
  data: T;

  @ApiProperty({ example: '2024-01-01T00:00:00.000Z' })
  timestamp: string;

  constructor(
    data: T,
    message = '요청이 성공적으로 처리되었습니다.',
    statusCode = 200,
  ) {
    this.success = true;
    this.statusCode = statusCode;
    this.message = message;
    this.data = data;
    this.timestamp = new Date().toISOString();
  }
}

export class ApiErrorResponse {
  @ApiProperty({ example: false })
  success: boolean;

  @ApiProperty({ example: 400 })
  statusCode: number;

  @ApiProperty({ example: '요청이 올바르지 않습니다.' })
  message: string;

  @ApiProperty({ example: 'Bad Request', required: false })
  error?: string;

  @ApiProperty({
    example: ['name must be a string'],
    required: false,
    type: [String],
  })
  validationErrors?: string[];

  @ApiProperty({ example: '2024-01-01T00:00:00.000Z' })
  timestamp: string;

  @ApiProperty({ example: '/api/users' })
  path: string;

  constructor(
    statusCode: number,
    message: string,
    path: string,
    error?: string,
    validationErrors?: string[],
  ) {
    this.success = false;
    this.statusCode = statusCode;
    this.message = message;
    this.error = error;
    this.validationErrors = validationErrors;
    this.timestamp = new Date().toISOString();
    this.path = path;
  }
}
