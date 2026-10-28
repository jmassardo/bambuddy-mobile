import { useSyncExternalStore } from 'react';
import type { SpoolBuddyRemoteState, InventorySpool } from '@/types/api';

const empty: SpoolBuddyRemoteState = {
  weight: null,
  stable: false,
  rawAdc: null,
  tagUid: null,
  trayUuid: null,
  sak: null,
  tagState: 'waiting',
  spool: null,
  online: null,
  reconnectRevision: 0,
  writeSpoolId: null,
  writeTagUid: null,
  writeStatus: 'idle',
  message: null,
  updateStatus: null,
  updateMessage: null,
  updateReportedAt: null,
};
const states = new Map<string, SpoolBuddyRemoteState>();
const listeners = new Set<() => void>();
const liveSockets = new Set<object>();
let currentServer: string | null | undefined;
function notify() {
  listeners.forEach(listener => listener());
}
export function resetSpoolBuddyEvents() {
  states.clear();
  notify();
}
export function setSpoolBuddyServer(server: string | null) {
  if (currentServer !== server) {
    currentServer = server;
    liveSockets.clear();
    resetSpoolBuddyEvents();
  }
}
export function spoolBuddySocketOpened(socket: object) {
  liveSockets.add(socket);
}
export function spoolBuddySocketClosed(socket: object) {
  if (liveSockets.delete(socket) && liveSockets.size === 0)
    clearSpoolBuddyReadings();
}
export function clearSpoolBuddyReadings() {
  states.forEach((state, id) =>
    states.set(id, {
      ...state,
      weight: null,
      stable: false,
      rawAdc: null,
      tagState: 'waiting',
      tagUid: null,
      trayUuid: null,
      sak: null,
      spool: null,
      online: null,
    }),
  );
  notify();
}
export function getSpoolBuddyRemoteState(id: string) {
  return states.get(id) ?? empty;
}
export function matchSpoolBuddyTag(
  id: string,
  uid: string | null,
  tray: string | null,
  spool: Partial<InventorySpool>,
) {
  const current = getSpoolBuddyRemoteState(id);
  if (
    current.tagState === 'unknown' &&
    current.tagUid === uid &&
    current.trayUuid === tray
  ) {
    setSpoolBuddyState(id, { tagState: 'matched', spool });
  }
}

export function setSpoolBuddyState(
  id: string,
  patch: Partial<SpoolBuddyRemoteState>,
) {
  states.set(id, { ...(states.get(id) ?? empty), ...patch });
  notify();
}

/** Consumes authenticated app-socket messages without mixing events across readers. */
export function publishSpoolBuddyEvent(message: {
  type: string;
  data?: Record<string, unknown>;
}) {
  if (typeof message.type !== 'string') return;
  if (
    !message.type.startsWith('spoolbuddy_') &&
    message.type !== 'spoolman_unavailable'
  )
    return;
  const data = { ...message, ...message.data } as Record<string, unknown>;
  if (typeof data.device_id !== 'string') return;
  const id = data.device_id;
  switch (message.type) {
    case 'spoolbuddy_weight':
      setSpoolBuddyState(id, {
        weight:
          typeof data.weight_grams === 'number' ? data.weight_grams : null,
        stable: data.stable === true,
        rawAdc: typeof data.raw_adc === 'number' ? data.raw_adc : null,
      });
      break;
    case 'spoolbuddy_tag_matched':
    case 'spoolbuddy_unknown_tag':
      setSpoolBuddyState(id, {
        tagState:
          message.type === 'spoolbuddy_tag_matched' ? 'matched' : 'unknown',
        tagUid: typeof data.tag_uid === 'string' ? data.tag_uid : null,
        trayUuid: typeof data.tray_uuid === 'string' ? data.tray_uuid : null,
        sak: typeof data.sak === 'number' ? data.sak : null,
        spool:
          typeof data.spool === 'object' && data.spool
            ? (data.spool as Partial<InventorySpool>)
            : null,
        message: null,
      });
      break;
    case 'spoolbuddy_tag_removed':
      setSpoolBuddyState(id, {
        tagState: 'removed',
        tagUid: null,
        trayUuid: null,
        sak: null,
        spool: null,
      });
      break;
    case 'spoolbuddy_tag_written':
    case 'spoolbuddy_tag_write_failed':
    case 'spoolbuddy_tag_link_failed': {
      const state = states.get(id);
      if (
        !state ||
        state.writeStatus !== 'queued' ||
        state.writeSpoolId !== data.spool_id
      )
        return;
      setSpoolBuddyState(id, {
        writeStatus:
          message.type === 'spoolbuddy_tag_written'
            ? 'success'
            : message.type === 'spoolbuddy_tag_link_failed'
            ? 'link_failed'
            : 'error',
        writeTagUid: typeof data.tag_uid === 'string' ? data.tag_uid : null,
        message: typeof data.message === 'string' ? data.message : null,
      });
      break;
    }
    case 'spoolman_unavailable':
      setSpoolBuddyState(id, {
        tagState: 'error',
        message: typeof data.message === 'string' ? data.message : null,
      });
      break;
    case 'spoolbuddy_online': {
      const previous = getSpoolBuddyRemoteState(id);
      setSpoolBuddyState(id, {
        online: true,
        reconnectRevision:
          previous.reconnectRevision + (previous.online === false ? 1 : 0),
      });
      break;
    }
    case 'spoolbuddy_offline':
      setSpoolBuddyState(id, {
        online: false,
        weight: null,
        stable: false,
        rawAdc: null,
        tagState: 'waiting',
        tagUid: null,
        trayUuid: null,
        spool: null,
      });
      break;
    case 'spoolbuddy_update':
      setSpoolBuddyState(id, {
        updateStatus:
          typeof data.update_status === 'string' ? data.update_status : null,
        updateMessage:
          typeof data.update_message === 'string' ? data.update_message : null,
        updateReportedAt: Date.now(),
      });
      break;
  }
}

export function useSpoolBuddyRemoteState(id: string) {
  return useSyncExternalStore(
    listener => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    () => getSpoolBuddyRemoteState(id),
  );
}
