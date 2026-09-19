import { Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from './auth.service';

describe('Auth email delivery', () => {
  let service: AuthService;
  let fetchMock: jest.SpiedFunction<typeof fetch>;

  beforeEach(() => {
    service = new AuthService(
      null!,
      null!,
      null!,
      new ConfigService({
        BREVO_API_KEY: 'test-api-key',
        SMTP_FROM: 'Auto UML Grader <sender@example.com>',
      }),
      new JwtService(),
    );
    fetchMock = jest.spyOn(globalThis, 'fetch');
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
  });

  afterEach(() => jest.restoreAllMocks());

  it('sends the existing OTP content using HTTPS and the configured sender', async () => {
    fetchMock.mockResolvedValue(new Response('{}', { status: 201 }));
    await service['sendOtpEmail']('student@example.com', '123456', 10);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.brevo.com/v3/smtp/email');
    expect(options?.headers).toEqual(
      expect.objectContaining({ 'api-key': 'test-api-key' }),
    );
    expect(options?.signal).toBeInstanceOf(AbortSignal);
    expect(JSON.parse(options?.body as string)).toEqual({
      sender: { email: 'sender@example.com', name: 'Auto UML Grader' },
      to: [{ email: 'student@example.com' }],
      subject: 'UML Grader signup verification OTP',
      textContent: 'Your OTP is 123456. It expires in 10 minutes.',
    });
  });

  it('sends teacher invitations through the same HTTPS endpoint', async () => {
    fetchMock.mockResolvedValue(new Response('{}', { status: 201 }));
    await service['sendTeacherInviteEmail'](
      'teacher@example.com',
      'https://example.com/signup?token=test',
    );
    expect(JSON.parse(fetchMock.mock.calls[0][1]?.body as string)).toEqual(
      expect.objectContaining({
        subject: 'UML Grader teacher invitation',
        textContent:
          'You were invited as a teacher. Complete signup here: https://example.com/signup?token=test',
      }),
    );
  });

  it.each([401, 403, 429, 500])(
    'reports provider HTTP %s as a readable service error',
    async (status) => {
      fetchMock.mockResolvedValue(new Response('provider details', { status }));
      await expect(
        service['sendOtpEmail']('student@example.com', '123456', 10),
      ).rejects.toThrow(ServiceUnavailableException);
      expect(Logger.prototype.error).toHaveBeenCalledWith(
        expect.stringContaining(`HTTP ${status}`),
      );
    },
  );

  it('handles network timeouts without exposing credentials or OTPs', async () => {
    fetchMock.mockRejectedValue(new DOMException('Timeout', 'TimeoutError'));
    await expect(
      service['sendOtpEmail']('student@example.com', '123456', 10),
    ).rejects.toThrow(
      'Unable to send email right now. Please try again shortly.',
    );
  });

  it('fails before sending when the API key is missing', async () => {
    service = new AuthService(
      null!,
      null!,
      null!,
      new ConfigService({ SMTP_FROM: 'sender@example.com' }),
      new JwtService(),
    );
    await expect(
      service['sendOtpEmail']('student@example.com', '123456', 10),
    ).rejects.toThrow('BREVO_API_KEY is not configured.');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
