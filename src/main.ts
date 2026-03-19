import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.setGlobalPrefix('api');

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // DTO에 없는 프로퍼티 제거
      forbidNonWhitelisted: true, // DTO에 없는 프로퍼티 요청 시 400 에러
      transform: true, // 요청 데이터를 DTO 타입으로 자동 변환
    }),
  );

  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(new ResponseInterceptor());

  //swagger
  const config = new DocumentBuilder()
    .setTitle('API 문서')
    .setDescription('NestJS API 자동화 문서')
    .setVersion('1.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        name: 'Authorization',
        in: 'header',
      },
      'access-token', // 보안 스키마 이름 (컨트롤러에서 @ApiBearerAuth('access-token') 으로 사용)
    )
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('/api/v1/docs', app, document, {
    swaggerOptions: {
      persistAuthorization: true, // 페이지 새로고침 후에도 인증 유지
    },
  });

  await app.listen(process.env.PORT ?? 3000);

  console.log('Server running on http://localhost:3000');
  console.log('Swagger docs: http://localhost:3000/docs');
}
bootstrap();
