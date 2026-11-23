import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { DataSource, Repository } from 'typeorm';
import { Role } from '../../common/enums/role.enum';
import { User } from '../users/user.entity';
import { Wallet } from '../wallets/wallet.entity';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  const users = { existsBy: jest.fn(), findOne: jest.fn() };
  const manager = {
    create: jest.fn((_entity: unknown, data: object) => ({ ...data })),
    save: jest.fn((entity: object) =>
      Promise.resolve({ id: 1, createdAt: new Date('2026-11-23T10:00:00Z'), ...entity }),
    ),
  };
  const dataSource = {
    transaction: jest.fn((work: (m: typeof manager) => unknown) => work(manager)),
  };
  const jwt = { signAsync: jest.fn().mockResolvedValue('signed.jwt.token') };
  const config = {
    get: jest.fn((key: string, fallback: unknown) => (key === 'BCRYPT_ROUNDS' ? 4 : fallback)),
  };

  let service: AuthService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new AuthService(
      users as unknown as Repository<User>,
      dataSource as unknown as DataSource,
      jwt as unknown as JwtService,
      config as unknown as ConfigService,
    );
  });

  describe('register', () => {
    const dto = { fullName: 'Alice', email: 'alice@paylite.tn', password: 'Passw0rd!' };

    it('rejects an email that is already registered', async () => {
      users.existsBy.mockResolvedValue(true);

      await expect(service.register(dto)).rejects.toThrow(ConflictException);
      expect(dataSource.transaction).not.toHaveBeenCalled();
    });

    it('stores a bcrypt hash and creates an empty TND wallet in the same transaction', async () => {
      users.existsBy.mockResolvedValue(false);

      const profile = await service.register(dto);

      const savedUser = manager.save.mock.calls[0][0] as User;
      expect(savedUser.passwordHash).not.toBe(dto.password);
      await expect(bcrypt.compare(dto.password, savedUser.passwordHash)).resolves.toBe(true);
      expect(savedUser.role).toBe(Role.USER);

      const savedWallet = manager.save.mock.calls[1][0] as Wallet;
      expect(savedWallet).toMatchObject({ userId: 1, balance: 0, currency: 'TND' });

      expect(profile).toMatchObject({ email: dto.email, wallet: { balance: 0 } });
      expect(profile).not.toHaveProperty('passwordHash');
    });
  });

  describe('login', () => {
    it('returns a bearer token for valid credentials', async () => {
      const passwordHash = await bcrypt.hash('Passw0rd!', 4);
      users.findOne.mockResolvedValue({
        id: 1,
        email: 'alice@paylite.tn',
        role: Role.USER,
        passwordHash,
      });

      const result = await service.login({ email: 'alice@paylite.tn', password: 'Passw0rd!' });

      expect(result).toEqual({
        accessToken: 'signed.jwt.token',
        tokenType: 'Bearer',
        expiresIn: 3600,
      });
      expect(jwt.signAsync).toHaveBeenCalledWith({
        sub: 1,
        email: 'alice@paylite.tn',
        role: Role.USER,
      });
    });

    it('rejects a wrong password', async () => {
      users.findOne.mockResolvedValue({
        id: 1,
        email: 'alice@paylite.tn',
        role: Role.USER,
        passwordHash: await bcrypt.hash('Passw0rd!', 4),
      });

      await expect(
        service.login({ email: 'alice@paylite.tn', password: 'wrong-pass1' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('gives the same error for an unknown email', async () => {
      users.findOne.mockResolvedValue(null);

      await expect(
        service.login({ email: 'ghost@paylite.tn', password: 'Passw0rd!' }),
      ).rejects.toThrow('Invalid email or password');
    });
  });
});
