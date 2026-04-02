import { Body, Controller, Delete, Get, Patch, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserService } from './user.service.js';
import { UserResponseDto } from './dto/user-response.dto.js';
import { UpdateUserDto } from './dto/update-user.dto.js';
import { ApiCommonResponse } from '../common/decorators/api-common-response.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import type { CurrentUserPayload } from '../common/decorators/current-user.decorator.js';
import { AuthService } from '../auth/auth.service.js';

@ApiTags('User')
@Controller('user')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('access-token')
export class UserController {
  constructor(
    private readonly userService: UserService,
    private readonly authService: AuthService,
  ) {}

  @Get('me')
  @ApiOperation({ summary: '내 정보 조회' })
  @ApiCommonResponse({ type: UserResponseDto, description: '내 정보 조회 성공' })
  async getMe(@CurrentUser() user: CurrentUserPayload): Promise<UserResponseDto> {
    const found = await this.userService.findById(user.id);
    return {
      id: found!.id,
      email: found!.email,
      nickname: found!.nickname,
      createdAt: found!.createdAt,
    };
  }

  @Patch('me')
  @ApiOperation({ summary: '내 정보 수정' })
  @ApiCommonResponse({ type: UserResponseDto, description: '내 정보 수정 성공' })
  async updateMe(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: UpdateUserDto,
  ): Promise<UserResponseDto> {
    const updated = await this.userService.update(user.id, dto);
    return {
      id: updated.id,
      email: updated.email,
      nickname: updated.nickname,
      createdAt: updated.createdAt,
    };
  }

  @Delete('me')
  @ApiOperation({ summary: '회원 탈퇴' })
  @ApiCommonResponse({ description: '회원 탈퇴 성공' })
  async deleteMe(@CurrentUser() user: CurrentUserPayload): Promise<void> {
    await this.authService.revokeAllTokens(user.id, user.jti, user.exp);
    await this.userService.remove(user.id);
  }
}
