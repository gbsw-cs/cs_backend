import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';
import { UserService } from '../user/user.service.js';
import { LoginDto } from './dto/login.dto.js';
import { TokenResponseDto } from './dto/token-response.dto.js';
import { CreateUserDto } from '../user/dto/create-user.dto.js';
import { RefreshToken } from './entities/refresh-token.entity.js';
import { TokenBlacklistService } from './token-blacklist.service.js';
import { JwtPayload } from './strategies/jwt.strategy.js';

@Injectable()
export class AuthService {
  constructor(
    private readonly userService: UserService,
    private readonly jwtService: JwtService,
    private readonly tokenBlacklistService: TokenBlacklistService,
    @InjectRepository(RefreshToken)
    private readonly refreshTokenRepository: Repository<RefreshToken>,
  ) {}

  async register(dto: CreateUserDto): Promise<TokenResponseDto> {
    const user = await this.userService.create(dto);
    return this.generateAndSaveTokens(user.id, user.email);
  }

  async login(dto: LoginDto): Promise<TokenResponseDto> {
    const user = await this.userService.findByEmail(dto.email);
    if (!user) {
      throw new UnauthorizedException('이메일 또는 비밀번호가 일치하지 않습니다.');
    }

    const isPasswordValid = await bcrypt.compare(dto.password, user.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('이메일 또는 비밀번호가 일치하지 않습니다.');
    }

    return this.generateAndSaveTokens(user.id, user.email);
  }

  async refresh(refreshToken: string): Promise<TokenResponseDto> {
    const stored = await this.refreshTokenRepository.findOne({
      where: { token: refreshToken },
    });

    if (!stored || stored.expiresAt < new Date()) {
      if (stored) {
        await this.refreshTokenRepository.remove(stored);
      }
      throw new UnauthorizedException('유효하지 않거나 만료된 Refresh Token입니다.');
    }

    const user = await this.userService.findById(stored.userId);
    if (!user) {
      throw new UnauthorizedException('유효하지 않은 토큰입니다.');
    }

    // 기존 refresh token 삭제 (토큰 회전)
    await this.refreshTokenRepository.remove(stored);

    return this.generateAndSaveTokens(user.id, user.email);
  }

  async logout(jti: string, exp: number, userId: number): Promise<void> {
    // Access token 블랙리스트 등록
    const ttl = exp - Math.floor(Date.now() / 1000);
    if (ttl > 0) {
      await this.tokenBlacklistService.blacklist(jti, ttl);
    }

    // 해당 유저의 모든 refresh token 삭제
    await this.refreshTokenRepository.delete({ userId });
  }

  async revokeAllTokens(userId: number, jti: string, exp: number): Promise<void> {
    const ttl = exp - Math.floor(Date.now() / 1000);
    if (ttl > 0) {
      await this.tokenBlacklistService.blacklist(jti, ttl);
    }

    await this.refreshTokenRepository.delete({ userId });
  }

  private async generateAndSaveTokens(userId: number, email: string): Promise<TokenResponseDto> {
    const jti = uuidv4();

    const payload: JwtPayload = { sub: userId, email, jti };

    const accessToken = this.jwtService.sign(payload, {
      secret: process.env.JWT_SECRET ?? 'default-secret-key',
      expiresIn: '30m',
    });

    const refreshToken = uuidv4();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    await this.refreshTokenRepository.save(
      this.refreshTokenRepository.create({
        token: refreshToken,
        userId,
        expiresAt,
      }),
    );

    return { accessToken, refreshToken };
  }
}
