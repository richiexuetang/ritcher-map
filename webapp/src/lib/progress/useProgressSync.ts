import { useCallback, useEffect, useRef, useState } from 'react';
import { getProgress, setMarkerFound } from '../api/progress';
import { getAuthToken } from '../api/client';
import { WS_URL } from '../config';
import type { ProgressSyncMessage } from '../types';

export interface ProgressSync {
  found: Set<number>;
  isFound: (markerId: number) => boolean;
  toggle: (markerId: number) => void;
  loading: boolean;
}

const MAX_BACKOFF_MS = 30_000;
const BASE_BACKOFF_MS = 1_000;

function isProgressMessage(value: unknown): value is ProgressSyncMessage {
  if (!value || typeof value !== 'object') return false;
  const m = value as Record<string, unknown>;
  return (
    m.type === 'progress' &&
    typeof m.map_id === 'string' &&
    typeof m.marker_id === 'string' &&
    typeof m.found === 'boolean'
  );
}

export function useProgressSync(
  mapId: number | null,
  authed: boolean,
): ProgressSync {
  const [found, setFound] = useState<Set<number>>(() => new Set());
  const [loading, setLoading] = useState(false);

  // Keep the latest found set accessible to socket handlers / rollbacks without
  // re-subscribing the effect.
  const foundRef = useRef<Set<number>>(found);
  foundRef.current = found;

  const active = authed && mapId !== null;

  // Mutate the found set via a fresh Set instance so React identity changes.
  const applyChange = useCallback(
    (markerId: number, isFound: boolean) => {
      setFound((prev) => {
        const has = prev.has(markerId);
        if (isFound === has) return prev; // no-op, keep identity stable
        const next = new Set(prev);
        if (isFound) next.add(markerId);
        else next.delete(markerId);
        return next;
      });
    },
    [],
  );

  const isFound = useCallback(
    (markerId: number) => foundRef.current.has(markerId),
    [],
  );

  const toggle = useCallback(
    (markerId: number) => {
      if (mapId === null || !authed) return;
      const wasFound = foundRef.current.has(markerId);
      const nextFound = !wasFound;

      // Optimistic update.
      applyChange(markerId, nextFound);

      setMarkerFound(mapId, markerId, nextFound).catch(() => {
        // Roll back on failure — but only if this toggle's optimistic value is
        // still current. If a WS event or newer toggle changed this marker in
        // the meantime, reverting would clobber newer authoritative state.
        if (foundRef.current.has(markerId) === nextFound) {
          applyChange(markerId, wasFound);
        }
      });
    },
    [mapId, authed, applyChange],
  );

  useEffect(() => {
    if (!active || mapId === null) {
      // Not authed / no map: empty state, no socket.
      setFound(new Set());
      setLoading(false);
      return;
    }

    let cancelled = false;
    let socket: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let attempts = 0;

    const mapIdStr = String(mapId);

    const resync = () => {
      // Fire-and-forget re-fetch of authoritative progress.
      getProgress(mapId)
        .then((set) => {
          if (!cancelled) setFound(set);
        })
        .catch(() => {
          // Ignore; socket events / next resync will recover.
        });
    };

    const scheduleReconnect = () => {
      if (cancelled) return;
      const delay = Math.min(
        BASE_BACKOFF_MS * 2 ** attempts,
        MAX_BACKOFF_MS,
      );
      attempts += 1;
      reconnectTimer = setTimeout(connect, delay);
    };

    const connect = () => {
      if (cancelled) return;
      const token = getAuthToken() ?? '';
      const url = `${WS_URL}?token=${encodeURIComponent(token)}`;

      let ws: WebSocket;
      try {
        ws = new WebSocket(url);
      } catch {
        scheduleReconnect();
        return;
      }
      socket = ws;

      ws.onopen = () => {
        if (cancelled) return;
        attempts = 0;
        // On (re)open, re-GET progress to resync (gap events are lost).
        resync();
      };

      ws.onmessage = (event: MessageEvent) => {
        if (cancelled) return;
        let parsed: unknown;
        try {
          parsed =
            typeof event.data === 'string'
              ? JSON.parse(event.data)
              : null;
        } catch {
          return;
        }
        if (!isProgressMessage(parsed)) return;
        // Filter: events arrive for ALL the user's maps.
        if (parsed.map_id !== mapIdStr) return;
        applyChange(Number(parsed.marker_id), parsed.found);
      };

      ws.onclose = () => {
        if (cancelled) return;
        if (socket === ws) socket = null;
        scheduleReconnect();
      };

      ws.onerror = () => {
        // Let onclose drive reconnection; closing here is harmless.
        try {
          ws.close();
        } catch {
          // ignore
        }
      };
    };

    // Initial load.
    setLoading(true);
    getProgress(mapId)
      .then((set) => {
        if (!cancelled) setFound(set);
      })
      .catch(() => {
        if (!cancelled) setFound(new Set());
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    connect();

    return () => {
      cancelled = true;
      if (reconnectTimer !== null) clearTimeout(reconnectTimer);
      if (socket) {
        // Detach handlers so the teardown close does not schedule a reconnect.
        socket.onopen = null;
        socket.onmessage = null;
        socket.onclose = null;
        socket.onerror = null;
        try {
          socket.close();
        } catch {
          // ignore
        }
        socket = null;
      }
    };
  }, [active, mapId, applyChange]);

  return { found, isFound, toggle, loading };
}
