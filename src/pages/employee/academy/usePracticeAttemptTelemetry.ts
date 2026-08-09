import {
  useEffect,
  useRef,
} from 'react';
import { supabase } from '../../../lib/supabase';

type PracticeAttemptTelemetry = {
  missionNumber: number;

  /*
    attemptOpen:
    Candidate is currently inside the
    Mission Check / simulation.

    submitted:
    Candidate has completed this attempt
    and the score is final.
  */
  attemptOpen: boolean;
  submitted: boolean;

  scorePercent: number;
  questionCount: number;
  correctCount: number;

  passed: boolean;
};

export function usePracticeAttemptTelemetry({
  missionNumber,
  attemptOpen,
  submitted,
  scorePercent,
  questionCount,
  correctCount,
  passed,
}: PracticeAttemptTelemetry) {
  const attemptStartedAtRef =
    useRef<string | null>(null);

  const attemptWasOpenRef =
    useRef(false);

  const wasSubmittedRef =
    useRef(false);

  const recordedRef =
    useRef(false);

  /*
    We deliberately keep attempt timing
    in memory.

    The database is authoritative for
    attempt numbering and permanent history.
  */
  useEffect(() => {
    /*
      Candidate has not entered the
      Mission Check yet.
    */
    if (!attemptOpen) {
      attemptWasOpenRef.current =
        false;

      wasSubmittedRef.current =
        false;

      recordedRef.current =
        false;

      attemptStartedAtRef.current =
        null;

      return;
    }


    /*
      First entry into this attempt.
    */
    if (!attemptWasOpenRef.current) {
      attemptWasOpenRef.current =
        true;

      attemptStartedAtRef.current =
        new Date().toISOString();

      recordedRef.current =
        false;

      wasSubmittedRef.current =
        false;
    }


    /*
      Retry transition:
      previous state was submitted,
      now the candidate is answering again.
    */
    if (
      !submitted &&
      wasSubmittedRef.current
    ) {
      attemptStartedAtRef.current =
        new Date().toISOString();

      recordedRef.current =
        false;

      wasSubmittedRef.current =
        false;

      return;
    }


    if (!submitted) {
      return;
    }


    wasSubmittedRef.current =
      true;


    /*
      React may render multiple times while
      showing results.

      One displayed submission must produce
      exactly one RPC call.
    */
    if (recordedRef.current) {
      return;
    }


    const safeQuestionCount =
      Math.max(
        1,
        Math.floor(
          Number(
            questionCount || 0,
          ),
        ),
      );


    const safeCorrectCount =
      Math.max(
        0,
        Math.min(
          safeQuestionCount,

          Math.floor(
            Number(
              correctCount || 0,
            ),
          ),
        ),
      );


    const safeScore =
      Math.max(
        0,
        Math.min(
          100,
          Math.round(
            Number(
              scorePercent || 0,
            ),
          ),
        ),
      );


    /*
      Lock this submission before the
      network request.

      This prevents a React rerender from
      firing the same attempt twice.
    */
    recordedRef.current =
      true;


    void (
      async () => {
        const {
          error,
        } = await supabase.rpc(
          'dmh_academy_record_practice_attempt',
          {
            p_mission:
              missionNumber,

            p_score:
              safeScore,

            p_question_count:
              safeQuestionCount,

            p_correct_count:
              safeCorrectCount,

            p_passed:
              Boolean(passed),

            p_started_at:
              attemptStartedAtRef.current,
          },
        );


        if (error) {
          /*
            Allow one future render to retry
            this database write rather than
            silently losing the attempt.
          */
          recordedRef.current =
            false;

          console.error(
            `Mission ${missionNumber} practice attempt audit failed:`,
            error,
          );

          return;
        }
      }
    )();

  }, [
    missionNumber,
    attemptOpen,
    submitted,
    scorePercent,
    questionCount,
    correctCount,
    passed,
  ]);
}
