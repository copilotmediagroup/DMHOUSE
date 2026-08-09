import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  Clock3,
  GraduationCap,
  LockKeyhole,
  Play,
  ShieldCheck,
  Sparkles,
  Target,
} from 'lucide-react';
import { Card } from '../../../components/Primitives';
import { usePortfolioStore } from '../../../store/PortfolioStore';
import {
  useAcademy,
  type AcademyMissionStatus,
} from '../../../store/AcademyStore';
import {
  formatActiveTime,
  formatSeconds,
  type AcademyLearningState,
} from './useAcademyIntelligence';

type Props = {
  onOpenMission: (missionNumber: number) => void;
  intelligence: AcademyLearningState | null;
  refreshIntelligence: () => Promise<void>;
};

type MissionDefinition = {
  number: number;
  title: string;
  description: string;
  minutes: string;
};

const missionDefinitions:
  MissionDefinition[] = [
  {
    number: 1,
    title:
      'Welcome to Data Market House',
    description:
      'Understand who we are, your role, professional standards, confidentiality, and the rule to never guess.',
    minutes: '10–15 min',
  },
  {
    number: 2,
    title:
      'Speak the Language',
    description:
      'Learn the portfolio terminology you will hear in real buyer conversations.',
    minutes: '30 min',
  },
  {
    number: 3,
    title:
      'Read Your First Portfolio',
    description:
      'Learn how to identify the information that matters inside a portfolio.',
    minutes: '20 min',
  },
  {
    number: 4,
    title:
      'Your First Buyer',
    description:
      'Practice answering common buyer questions accurately and professionally.',
    minutes: '20–30 min',
  },
  {
    number: 5,
    title:
      'Run the Process',
    description:
      'Walk through the Day-1 DMHOUSE workflow from territory through release.',
    minutes: '30 min',
  },
  {
    number: 6,
    title:
      'Ready for Your First Buyer',
    description:
      'Complete the practical exercise and prove you are ready to represent Data Market House.',
    minutes: '30–40 min',
  },
];

function firstName(
  fullName?: string,
) {
  const value =
    String(
      fullName || '',
    ).trim();

  return value
    ? value.split(/\s+/)[0]
    : 'there';
}

function statusLabel(
  status: AcademyMissionStatus,
) {
  if (status === 'complete') {
    return 'Complete';
  }

  if (status === 'in_progress') {
    return 'In Progress';
  }

  if (status === 'available') {
    return 'Ready';
  }

  return 'Locked';
}

export default function AcademyHome({
  onOpenMission,
  intelligence,
}: Props) {
  const { profile } =
    usePortfolioStore();

  const {
    state,
    completedCount,
    progressPercent,
    getMission,
    resetAcademy,
  } = useAcademy();

  const learningExpired =
    intelligence?.learningPace === 'expired';

  const paceLabel =
    intelligence?.learningPace === 'excellent'
      ? 'Excellent Pace'
      : intelligence?.learningPace === 'on_track'
        ? 'On Track'
        : intelligence?.learningPace === 'late'
          ? 'Late'
          : intelligence?.learningPace === 'expired'
            ? 'Expired'
            : intelligence?.learningPace === 'completed'
              ? 'Learning Complete'
              : 'Loading';

  const paceClass =
    intelligence?.learningPace === 'excellent'
      ? 'bg-emerald-400/10 text-emerald-200 border-emerald-400/20'
      : intelligence?.learningPace === 'on_track'
        ? 'bg-blue-400/10 text-blue-200 border-blue-400/20'
        : intelligence?.learningPace === 'late'
          ? 'bg-amber-400/10 text-amber-200 border-amber-400/20'
          : intelligence?.learningPace === 'expired'
            ? 'bg-red-400/10 text-red-200 border-red-400/20'
            : 'bg-white/10 text-slate-200 border-white/10';

  return (
    <div className="min-h-full bg-slate-50">
      <div className="mx-auto max-w-[1380px] p-5 md:p-8 lg:p-10">
        <header className="overflow-hidden rounded-[32px] bg-slate-950 text-white shadow-xl shadow-slate-200/60">
          <div className="relative p-6 md:p-9 lg:p-10">
            <div className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-blue-600/20 blur-3xl" />

            <div className="relative">
              <div className="flex flex-wrap gap-3">
                <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-3 py-1.5 text-xs font-semibold text-blue-100">
                  <GraduationCap
                    size={15}
                  />
                  DMHOUSE ACADEMY™
                </span>

                <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1.5 text-xs font-semibold text-emerald-200">
                  QuickStart Certification
                </span>
              </div>

              <div className="mt-7 grid gap-8 xl:grid-cols-[1.35fr_.65fr] xl:items-end">
                <div>
                  <p className="text-sm font-medium text-blue-300">
                    Welcome,{' '}
                    {firstName(
                      profile?.full_name,
                    )}
                  </p>

                  <h1 className="mt-2 text-3xl font-semibold tracking-tight md:text-5xl">
                    Learn it. Prove it.
                    <span className="text-blue-400">
                      {' '}
                      Start selling.
                    </span>
                  </h1>

                  <p className="mt-5 max-w-2xl text-sm leading-7 text-slate-300 md:text-base">
                    QuickStart prepares you
                    for your first real buyer
                    conversation without
                    turning onboarding into a
                    textbook.
                  </p>

                  <div className="mt-7 flex flex-wrap gap-3 text-xs text-slate-300">
                    <span className="inline-flex items-center gap-2 rounded-xl bg-white/5 px-3 py-2">
                      <Clock3
                        size={15}
                      />
                      Approximately 2.5–3
                      hours
                    </span>

                    <span className="inline-flex items-center gap-2 rounded-xl bg-white/5 px-3 py-2">
                      <Target
                        size={15}
                      />
                      6 guided missions
                    </span>

                    <span className="inline-flex items-center gap-2 rounded-xl bg-white/5 px-3 py-2">
                      <ShieldCheck
                        size={15}
                      />
                      Certification required
                    </span>
                  </div>
                </div>

                <div className="rounded-3xl border border-white/10 bg-white/[0.07] p-5">
                  <div className="flex items-end justify-between">
                    <div>
                      <p className="text-xs uppercase tracking-[.18em] text-slate-400">
                        Progress
                      </p>

                      <p className="mt-2 text-4xl font-semibold">
                        {progressPercent}%
                      </p>
                    </div>

                    <p className="text-sm text-slate-400">
                      {completedCount} / 6
                    </p>
                  </div>

                  <div className="mt-5 h-2.5 overflow-hidden rounded-full bg-white/10">
                    <div
                      className="h-full rounded-full bg-blue-500 transition-all"
                      style={{
                        width:
                          `${progressPercent}%`,
                      }}
                    />
                  </div>

                  <p className="mt-4 text-xs leading-5 text-slate-400">
                    Current mission:{' '}
                    {state.currentMission}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </header>

        <section className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-3xl bg-slate-950 p-5 text-white">
            <p className="text-xs font-bold uppercase tracking-[.16em] text-slate-400">
              Academy Deadline
            </p>

            <p className="mt-2 font-mono text-2xl font-semibold">
              {formatSeconds(
                intelligence?.secondsUntilExpiration,
              )}
            </p>

            <p className="mt-2 text-xs text-slate-400">
              Hard deadline: 72 hours
            </p>
          </div>

          <div className="rounded-3xl bg-white p-5 shadow-sm">
            <p className="text-xs font-bold uppercase tracking-[.16em] text-slate-400">
              Learning Pace
            </p>

            <span className={`mt-3 inline-flex rounded-full border px-3 py-1.5 text-xs font-bold ${paceClass}`}>
              {paceLabel}
            </span>

            <p className="mt-3 text-xs text-slate-500">
              0–24h excellent · 24–48h on track · 48–72h late
            </p>
          </div>

          <div className="rounded-3xl bg-white p-5 shadow-sm">
            <p className="text-xs font-bold uppercase tracking-[.16em] text-slate-400">
              Active Learning
            </p>

            <p className="mt-2 text-2xl font-semibold text-slate-950">
              {formatActiveTime(
                intelligence?.activeLearningSeconds,
              )}
            </p>

            <p className="mt-2 text-xs text-slate-500">
              Time actually spent inside Missions 1–5
            </p>
          </div>

          <div className="rounded-3xl bg-white p-5 shadow-sm">
            <p className="text-xs font-bold uppercase tracking-[.16em] text-slate-400">
              Practice Average
            </p>

            <p className="mt-2 text-2xl font-semibold text-slate-950">
              {intelligence?.averagePracticeScore == null
                ? '—'
                : `${Number(
                    intelligence.averagePracticeScore,
                  ).toFixed(0)}%`}
            </p>

            <p className="mt-2 text-xs text-slate-500">
              Successful Mission Check scores
            </p>
          </div>
        </section>

        {learningExpired && (
          <div className="mt-5 rounded-3xl border border-red-200 bg-red-50 p-5">
            <p className="font-semibold text-red-950">
              Academy access window expired
            </p>

            <p className="mt-2 text-sm leading-6 text-red-800">
              Your standard 72-hour learning window has ended. An Owner must extend your Academy deadline before additional learning or certification can continue.
            </p>
          </div>
        )}

        <div className="mt-8 grid gap-7 xl:grid-cols-[1fr_330px]">
          <section>
            <p className="text-sm font-semibold text-blue-600">
              QuickStart Certification
            </p>

            <h2 className="mt-1 text-2xl font-semibold">
              Your six missions
            </h2>

            <div className="mt-5 space-y-4">
              {missionDefinitions.map(
                (definition) => {
                  const progress =
                    getMission(
                      definition.number,
                    );

                  const status =
                    progress.status;

                  return (
                    <Card
                      key={
                        definition.number
                      }
                      className="overflow-hidden border border-slate-100"
                    >
                      <div className="flex flex-col gap-5 p-6 md:flex-row md:items-center">
                        <div
                          className={`grid h-14 w-14 shrink-0 place-items-center rounded-2xl text-lg font-bold ${
                            status ===
                            'complete'
                              ? 'bg-emerald-50 text-emerald-700'
                              : status ===
                                    'available' ||
                                  status ===
                                    'in_progress'
                                ? 'bg-blue-600 text-white'
                                : 'bg-slate-100 text-slate-400'
                          }`}
                        >
                          {status ===
                          'complete' ? (
                            <CheckCircle2
                              size={24}
                            />
                          ) : (
                            definition.number
                          )}
                        </div>

                        <div className="flex-1">
                          <div className="flex flex-wrap items-center gap-3">
                            <p className="text-xs font-semibold uppercase tracking-[.16em] text-slate-400">
                              Mission{' '}
                              {
                                definition.number
                              }
                            </p>

                            <span
                              className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                                status ===
                                'complete'
                                  ? 'bg-emerald-50 text-emerald-700'
                                  : status ===
                                      'in_progress'
                                    ? 'bg-amber-50 text-amber-700'
                                    : status ===
                                        'available'
                                      ? 'bg-blue-50 text-blue-700'
                                      : 'bg-slate-100 text-slate-500'
                              }`}
                            >
                              {statusLabel(
                                status,
                              )}
                            </span>
                          </div>

                          <h3 className="mt-2 text-xl font-semibold">
                            {
                              definition.title
                            }
                          </h3>

                          <p className="mt-2 text-sm leading-6 text-slate-500">
                            {
                              definition.description
                            }
                          </p>

                          <p className="mt-3 flex items-center gap-2 text-xs text-slate-400">
                            <Clock3
                              size={14}
                            />
                            {
                              definition.minutes
                            }
                          </p>

                          {progress.score !=
                            null && (
                            <p className="mt-2 text-xs font-semibold text-emerald-700">
                              Score:{' '}
                              {
                                progress.score
                              }
                              %
                            </p>
                          )}
                        </div>

                        {status === 'locked' ? (
                          <div className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-slate-100 px-4 text-sm font-semibold text-slate-400">
                            <LockKeyhole size={16} />
                            Locked
                          </div>
                        ) : (
                          <button
                            onClick={() => {
                              if (
                                learningExpired &&
                                definition.number <= 5
                              ) {
                                return;
                              }

                              onOpenMission(
                                definition.number,
                              );
                            }}
                            className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-blue-600 px-5 text-sm font-semibold text-white hover:bg-blue-700"
                          >
                            {status === 'complete'
                              ? 'Review Mission'
                              : status === 'in_progress'
                                ? 'Continue Mission'
                                : 'Begin Mission'}

                            <ArrowRight size={17} />
                          </button>
                        )}
                      </div>
                    </Card>
                  );
                },
              )}
            </div>
          </section>

          <aside className="space-y-5">
            <Card className="p-6">
              <Sparkles className="text-blue-600" />

              <h3 className="mt-4 font-semibold">
                Your goal
              </h3>

              <p className="mt-2 text-sm leading-6 text-slate-500">
                Become ready to
                professionally represent
                Data Market House in front
                of a buyer.
              </p>
            </Card>

            <Card className="p-6">
              <ShieldCheck className="text-amber-700" />

              <h3 className="mt-4 font-semibold">
                The #1 rule
              </h3>

              <p className="mt-2 text-sm leading-6 text-slate-500">
                Never guess. Verify the
                information and follow up.
              </p>
            </Card>

            <Card className="p-6">
              <BookOpen className="text-violet-700" />

              <h3 className="mt-4 font-semibold">
                Academy Library
              </h3>

              <p className="mt-2 text-sm leading-6 text-slate-500">
                Advanced education will
                live here after
                QuickStart.
              </p>
            </Card>

            <Card className="p-6">
              <p className="text-xs font-semibold uppercase tracking-[.16em] text-slate-400">
                Development Control
              </p>

              <button
                onClick={() => {
                  if (
                    window.confirm(
                      'Reset all Academy progress on this browser?',
                    )
                  ) {
                    resetAcademy();
                  }
                }}
                className="mt-4 text-xs font-semibold text-red-600 hover:text-red-700"
              >
                Reset Academy Progress
              </button>
            </Card>
          </aside>
        </div>
      </div>
    </div>
  );
}
