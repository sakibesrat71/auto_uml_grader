import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AssignmentDocument } from '../schemas/entities.schema';
import { TeacherAssignmentsService } from './teacher-assignments.service';

describe('Assignment notification emails', () => {
  const assignment = {
    title: 'UML test',
    totalMarks: 10,
  } as AssignmentDocument;
  let service: TeacherAssignmentsService;
  let request: jest.SpiedFunction<typeof fetch>;

  beforeEach(() => {
    service = new TeacherAssignmentsService(
      null!,
      null!,
      null!,
      null!,
      null!,
      new ConfigService({
        BREVO_API_KEY: 'test-key',
        SMTP_FROM: 'Teacher <sender@example.com>',
      }),
    );
    request = jest.spyOn(globalThis, 'fetch');
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
  });
  afterEach(() => jest.restoreAllMocks());

  it.each([
    'sendAssignmentReminderEmails',
    'sendMarksPublishedEmails',
  ] as const)('%s uses HTTPS without SMTP credentials', async (method) => {
    request.mockResolvedValue(new Response('{}', { status: 201 }));
    const result = await service[method](assignment, ['student@example.com']);
    expect(result.sentCount).toBe(1);
    expect(result.failedCount).toBe(0);
    expect(request.mock.calls[0][0]).toBe(
      'https://api.brevo.com/v3/smtp/email',
    );
    const body = JSON.parse(request.mock.calls[0][1]?.body as string);
    expect(body.to).toEqual([{ email: 'student@example.com' }]);
    expect(body.subject).toContain('UML test');
    expect(body.textContent).toContain('UML Grader');
  });

  it('reports a notification timeout without throwing away the assignment response', async () => {
    request.mockRejectedValue(new DOMException('Timeout', 'TimeoutError'));
    const result = await service['sendAssignmentReminderEmails'](assignment, [
      'student@example.com',
    ]);
    expect(result.failedCount).toBe(1);
    expect(result.sentCount).toBe(0);
  });

  it('skips notifications when Brevo is unconfigured', async () => {
    service = new TeacherAssignmentsService(
      null!,
      null!,
      null!,
      null!,
      null!,
      new ConfigService({}),
    );
    const result = await service['sendAssignmentReminderEmails'](assignment, [
      'student@example.com',
    ]);
    expect(result.skippedCount).toBe(1);
    expect(request).not.toHaveBeenCalled();
  });
});
