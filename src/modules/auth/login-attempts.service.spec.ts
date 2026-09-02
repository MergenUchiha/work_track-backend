import { ConfigService } from '@nestjs/config';
import { HttpException } from '@nestjs/common';
import { LoginAttemptsService } from './login-attempts.service';

const buildService = (overrides: Record<string, number> = {}) => {
  const settings: Record<string, number> = {
    LOGIN_MAX_ATTEMPTS: 3,
    LOGIN_LOCKOUT_MS: 1000,
    ...overrides,
  };

  const configService = {
    get: jest.fn((key: string) => settings[key]),
  } as unknown as ConfigService;

  return new LoginAttemptsService(configService);
};

describe('LoginAttemptsService', () => {
  let service: LoginAttemptsService;
  let key: string;

  beforeEach(() => {
    service = buildService();
    key = service.buildKey('203.0.113.7', 'user@example.com');
  });

  it('allows attempts while the budget lasts', () => {
    service.recordFailure(key);
    service.recordFailure(key);

    expect(() => service.assertNotLocked(key)).not.toThrow();
  });

  it('locks the account once the budget is spent', () => {
    for (let i = 0; i < 3; i++) {
      service.recordFailure(key);
    }

    expect(() => service.assertNotLocked(key)).toThrow(HttpException);
  });

  it('reports how long the caller must wait', () => {
    for (let i = 0; i < 3; i++) {
      service.recordFailure(key);
    }

    try {
      service.assertNotLocked(key);
      fail('expected a lockout');
    } catch (error) {
      const response = (error as HttpException).getResponse() as {
        statusCode: number;
        retryAfter: number;
      };
      expect(response.statusCode).toBe(429);
      expect(response.retryAfter).toBeGreaterThan(0);
    }
  });

  // The whole point of counting failures rather than requests.
  it('clears the budget after a successful sign-in', () => {
    service.recordFailure(key);
    service.recordFailure(key);
    service.reset(key);
    service.recordFailure(key);

    expect(() => service.assertNotLocked(key)).not.toThrow();
  });

  it('never locks a caller who keeps signing in successfully', () => {
    for (let i = 0; i < 20; i++) {
      service.assertNotLocked(key);
      service.reset(key);
    }

    expect(() => service.assertNotLocked(key)).not.toThrow();
  });

  // Regression: keying on the address alone let one attacker lock out
  // everyone behind the same NAT or reverse proxy.
  it('isolates accounts sharing one address', () => {
    const victim = service.buildKey('203.0.113.7', 'victim@example.com');
    const bystander = service.buildKey('203.0.113.7', 'bystander@example.com');

    for (let i = 0; i < 3; i++) {
      service.recordFailure(victim);
    }

    expect(() => service.assertNotLocked(victim)).toThrow(HttpException);
    expect(() => service.assertNotLocked(bystander)).not.toThrow();
  });

  it('isolates one account across different addresses', () => {
    const fromOffice = service.buildKey('203.0.113.7', 'user@example.com');
    const fromHome = service.buildKey('198.51.100.4', 'user@example.com');

    for (let i = 0; i < 3; i++) {
      service.recordFailure(fromOffice);
    }

    expect(() => service.assertNotLocked(fromHome)).not.toThrow();
  });

  it('treats the email case-insensitively', () => {
    expect(service.buildKey('203.0.113.7', 'User@Example.com')).toBe(
      service.buildKey('203.0.113.7', 'user@example.com'),
    );
  });

  it('forgives the caller once the window has passed', async () => {
    for (let i = 0; i < 3; i++) {
      service.recordFailure(key);
    }
    expect(() => service.assertNotLocked(key)).toThrow(HttpException);

    await new Promise((resolve) => setTimeout(resolve, 1100));

    expect(() => service.assertNotLocked(key)).not.toThrow();
  });

  it('falls back to sane defaults when nothing is configured', () => {
    const configService = { get: jest.fn(() => undefined) } as unknown as ConfigService;
    const defaults = new LoginAttemptsService(configService);
    const defaultKey = defaults.buildKey('203.0.113.7', 'user@example.com');

    for (let i = 0; i < 5; i++) {
      defaults.recordFailure(defaultKey);
    }

    expect(() => defaults.assertNotLocked(defaultKey)).toThrow(HttpException);
  });
});
