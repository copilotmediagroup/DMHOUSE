import {
  useEffect,
  useRef,
} from 'react';
import { supabase } from '../lib/supabase';

export function useEmploymentAccessGuard(
  userId?: string | null,
  role?: string | null,
) {
  const signingOutRef =
    useRef(false);

  useEffect(() => {
    if (
      !userId ||
      role !== 'employee'
    ) {
      return;
    }

    let active = true;

    async function forceLogout(
      reason: string,
    ) {
      if (
        !active ||
        signingOutRef.current
      ) {
        return;
      }

      signingOutRef.current =
        true;

      try {
        /*
          Local sign-out clears this browser
          immediately.

          Server-side employment state already
          prevents the employee from being
          considered active by DMHOUSE.
        */
        await supabase.auth.signOut({
          scope: 'local',
        });
      } finally {
        window.location.replace(
          '/?accessRevoked=' +
            encodeURIComponent(
              reason,
            ),
        );
      }
    }


    async function verifyCurrentState() {
      const {
        data,
        error,
      } = await supabase
        .from(
          'employee_employment_state',
        )
        .select(
          'status',
        )
        .eq(
          'employee_id',
          userId,
        )
        .maybeSingle();

      if (
        error ||
        !active
      ) {
        return;
      }

      if (
        data?.status ===
          'suspended' ||
        data?.status ===
          'terminated'
      ) {
        await forceLogout(
          data.status ===
            'terminated'
            ? 'Employment has been terminated.'
            : 'Employee access has been suspended.',
        );
      }
    }


    /*
      Verify immediately at app boot.
    */
    void verifyCurrentState();


    /*
      Realtime employment-state listener.

      This is what makes an already-open
      employee session disappear immediately
      when the Owner changes employment state.
    */
    const channel =
      supabase
        .channel(
          `employment-access-${userId}`,
        )
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table:
              'employee_employment_state',
            filter:
              `employee_id=eq.${userId}`,
          },
          (payload) => {
            const next =
              payload.new as {
                status?: string;
              };

            if (
              next.status ===
                'suspended' ||
              next.status ===
                'terminated'
            ) {
              void forceLogout(
                next.status ===
                  'terminated'
                  ? 'Employment has been terminated.'
                  : 'Employee access has been suspended.',
              );
            }
          },
        )
        .subscribe();


    /*
      Secondary verification.

      Realtime is primary.
      This protects against:
      - network interruptions
      - missed realtime event
      - browser sleep/wake
    */
    const timer =
      window.setInterval(
        () => {
          void verifyCurrentState();
        },
        15_000,
      );


    function verifyOnFocus() {
      void verifyCurrentState();
    }

    window.addEventListener(
      'focus',
      verifyOnFocus,
    );


    return () => {
      active = false;

      window.clearInterval(
        timer,
      );

      window.removeEventListener(
        'focus',
        verifyOnFocus,
      );

      void supabase.removeChannel(
        channel,
      );
    };
  }, [
    userId,
    role,
  ]);
}
