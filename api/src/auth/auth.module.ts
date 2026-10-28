import {
  Body,
  Controller,
  Global,
  HttpCode,
  Module,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { IsEmail, IsString } from 'class-validator';

import { PrismaService } from '../prisma/prisma.service';
import { AdminGuard } from './admin.guard';
import { checkPassword } from './password';

class LoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  password!: string;
}

@Controller('auth')
class AuthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  @Post('login')
  @HttpCode(200)
  async login(@Body() dto: LoginDto) {
    const admin = await this.prisma.admin.findUnique({ where: { email: dto.email } });
    // Same answer for an unknown email and a wrong password.
    if (!admin || !(await checkPassword(dto.password, admin.passwordHash))) {
      throw new UnauthorizedException('wrong email or password');
    }
    return { token: await this.jwt.signAsync({ sub: admin.id }) };
  }
}

@Global()
@Module({
  imports: [
    JwtModule.registerAsync({
      useFactory: () => ({
        secret: process.env.JWT_SECRET,
        signOptions: { expiresIn: '12h' },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AdminGuard],
  exports: [AdminGuard, JwtModule],
})
export class AuthModule {}
