import {
  Activity,
  AlertTriangle,
  BarChart3,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock3,
  GraduationCap,
  History,
  LockKeyhole,
  RefreshCw,
  ShieldCheck,
  TimerReset,
  UserCheck,
  Users,
} from 'lucide-react';
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { supabase } from '../../lib/supabase';

type CandidateStage =
  | 'invited'
  | 'registered'
  | 'learning'
  | 'assessment_ready'
  | 'assessing'
  | 'cooldown'
  | 'locked'
  | 'certified'
  | 'hired'
  | 'rejected'
  | 'expired'
  | 'archived'
  | string;

type CandidateIntelligence = {
  candidate_id: string;
  cycle_id: string;
  user_id: string | null;

  full_name: string;
  email: string;

  stage: CandidateStage;

  invite_status: string | null;
  owner_status: string | null;

  learning_pace:
    | 'excellent'
    | 'on_track'
    | 'late'
    | 'expired'
    | 'completed'
    | 'not_started'
    | string;

  missions_completed: number | null;
  active_learning_seconds: number | null;
  practice_average: number | null;

  learning_started_at: string | null;
  learning_target_at: string | null;
  learning_deadline_at: string | null;
  learning_completed_at: string | null;

  final_attempts_used: number | null;
  final_attempt_limit: number | null;

  final_assessment_status: string | null;

  latest_attempt: number | null;
  latest_exam_status: string | null;
  latest_score: number | null;
  best_score: number | null;

  average_response_ms: number | null;
  timed_out_count: number | null;

  cooldown_until: string | null;

  certified: boolean;
  certified_at: string | null;

  last_activity_at: string | null;
  candidate_created_at: string;
};

type MissionIntelligence = {
  missionNumber: number;
  firstOpenedAt?: string | null;
  lastActivityAt?: string | null;
  completedAt?: string | null;
  activeSeconds?: number | null;
  viewCount?: number | null;
  practiceAttemptCount?: number | null;
  firstPracticeScore?: number | null;
  bestPracticeScore?: number | null;
  latestPracticeScore?: number | null;
};

type AssessmentAttempt = {
  sessionId: string;
  attemptNumber: number;
  status: string;
  startedAt?: string | null;
  finishedAt?: string | null;
  score?: number | null;
  correctCount?: number | null;
  timedOutCount?: number | null;
  averageResponseMs?: number | null;
};

type TimelineEvent = {
  id: number | string;
  eventType: string;
  actorId?: string | null;
  metadata?: Record<string, unknown> | null;
  createdAt: string;
};

type CandidateDossier = {
  summary?: CandidateIntelligence | null;
  missions?: MissionIntelligence[];
  assessmentHistory?: AssessmentAttempt[];
  timeline?: TimelineEvent[];
};

type LearningPracticeAttempt = {
  id: number | string;
  missionNumber: number;
  attemptNumber: number;
  score: number;
  passed: boolean;
  questionCount?: number | null;
  correctCount?: number | null;
  durationSeconds?: number | null;
  verificationLevel?: string | null;
  submittedAt?: string | null;
};

type LearningEngineDetail = {
  employeeId?: string;

  totals?: {
    sessionCount?: number | null;
    activeSeconds?: number | null;
    idleSeconds?: number | null;
    hiddenSeconds?: number | null;
    firstSessionAt?: string | null;
    lastSessionAt?: string | null;
  };

  missions?: Array<{
    missionNumber: number;
    sessionCount?: number | null;
    activeSeconds?: number | null;
    idleSeconds?: number | null;
    hiddenSeconds?: number | null;
    firstOpenedAt?: string | null;
    lastActivityAt?: string | null;
  }>;

  practiceAttempts?: LearningPracticeAttempt[];

  sessions?: Array<{
    id: string;
    missionNumber: number;
    status: string;
    startedAt?: string | null;
    endedAt?: string | null;
    activeSeconds?: number | null;
    idleSeconds?: number | null;
    hiddenSeconds?: number | null;
    heartbeatCount?: number | null;
    exitReason?: string | null;
  }>;
};

type MissionLearningCurve = {
  missionNumber: number;
  attempts: LearningPracticeAttempt[];
  firstScore: number;
  bestScore: number;
  latestScore: number;
  retryCount: number;
  improvement: number;
  passed: boolean;
};

function numberValue(
  value: number | null | undefined,
) {
  return Number(value || 0);
}

function niceDate(
  value?: string | null,
) {
  if (!value) return '—';

  const date = new Date(value);

  if (
    Number.isNaN(
      date.getTime(),
    )
  ) {
    return '—';
  }

  return date.toLocaleString();
}

function relativeTime(
  value?: string | null,
) {
  if (!value) return '—';

  const date = new Date(value);

  if (
    Number.isNaN(
      date.getTime(),
    )
  ) {
    return '—';
  }

  const diff =
    Date.now() - date.getTime();

  const minutes =
    Math.floor(
      Math.abs(diff) / 60000,
    );

  if (minutes < 1) {
    return 'Just now';
  }

  if (minutes < 60) {
    return `${minutes}m ago`;
  }

  const hours =
    Math.floor(
      minutes / 60,
    );

  if (hours < 24) {
    return `${hours}h ago`;
  }

  const days =
    Math.floor(
      hours / 24,
    );

  return `${days}d ago`;
}

function duration(
  seconds?: number | null,
) {
  const total =
    Math.max(
      0,
      numberValue(seconds),
    );

  const hours =
    Math.floor(
      total / 3600,
    );

  const minutes =
    Math.floor(
      (total % 3600) / 60,
    );

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }

  return `${minutes}m`;
}

function responseTime(
  ms?: number | null,
) {
  if (ms == null) {
    return '—';
  }

  return `${(
    Number(ms) / 1000
  ).toFixed(1)} sec`;
}

function remainingUntil(
  value?: string | null,
  now = Date.now(),
) {
  if (!value) return 0;

  const end =
    new Date(value).getTime();

  if (
    Number.isNaN(end)
  ) {
    return 0;
  }

  return Math.max(
    0,
    Math.floor(
      (end - now) / 1000,
    ),
  );
}

function countdown(
  seconds: number,
) {
  const total =
    Math.max(
      0,
      Math.floor(seconds),
    );

  const days =
    Math.floor(
      total / 86400,
    );

  const hours =
    Math.floor(
      (total % 86400) / 3600,
    );

  const minutes =
    Math.floor(
      (total % 3600) / 60,
    );

  const secs =
    total % 60;

  const time =
    [hours, minutes, secs]
      .map((value) =>
        String(value).padStart(
          2,
          '0',
        ),
      )
      .join(':');

  return days > 0
    ? `${days}d ${time}`
    : time;
}

function stageLabel(
  stage: CandidateStage,
) {
  switch (stage) {
    case 'assessment_ready':
      return 'Assessment Ready';

    case 'assessing':
      return 'Assessing';

    case 'cooldown':
      return 'Cooldown';

    case 'locked':
      return 'Assessment Locked';

    case 'certified':
      return 'Certified';

    case 'hired':
      return 'Hired';

    case 'registered':
      return 'Registered';

    case 'learning':
      return 'Learning';

    case 'invited':
      return 'Invited';

    case 'rejected':
      return 'Rejected';

    case 'expired':
      return 'Expired';

    case 'archived':
      return 'Archived';

    default:
      return String(stage || 'Unknown')
        .replace(/_/g, ' ');
  }
}

function stageStyle(
  stage: CandidateStage,
) {
  switch (stage) {
    case 'hired':
    case 'certified':
      return 'border-emerald-200 bg-emerald-50 text-emerald-700';

    case 'learning':
      return 'border-blue-200 bg-blue-50 text-blue-700';

    case 'assessment_ready':
    case 'assessing':
      return 'border-violet-200 bg-violet-50 text-violet-700';

    case 'cooldown':
      return 'border-amber-200 bg-amber-50 text-amber-700';

    case 'locked':
    case 'rejected':
    case 'expired':
      return 'border-red-200 bg-red-50 text-red-700';

    default:
      return 'border-slate-200 bg-slate-50 text-slate-600';
  }
}

function paceLabel(
  pace?: string | null,
) {
  switch (pace) {
    case 'excellent':
      return 'Excellent';

    case 'on_track':
      return 'On Track';

    case 'late':
      return 'Late';

    case 'expired':
      return 'Expired';

    case 'completed':
      return 'Completed';

    case 'not_started':
      return 'Not Started';

    default:
      return pace
        ? pace.replace(/_/g, ' ')
        : '—';
  }
}

function paceStyle(
  pace?: string | null,
) {
  if (
    pace === 'excellent' ||
    pace === 'completed'
  ) {
    return 'text-emerald-700';
  }

  if (
    pace === 'late'
  ) {
    return 'text-amber-700';
  }

  if (
    pace === 'expired'
  ) {
    return 'text-red-700';
  }

  return 'text-blue-700';
}

function eventLabel(
  eventType: string,
) {
  return eventType
    .replace(/\./g, ' · ')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (letter: string) =>
      letter.toUpperCase(),
    );
}

function average(
  values: number[],
) {
  if (!values.length) {
    return null;
  }

  return (
    values.reduce(
      (sum, value) =>
        sum + value,
      0,
    ) / values.length
  );
}

function buildLearningCurve(
  attempts: LearningPracticeAttempt[],
) {
  const grouped =
    new Map<
      number,
      LearningPracticeAttempt[]
    >();

  for (const attempt of attempts) {
    const current =
      grouped.get(
        attempt.missionNumber,
      ) || [];

    current.push(attempt);

    grouped.set(
      attempt.missionNumber,
      current,
    );
  }

  const missions:
    MissionLearningCurve[] =
    [];

  for (
    let missionNumber = 1;
    missionNumber <= 5;
    missionNumber++
  ) {
    const missionAttempts =
      (
        grouped.get(
          missionNumber,
        ) || []
      )
        .slice()
        .sort(
          (a, b) =>
            a.attemptNumber -
            b.attemptNumber,
        );

    if (!missionAttempts.length) {
      continue;
    }

    const firstScore =
      Number(
        missionAttempts[0]
          .score || 0,
      );

    const latestScore =
      Number(
        missionAttempts[
          missionAttempts.length - 1
        ].score || 0,
      );

    const bestScore =
      Math.max(
        ...missionAttempts.map(
          (attempt) =>
            Number(
              attempt.score || 0,
            ),
        ),
      );

    missions.push({
      missionNumber,
      attempts:
        missionAttempts,

      firstScore,
      bestScore,
      latestScore,

      retryCount:
        Math.max(
          0,
          missionAttempts.length - 1,
        ),

      improvement:
        bestScore -
        firstScore,

      passed:
        missionAttempts.some(
          (attempt) =>
            Boolean(
              attempt.passed,
            ),
        ),
    });
  }

  const firstAttemptAverage =
    average(
      missions.map(
        (mission) =>
          mission.firstScore,
      ),
    );

  const bestAverage =
    average(
      missions.map(
        (mission) =>
          mission.bestScore,
      ),
    );

  const totalAttempts =
    attempts.length;

  const retries =
    missions.reduce(
      (sum, mission) =>
        sum +
        mission.retryCount,
      0,
    );

  const improvementAverage =
    average(
      missions.map(
        (mission) =>
          mission.improvement,
      ),
    );

  const firstAttemptPasses =
    missions.filter(
      (mission) =>
        mission.attempts[0]
          ?.passed,
    ).length;

  return {
    missions,
    firstAttemptAverage,
    bestAverage,
    totalAttempts,
    retries,
    improvementAverage,
    firstAttemptPasses,
  };
}

function Metric({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail?: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-slate-50/80 p-4">
      <p className="text-[11px] font-bold uppercase tracking-[.14em] text-slate-400">
        {label}
      </p>

      <p className="mt-2 text-lg font-semibold text-slate-950">
        {value}
      </p>

      {detail && (
        <p className="mt-1 text-xs leading-5 text-slate-500">
          {detail}
        </p>
      )}
    </div>
  );
}

export default function HiringCommandCenter() {
  const [candidates, setCandidates] =
    useState<CandidateIntelligence[]>([]);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState('');

  const [selectedId, setSelectedId] =
    useState<string | null>(null);

  const [dossier, setDossier] =
    useState<CandidateDossier | null>(
      null,
    );

  const [dossierLoading, setDossierLoading] =
    useState(false);

  const [
    learningDetail,
    setLearningDetail,
  ] =
    useState<LearningEngineDetail | null>(
      null,
    );

  const [
    learningDetailLoading,
    setLearningDetailLoading,
  ] =
    useState(false);

  const [now, setNow] =
    useState(Date.now());

  const load =
    useCallback(async () => {
      setLoading(true);
      setError('');

      const {
        data,
        error: rpcError,
      } = await supabase.rpc(
        'dmh_owner_candidate_intelligence',
      );

      if (rpcError) {
        setError(
          rpcError.message,
        );

        setLoading(false);
        return;
      }

      setCandidates(
        Array.isArray(data)
          ? (
              data as CandidateIntelligence[]
            )
          : [],
      );

      setLoading(false);
    }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const timer =
      window.setInterval(() => {
        setNow(Date.now());
      }, 1000);

    return () => {
      window.clearInterval(
        timer,
      );
    };
  }, []);

  const counts =
    useMemo(() => {
      const countStage = (
        ...stages: string[]
      ) =>
        candidates.filter(
          (candidate) =>
            stages.includes(
              candidate.stage,
            ),
        ).length;

      return {
        active:
          candidates.filter(
            (candidate) =>
              ![
                'hired',
                'rejected',
                'archived',
                'expired',
              ].includes(
                candidate.stage,
              ),
          ).length,

        learning:
          countStage(
            'registered',
            'learning',
          ),

        ready:
          countStage(
            'assessment_ready',
            'assessing',
          ),

        cooldown:
          countStage(
            'cooldown',
          ),

        attention:
          countStage(
            'locked',
            'expired',
            'rejected',
          ),

        hired:
          countStage(
            'certified',
            'hired',
          ),
      };
    }, [candidates]);

  async function toggleCandidate(
    candidate: CandidateIntelligence,
  ) {
    if (
      selectedId ===
      candidate.candidate_id
    ) {
      setSelectedId(null);
      setDossier(null);
      setLearningDetail(null);
      setLearningDetailLoading(false);
      return;
    }

    setSelectedId(
      candidate.candidate_id,
    );

    setDossier(null);
    setLearningDetail(null);

    setDossierLoading(true);
    setLearningDetailLoading(true);

    const {
      data,
      error: rpcError,
    } = await supabase.rpc(
      'dmh_owner_candidate_dossier',
      {
        p_candidate_id:
          candidate.candidate_id,
      },
    );

    if (rpcError) {
      setError(
        rpcError.message,
      );

      setDossierLoading(false);
      return;
    }

    setDossier(
      (
        data || {}
      ) as CandidateDossier,
    );

    setDossierLoading(false);

    if (!candidate.user_id) {
      setLearningDetailLoading(
        false,
      );

      return;
    }

    const {
      data: learningData,
      error: learningError,
    } = await supabase.rpc(
      'dmh_owner_learning_engine_summary',
      {
        p_employee_id:
          candidate.user_id,
      },
    );

    if (learningError) {
      console.error(
        'Learning Engine dossier failed:',
        learningError,
      );

      setLearningDetailLoading(
        false,
      );

      return;
    }

    setLearningDetail(
      (
        learningData || {}
      ) as LearningEngineDetail,
    );

    setLearningDetailLoading(
      false,
    );
  }

  return (
    <section>
      <div className="overflow-hidden rounded-[30px] border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 bg-slate-950 px-6 py-7 text-white md:px-8">
          <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <ShieldCheck
                  size={18}
                  className="text-blue-400"
                />

                <p className="text-xs font-bold uppercase tracking-[.2em] text-blue-300">
                  Hiring OS
                </p>
              </div>

              <h2 className="mt-2 text-2xl font-semibold tracking-tight md:text-3xl">
                Hiring Command Center
              </h2>

              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">
                Canonical candidate state,
                learning intelligence, and
                certification telemetry from
                the DMHOUSE Hiring Core.
              </p>
            </div>

            <button
              type="button"
              onClick={() =>
                void load()
              }
              disabled={loading}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/10 px-4 text-sm font-semibold text-white hover:bg-white/15 disabled:opacity-50"
            >
              <RefreshCw
                size={16}
                className={
                  loading
                    ? 'animate-spin'
                    : ''
                }
              />

              Refresh Intelligence
            </button>
          </div>
        </div>

        <div className="grid gap-px bg-slate-100 sm:grid-cols-2 xl:grid-cols-6">
          {[
            {
              label: 'Active',
              value: counts.active,
              icon: Users,
              color:
                'text-blue-600',
            },
            {
              label: 'Learning',
              value: counts.learning,
              icon: BookOpen,
              color:
                'text-indigo-600',
            },
            {
              label: 'Assessment',
              value: counts.ready,
              icon: GraduationCap,
              color:
                'text-violet-600',
            },
            {
              label: 'Cooldown',
              value: counts.cooldown,
              icon: TimerReset,
              color:
                'text-amber-600',
            },
            {
              label: 'Needs Attention',
              value: counts.attention,
              icon: AlertTriangle,
              color:
                'text-red-600',
            },
            {
              label: 'Certified / Hired',
              value: counts.hired,
              icon: UserCheck,
              color:
                'text-emerald-600',
            },
          ].map(
            ({
              label,
              value,
              icon: Icon,
              color,
            }) => (
              <div
                key={label}
                className="bg-white p-5"
              >
                <Icon
                  size={19}
                  className={
                    color
                  }
                />

                <p className="mt-4 text-[11px] font-bold uppercase tracking-[.12em] text-slate-400">
                  {label}
                </p>

                <p className="mt-1 text-2xl font-semibold text-slate-950">
                  {value}
                </p>
              </div>
            ),
          )}
        </div>

        {error && (
          <div className="m-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        )}

        {loading ? (
          <div className="p-10 text-center text-sm text-slate-500">
            Loading Hiring Intelligence…
          </div>
        ) : candidates.length === 0 ? (
          <div className="p-10 text-center">
            <Users className="mx-auto text-slate-300" />

            <p className="mt-4 font-semibold text-slate-700">
              No candidates yet
            </p>

            <p className="mt-1 text-sm text-slate-500">
              Create an Academy invitation
              to begin a hiring cycle.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {candidates.map(
              (candidate) => {
                const missions =
                  Math.max(
                    0,
                    Math.min(
                      5,
                      numberValue(
                        candidate.missions_completed,
                      ),
                    ),
                  );

                const missionPercent =
                  Math.round(
                    (
                      missions /
                      5
                    ) *
                      100,
                  );

                const deadlineRemaining =
                  remainingUntil(
                    candidate.learning_deadline_at,
                    now,
                  );

                const cooldownRemaining =
                  remainingUntil(
                    candidate.cooldown_until,
                    now,
                  );

                const attemptsUsed =
                  numberValue(
                    candidate.final_attempts_used,
                  );

                const attemptLimit =
                  numberValue(
                    candidate.final_attempt_limit,
                  ) || 3;

                const selected =
                  selectedId ===
                  candidate.candidate_id;

                return (
                  <article
                    key={
                      candidate.candidate_id
                    }
                    className="p-6 md:p-7"
                  >
                    <div className="flex flex-col gap-5 xl:flex-row xl:items-start">
                      <div className="flex min-w-0 flex-1 gap-4">
                        <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-blue-50 text-blue-600">
                          <GraduationCap
                            size={21}
                          />
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="truncate text-lg font-semibold text-slate-950">
                              {candidate.full_name}
                            </h3>

                            <span
                              className={`rounded-full border px-2.5 py-1 text-[11px] font-bold ${stageStyle(
                                candidate.stage,
                              )}`}
                            >
                              {stageLabel(
                                candidate.stage,
                              )}
                            </span>
                          </div>

                          <p className="mt-1 truncate text-sm text-slate-500">
                            {candidate.email}
                          </p>

                          <div className="mt-5">
                            <div className="flex items-center justify-between text-xs">
                              <span className="font-semibold text-slate-600">
                                Learning Progress
                              </span>

                              <span className="text-slate-400">
                                {missions} / 5 missions
                              </span>
                            </div>

                            <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
                              <div
                                className="h-full rounded-full bg-blue-600 transition-all"
                                style={{
                                  width: `${missionPercent}%`,
                                }}
                              />
                            </div>
                          </div>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() =>
                          void toggleCandidate(
                            candidate,
                          )
                        }
                        className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                      >
                        {selected
                          ? 'Close Dossier'
                          : 'View Candidate'}

                        {selected ? (
                          <ChevronUp
                            size={16}
                          />
                        ) : (
                          <ChevronDown
                            size={16}
                          />
                        )}
                      </button>
                    </div>

                    <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
                      <Metric
                        label="Learning Pace"
                        value={
                          paceLabel(
                            candidate.learning_pace,
                          )
                        }
                        detail={
                          candidate.learning_pace ===
                          'excellent'
                            ? 'Within first 24h'
                            : undefined
                        }
                      />

                      <Metric
                        label="Active Study"
                        value={duration(
                          candidate.active_learning_seconds,
                        )}
                      />

                      <Metric
                        label="Practice Avg"
                        value={
                          candidate.practice_average ==
                          null
                            ? '—'
                            : `${Number(
                                candidate.practice_average,
                              ).toFixed(
                                0,
                              )}%`
                        }
                      />

                      <Metric
                        label="Academy Deadline"
                        value={
                          candidate.learning_deadline_at
                            ? countdown(
                                deadlineRemaining,
                              )
                            : '—'
                        }
                        detail={
                          candidate.learning_deadline_at
                            ? niceDate(
                                candidate.learning_deadline_at,
                              )
                            : undefined
                        }
                      />

                      <Metric
                        label="Assessment"
                        value={`${attemptsUsed} / ${attemptLimit}`}
                        detail={
                          candidate.latest_attempt
                            ? `Latest attempt ${candidate.latest_attempt}`
                            : 'Not attempted'
                        }
                      />

                      <Metric
                        label="Latest Score"
                        value={
                          candidate.latest_score ==
                          null
                            ? '—'
                            : `${Number(
                                candidate.latest_score,
                              ).toFixed(
                                0,
                              )}%`
                        }
                        detail={
                          candidate.best_score ==
                          null
                            ? undefined
                            : `Best ${Number(
                                candidate.best_score,
                              ).toFixed(
                                0,
                              )}%`
                        }
                      />

                      <Metric
                        label={
                          candidate.stage ===
                          'cooldown'
                            ? 'Cooldown'
                            : 'Last Activity'
                        }
                        value={
                          candidate.stage ===
                            'cooldown' &&
                          candidate.cooldown_until
                            ? countdown(
                                cooldownRemaining,
                              )
                            : relativeTime(
                                candidate.last_activity_at,
                              )
                        }
                        detail={
                          candidate.stage ===
                            'cooldown' &&
                          candidate.cooldown_until
                            ? `Unlocks ${niceDate(
                                candidate.cooldown_until,
                              )}`
                            : undefined
                        }
                      />
                    </div>

                    <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-slate-500">
                      <span
                        className={`font-semibold ${paceStyle(
                          candidate.learning_pace,
                        )}`}
                      >
                        Pace:{' '}
                        {paceLabel(
                          candidate.learning_pace,
                        )}
                      </span>

                      <span>
                        Avg response:{' '}
                        {responseTime(
                          candidate.average_response_ms,
                        )}
                      </span>

                      <span>
                        Timeouts:{' '}
                        {numberValue(
                          candidate.timed_out_count,
                        )}
                      </span>

                      <span>
                        Started:{' '}
                        {niceDate(
                          candidate.learning_started_at ||
                            candidate.candidate_created_at,
                        )}
                      </span>
                    </div>

                    {selected && (
                      <div className="mt-7 overflow-hidden rounded-[26px] border border-slate-200 bg-slate-50">
                        {dossierLoading ? (
                          <div className="p-8 text-sm text-slate-500">
                            Loading candidate dossier…
                          </div>
                        ) : !dossier ? (
                          <div className="p-8 text-sm text-slate-500">
                            Candidate dossier is unavailable.
                          </div>
                        ) : (
                          <div>
                            <div className="border-b border-slate-200 bg-white p-6">
                              <div className="flex items-center gap-3">
                                <BarChart3
                                  size={20}
                                  className="text-blue-600"
                                />

                                <div>
                                  <h4 className="font-semibold text-slate-950">
                                    Candidate Intelligence Dossier
                                  </h4>

                                  <p className="mt-1 text-sm text-slate-500">
                                    Server-authoritative learning and assessment history.
                                  </p>
                                </div>
                              </div>
                            </div>

                            <section className="border-b border-slate-200 bg-gradient-to-br from-slate-950 to-slate-900 p-6 text-white">
                              <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                                <div>
                                  <div className="flex items-center gap-2">
                                    <Activity
                                      size={18}
                                      className="text-blue-400"
                                    />

                                    <p className="text-xs font-bold uppercase tracking-[.18em] text-blue-300">
                                      Learning Engine
                                    </p>
                                  </div>

                                  <h5 className="mt-2 text-xl font-semibold">
                                    Learning Curve Intelligence
                                  </h5>

                                  <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">
                                    Objective evidence showing first-attempt comprehension,
                                    improvement, retries, and actual learning-session behavior.
                                  </p>
                                </div>
                              </div>

                              {learningDetailLoading ? (
                                <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-5 text-sm text-slate-300">
                                  Loading Learning Engine evidence…
                                </div>
                              ) : !learningDetail ? (
                                <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-5 text-sm text-slate-300">
                                  No detailed Learning Engine record is available for this candidate yet.
                                </div>
                              ) : (() => {
                                const insight =
                                  buildLearningCurve(
                                    learningDetail.practiceAttempts ||
                                      [],
                                  );

                                const totals =
                                  learningDetail.totals ||
                                  {};

                                return (
                                  <>
                                    <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
                                      <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                                        <p className="text-[10px] font-bold uppercase tracking-[.14em] text-slate-400">
                                          First Attempt Avg
                                        </p>

                                        <p className="mt-2 text-2xl font-semibold">
                                          {insight.firstAttemptAverage ==
                                          null
                                            ? '—'
                                            : `${Math.round(
                                                insight.firstAttemptAverage,
                                              )}%`}
                                        </p>
                                      </div>

                                      <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                                        <p className="text-[10px] font-bold uppercase tracking-[.14em] text-slate-400">
                                          Best Average
                                        </p>

                                        <p className="mt-2 text-2xl font-semibold">
                                          {insight.bestAverage ==
                                          null
                                            ? '—'
                                            : `${Math.round(
                                                insight.bestAverage,
                                              )}%`}
                                        </p>
                                      </div>

                                      <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                                        <p className="text-[10px] font-bold uppercase tracking-[.14em] text-slate-400">
                                          Practice Attempts
                                        </p>

                                        <p className="mt-2 text-2xl font-semibold">
                                          {
                                            insight.totalAttempts
                                          }
                                        </p>
                                      </div>

                                      <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                                        <p className="text-[10px] font-bold uppercase tracking-[.14em] text-slate-400">
                                          Retries
                                        </p>

                                        <p className="mt-2 text-2xl font-semibold">
                                          {insight.retries}
                                        </p>
                                      </div>

                                      <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                                        <p className="text-[10px] font-bold uppercase tracking-[.14em] text-slate-400">
                                          Avg Improvement
                                        </p>

                                        <p className="mt-2 text-2xl font-semibold">
                                          {insight.improvementAverage ==
                                          null
                                            ? '—'
                                            : `+${Math.round(
                                                insight.improvementAverage,
                                              )}%`}
                                        </p>
                                      </div>

                                      <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                                        <p className="text-[10px] font-bold uppercase tracking-[.14em] text-slate-400">
                                          Active Study
                                        </p>

                                        <p className="mt-2 text-2xl font-semibold">
                                          {duration(
                                            totals.activeSeconds,
                                          )}
                                        </p>
                                      </div>

                                      <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                                        <p className="text-[10px] font-bold uppercase tracking-[.14em] text-slate-400">
                                          Study Sessions
                                        </p>

                                        <p className="mt-2 text-2xl font-semibold">
                                          {numberValue(
                                            totals.sessionCount,
                                          )}
                                        </p>
                                      </div>
                                    </div>

                                    <div className="mt-3 grid gap-3 md:grid-cols-3">
                                      <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                                        <div className="flex items-center gap-2">
                                          <CheckCircle2
                                            size={16}
                                            className="text-emerald-400"
                                          />

                                          <p className="text-xs font-semibold text-slate-200">
                                            First-attempt passes
                                          </p>
                                        </div>

                                        <p className="mt-2 text-lg font-semibold">
                                          {
                                            insight.firstAttemptPasses
                                          }{' '}
                                          /{' '}
                                          {
                                            insight.missions.length
                                          }
                                        </p>
                                      </div>

                                      <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                                        <div className="flex items-center gap-2">
                                          <Clock3
                                            size={16}
                                            className="text-amber-300"
                                          />

                                          <p className="text-xs font-semibold text-slate-200">
                                            Visible idle time
                                          </p>
                                        </div>

                                        <p className="mt-2 text-lg font-semibold">
                                          {duration(
                                            totals.idleSeconds,
                                          )}
                                        </p>
                                      </div>

                                      <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                                        <div className="flex items-center gap-2">
                                          <LockKeyhole
                                            size={16}
                                            className="text-violet-300"
                                          />

                                          <p className="text-xs font-semibold text-slate-200">
                                            Hidden-tab time
                                          </p>
                                        </div>

                                        <p className="mt-2 text-lg font-semibold">
                                          {duration(
                                            totals.hiddenSeconds,
                                          )}
                                        </p>
                                      </div>
                                    </div>

                                    {!insight.missions.length ? (
                                      <div className="mt-5 rounded-2xl border border-white/10 bg-white/5 p-5 text-sm text-slate-300">
                                        No Mission Check attempt history has been recorded yet.
                                      </div>
                                    ) : (
                                      <div className="mt-6 grid gap-3 xl:grid-cols-5">
                                        {insight.missions.map(
                                          (mission) => (
                                            <div
                                              key={
                                                mission.missionNumber
                                              }
                                              className="rounded-2xl border border-white/10 bg-white/5 p-4"
                                            >
                                              <div className="flex items-center justify-between gap-2">
                                                <p className="font-semibold">
                                                  Mission{' '}
                                                  {
                                                    mission.missionNumber
                                                  }
                                                </p>

                                                <span
                                                  className={
                                                    mission.passed
                                                      ? 'text-xs font-bold text-emerald-300'
                                                      : 'text-xs font-bold text-amber-300'
                                                  }
                                                >
                                                  {mission.passed
                                                    ? 'Passed'
                                                    : 'In Progress'}
                                                </span>
                                              </div>

                                              <div className="mt-4 space-y-2">
                                                {mission.attempts.map(
                                                  (
                                                    attempt,
                                                  ) => (
                                                    <div
                                                      key={
                                                        attempt.id
                                                      }
                                                      className="flex items-center justify-between rounded-xl bg-black/20 px-3 py-2 text-xs"
                                                    >
                                                      <span className="text-slate-400">
                                                        Attempt{' '}
                                                        {
                                                          attempt.attemptNumber
                                                        }
                                                      </span>

                                                      <span
                                                        className={
                                                          attempt.passed
                                                            ? 'font-bold text-emerald-300'
                                                            : 'font-bold text-slate-200'
                                                        }
                                                      >
                                                        {Math.round(
                                                          Number(
                                                            attempt.score ||
                                                              0,
                                                          ),
                                                        )}
                                                        %
                                                      </span>
                                                    </div>
                                                  ),
                                                )}
                                              </div>

                                              <div className="mt-4 border-t border-white/10 pt-3 text-xs">
                                                <div className="flex justify-between">
                                                  <span className="text-slate-400">
                                                    First
                                                  </span>

                                                  <span>
                                                    {
                                                      mission.firstScore
                                                    }
                                                    %
                                                  </span>
                                                </div>

                                                <div className="mt-1 flex justify-between">
                                                  <span className="text-slate-400">
                                                    Best
                                                  </span>

                                                  <span>
                                                    {
                                                      mission.bestScore
                                                    }
                                                    %
                                                  </span>
                                                </div>

                                                <div className="mt-1 flex justify-between">
                                                  <span className="text-slate-400">
                                                    Improvement
                                                  </span>

                                                  <span
                                                    className={
                                                      mission.improvement >
                                                      0
                                                        ? 'text-emerald-300'
                                                        : ''
                                                    }
                                                  >
                                                    {mission.improvement >
                                                    0
                                                      ? '+'
                                                      : ''}
                                                    {
                                                      mission.improvement
                                                    }
                                                    %
                                                  </span>
                                                </div>
                                              </div>
                                            </div>
                                          ),
                                        )}
                                      </div>
                                    )}
                                  </>
                                );
                              })()}
                            </section>

                            <div className="grid gap-0 lg:grid-cols-2">
                              <section className="border-b border-slate-200 p-6 lg:border-b-0 lg:border-r">
                                <div className="flex items-center gap-2">
                                  <BookOpen
                                    size={18}
                                    className="text-blue-600"
                                  />

                                  <h5 className="font-semibold">
                                    Mission Intelligence
                                  </h5>
                                </div>

                                {!dossier.missions?.length ? (
                                  <p className="mt-5 text-sm text-slate-500">
                                    No server-side mission activity has been recorded yet.
                                  </p>
                                ) : (
                                  <div className="mt-5 space-y-3">
                                    {dossier.missions.map(
                                      (
                                        mission,
                                      ) => (
                                        <div
                                          key={
                                            mission.missionNumber
                                          }
                                          className="rounded-2xl bg-white p-4 shadow-sm"
                                        >
                                          <div className="flex items-center justify-between gap-3">
                                            <div className="flex items-center gap-3">
                                              <div className="grid h-9 w-9 place-items-center rounded-xl bg-blue-50 text-sm font-bold text-blue-700">
                                                {
                                                  mission.missionNumber
                                                }
                                              </div>

                                              <div>
                                                <p className="text-sm font-semibold">
                                                  Mission{' '}
                                                  {
                                                    mission.missionNumber
                                                  }
                                                </p>

                                                <p className="mt-0.5 text-xs text-slate-400">
                                                  {mission.completedAt
                                                    ? 'Complete'
                                                    : 'In progress'}
                                                </p>
                                              </div>
                                            </div>

                                            <span className="text-sm font-semibold text-slate-700">
                                              {mission.bestPracticeScore ==
                                              null
                                                ? '—'
                                                : `${Number(
                                                    mission.bestPracticeScore,
                                                  ).toFixed(
                                                    0,
                                                  )}%`}
                                            </span>
                                          </div>

                                          <div className="mt-4 grid grid-cols-3 gap-2 text-xs">
                                            <div>
                                              <p className="text-slate-400">
                                                Active
                                              </p>

                                              <p className="mt-1 font-semibold">
                                                {duration(
                                                  mission.activeSeconds,
                                                )}
                                              </p>
                                            </div>

                                            <div>
                                              <p className="text-slate-400">
                                                Views
                                              </p>

                                              <p className="mt-1 font-semibold">
                                                {numberValue(
                                                  mission.viewCount,
                                                )}
                                              </p>
                                            </div>

                                            <div>
                                              <p className="text-slate-400">
                                                Attempts
                                              </p>

                                              <p className="mt-1 font-semibold">
                                                {numberValue(
                                                  mission.practiceAttemptCount,
                                                )}
                                              </p>
                                            </div>
                                          </div>
                                        </div>
                                      ),
                                    )}
                                  </div>
                                )}
                              </section>

                              <section className="p-6">
                                <div className="flex items-center gap-2">
                                  <GraduationCap
                                    size={18}
                                    className="text-violet-600"
                                  />

                                  <h5 className="font-semibold">
                                    Assessment History
                                  </h5>
                                </div>

                                {!dossier.assessmentHistory?.length ? (
                                  <p className="mt-5 text-sm text-slate-500">
                                    Final assessment has not been attempted.
                                  </p>
                                ) : (
                                  <div className="mt-5 space-y-3">
                                    {dossier.assessmentHistory.map(
                                      (
                                        attempt,
                                      ) => (
                                        <div
                                          key={
                                            attempt.sessionId
                                          }
                                          className="rounded-2xl bg-white p-4 shadow-sm"
                                        >
                                          <div className="flex items-center justify-between gap-3">
                                            <div>
                                              <p className="font-semibold">
                                                Attempt{' '}
                                                {
                                                  attempt.attemptNumber
                                                }
                                              </p>

                                              <p className="mt-1 text-xs text-slate-400">
                                                {niceDate(
                                                  attempt.finishedAt ||
                                                    attempt.startedAt,
                                                )}
                                              </p>
                                            </div>

                                            <span
                                              className={`rounded-full px-2.5 py-1 text-xs font-bold ${
                                                attempt.status ===
                                                'passed'
                                                  ? 'bg-emerald-50 text-emerald-700'
                                                  : attempt.status ===
                                                      'failed'
                                                    ? 'bg-red-50 text-red-700'
                                                    : 'bg-violet-50 text-violet-700'
                                              }`}
                                            >
                                              {
                                                attempt.status
                                              }
                                            </span>
                                          </div>

                                          <div className="mt-4 grid grid-cols-4 gap-2 text-xs">
                                            <div>
                                              <p className="text-slate-400">
                                                Score
                                              </p>

                                              <p className="mt-1 font-semibold">
                                                {attempt.score ==
                                                null
                                                  ? '—'
                                                  : `${Number(
                                                      attempt.score,
                                                    ).toFixed(
                                                      0,
                                                    )}%`}
                                              </p>
                                            </div>

                                            <div>
                                              <p className="text-slate-400">
                                                Correct
                                              </p>

                                              <p className="mt-1 font-semibold">
                                                {numberValue(
                                                  attempt.correctCount,
                                                )}
                                              </p>
                                            </div>

                                            <div>
                                              <p className="text-slate-400">
                                                Timeouts
                                              </p>

                                              <p className="mt-1 font-semibold">
                                                {numberValue(
                                                  attempt.timedOutCount,
                                                )}
                                              </p>
                                            </div>

                                            <div>
                                              <p className="text-slate-400">
                                                Avg
                                              </p>

                                              <p className="mt-1 font-semibold">
                                                {responseTime(
                                                  attempt.averageResponseMs,
                                                )}
                                              </p>
                                            </div>
                                          </div>
                                        </div>
                                      ),
                                    )}
                                  </div>
                                )}
                              </section>
                            </div>

                            <section className="border-t border-slate-200 p-6">
                              <div className="flex items-center gap-2">
                                <History
                                  size={18}
                                  className="text-slate-600"
                                />

                                <h5 className="font-semibold">
                                  Hiring Timeline
                                </h5>
                              </div>

                              {!dossier.timeline?.length ? (
                                <p className="mt-5 text-sm text-slate-500">
                                  No timeline events are available.
                                </p>
                              ) : (
                                <div className="mt-5 space-y-0">
                                  {dossier.timeline
                                    .slice(
                                      0,
                                      12,
                                    )
                                    .map(
                                      (
                                        event,
                                        index,
                                      ) => (
                                        <div
                                          key={
                                            event.id
                                          }
                                          className="relative flex gap-4 pb-5"
                                        >
                                          {index <
                                            Math.min(
                                              12,
                                              dossier.timeline?.length ||
                                                0,
                                            ) -
                                              1 && (
                                            <div className="absolute bottom-0 left-[9px] top-5 w-px bg-slate-200" />
                                          )}

                                          <div className="relative mt-1 h-[19px] w-[19px] shrink-0 rounded-full border-4 border-slate-50 bg-blue-500" />

                                          <div className="min-w-0">
                                            <p className="text-sm font-semibold text-slate-800">
                                              {eventLabel(
                                                event.eventType,
                                              )}
                                            </p>

                                            <p className="mt-1 text-xs text-slate-400">
                                              {niceDate(
                                                event.createdAt,
                                              )}
                                            </p>
                                          </div>
                                        </div>
                                      ),
                                    )}
                                </div>
                              )}
                            </section>
                          </div>
                        )}
                      </div>
                    )}
                  </article>
                );
              },
            )}
          </div>
        )}
      </div>
    </section>
  );
}
