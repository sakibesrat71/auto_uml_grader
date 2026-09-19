import {
  InternalServerErrorException,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

function requiredEnv(config: ConfigService, key: string): string {
  const value = config.get<string>(key)?.trim();
  if (!value)
    throw new InternalServerErrorException(`${key} is not configured.`);
  return value;
}

export async function sendBrevoEmail(
  config: ConfigService,
  logger: Logger,
  email: string,
  subject: string,
  textContent: string,
) {
  const apiKey = requiredEnv(config, 'BREVO_API_KEY').trim();
  // Retain the deployed sender setting: either an address or Name <address>.
  const from = requiredEnv(config, 'SMTP_FROM')
    .trim()
    .replace(/^"(.*)"$/, '$1');
  const mailbox = /^(.*?)\s*<([^<>]+)>$/.exec(from);
  const sender = {
    email: (mailbox?.[2] ?? from).trim(),
    name: mailbox?.[1]?.trim().replace(/^"(.*)"$/, '$1') || 'Auto UML Grader',
  };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(sender.email)) {
    throw new InternalServerErrorException(
      'SMTP_FROM must contain a valid sender email.',
    );
  }

  let response: globalThis.Response;
  try {
    response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': apiKey,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ sender, to: [{ email }], subject, textContent }),
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    logger.error('Brevo HTTPS email request failed or timed out.');
    throw new ServiceUnavailableException(
      'Unable to send email right now. Please try again shortly.',
    );
  }

  if (!response.ok) {
    // Provider bodies may contain recipient data; log only the HTTP status.
    logger.error(
      `Brevo email request rejected (HTTP ${response.status}). Check API key, verified sender, and Brevo account limits.`,
    );
    await response.body?.cancel();
    throw new ServiceUnavailableException(
      'Unable to send email right now. Please try again shortly.',
    );
  }
  await response.body?.cancel();
}
