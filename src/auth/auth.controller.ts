import { Body, Controller, Delete, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthService } from './auth.service.js';
import { LoginDto } from './dto/login.dto.js';
import { RefreshTokenDto } from './dto/refresh-token.dto.js';
import { TokenResponseDto } from './dto/token-response.dto.js';
import { CreateUserDto } from '../user/dto/create-user.dto.js';
import { ApiCommonResponse } from '../common/decorators/api-common-response.decorator.js';
import { JwtAuthGuard } from './guards/jwt-auth.guard.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import type { CurrentUserPayload } from '../common/decorators/current-user.decorator.js';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @ApiOperation({ summary: '회원가입' })
  @ApiCommonResponse({ type: TokenResponseDto, status: 201, description: '회원가입 성공' })
  async register(@Body() dto: CreateUserDto): Promise<TokenResponseDto> {
    return this.authService.register(dto);
  }

  @Post('login')
  @ApiOperation({ summary: '로그인' })
  @ApiCommonResponse({ type: TokenResponseDto, description: '로그인 성공' })
  async login(@Body() dto: LoginDto): Promise<TokenResponseDto> {
    return this.authService.login(dto);
  }

  @Post('refresh')
  @ApiOperation({ summary: '토큰 갱신' })
  @ApiCommonResponse({ type: TokenResponseDto, description: '토큰 갱신 성공' })
  async refresh(@Body() dto: RefreshTokenDto): Promise<TokenResponseDto> {
    return this.authService.refresh(dto.refreshToken);
  }

  @Delete('logout')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: '로그아웃' })
  @ApiCommonResponse({ description: '로그아웃 성공' })
  async logout(@CurrentUser() user: CurrentUserPayload): Promise<void> {
    await this.authService.logout(user.jti, user.exp, user.id);
  }
}
