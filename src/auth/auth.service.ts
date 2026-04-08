import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service.js';
import { SignupDto } from './dto/signup.dto.js';
import { LoginDto } from './dto/login.dto.js';
import { TokenResponseDto } from './dto/token-response.dto.js';
import { TokenBlacklistService } from './token-blacklist.service.js';
import { GoogleProfile } from './strategies/google.strategy.js';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly tokenBlacklistService: TokenBlacklistService,
  ) {}

  async signup(dto: SignupDto): Promise<TokenResponseDto> {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (existing) {
      throw new ConflictException('이미 사용 중인 이메일입니다.');
    }

    const hashedPassword = await bcrypt.hash(dto.password, 10);

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        password: hashedPassword,
        name: dto.name,
        profileImg: dto.profileImg,
      },
    });

    return this.generateTokens(user.id, user.email, user.name);
  }

  async login(dto: LoginDto): Promise<TokenResponseDto> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (!user) {
      throw new UnauthorizedException(
        '이메일 또는 비밀번호가 올바르지 않습니다.',
      );
    }

    if (!user.password) {
      throw new UnauthorizedException('소셜 로그인으로 가입된 계정입니다.');
    }

    const isPasswordValid = await bcrypt.compare(dto.password, user.password);

    if (!isPasswordValid) {
      throw new UnauthorizedException(
        '이메일 또는 비밀번호가 올바르지 않습니다.',
      );
    }

    return this.generateTokens(user.id, user.email, user.name);
  }

  async googleLogin(profile: GoogleProfile): Promise<TokenResponseDto> {
    let user = await this.prisma.user.findFirst({
      where: { provider: 'google', providerId: profile.providerId },
    });

    if (!user) {
      const existingByEmail = await this.prisma.user.findUnique({
        where: { email: profile.email },
      });
      if (existingByEmail) {
        throw new ConflictException('이미 다른 방식으로 가입된 이메일입니다.');
      }

      user = await this.prisma.user.create({
        data: {
          email: profile.email,
          name: profile.name,
          provider: 'google',
          providerId: profile.providerId,
        },
      });
    }

    return this.generateTokens(user.id, user.email, user.name);
  }

  async refresh(refreshToken: string): Promise<TokenResponseDto> {
    const stored = await this.prisma.refreshToken.findUnique({
      where: { token: refreshToken },
      include: { user: true },
    });

    if (!stored || stored.expiresAt < new Date()) {
      if (stored) {
        await this.prisma.refreshToken.delete({ where: { id: stored.id } });
      }
      throw new UnauthorizedException('유효하지 않은 리프레시 토큰입니다.');
    }

    await this.prisma.refreshToken.delete({ where: { id: stored.id } });

    return this.generateTokens(
      stored.user.id,
      stored.user.email,
      stored.user.name,
    );
  }

  async logout(userId: string, accessToken: string): Promise<void> {
    await this.blacklistAccessToken(accessToken);

    await this.prisma.refreshToken.deleteMany({
      where: { userId },
    });
  }

  async withdraw(userId: string, accessToken: string): Promise<void> {
    await this.blacklistAccessToken(accessToken);

    // Cascade로 RefreshToken도 함께 삭제됨
    await this.prisma.user.delete({
      where: { id: userId },
    });
  }

  private async blacklistAccessToken(token: string): Promise<void> {
    const decoded = this.jwtService.decode(token);
    if (decoded?.exp) {
      const ttl = decoded.exp - Math.floor(Date.now() / 1000);
      if (ttl > 0) {
        await this.tokenBlacklistService.blacklist(token, ttl);
      }
    }
  }

  private async generateTokens(
    userId: string,
    email: string,
    name: string,
  ): Promise<TokenResponseDto> {
    const isDev = this.configService.get('NODE_ENV') !== 'production';

    const accessTokenExpiresIn = isDev ? '1h' : '5m';
    const refreshTokenExpiresIn = isDev ? '1d' : '1h';

    const payload = { sub: userId, email, name };

    const accessToken = this.jwtService.sign(payload, {
      expiresIn: accessTokenExpiresIn,
    });

    const refreshToken = this.jwtService.sign(payload, {
      expiresIn: refreshTokenExpiresIn,
    });

    const refreshExpiresAt = isDev
      ? new Date(Date.now() + 24 * 60 * 60 * 1000)
      : new Date(Date.now() + 60 * 60 * 1000);

    await this.prisma.refreshToken.create({
      data: {
        token: refreshToken,
        userId,
        expiresAt: refreshExpiresAt,
      },
    });

    return { accessToken, refreshToken };
  }
}
