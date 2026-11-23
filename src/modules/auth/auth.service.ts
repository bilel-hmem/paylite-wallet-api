import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { DataSource, Repository } from 'typeorm';
import { Role } from '../../common/enums/role.enum';
import { JwtPayload } from '../../common/interfaces/auth-user.interface';
import { User } from '../users/user.entity';
import { Wallet, WalletStatus } from '../wallets/wallet.entity';
import { LoginResponse, toUserProfile, UserProfile } from './auth.types';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

@Injectable()
export class AuthService {
  private readonly bcryptRounds: number;
  private readonly expiresIn: number;
  /** Compared against when the email is unknown, so both failure paths take the same time. */
  private readonly dummyHash: string;

  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly dataSource: DataSource,
    private readonly jwt: JwtService,
    config: ConfigService,
  ) {
    this.bcryptRounds = config.get<number>('BCRYPT_ROUNDS', 10);
    this.expiresIn = config.get<number>('JWT_EXPIRES_IN_SECONDS', 3600);
    this.dummyHash = bcrypt.hashSync('timing-attack-protection', this.bcryptRounds);
  }

  /** Creates the user and their TND wallet atomically: no user can exist without a wallet. */
  async register(dto: RegisterDto): Promise<UserProfile> {
    if (await this.users.existsBy({ email: dto.email })) {
      throw new ConflictException('Email is already registered');
    }
    const passwordHash = await bcrypt.hash(dto.password, this.bcryptRounds);

    return this.dataSource.transaction(async (manager) => {
      const user = await manager.save(
        manager.create(User, {
          fullName: dto.fullName,
          email: dto.email,
          passwordHash,
          role: Role.USER,
        }),
      );
      const wallet = await manager.save(
        manager.create(Wallet, {
          userId: user.id,
          balance: 0,
          currency: 'TND',
          status: WalletStatus.ACTIVE,
        }),
      );
      return toUserProfile(user, wallet);
    });
  }

  async login(dto: LoginDto): Promise<LoginResponse> {
    const user = await this.users.findOne({
      where: { email: dto.email },
      select: { id: true, email: true, role: true, passwordHash: true },
    });
    const passwordMatches = await bcrypt.compare(
      dto.password,
      user?.passwordHash ?? this.dummyHash,
    );
    if (!user || !passwordMatches) {
      // Same message for both cases: never reveal which emails are registered.
      throw new UnauthorizedException('Invalid email or password');
    }

    const payload: JwtPayload = { sub: user.id, email: user.email, role: user.role };
    return {
      accessToken: await this.jwt.signAsync(payload),
      tokenType: 'Bearer',
      expiresIn: this.expiresIn,
    };
  }

  async me(userId: number): Promise<UserProfile> {
    const user = await this.users.findOne({ where: { id: userId }, relations: { wallet: true } });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return toUserProfile(user, user.wallet ?? null);
  }
}
