import {
  useCallback,
  useEffect,
  useState,
} from 'react';
import { supabase } from '../../../lib/supabase';

export type AcademyLearningState = {
  learningStartedAt?: string | null;
  learningTargetAt?: string | null;
  learningDeadlineAt?: string | null;
  learningCompletedAt?: string | null;

  learningPace?:
    | 'excellent'
    | 'on_track'
    | 'late'
    | 'expired'
    | 'completed';

  secondsUntilExpiration?: number;

  missionsCompleted?: number;
  missionsRequired?: number;

  activeLearningSeconds?: number;

  averagePracticeScore?: number | null;

  finalAttemptsUsed?: number;
  finalAttemptLimit?: number;

  nextFinalAttemptAt?: string | null;
  secondsUntilNextAttempt?: number;

  finalAssessmentStatus?: string;
};

export function useAcademyIntelligence() {
  const [state, setState] =
    useState<AcademyLearningState | null>(null);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState('');

  const refresh =
    useCallback(async () => {
      const {
        data,
        error: rpcError,
      } = await supabase.rpc(
        'dmh_academy_learning_state',
      );

      if (rpcError) {
        setError(rpcError.message);
        setLoading(false);
        return;
      }

      setState(
        data as AcademyLearningState,
      );

      setError('');
      setLoading(false);
    }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const record =
    useCallback(
      async (
        mission: number,
        event:
          | 'open'
          | 'heartbeat'
          | 'practice'
          | 'complete',
        score?: number | null,
      ) => {
        const {
          data,
          error: rpcError,
        } = await supabase.rpc(
          'dmh_academy_record_learning_activity',
          {
            p_mission: mission,
            p_event: event,
            p_score:
              score == null
                ? null
                : score,
          },
        );

        if (rpcError) {
          throw rpcError;
        }

        setState(
          data as AcademyLearningState,
        );

        return data as AcademyLearningState;
      },
      [],
    );

  return {
    state,
    loading,
    error,
    refresh,
    record,
  };
}

export function formatSeconds(
  value?: number | null,
) {
  const total =
    Math.max(
      0,
      Math.floor(Number(value || 0)),
    );

  const days =
    Math.floor(total / 86400);

  const hours =
    Math.floor(
      (total % 86400) / 3600,
    );

  const minutes =
    Math.floor(
      (total % 3600) / 60,
    );

  const seconds =
    total % 60;

  const hh =
    String(hours).padStart(2, '0');

  const mm =
    String(minutes).padStart(2, '0');

  const ss =
    String(seconds).padStart(2, '0');

  if (days > 0) {
    return `${days}d ${hh}:${mm}:${ss}`;
  }

  return `${hh}:${mm}:${ss}`;
}

export function formatActiveTime(
  seconds?: number | null,
) {
  const total =
    Math.max(
      0,
      Number(seconds || 0),
    );

  const hours =
    Math.floor(total / 3600);

  const minutes =
    Math.floor(
      (total % 3600) / 60,
    );

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }

  return `${minutes}m`;
}
