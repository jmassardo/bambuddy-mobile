import type { NotificationProvider } from '@/types/api';
import {
  buildProviderPayload, emptyProviderForm, formFromProvider, PROVIDER_EVENTS, validateProviderForm,
} from '@/utils/notificationProvider';

function provider(overrides: Partial<NotificationProvider> = {}): NotificationProvider {
  return {
    ...buildProviderPayload(emptyProviderForm('ntfy')), id: 8, name: 'Alerts',
    config: { topic: 'farm' }, enabled: true, printer_id: null,
    quiet_hours_enabled: false, quiet_hours_start: null, quiet_hours_end: null,
    daily_digest_enabled: false, daily_digest_time: null,
    ...overrides,
  } as NotificationProvider;
}

describe('notification provider editing and serialization', () => {
  it.each([
    ['bark', { device_key: 'device', server: 'https://bark.example', group: 'Farm', sound: 'minuet', level: 'critical' }],
    ['callmebot', { phone: '+123456789', apikey: 'secret' }],
    ['homeassistant', { service: 'notify.mobile_app_phone', data: '{"priority":"high","ttl":0}' }],
  ] as const)('round-trips %s without dropping transport or unknown nested settings', (kind, config) => {
    const form = formFromProvider(provider({ provider_type: kind, config: { ...config, future: { nested: true } } }));
    form.name = 'Edited';
    const payload = buildProviderPayload(form);
    expect(payload.provider_type).toBe(kind);
    expect(payload.config).toMatchObject({ ...config, future: { nested: true } });
    expect(payload.name).toBe('Edited');
    expect(validateProviderForm(form)).toBeNull();
  });

  it('keeps webhook transport exact even when the host happens to contain gotify', () => {
    const form = formFromProvider(provider({
      provider_type: 'webhook',
      config: { webhook_url: 'https://gotify.example/custom', payload_format: 'slack', auth_header: 'Bearer value', field_title: 'old', future: [1, 2] },
    }));
    expect(form.kind).toBe('generic_webhook');
    expect(buildProviderPayload(form).config).toMatchObject({
      webhook_url: 'https://gotify.example/custom', payload_format: 'slack', auth_header: 'Bearer value', future: [1, 2],
    });
    form.config.payload_format = 'generic';
    expect(buildProviderPayload(form).config.field_title).toBe('old');
  });

  it('does not silently convert future server provider families', () => {
    const form = formFromProvider(provider({ provider_type: 'future-provider' as NotificationProvider['provider_type'], config: { nested: { value: 1 } } }));
    expect(buildProviderPayload(form)).toMatchObject({ provider_type: 'future-provider', config: { nested: { value: 1 } } });
    expect(validateProviderForm(form)).toMatch(/not supported/);
  });

  it('preserves every event and printer scope while changing credentials, independently of personal email', () => {
    const events = Object.fromEntries(PROVIDER_EVENTS.map(([key], index) => [key, index % 2 === 0]));
    const form = formFromProvider(provider({ ...events, printer_id: 42 }));
    form.config.auth_token = 'new-token';
    expect(buildProviderPayload(form)).toMatchObject({ ...events, printer_id: 42, config: { auth_token: 'new-token' } });
    form.events.on_print_start = !form.events.on_print_start;
    form.printer_id = null;
    const payload = buildProviderPayload(form);
    expect(payload.on_print_start).toBe(false);
    expect(payload.printer_id).toBeNull();
    expect(payload).not.toHaveProperty('notify_print_start');
    for (const [key] of PROVIDER_EVENTS.filter(([eventKey]) => eventKey !== 'on_print_start')) expect(payload[key]).toBe(events[key]);
  });

  it('round-trips independent ntfy priorities and disables delivery times using the server nullable contract', () => {
    const form = formFromProvider(provider({
      config: { topic: 'farm', event_priorities: { on_print_failed: 5, on_queue_completed: 1, future_event: 2 } },
      attach_photo: false, quiet_hours_enabled: true, quiet_hours_start: '23:30', quiet_hours_end: '06:15',
      daily_digest_enabled: true, daily_digest_time: '10:45',
    }));
    form.events.on_print_failed = false;
    form.eventPriorities.on_print_complete = 4;
    form.quiet_hours_enabled = false;
    expect(buildProviderPayload(form)).toMatchObject({
      attach_photo: false, quiet_hours_enabled: false, quiet_hours_start: null, quiet_hours_end: null,
      daily_digest_time: '10:45', config: { event_priorities: {
        on_print_failed: 5, on_queue_completed: 1, on_print_complete: 4, future_event: 2,
      } },
    });
    form.quiet_hours_enabled = true;
    form.quiet_hours_start = '24:00';
    expect(validateProviderForm(form)).toMatch(/HH:MM/);
    form.quiet_hours_start = '00:00';
    form.eventPriorities.on_print_complete = 6;
    expect(validateProviderForm(form)).toMatch(/priorities/);
  });

  it('validates HA JSON objects, plain Telegram topic integers, and emergency required parameters', () => {
    const ha = emptyProviderForm('homeassistant');
    ha.name = 'HA';
    for (const value of ['{', '[]', 'null', '"text"']) {
      ha.config.data = value;
      expect(validateProviderForm(ha)).toMatch(/JSON/);
    }
    ha.config.data = '{"ttl":0}';
    expect(validateProviderForm(ha)).toBeNull();
    const telegram = emptyProviderForm('telegram');
    telegram.name = 'Telegram';
    telegram.config = { bot_token: 'token', chat_id: '-100123', message_thread_id: '1e5' };
    expect(validateProviderForm(telegram)).toMatch(/integer/);
    telegram.config.message_thread_id = '123';
    telegram.telegram_verdict_mode = 'both';
    expect(buildProviderPayload(telegram)).toMatchObject({ config: { message_thread_id: '123' }, telegram_verdict_mode: 'both' });
    const pushover = emptyProviderForm('pushover');
    pushover.name = 'Pushover';
    Object.assign(pushover.config, { user_key: 'key', app_token: 'app', priority: '2', retry: '', expire: '3600' });
    expect(validateProviderForm(pushover)).toMatch(/retry and expiry/);
    pushover.config.retry = '30';
    expect(validateProviderForm(pushover)).toBeNull();
    expect(buildProviderPayload(pushover).config).toMatchObject({ priority: 2, retry: 30, expire: 3600 });
  });

  it('keeps SMTP authentication in the string format consumed by the server, including disabled auth', () => {
    const form = emptyProviderForm('email');
    form.config = {
      ...form.config, smtp_server: 'mail.example.com', from_email: 'from@example.com',
      to_email: 'to@example.com', auth_enabled: 'false', smtp_port: '25', security: 'none',
    };
    expect(validateProviderForm(form)).toMatch(/name/);
    expect(validateProviderForm(form, 'test')).toBeNull();
    expect(buildProviderPayload(form).config).toMatchObject({ auth_enabled: 'false', smtp_port: 25, security: 'none' });
    form.config.auth_enabled = 'true';
    expect(buildProviderPayload(form).config.auth_enabled).toBe('true');
  });
});
