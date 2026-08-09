import {
  useEffect,
  useRef,
  useState,
} from 'react';
import { supabase } from '../../../lib/supabase';

type LearningSessionState = {
  sessionId: string;
  missionNumber: number;
  startedAt?: string;
  status?: string;
};

const ACTIVE_WINDOW_MS = 60_000;
const HEARTBEAT_MS = 30_000;

export function useLearningSession(
  missionNumber: number | null,
) {
  const [session, setSession] =
    useState<LearningSessionState | null>(null);

  const lastInteractionRef =
    useRef<number>(Date.now());

  const sessionIdRef =
    useRef<string | null>(null);

  const startingRef =
    useRef(false);

  /*
    Candidate interaction signals.

    We do not record individual keys, text,
    clicks, coordinates, or content.

    We only keep an in-memory timestamp
    showing that the candidate interacted
    recently.
  */
  useEffect(() => {
    if (!missionNumber) return;

    function markActive() {
      lastInteractionRef.current =
        Date.now();
    }

    window.addEventListener(
      'keydown',
      markActive,
    );

    window.addEventListener(
      'mousedown',
      markActive,
    );

    window.addEventListener(
      'touchstart',
      markActive,
      {
        passive: true,
      },
    );

    window.addEventListener(
      'scroll',
      markActive,
      {
        passive: true,
      },
    );

    return () => {
      window.removeEventListener(
        'keydown',
        markActive,
      );

      window.removeEventListener(
        'mousedown',
        markActive,
      );

      window.removeEventListener(
        'touchstart',
        markActive,
      );

      window.removeEventListener(
        'scroll',
        markActive,
      );
    };
  }, [missionNumber]);


  /*
    Start one server-side learning session
    whenever the candidate enters
    Missions 1–5.
  */
  useEffect(() => {
    if (!missionNumber) {
      setSession(null);
      sessionIdRef.current = null;
      return;
    }

    let disposed = false;

    async function start() {
      if (startingRef.current) return;

      startingRef.current = true;

      lastInteractionRef.current =
        Date.now();

      const {
        data,
        error,
      } = await supabase.rpc(
        'dmh_academy_start_learning_session',
        {
          p_mission:
            missionNumber,
        },
      );

      startingRef.current = false;

      if (disposed) {
        /*
          Screen changed while the RPC
          was resolving.

          If the session was created,
          close it immediately.
        */
        const created =
          data as LearningSessionState | null;

        if (created?.sessionId) {
          void supabase.rpc(
            'dmh_academy_end_learning_session',
            {
              p_session_id:
                created.sessionId,

              p_reason:
                'screen_changed_during_start',
            },
          );
        }

        return;
      }

      if (error) {
        console.error(
          'Learning session start failed:',
          error,
        );

        return;
      }

      const created =
        data as LearningSessionState;

      sessionIdRef.current =
        created.sessionId;

      setSession(created);
    }

    void start();

    return () => {
      disposed = true;

      const sessionId =
        sessionIdRef.current;

      sessionIdRef.current =
        null;

      if (!sessionId) return;

      /*
        Normal Academy navigation closes
        the session.

        If the browser itself disappears
        before this resolves, the next
        learning-session start will safely
        mark the old session abandoned.
      */
      void supabase.rpc(
        'dmh_academy_end_learning_session',
        {
          p_session_id:
            sessionId,

          p_reason:
            'mission_exit',
        },
      );
    };
  }, [missionNumber]);


  /*
    Server heartbeat.

    The browser reports only two signals:

      visible?
      recently active?

    PostgreSQL decides how much time
    actually receives credit.
  */
  useEffect(() => {
    if (
      !missionNumber ||
      !session?.sessionId
    ) {
      return;
    }

    async function heartbeat() {
      const sessionId =
        sessionIdRef.current;

      if (!sessionId) return;

      const visible =
        document.visibilityState ===
        'visible';

      const active =
        visible &&
        Date.now() -
          lastInteractionRef.current <=
          ACTIVE_WINDOW_MS;

      const {
        error,
      } = await supabase.rpc(
        'dmh_academy_learning_heartbeat',
        {
          p_session_id:
            sessionId,

          p_visible:
            visible,

          p_active:
            active,
        },
      );

      if (error) {
        console.error(
          'Learning heartbeat failed:',
          error,
        );
      }
    }

    const timer =
      window.setInterval(
        () => {
          void heartbeat();
        },
        HEARTBEAT_MS,
      );

    return () => {
      window.clearInterval(timer);
    };
  }, [
    missionNumber,
    session?.sessionId,
  ]);


  return {
    session,
  };
}
