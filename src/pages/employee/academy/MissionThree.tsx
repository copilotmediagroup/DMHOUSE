import {
  ArrowLeft,
  ArrowRight,
  BriefcaseBusiness,
  Check,
  CheckCircle2,
  Clock3,
  Database,
  FileSpreadsheet,
  GraduationCap,
  Lightbulb,
  Search,
  Target,
  XCircle,
} from 'lucide-react';
import { useMemo, useState } from 'react';

type Props = {
  onBack: () => void;
  onComplete: (score: number) => void;
};

type PortfolioRow = {
  field: string;
  value: string;
  meaning: string;
  buyerImportance: string;
};

type Question = {
  question: string;
  answers: string[];
  correct: number;
};

const portfolioRows: PortfolioRow[] = [
  {
    field: 'Portfolio Name',
    value: 'DMHOUSE Retail Sample A',
    meaning:
      'The internal or marketing name used to identify this portfolio.',
    buyerImportance:
      'Helps everyone make sure they are discussing the same file.',
  },
  {
    field: 'Original Creditor',
    value: 'Metro Retail Finance',
    meaning:
      'The company that originally issued the accounts.',
    buyerImportance:
      'Buyers often specialize by creditor or account type.',
  },
  {
    field: 'Account Count',
    value: '9,600',
    meaning:
      'The total number of accounts in the portfolio.',
    buyerImportance:
      'Helps the buyer understand portfolio size and workload.',
  },
  {
    field: 'Principal Balance',
    value: '$6,720,000',
    meaning:
      'The total principal amount represented by the accounts.',
    buyerImportance:
      'Some buyers price and evaluate principal separately.',
  },
  {
    field: 'Current Balance',
    value: '$8,160,000',
    meaning:
      'The total current balance shown across all accounts.',
    buyerImportance:
      'Often used when discussing face value and portfolio pricing.',
  },
  {
    field: 'Average Balance',
    value: '$850',
    meaning:
      'The average current balance per account.',
    buyerImportance:
      'Shows the typical account size in the portfolio.',
  },
  {
    field: 'Average Charge-Off Date',
    value: 'August 2023',
    meaning:
      'The approximate average charge-off period across the file.',
    buyerImportance:
      'Helps the buyer understand the age or vintage of the paper.',
  },
  {
    field: 'Charge-Off Year',
    value: '2023',
    meaning:
      'The general charge-off year represented by the portfolio.',
    buyerImportance:
      'Buyers frequently ask for the vintage.',
  },
  {
    field: 'State Coverage',
    value: 'FL, GA, TX, NC, SC',
    meaning:
      'The states represented in the portfolio.',
    buyerImportance:
      'Buyers may have licensing, operational, or strategic state preferences.',
  },
  {
    field: 'Media',
    value: 'Available on request',
    meaning:
      'Supporting documentation may be available for qualifying accounts.',
    buyerImportance:
      'Media availability can affect buyer interest and due diligence.',
  },
  {
    field: 'Paper Type',
    value: 'Secondary / AS-IS',
    meaning:
      'The portfolio is not being represented as fresh first-placement paper.',
    buyerImportance:
      'Sets expectations about history, pricing, and condition.',
  },
  {
    field: 'Masked File',
    value: 'Available after NDA',
    meaning:
      'A buyer may receive masked portfolio data after completing the required process.',
    buyerImportance:
      'Allows due diligence while protecting sensitive information.',
  },
  {
    field: 'Asking Price',
    value: '$48,000',
    meaning:
      'The current asking price for the portfolio.',
    buyerImportance:
      'Provides a starting point for evaluation or negotiation.',
  },
  {
    field: 'Price Per Account',
    value: '$5.00',
    meaning:
      'The asking price divided by the number of accounts.',
    buyerImportance:
      'Some buyers compare deals using per-account pricing.',
  },
  {
    field: 'Approx. Price in BPS',
    value: '58.8 BPS',
    meaning:
      'The asking price expressed as a percentage of current balance.',
    buyerImportance:
      'Debt buyers frequently discuss pricing in basis points.',
  },
];

const lookupQuestions = [
  {
    prompt:
      'A buyer asks: “Who originated these accounts?”',
    field: 'Original Creditor',
    answer: 'Metro Retail Finance',
  },
  {
    prompt:
      'A buyer asks: “How many accounts are included?”',
    field: 'Account Count',
    answer: '9,600',
  },
  {
    prompt:
      'A buyer asks: “What is the total current balance?”',
    field: 'Current Balance',
    answer: '$8,160,000',
  },
  {
    prompt:
      'A buyer asks: “What is the average balance?”',
    field: 'Average Balance',
    answer: '$850',
  },
  {
    prompt:
      'A buyer asks: “What vintage is this?”',
    field: 'Charge-Off Year',
    answer: '2023',
  },
  {
    prompt:
      'A buyer asks: “Is media available?”',
    field: 'Media',
    answer: 'Available on request',
  },
];

const questions: Question[] = [
  {
    question:
      'What is the original creditor in this sample portfolio?',
    answers: [
      'Data Market House',
      'Metro Retail Finance',
      'Retail Sample A',
      'Florida Finance',
    ],
    correct: 1,
  },
  {
    question:
      'How many accounts are in the portfolio?',
    answers: [
      '8,160',
      '9,600',
      '48,000',
      '6,720',
    ],
    correct: 1,
  },
  {
    question:
      'What is the current balance?',
    answers: [
      '$6,720,000',
      '$8,160,000',
      '$48,000',
      '$850',
    ],
    correct: 1,
  },
  {
    question:
      'What is the average account balance?',
    answers: [
      '$5.00',
      '$58.80',
      '$850',
      '$9,600',
    ],
    correct: 2,
  },
  {
    question:
      'What charge-off year should you tell the buyer?',
    answers: [
      '2021',
      '2022',
      '2023',
      '2024',
    ],
    correct: 2,
  },
  {
    question:
      'Which states are represented in the sample?',
    answers: [
      'CA, NV, AZ',
      'FL, GA, TX, NC, SC',
      'NY, NJ, PA',
      'All 50 states',
    ],
    correct: 1,
  },
  {
    question:
      'What does “Available on request” mean under Media?',
    answers: [
      'Media is guaranteed for every account',
      'Supporting documentation may be available',
      'No documentation exists',
      'The employee should send everything immediately',
    ],
    correct: 1,
  },
  {
    question:
      'How is this paper represented?',
    answers: [
      'Fresh / First Placement',
      'Primary / Guaranteed',
      'Secondary / AS-IS',
      'Forward Flow',
    ],
    correct: 2,
  },
  {
    question:
      'When is the masked file available according to the sample?',
    answers: [
      'Before any buyer contact',
      'After NDA',
      'Only after final payment',
      'Never',
    ],
    correct: 1,
  },
  {
    question:
      'What is the asking price?',
    answers: [
      '$8,160,000',
      '$6,720,000',
      '$48,000',
      '$9,600',
    ],
    correct: 2,
  },
  {
    question:
      'What is the price per account?',
    answers: [
      '$0.50',
      '$5.00',
      '$50.00',
      '$850.00',
    ],
    correct: 1,
  },
  {
    question:
      'If a buyer asks a field that is not shown or verified in the portfolio, what should you do?',
    answers: [
      'Estimate it',
      'Use the closest number',
      'Verify the information before answering',
      'Tell the buyer it does not matter',
    ],
    correct: 2,
  },
];

type Screen =
  | 'intro'
  | 'walkthrough'
  | 'exercise'
  | 'quiz'
  | 'complete';

export default function MissionThree({
  onBack,
  onComplete,
}: Props) {
  const [screen, setScreen] =
    useState<Screen>('intro');

  const [rowIndex, setRowIndex] =
    useState(0);

  const [exerciseIndex, setExerciseIndex] =
    useState(0);

  const [revealed, setRevealed] =
    useState(false);

  const [answers, setAnswers] =
    useState<Record<number, number>>({});

  const [submitted, setSubmitted] =
    useState(false);

  const row =
    portfolioRows[rowIndex];

  const exercise =
    lookupQuestions[exerciseIndex];

  const quizAnswered =
    Object.keys(answers).length ===
    questions.length;

  const score = useMemo(
    () =>
      questions.reduce(
        (
          total,
          question,
          index,
        ) =>
          total +
          (answers[index] ===
          question.correct
            ? 1
            : 0),
        0,
      ),
    [answers],
  );

  const percent =
    Math.round(
      (score /
        questions.length) *
        100,
    );

  const passed =
    percent >= 90;

  function nextRow() {
    if (
      rowIndex <
      portfolioRows.length - 1
    ) {
      setRowIndex(
        rowIndex + 1,
      );
      return;
    }

    setScreen('exercise');
  }

  function previousRow() {
    if (rowIndex > 0) {
      setRowIndex(
        rowIndex - 1,
      );
    }
  }

  function nextExercise() {
    if (
      exerciseIndex <
      lookupQuestions.length - 1
    ) {
      setExerciseIndex(
        exerciseIndex + 1,
      );
      setRevealed(false);
      return;
    }

    setScreen('quiz');
  }

  function retryQuiz() {
    setAnswers({});
    setSubmitted(false);
  }

  function finish() {
    if (!passed) return;

    onComplete(percent);
    setScreen('complete');
  }

  if (screen === 'complete') {
    return (
      <div className="min-h-full bg-slate-50 p-5 md:p-8 lg:p-10">
        <div className="mx-auto max-w-3xl">
          <div className="rounded-[32px] bg-slate-950 p-8 text-center text-white shadow-xl md:p-12">
            <div className="mx-auto grid h-20 w-20 place-items-center rounded-full bg-emerald-500/15 text-emerald-300">
              <CheckCircle2 size={40} />
            </div>

            <p className="mt-7 text-xs font-bold uppercase tracking-[.22em] text-emerald-300">
              Mission Complete
            </p>

            <h1 className="mt-3 text-3xl font-semibold md:text-4xl">
              You Read Your First Portfolio
            </h1>

            <p className="mx-auto mt-4 max-w-xl leading-7 text-slate-300">
              You can now locate and explain the core portfolio information buyers are most likely to ask about.
            </p>

            <div className="mt-8 rounded-3xl border border-white/10 bg-white/5 p-5">
              <p className="text-sm text-slate-400">
                Mission Check
              </p>

              <p className="mt-2 text-3xl font-semibold">
                {percent}%
              </p>

              <p className="mt-1 text-sm text-emerald-300">
                Passed
              </p>
            </div>

            <button
              onClick={onBack}
              className="mt-8 inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-blue-600 px-6 text-sm font-semibold text-white hover:bg-blue-700"
            >
              Return to Academy
              <ArrowRight size={17} />
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (screen === 'quiz') {
    return (
      <div className="min-h-full bg-slate-50 p-5 md:p-8 lg:p-10">
        <div className="mx-auto max-w-4xl">
          <button
            onClick={() =>
              setScreen('exercise')
            }
            className="inline-flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-slate-900"
          >
            <ArrowLeft size={17} />
            Back to exercise
          </button>

          <div className="mt-6 rounded-[30px] bg-slate-950 p-7 text-white md:p-9">
            <div className="flex items-center gap-3">
              <GraduationCap className="text-blue-300" />

              <p className="text-xs font-bold uppercase tracking-[.2em] text-blue-300">
                Mission 3 Check
              </p>
            </div>

            <h1 className="mt-3 text-3xl font-semibold">
              Can you read the portfolio?
            </h1>

            <p className="mt-3 max-w-2xl leading-7 text-slate-300">
              Answer all 12 questions. Mission 3 requires a 90% passing score.
            </p>
          </div>

          <div className="mt-6 space-y-5">
            {questions.map(
              (
                question,
                questionIndex,
              ) => (
                <div
                  key={
                    question.question
                  }
                  className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"
                >
                  <div className="flex gap-4">
                    <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-slate-100 text-sm font-bold text-slate-600">
                      {questionIndex + 1}
                    </div>

                    <div className="flex-1">
                      <h2 className="font-semibold leading-6 text-slate-950">
                        {question.question}
                      </h2>

                      <div className="mt-4 space-y-2">
                        {question.answers.map(
                          (
                            answer,
                            answerIndex,
                          ) => {
                            const selected =
                              answers[
                                questionIndex
                              ] ===
                              answerIndex;

                            const correct =
                              submitted &&
                              answerIndex ===
                                question.correct;

                            const wrong =
                              submitted &&
                              selected &&
                              answerIndex !==
                                question.correct;

                            return (
                              <button
                                key={answer}
                                disabled={
                                  submitted
                                }
                                onClick={() =>
                                  setAnswers(
                                    (
                                      current,
                                    ) => ({
                                      ...current,
                                      [questionIndex]:
                                        answerIndex,
                                    }),
                                  )
                                }
                                className={`flex w-full items-center gap-3 rounded-2xl border p-4 text-left text-sm transition ${
                                  correct
                                    ? 'border-emerald-300 bg-emerald-50 text-emerald-900'
                                    : wrong
                                      ? 'border-red-300 bg-red-50 text-red-900'
                                      : selected
                                        ? 'border-blue-400 bg-blue-50 text-blue-950'
                                        : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                                }`}
                              >
                                <span
                                  className={`grid h-6 w-6 shrink-0 place-items-center rounded-full border ${
                                    selected
                                      ? 'border-blue-600 bg-blue-600 text-white'
                                      : 'border-slate-300'
                                  }`}
                                >
                                  {correct ? (
                                    <Check size={14} />
                                  ) : wrong ? (
                                    <XCircle size={14} />
                                  ) : selected ? (
                                    <Check size={14} />
                                  ) : null}
                                </span>

                                {answer}
                              </button>
                            );
                          },
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ),
            )}
          </div>

          {!submitted && (
            <div className="mt-6 flex justify-end">
              <button
                disabled={
                  !quizAnswered
                }
                onClick={() =>
                  setSubmitted(true)
                }
                className={`min-h-12 rounded-xl px-6 text-sm font-semibold ${
                  quizAnswered
                    ? 'bg-blue-600 text-white hover:bg-blue-700'
                    : 'cursor-not-allowed bg-slate-200 text-slate-400'
                }`}
              >
                Submit Mission Check
              </button>
            </div>
          )}

          {submitted && (
            <div
              className={`mt-7 rounded-[30px] border p-7 ${
                passed
                  ? 'border-emerald-200 bg-emerald-50'
                  : 'border-red-200 bg-red-50'
              }`}
            >
              <div className="flex gap-4">
                <div
                  className={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl ${
                    passed
                      ? 'bg-emerald-100 text-emerald-700'
                      : 'bg-red-100 text-red-700'
                  }`}
                >
                  {passed ? (
                    <CheckCircle2 size={25} />
                  ) : (
                    <XCircle size={25} />
                  )}
                </div>

                <div className="flex-1">
                  <p className="text-sm font-semibold">
                    Mission Check Score
                  </p>

                  <p className="mt-1 text-3xl font-bold">
                    {percent}%
                  </p>

                  {passed ? (
                    <>
                      <p className="mt-3 text-sm leading-6 text-emerald-900">
                        You passed Mission 3 and are ready to practice real buyer conversations.
                      </p>

                      <button
                        onClick={finish}
                        className="mt-5 inline-flex min-h-12 items-center gap-2 rounded-xl bg-emerald-600 px-6 text-sm font-semibold text-white hover:bg-emerald-700"
                      >
                        Complete Mission 3
                        <CheckCircle2 size={17} />
                      </button>
                    </>
                  ) : (
                    <>
                      <p className="mt-3 text-sm leading-6 text-red-900">
                        Mission 3 requires 90%. Review the incorrect answers and try again.
                      </p>

                      <button
                        onClick={
                          retryQuiz
                        }
                        className="mt-5 rounded-xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-800"
                      >
                        Retake Mission Check
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (screen === 'exercise') {
    return (
      <div className="min-h-full bg-slate-50 p-5 md:p-8 lg:p-10">
        <div className="mx-auto max-w-5xl">
          <button
            onClick={() =>
              setScreen('walkthrough')
            }
            className="inline-flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-slate-900"
          >
            <ArrowLeft size={17} />
            Portfolio walkthrough
          </button>

          <div className="mt-6 rounded-[30px] bg-slate-950 p-7 text-white md:p-9">
            <div className="flex items-center gap-3">
              <Search className="text-blue-300" />

              <p className="text-xs font-bold uppercase tracking-[.2em] text-blue-300">
                Practical Exercise
              </p>
            </div>

            <h1 className="mt-3 text-3xl font-semibold">
              Find the answer.
            </h1>

            <p className="mt-3 max-w-2xl leading-7 text-slate-300">
              A buyer asks a question. Identify which portfolio field answers it.
            </p>
          </div>

          <div className="mt-7 grid gap-6 lg:grid-cols-[1fr_.9fr]">
            <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
              <p className="text-xs font-bold uppercase tracking-[.18em] text-blue-600">
                Buyer Question
              </p>

              <h2 className="mt-3 text-2xl font-semibold leading-8">
                {exercise.prompt}
              </h2>

              {!revealed ? (
                <button
                  onClick={() =>
                    setRevealed(true)
                  }
                  className="mt-7 inline-flex min-h-12 items-center gap-2 rounded-xl bg-blue-600 px-6 text-sm font-semibold text-white hover:bg-blue-700"
                >
                  Reveal Answer
                  <ArrowRight size={17} />
                </button>
              ) : (
                <div className="mt-7 rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
                  <p className="text-xs font-bold uppercase tracking-[.14em] text-emerald-700">
                    Correct Field
                  </p>

                  <p className="mt-2 text-lg font-semibold text-emerald-950">
                    {exercise.field}
                  </p>

                  <p className="mt-2 text-sm text-emerald-800">
                    {exercise.answer}
                  </p>
                </div>
              )}

              <div className="mt-7 flex items-center justify-between border-t border-slate-100 pt-5">
                <p className="text-sm text-slate-400">
                  Exercise {exerciseIndex + 1} of {lookupQuestions.length}
                </p>

                <button
                  disabled={!revealed}
                  onClick={nextExercise}
                  className={`inline-flex min-h-11 items-center gap-2 rounded-xl px-5 text-sm font-semibold ${
                    revealed
                      ? 'bg-slate-950 text-white hover:bg-slate-800'
                      : 'cursor-not-allowed bg-slate-100 text-slate-300'
                  }`}
                >
                  {exerciseIndex ===
                  lookupQuestions.length - 1
                    ? 'Take Mission Check'
                    : 'Next Buyer Question'}
                  <ArrowRight size={17} />
                </button>
              </div>
            </div>

            <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
              <FileSpreadsheet className="text-violet-600" />

              <h3 className="mt-4 text-lg font-semibold">
                Sample Portfolio
              </h3>

              <div className="mt-4 max-h-[520px] space-y-2 overflow-y-auto">
                {portfolioRows.map(
                  (item) => (
                    <div
                      key={item.field}
                      className={`rounded-xl border p-3 ${
                        revealed &&
                        item.field ===
                          exercise.field
                          ? 'border-emerald-300 bg-emerald-50'
                          : 'border-slate-100 bg-slate-50'
                      }`}
                    >
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                        {item.field}
                      </p>

                      <p className="mt-1 text-sm font-semibold text-slate-900">
                        {item.value}
                      </p>
                    </div>
                  ),
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (screen === 'walkthrough') {
    const progress =
      Math.round(
        ((rowIndex + 1) /
          portfolioRows.length) *
          100,
      );

    return (
      <div className="min-h-full bg-slate-50 p-5 md:p-8 lg:p-10">
        <div className="mx-auto max-w-5xl">
          <button
            onClick={onBack}
            className="inline-flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-slate-900"
          >
            <ArrowLeft size={17} />
            Academy
          </button>

          <div className="mt-6 rounded-[30px] bg-slate-950 p-7 text-white md:p-9">
            <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-[.2em] text-blue-300">
                  Mission 3
                </p>

                <h1 className="mt-2 text-3xl font-semibold">
                  Read Your First Portfolio
                </h1>

                <p className="mt-3 max-w-2xl leading-7 text-slate-300">
                  Learn how to find the information buyers care about inside a real portfolio summary.
                </p>

                <div className="mt-4 flex flex-wrap gap-4 text-xs text-slate-300">
                  <span className="inline-flex items-center gap-2">
                    <Clock3 size={14} />
                    About 20 minutes
                  </span>

                  <span className="inline-flex items-center gap-2">
                    <Target size={14} />
                    Portfolio confidence
                  </span>

                  <span className="inline-flex items-center gap-2">
                    <Database size={14} />
                    {portfolioRows.length} key fields
                  </span>
                </div>
              </div>

              <div className="min-w-56">
                <div className="flex justify-between text-xs text-slate-400">
                  <span>
                    Walkthrough
                  </span>

                  <span>
                    {progress}%
                  </span>
                </div>

                <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
                  <div
                    className="h-full rounded-full bg-blue-500 transition-all"
                    style={{
                      width:
                        `${progress}%`,
                    }}
                  />
                </div>

                <p className="mt-2 text-xs text-slate-500">
                  Field {rowIndex + 1} of {portfolioRows.length}
                </p>
              </div>
            </div>
          </div>

          <div className="mt-7 grid gap-6 lg:grid-cols-[.8fr_1.2fr]">
            <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
              <FileSpreadsheet className="text-blue-600" />

              <h3 className="mt-4 text-lg font-semibold">
                Portfolio Summary
              </h3>

              <div className="mt-4 space-y-2">
                {portfolioRows.map(
                  (
                    item,
                    index,
                  ) => (
                    <button
                      key={item.field}
                      onClick={() =>
                        setRowIndex(index)
                      }
                      className={`w-full rounded-xl border p-3 text-left transition ${
                        index === rowIndex
                          ? 'border-blue-300 bg-blue-50'
                          : 'border-slate-100 bg-slate-50 hover:border-slate-200'
                      }`}
                    >
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                        {item.field}
                      </p>

                      <p className="mt-1 text-sm font-semibold text-slate-900">
                        {item.value}
                      </p>
                    </button>
                  ),
                )}
              </div>
            </div>

            <div className="rounded-[28px] border border-slate-200 bg-white p-7 shadow-sm">
              <p className="text-xs font-bold uppercase tracking-[.18em] text-blue-600">
                Field {rowIndex + 1}
              </p>

              <h2 className="mt-3 text-3xl font-semibold tracking-tight">
                {row.field}
              </h2>

              <div className="mt-6 rounded-2xl bg-slate-50 p-5">
                <p className="text-xs font-bold uppercase tracking-[.14em] text-slate-400">
                  Portfolio Value
                </p>

                <p className="mt-2 text-2xl font-semibold text-slate-950">
                  {row.value}
                </p>
              </div>

              <div className="mt-4 grid gap-4">
                <div className="rounded-2xl border border-blue-100 bg-blue-50 p-5">
                  <p className="text-xs font-bold uppercase tracking-[.14em] text-blue-700">
                    What it means
                  </p>

                  <p className="mt-3 text-sm leading-6 text-blue-950">
                    {row.meaning}
                  </p>
                </div>

                <div className="rounded-2xl border border-violet-100 bg-violet-50 p-5">
                  <p className="text-xs font-bold uppercase tracking-[.14em] text-violet-700">
                    Why buyers care
                  </p>

                  <p className="mt-3 text-sm leading-6 text-violet-950">
                    {row.buyerImportance}
                  </p>
                </div>

                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
                  <div className="flex gap-3">
                    <Lightbulb
                      size={19}
                      className="mt-0.5 shrink-0 text-amber-700"
                    />

                    <p className="text-sm leading-6 text-amber-950">
                      Your job is not to memorize every number. Your job is to know where to find the correct number and give the buyer an accurate answer.
                    </p>
                  </div>
                </div>
              </div>

              <div className="mt-7 flex items-center justify-between border-t border-slate-100 pt-6">
                <button
                  onClick={previousRow}
                  disabled={
                    rowIndex === 0
                  }
                  className={`inline-flex min-h-11 items-center gap-2 rounded-xl px-4 text-sm font-semibold ${
                    rowIndex === 0
                      ? 'cursor-not-allowed bg-slate-100 text-slate-300'
                      : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <ArrowLeft size={17} />
                  Previous
                </button>

                <button
                  onClick={nextRow}
                  className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-blue-600 px-5 text-sm font-semibold text-white hover:bg-blue-700"
                >
                  {rowIndex ===
                  portfolioRows.length - 1
                    ? 'Practice With a Buyer'
                    : 'Next Field'}
                  <ArrowRight size={17} />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-slate-50 p-5 md:p-8 lg:p-10">
      <div className="mx-auto max-w-4xl">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-slate-900"
        >
          <ArrowLeft size={17} />
          Academy
        </button>

        <div className="mt-6 overflow-hidden rounded-[32px] bg-slate-950 p-8 text-white shadow-xl md:p-10">
          <div className="grid gap-8 lg:grid-cols-[1fr_280px] lg:items-center">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-blue-200">
                <BriefcaseBusiness size={15} />
                Mission 3
              </div>

              <h1 className="mt-5 text-3xl font-semibold md:text-4xl">
                Read Your First Portfolio
              </h1>

              <p className="mt-4 max-w-2xl leading-7 text-slate-300">
                Portfolio spreadsheets can look intimidating when you are new. This mission teaches you to ignore the noise and quickly locate the information a buyer actually cares about.
              </p>

              <div className="mt-6 flex flex-wrap gap-3 text-xs text-slate-300">
                <span className="inline-flex items-center gap-2 rounded-xl bg-white/5 px-3 py-2">
                  <Clock3 size={14} />
                  About 20 minutes
                </span>

                <span className="inline-flex items-center gap-2 rounded-xl bg-white/5 px-3 py-2">
                  <Target size={14} />
                  Practical exercise
                </span>
              </div>

              <button
                onClick={() =>
                  setScreen(
                    'walkthrough',
                  )
                }
                className="mt-7 inline-flex min-h-12 items-center gap-2 rounded-xl bg-blue-600 px-6 text-sm font-semibold text-white hover:bg-blue-700"
              >
                Open Sample Portfolio
                <ArrowRight size={17} />
              </button>
            </div>

            <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
              <FileSpreadsheet
                className="text-blue-300"
                size={34}
              />

              <p className="mt-4 text-sm font-semibold">
                Your objective
              </p>

              <p className="mt-2 text-sm leading-6 text-slate-400">
                Find the answer instead of guessing the answer.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
