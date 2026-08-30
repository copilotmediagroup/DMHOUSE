import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Clock3,
  LockKeyhole,
  ShieldCheck,
  TimerReset,
  Trophy,
  XCircle,
} from 'lucide-react';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { supabase } from '../../../lib/supabase';

type Props = {
  onBack: () => void;
  onComplete?: (score?: number) => void;
};

type ExamState = {
  sessionId: string;
  status: 'active' | 'passed' | 'failed';
  attemptNumber: number;

  questionPosition?: number;
  totalQuestions: number;

  itemKey?: string;
  choiceOrder?: number[];

  questionStartedAt?: string;
  questionDeadline?: string;
  remainingMs?: number;

  score?: number | null;
  correctCount?: number;
  timedOutCount?: number;
  averageResponseMs?: number | null;
};

type Question = {
  prompt: string;
  choices: string[];
};

/*
  IMPORTANT:
  These are canonical answer positions.

  Supabase randomizes their display order per candidate/session.
  The browser never receives the correct-answer key.
*/
const QUESTIONS: Record<string, Question> = {
  q01: {
    prompt:
      'A buyer asks what Data Market House primarily does. Which answer is correct?',
    choices: [
      'Collects directly from consumers',
      'Connects debt portfolio sellers with qualified buyers and agencies',
      'Provides consumer credit repair',
      'Operates as a law firm for creditors',
    ],
  },

  q02: {
    prompt:
      'A buyer asks a question and you are not certain of the answer. What should you do?',
    choices: [
      'Give your best estimate so the conversation keeps moving',
      'Tell the buyer you will verify the information and follow up',
      'Change the subject',
      'Tell the buyer the question is not important',
    ],
  },

  q03: {
    prompt:
      'Which description best explains a debt portfolio?',
    choices: [
      'A list of collection agencies',
      'A report showing company revenue',
      'A group of debt accounts offered for sale together',
      'A contract between two employees',
    ],
  },

  q04: {
    prompt:
      'A buyer asks whether a portfolio has chain of title. What is the correct approach?',
    choices: [
      'Verify whether documentation showing ownership transfers is available',
      'Say yes because most portfolios have it',
      'Tell the buyer chain never matters',
      'Send an unmasked file instead',
    ],
  },

  q05: {
    prompt:
      'What does a masked portfolio file primarily protect?',
    choices: [
      'The asking price',
      'The employee commission',
      'Sensitive consumer/account identifying information',
      'The original creditor name',
    ],
  },

  q06: {
    prompt:
      'What should happen before sensitive unmasked portfolio information is released to a buyer?',
    choices: [
      'Required transaction protections and authorization should be completed',
      'The buyer only needs to request it by phone',
      'The employee decides whether the buyer seems trustworthy',
      'Nothing; unmasked files should be sent immediately',
    ],
  },

  q07: {
    prompt:
      'A buyer asks if media is available. What does "media" generally refer to in a portfolio transaction?',
    choices: [
      'Advertising graphics for the portfolio',
      'Account-level supporting documentation or records',
      'A social media profile for the creditor',
      'The employee training materials',
    ],
  },

  q08: {
    prompt:
      'What is the safest response when a buyer asks whether a portfolio has been sold before and you do not have verified placement history?',
    choices: [
      'Tell them it is definitely first placement',
      'Tell them every portfolio has been sold before',
      'State that you need to verify the placement/history before answering',
      'Avoid responding to the buyer',
    ],
  },

  q09: {
    prompt:
      'What does account count tell a buyer?',
    choices: [
      'How many employees worked the file',
      'How many accounts are included in the portfolio',
      'How many previous buyers reviewed it',
      'How many payments have been received',
    ],
  },

  q10: {
    prompt:
      'What does average balance help a buyer understand?',
    choices: [
      'How old the seller company is',
      'How many NDAs were signed',
      'The typical balance size across accounts in the portfolio',
      'The employee commission percentage',
    ],
  },

  q11: {
    prompt:
      'What is the primary reason an employee should keep buyer communications organized inside DMHOUSE?',
    choices: [
      'To make the dashboard look busy',
      'So the deal history, follow-ups, and next actions remain clear',
      'To prevent the Owner from reviewing conversations',
      'So buyers cannot respond by email',
    ],
  },

  q12: {
    prompt:
      'A buyer wants to review an opportunity before receiving protected data. Which item is appropriate?',
    choices: [
      'An unrestricted database export',
      'Another buyer’s signed agreement',
      'A properly masked portfolio/sample',
      'The company password',
    ],
  },

  q13: {
    prompt:
      'What should be the employee’s first goal in a new buyer relationship?',
    choices: [
      'Close the sale during the first call at any price',
      'Earn trust through accurate and professional communication',
      'Send every portfolio immediately',
      'Avoid asking the buyer questions',
    ],
  },

  q14: {
    prompt:
      'Which action best represents professional DMHOUSE communication?',
    choices: [
      'Pressure the buyer to make an immediate decision',
      'Answer accurately, stay organized, and follow up when promised',
      'Guess when information is unavailable',
      'Ignore questions that require management',
    ],
  },

  q15: {
    prompt:
      'A buyer makes an offer that requires negotiation outside your authority. What should you do?',
    choices: [
      'Accept it immediately',
      'Escalate the negotiation or decision to the appropriate Owner/management workflow',
      'Reject every offer below asking price',
      'Change the portfolio asking price yourself',
    ],
  },

  q16: {
    prompt:
      'Which sequence best reflects the Day-1 DMHOUSE sales process?',
    choices: [
      'Territory → Agency → Conversation → NDA → Offer → Owner/Negotiation → Payment → Release',
      'Payment → Territory → Agency → NDA → Conversation',
      'Release → Offer → Payment → Agency',
      'Agency → Release → Conversation → Territory',
    ],
  },

  q17: {
    prompt:
      'Why should confidential portfolio information be protected?',
    choices: [
      'Only because it makes the file harder to sell',
      'Because employees are responsible for handling sensitive information according to company procedure',
      'Only the buyer is responsible for confidentiality',
      'Confidentiality applies only after a sale closes',
    ],
  },

  q18: {
    prompt:
      'What is due diligence in a portfolio transaction?',
    choices: [
      'The employee’s daily attendance report',
      'A buyer’s advertising campaign',
      'The buyer’s review of portfolio information before completing a purchase decision',
      'The process of assigning employee territories',
    ],
  },

  q19: {
    prompt:
      'A buyer asks for information that is not shown in the available portfolio materials. What should you do?',
    choices: [
      'Verify or escalate the request instead of inventing an answer',
      'Create an estimate and present it as fact',
      'Tell the buyer all missing data is irrelevant',
      'End the conversation',
    ],
  },

  q20: {
    prompt:
      'Which statement best describes a candidate who is ready to represent Data Market House?',
    choices: [
      'Someone who memorizes every possible answer but ignores procedure',
      'Someone who speaks quickly even when unsure',
      'Someone who understands the workflow, protects information, communicates accurately, and knows when to escalate',
      'Someone who promises buyers whatever they request',
    ],
  },
};

function secondsFromMs(ms?: number) {
  return Math.max(
    0,
    Math.ceil(Number(ms || 0) / 1000),
  );
}

function formatResponseTime(ms?: number | null) {
  if (ms == null) return '—';

  return `${(ms / 1000).toFixed(1)} sec`;
}

export default function MissionSix({
  onBack,
}: Props) {
  const [phase, setPhase] = useState<
    'loading' | 'intro' | 'exam' | 'result'
  >('loading');

  const [exam, setExam] =
    useState<ExamState | null>(null);

  const [error, setError] =
    useState('');

  const [busy, setBusy] =
    useState(false);

  const [remainingMs, setRemainingMs] =
    useState(0);

  const submittingRef = useRef(false);

  const currentQuestion = useMemo(() => {
    if (!exam?.itemKey) return null;

    return QUESTIONS[exam.itemKey] || null;
  }, [exam?.itemKey]);

  const displayedChoices = useMemo(() => {
    if (
      !currentQuestion ||
      !Array.isArray(exam?.choiceOrder)
    ) {
      return [];
    }

    return exam.choiceOrder.map(
      (canonicalIndex) =>
        currentQuestion.choices[
          canonicalIndex
        ] ?? 'Unavailable choice',
    );
  }, [
    currentQuestion,
    exam?.choiceOrder,
  ]);

  const loadState = useCallback(async () => {
    setError('');

    const {
      data: userResult,
      error: userError,
    } = await supabase.auth.getUser();

    if (userError) {
      setError(userError.message);
      setPhase('intro');
      return;
    }

    const user = userResult.user;

    if (!user) {
      setError(
        'Your Academy session is no longer authenticated.',
      );
      setPhase('intro');
      return;
    }

    const {
      data: latest,
      error: latestError,
    } = await supabase
      .from('academy_exam_sessions')
      .select(
        'id,status,attempt_number,final_score,correct_count,timed_out_count,average_response_ms,created_at',
      )
      .eq('employee_id', user.id)
      .order('created_at', {
        ascending: false,
      })
      .limit(1)
      .maybeSingle();

    if (latestError) {
      setError(latestError.message);
      setPhase('intro');
      return;
    }

    if (!latest) {
      setExam(null);
      setPhase('intro');
      return;
    }

    if (latest.status !== 'active') {
      setExam({
        sessionId: latest.id,
        status: latest.status,
        attemptNumber:
          latest.attempt_number,
        totalQuestions: 20,
        score: latest.final_score,
        correctCount:
          latest.correct_count,
        timedOutCount:
          latest.timed_out_count,
        averageResponseMs:
          latest.average_response_ms,
      });

      setPhase('result');
      return;
    }

    const {
      data,
      error: stateError,
    } = await supabase.rpc(
      'dmh_academy_final_exam_state',
      {
        p_session_id: latest.id,
      },
    );

    if (stateError) {
      setError(stateError.message);
      setPhase('intro');
      return;
    }

    const next = data as ExamState;

    setExam(next);
    setRemainingMs(
      Number(next.remainingMs || 0),
    );
    setPhase('exam');
  }, []);

  useEffect(() => {
    void loadState();
  }, [loadState]);

  async function startAssessment() {
    if (busy) return;

    setBusy(true);
    setError('');

    const {
      data,
      error: rpcError,
    } = await supabase.rpc(
      'dmh_academy_start_final_exam',
    );

    setBusy(false);

    if (rpcError) {
      setError(rpcError.message);
      return;
    }

    const next = data as ExamState;

    setExam(next);

    if (next.status === 'active') {
      setRemainingMs(
        Number(next.remainingMs || 0),
      );
      setPhase('exam');
    } else {
      setPhase('result');
    }
  }

  const submitAnswer = useCallback(
    async (
      displayedChoice: number | null,
    ) => {
      if (
        !exam?.sessionId ||
        submittingRef.current
      ) {
        return;
      }

      submittingRef.current = true;
      setBusy(true);
      setError('');

      const {
        data,
        error: rpcError,
      } = await supabase.rpc(
        'dmh_academy_answer_final_question',
        {
          p_session_id:
            exam.sessionId,

          p_displayed_choice:
            displayedChoice,
        },
      );

      setBusy(false);
      submittingRef.current = false;

      if (rpcError) {
        /*
          A race can occur when the local timer reaches zero
          at the same instant a candidate clicks an answer.
          Reload server state instead of creating a second answer.
        */
        if (
          rpcError.message
            .toLowerCase()
            .includes(
              'already been answered',
            )
        ) {
          await loadState();
          return;
        }

        setError(rpcError.message);
        return;
      }

      const next = data as ExamState;

      setExam(next);

      if (next.status === 'active') {
        setRemainingMs(
          Number(next.remainingMs || 0),
        );
        setPhase('exam');
        return;
      }

      setPhase('result');
    },
    [exam?.sessionId, loadState],
  );

  /*
    CLIENT TIMER

    This is only the visual countdown.
    PostgreSQL's question_deadline is the actual authority.
  */
  useEffect(() => {
    if (
      phase !== 'exam' ||
      !exam?.questionDeadline
    ) {
      return;
    }

    const deadline =
      new Date(
        exam.questionDeadline,
      ).getTime();

    function tick() {
      const left = Math.max(
        0,
        deadline - Date.now(),
      );

      setRemainingMs(left);

      if (
        left <= 0 &&
        !submittingRef.current
      ) {
        void submitAnswer(null);
      }
    }

    tick();

    const timer =
      window.setInterval(
        tick,
        100,
      );

    return () => {
      window.clearInterval(timer);
    };
  }, [
    phase,
    exam?.sessionId,
    exam?.questionPosition,
    exam?.questionDeadline,
    submitAnswer,
  ]);

  /*
    Record focus changes for Owner review.
    Focus changes do NOT automatically fail the candidate.
  */
  useEffect(() => {
    if (
      phase !== 'exam' ||
      !exam?.sessionId
    ) {
      return;
    }

    const sessionId =
      exam.sessionId;

    function visibility() {
      const eventType =
        document.hidden
          ? 'focus_lost'
          : 'focus_returned';

      void supabase.rpc(
        'dmh_academy_final_exam_event',
        {
          p_session_id:
            sessionId,

          p_event_type:
            eventType,
        },
      );
    }

    document.addEventListener(
      'visibilitychange',
      visibility,
    );

    return () => {
      document.removeEventListener(
        'visibilitychange',
        visibility,
      );
    };
  }, [
    phase,
    exam?.sessionId,
  ]);

  if (phase === 'loading') {
    return (
      <div className="grid min-h-screen place-items-center bg-slate-950 p-6 text-white">
        <div className="text-center">
          <div className="mx-auto h-10 w-10 animate-spin rounded-full border-2 border-blue-400 border-t-transparent" />

          <p className="mt-4 text-sm text-slate-300">
            Loading final assessment…
          </p>
        </div>
      </div>
    );
  }

  if (phase === 'result' && exam) {
    const passed =
      exam.status === 'passed';

    return (
      <div className="min-h-screen bg-slate-100 p-5 md:p-8">
        <div className="mx-auto max-w-4xl">
          <div
            className={`overflow-hidden rounded-[32px] ${
              passed
                ? 'bg-emerald-950'
                : 'bg-slate-950'
            } p-7 text-white shadow-xl md:p-10`}
          >
            <div
              className={`grid h-16 w-16 place-items-center rounded-2xl ${
                passed
                  ? 'bg-emerald-400/15 text-emerald-300'
                  : 'bg-red-400/15 text-red-300'
              }`}
            >
              {passed ? (
                <Trophy size={30} />
              ) : (
                <XCircle size={30} />
              )}
            </div>

            <p
              className={`mt-7 text-xs font-bold uppercase tracking-[.22em] ${
                passed
                  ? 'text-emerald-300'
                  : 'text-red-300'
              }`}
            >
              {passed
                ? 'DMHOUSE CERTIFIED'
                : 'CERTIFICATION NOT ACHIEVED'}
            </p>

            <h1 className="mt-2 text-4xl font-semibold tracking-tight">
              {passed
                ? 'You earned access to the Sales OS.'
                : 'Your employee workspace remains locked.'}
            </h1>

            <p className="mt-4 max-w-2xl text-base leading-7 text-slate-300">
              {passed
                ? 'You demonstrated the comprehension and response speed required to begin representing Data Market House.'
                : 'The final assessment is complete. A failed assessment cannot be retaken unless the Owner specifically authorizes another attempt.'}
            </p>
          </div>

          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-3xl bg-white p-6 shadow-sm">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Score
              </p>

              <p className="mt-2 text-3xl font-semibold">
                {Number(
                  exam.score || 0,
                ).toFixed(0)}
                %
              </p>
            </div>

            <div className="rounded-3xl bg-white p-6 shadow-sm">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Correct
              </p>

              <p className="mt-2 text-3xl font-semibold">
                {exam.correctCount || 0}
                /20
              </p>
            </div>

            <div className="rounded-3xl bg-white p-6 shadow-sm">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Timed Out
              </p>

              <p className="mt-2 text-3xl font-semibold">
                {exam.timedOutCount || 0}
              </p>
            </div>

            <div className="rounded-3xl bg-white p-6 shadow-sm">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Avg Response
              </p>

              <p className="mt-2 text-3xl font-semibold">
                {formatResponseTime(
                  exam.averageResponseMs,
                )}
              </p>
            </div>
          </div>

          {!passed && (
            <div className="mt-6 rounded-3xl border border-red-200 bg-red-50 p-6">
              <div className="flex gap-4">
                <LockKeyhole
                  className="mt-1 shrink-0 text-red-600"
                  size={24}
                />

                <div>
                  <h2 className="text-lg font-semibold text-red-950">
                    No automatic retake
                  </h2>

                  <p className="mt-2 leading-7 text-red-800">
                    This assessment is part
                    of the DMHOUSE hiring
                    standard. Another attempt
                    requires explicit Owner
                    authorization.
                  </p>
                </div>
              </div>
            </div>
          )}

          <div className="mt-6 flex flex-wrap gap-3">
            {passed ? (
              <button
                onClick={() => {
                  window.location.href =
                    '/employee';
                }}
                className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-blue-600 px-6 text-sm font-semibold text-white hover:bg-blue-700"
              >
                Enter Employee Sales OS
                <ArrowRight size={17} />
              </button>
            ) : (
              <button
                onClick={onBack}
                className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-slate-900 px-6 text-sm font-semibold text-white hover:bg-slate-800"
              >
                <ArrowLeft size={17} />
                Return to Academy
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (phase === 'exam' && exam) {
    const seconds =
      secondsFromMs(remainingMs);

    const urgent =
      seconds <= 3;

    return (
      <div className="min-h-screen bg-[#07101f] p-4 md:p-7">
        <div className="mx-auto max-w-5xl">
          <header className="flex items-center justify-between gap-4 text-white">
            <div>
              <p className="text-xs font-bold uppercase tracking-[.2em] text-blue-300">
                DMHOUSE Final Assessment
              </p>

              <h1 className="mt-1 text-xl font-semibold">
                Question{' '}
                {exam.questionPosition}{' '}
                of {exam.totalQuestions}
              </h1>
            </div>

            <div
              className={`grid h-20 w-20 place-items-center rounded-full border-4 text-3xl font-bold ${
                urgent
                  ? 'border-red-400 bg-red-500/15 text-red-300'
                  : 'border-blue-400 bg-blue-500/10 text-white'
              }`}
            >
              {seconds}
            </div>
          </header>

          <div className="mt-6 h-2 overflow-hidden rounded-full bg-white/10">
            <div
              className={`h-full transition-all ${
                urgent
                  ? 'bg-red-500'
                  : 'bg-blue-500'
              }`}
              style={{
                width: `${Math.max(
                  0,
                  Math.min(
                    100,
                    (remainingMs /
                      10000) *
                      100,
                  ),
                )}%`,
              }}
            />
          </div>

          <div className="mt-8 rounded-[32px] bg-white p-6 shadow-2xl md:p-10">
            <div className="flex items-center justify-between gap-4">
              <span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-slate-500">
                One answer only
              </span>

              <span className="inline-flex items-center gap-2 text-sm font-semibold text-slate-500">
                <Clock3 size={16} />
                10 seconds
              </span>
            </div>

            <h2 className="mt-7 text-2xl font-semibold leading-snug text-slate-950 md:text-3xl">
              {currentQuestion?.prompt ||
                'Assessment question unavailable.'}
            </h2>

            <div className="mt-8 grid gap-3">
              {displayedChoices.map(
                (choice, index) => (
                  <button
                    key={`${exam.itemKey}-${index}`}
                    disabled={busy}
                    onClick={() =>
                      void submitAnswer(
                        index,
                      )
                    }
                    className="group flex min-h-[72px] items-center gap-4 rounded-2xl border-2 border-slate-200 p-4 text-left transition hover:border-blue-500 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-slate-100 font-bold text-slate-600 group-hover:bg-blue-600 group-hover:text-white">
                      {String.fromCharCode(
                        65 + index,
                      )}
                    </span>

                    <span className="text-base font-medium leading-6 text-slate-900">
                      {choice}
                    </span>
                  </button>
                ),
              )}
            </div>

            {error && (
              <div className="mt-6 rounded-2xl bg-red-50 p-4 text-sm text-red-700">
                {error}
              </div>
            )}

            <div className="mt-7 flex items-start gap-3 border-t border-slate-100 pt-5 text-xs leading-5 text-slate-500">
              <ShieldCheck
                size={17}
                className="mt-0.5 shrink-0"
              />

              <p>
                Answers lock immediately.
                There is no back button.
                If the timer reaches zero,
                this question is recorded
                as incorrect automatically.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 p-5 md:p-8">
      <div className="mx-auto max-w-5xl">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-slate-900"
        >
          <ArrowLeft size={17} />
          Academy
        </button>

        <div className="mt-6 overflow-hidden rounded-[34px] bg-slate-950 text-white shadow-xl">
          <div className="p-7 md:p-10">
            <div className="grid h-14 w-14 place-items-center rounded-2xl bg-blue-500/15 text-blue-300">
              <ShieldCheck size={27} />
            </div>

            <p className="mt-7 text-xs font-bold uppercase tracking-[.22em] text-blue-300">
              Mission 6
            </p>

            <h1 className="mt-2 text-4xl font-semibold tracking-tight">
              Final Readiness Assessment
            </h1>

            <p className="mt-4 max-w-3xl text-lg leading-8 text-slate-300">
              This is not a practice quiz.
              It is the final screening
              assessment used to determine
              whether you are ready to
              represent Data Market House.
            </p>
          </div>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-4">
          <div className="rounded-3xl bg-white p-5 shadow-sm">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Questions
            </p>
            <p className="mt-2 text-3xl font-semibold">
              20
            </p>
          </div>

          <div className="rounded-3xl bg-white p-5 shadow-sm">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Per Question
            </p>
            <p className="mt-2 text-3xl font-semibold">
              10 sec
            </p>
          </div>

          <div className="rounded-3xl bg-white p-5 shadow-sm">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Passing
            </p>
            <p className="mt-2 text-3xl font-semibold">
              75%
            </p>
          </div>

          <div className="rounded-3xl bg-white p-5 shadow-sm">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Attempts
            </p>
            <p className="mt-2 text-3xl font-semibold">
              1
            </p>
          </div>
        </div>

        <div className="mt-6 rounded-3xl border border-amber-200 bg-amber-50 p-6">
          <div className="flex gap-4">
            <AlertTriangle
              size={25}
              className="mt-1 shrink-0 text-amber-600"
            />

            <div>
              <h2 className="text-lg font-semibold text-amber-950">
                Read before beginning
              </h2>

              <div className="mt-3 space-y-2 text-sm leading-6 text-amber-900">
                <p>
                  • Each question has exactly
                  10 seconds.
                </p>

                <p>
                  • A timeout counts as an
                  incorrect answer.
                </p>

                <p>
                  • You cannot return to a
                  previous question.
                </p>

                <p>
                  • Question and answer order
                  are randomized.
                </p>

                <p>
                  • You receive one attempt.
                  A failed assessment requires
                  Owner authorization before
                  another attempt can be taken.
                </p>

                <p>
                  • Switching away from the
                  assessment is recorded for
                  review.
                </p>
              </div>
            </div>
          </div>
        </div>

        {error && (
          <div className="mt-6 rounded-2xl bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        )}

        <button
          onClick={() =>
            void startAssessment()
          }
          disabled={busy}
          className="mt-6 inline-flex min-h-14 items-center gap-3 rounded-2xl bg-blue-600 px-7 text-base font-semibold text-white shadow-lg shadow-blue-200 hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <TimerReset size={20} />

          {busy
            ? 'Preparing assessment…'
            : 'Begin Final Assessment'}

          {!busy && (
            <ArrowRight size={19} />
          )}
        </button>

        <p className="mt-4 max-w-2xl text-xs leading-5 text-slate-500">
          Once you begin, your attempt is
          created on the DMHOUSE server.
          Closing or refreshing the browser
          does not restore the attempt.
        </p>
      </div>
    </div>
  );
}
