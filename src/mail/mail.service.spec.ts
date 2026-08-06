const createTransport = jest.fn();
jest.mock('nodemailer', () => ({ createTransport }));

import { MailService } from './mail.service';

const MAIL = {
  to: 'user@test.com',
  subject: 'مرحباً',
  html: '<p>hi</p>',
  text: 'hi',
};

function configFor(overrides: Record<string, unknown>) {
  const values: Record<string, unknown> = {
    'mail.fromAddress': 'no-reply@trendwa.test',
    'mail.fromName': 'TRENDWA',
    ...overrides,
  };
  return { get: jest.fn((key: string) => values[key]) };
}

describe('MailService', () => {
  let sendMail: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    sendMail = jest.fn().mockResolvedValue(undefined);
    createTransport.mockReturnValue({ sendMail });
  });

  describe('log driver (local dev default)', () => {
    it('does not build an SMTP transport at all', () => {
      new MailService(configFor({ 'mail.driver': 'log' }) as never);
      expect(createTransport).not.toHaveBeenCalled();
    });

    it('resolves without sending, so the app runs with no mail credentials', async () => {
      const service = new MailService(
        configFor({ 'mail.driver': 'log' }) as never,
      );
      await expect(service.send(MAIL)).resolves.toBeUndefined();
      expect(sendMail).not.toHaveBeenCalled();
    });
  });

  describe('smtp driver', () => {
    const config = () =>
      configFor({
        'mail.driver': 'smtp',
        'mail.host': 'smtp.test',
        'mail.port': 587,
        'mail.secure': false,
        'mail.user': 'u',
        'mail.pass': 'p',
      });

    it('builds the transport once, at construction, from config', () => {
      new MailService(config() as never);
      expect(createTransport).toHaveBeenCalledTimes(1);
      expect(createTransport).toHaveBeenCalledWith(
        expect.objectContaining({
          host: 'smtp.test',
          port: 587,
          secure: false,
          auth: { user: 'u', pass: 'p' },
        }),
      );
    });

    it('omits auth entirely for a relay that takes no credentials', () => {
      new MailService(
        configFor({
          'mail.driver': 'smtp',
          'mail.host': 'smtp.test',
          'mail.port': 25,
          'mail.secure': false,
        }) as never,
      );
      expect(createTransport).toHaveBeenCalledWith(
        expect.objectContaining({ auth: undefined }),
      );
    });

    it('sends with a display-name From built from config', async () => {
      const service = new MailService(config() as never);
      await service.send(MAIL);
      expect(sendMail).toHaveBeenCalledWith({
        from: '"TRENDWA" <no-reply@trendwa.test>',
        to: MAIL.to,
        subject: MAIL.subject,
        html: MAIL.html,
        text: MAIL.text,
      });
    });

    it('propagates a transport failure so the queue can retry it', async () => {
      sendMail.mockRejectedValue(new Error('connection refused'));
      const service = new MailService(config() as never);
      await expect(service.send(MAIL)).rejects.toThrow('connection refused');
    });
  });

  describe('brevo-api driver (hosts that block outbound SMTP)', () => {
    const config = () =>
      configFor({ 'mail.driver': 'brevo-api', 'mail.brevoApiKey': 'key-123' });
    let fetchMock: jest.Mock;

    beforeEach(() => {
      fetchMock = jest.fn().mockResolvedValue({ ok: true, status: 201 });
      global.fetch = fetchMock as never;
    });

    it('never constructs an SMTP transport', () => {
      new MailService(config() as never);
      expect(createTransport).not.toHaveBeenCalled();
    });

    it('posts the message to the Brevo transactional endpoint', async () => {
      const service = new MailService(config() as never);
      await service.send(MAIL);

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0] as [
        string,
        { method: string; headers: Record<string, string>; body: string },
      ];
      expect(url).toBe('https://api.brevo.com/v3/smtp/email');
      expect(init.method).toBe('POST');
      expect(init.headers['api-key']).toBe('key-123');
      expect(JSON.parse(init.body)).toEqual({
        sender: { name: 'TRENDWA', email: 'no-reply@trendwa.test' },
        to: [{ email: MAIL.to }],
        subject: MAIL.subject,
        htmlContent: MAIL.html,
        textContent: MAIL.text,
      });
    });

    it('throws with the provider response when Brevo rejects the send', async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        status: 401,
        text: () => Promise.resolve('unauthorised'),
      });
      const service = new MailService(config() as never);
      await expect(service.send(MAIL)).rejects.toThrow(
        'Brevo API send failed: 401 unauthorised',
      );
    });

    it('still calls the API with an empty key rather than crashing on undefined', async () => {
      const service = new MailService(
        configFor({ 'mail.driver': 'brevo-api' }) as never,
      );
      await service.send(MAIL);
      const init = fetchMock.mock.calls[0][1] as {
        headers: Record<string, string>;
      };
      expect(init.headers['api-key']).toBe('');
    });

    it('does not fall through to SMTP after a successful API send', async () => {
      const service = new MailService(config() as never);
      await service.send(MAIL);
      expect(sendMail).not.toHaveBeenCalled();
    });
  });
});
