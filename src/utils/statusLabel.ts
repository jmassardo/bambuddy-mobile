import { translateNative } from '@/i18n';

import { getFormattingPreferences } from '@/utils/preferences';

const STATUS_LABELS: Record<string, string> = {
  get all() { return translateNative('common.all'); },
  get complete() { return STATUS_LABELS.completed; },
  get updating() { return translateNative('enums.updating', { defaultValue: 'Updating' }); },
  get preparing() { return translateNative('enums.preparing', { defaultValue: 'Preparing' }); },
  get checking() { return translateNative('enums.checking', { defaultValue: 'Checking' }); },
  get downloading() { return translateNative('enums.downloading', { defaultValue: 'Downloading' }); },
  get installing() { return translateNative('enums.installing', { defaultValue: 'Installing' }); },
  get slicing() { return translateNative('enums.slicing', { defaultValue: 'Slicing' }); },
  get dispatching() { return translateNative('enums.dispatching', { defaultValue: 'Dispatching' }); },
  get partial_failure() { return translateNative('enums.partialFailure', { defaultValue: 'Partial failure' }); },
  get partially_failed() { return STATUS_LABELS.partial_failure; },
  get valid() { return translateNative('enums.valid', { defaultValue: 'Valid' }); },
  get purchased() { return translateNative('enums.purchased', { defaultValue: 'Purchased' }); },
  get received() { return translateNative('enums.received', { defaultValue: 'Received' }); },
  get auto() { return translateNative('native.18782f1449ef93d2'); },
  get pass() { return STATUS_LABELS.success; },
  get fail() { return STATUS_LABELS.failed; },
  get warn() { return STATUS_LABELS.warning; },
  get skip() { return STATUS_LABELS.skipped; },
  get ok() { return STATUS_LABELS.normal; },
  get uploaded() { return translateNative('native.5aebee33930209dc'); },
  get pending() { return translateNative('native.f57578b016dacb32'); }, get queued() { return translateNative('native.e3f9fafdd8daaba0'); }, get waiting() { return translateNative('native.62363493900507d9'); }, get scheduled() { return translateNative('native.6ad7336d402e07da'); },
  get running() { return translateNative('native.76eab837674fba9a'); }, get printing() { return translateNative('native.58b5ceab5adaa853'); }, get paused() { return translateNative('native.2e8d3baadb9cc3fd'); }, get uploading() { return translateNative('native.b687176a58e9610e'); },
  get processing() { return translateNative('native.93f1a05bc8352efb'); }, get completed() { return translateNative('native.e8d25c3ab5a7be5d'); }, get finished() { return translateNative('native.90a4f4400cd3eda4'); }, get finish() { return translateNative('native.90a4f4400cd3eda4'); },
  get failed() { return translateNative('native.4951b5090ada997d'); }, get error() { return translateNative('native.e971662d6928639f'); }, get stopped() { return translateNative('native.7208cfbe567a4d19'); }, get cancelled() { return translateNative('native.827f4f3e696f5356'); }, get canceled() { return translateNative('native.827f4f3e696f5356'); },
  get skipped() { return translateNative('native.23a65d62ff0a8c05'); }, get idle() { return translateNative('native.a3b81f922d798281'); }, get ready() { return translateNative('native.9eb7d9bd5a5902c9'); }, get online() { return translateNative('native.f592dbfa89d86eef'); }, get offline() { return translateNative('native.460c8b942025eaac'); },
  get unknown() { return translateNative('native.ff12a040d13addb7'); }, get active() { return translateNative('native.338a8c40557b22a0'); }, get inactive() { return translateNative('native.e4288d9846e01891'); }, get enabled() { return translateNative('common.enabled'); }, get disabled() { return translateNative('common.disabled'); },
  get success() { return translateNative('native.bdb049e6cec2945e'); }, get warning() { return translateNative('native.ecedc86c28d0c0db'); }, get archived() { return translateNative('native.09a6280015b8766a'); }, get deleted() { return translateNative('native.b8640547d8faf2de'); },
  get unavailable() { return translateNative('native.690339bc141891b7'); }, get degraded() { return translateNative('native.7380fa37c3222710'); }, get stale() { return translateNative('native.056b5cdabb0df53b'); }, get connected() { return translateNative('native.7a24d4ce1f2c4857'); },
  get disconnected() { return translateNative('native.22cd1cee4ce4b061'); }, get connecting() { return translateNative('native.b8ebd218524c9cd5'); }, get loading() { return translateNative('native.4faaebf1fa58e4d2'); },
  get low() { return translateNative('native.454308c8cdb7a63d', { defaultValue: 'Low' }); }, get normal() { return translateNative('native.729aa07c7938c10d'); }, get high() { return translateNative('native.cdc3ff5be2c37e14'); }, get urgent() { return translateNative('native.f77ac839075e90bb'); },
  get todo() { return translateNative('native.c69eb4c13de3019b'); }, get not_started() { return translateNative('native.62dcfab695163f1f'); }, get in_progress() { return translateNative('native.9158318eb5b9bccc'); }, get blocked() { return translateNative('native.e545c17398a12c4c'); },
  get done() { return translateNative('native.7ab7b842cbd975a6'); }, get draft() { return translateNative('native.f918c9f78c2062d6'); }, get published() { return translateNative('native.cf7da6773149c2af'); }, get on_hold() { return translateNative('native.2b93044f2ee8dc1e'); },
  get admin() { return translateNative('native.9a55b81076127e59'); }, get administrator() { return translateNative('native.5c78de21b845246c'); }, get user() { return translateNative('native.79911ae711e1198c'); }, get viewer() { return translateNative('native.50dfaa9aa7152ac6'); },
  get on() { return translateNative('native.c7e4e8a8db2bbe79', { defaultValue: 'On' }); }, get off() { return translateNative('native.eaa897b0631e7896', { defaultValue: 'Off' }); }, get healthy() { return translateNative('native.956bb2d74f8c0cf9'); }, get unhealthy() { return translateNative('native.a4c86aabb5b97e4a'); }, get shutdown() { return translateNative('native.5c6e8ea463412d9d'); },
};

/** Display-only known status/priority/role enums; never rewrite arbitrary user text. */
export function localizedStatus<T>(value: T): T {
  if (typeof value !== 'string' || (getFormattingPreferences().locale ?? 'en').split('-')[0] === 'en') return value;
  const label = STATUS_LABELS[value.toLowerCase().replace(/ /g, '_')];
  return label ? label as T : value;
}

/** Only use with a closed source-owned caption table, never arbitrary data. */
export function localizedEnum(value: string, labels: Record<string, string>): string {
  if ((getFormattingPreferences().locale ?? 'en').split('-')[0] === 'en') return value;
  return Object.prototype.hasOwnProperty.call(labels, value) ? labels[value] : value;
}
