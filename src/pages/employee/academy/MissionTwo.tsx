import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  CheckCircle2,
  Clock3,
  GraduationCap,
  Lightbulb,
  MessageSquareText,
  ShieldCheck,
  Target,
  XCircle,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { usePracticeAttemptTelemetry } from './usePracticeAttemptTelemetry';

type Props = {
  onBack: () => void;
  onComplete: (score: number) => void;
};

type Term = {
  term: string;
  definition: string;
  why: string;
  example?: string;
  buyer: string;
  mistake?: string;
  memory?: string;
};

type Lesson = {
  title: string;
  subtitle: string;
  terms: Term[];
};

type Question = {
  question: string;
  answers: string[];
  correct: number;
};

const lessons: Lesson[] = [
  {
    title: 'Portfolio Basics',
    subtitle:
      'The basic numbers and names you will hear in almost every buyer conversation.',
    terms: [
      {
        term: 'Original Creditor',
        definition:
          'The company that originally issued the loan or credit account.',
        why:
          'Buyers often specialize in specific creditors or types of accounts.',
        example:
          'Original Creditor: World Finance',
        buyer:
          '“Who is the original creditor?”',
        mistake:
          'Do not confuse the original creditor with the current seller.',
        memory:
          'Original creditor = where the account started.',
      },
      {
        term: 'Account Count',
        definition:
          'The total number of accounts included in the portfolio.',
        why:
          'Buyers use account count to judge portfolio size and operational fit.',
        example:
          '9,600 accounts',
        buyer:
          '“How many accounts are in the file?”',
        memory:
          'Account count = how many individual accounts are included.',
      },
      {
        term: 'Principal Balance',
        definition:
          'The principal amount owed before additional interest or fees are included.',
        why:
          'Some buyers evaluate principal separately from the full current balance.',
        example:
          'Principal Balance: $4,250,000',
        buyer:
          '“What is the principal balance?”',
        mistake:
          'Do not automatically use current balance when a buyer asks for principal.',
      },
      {
        term: 'Current Balance',
        definition:
          'The amount currently shown as owed on the account or portfolio.',
        why:
          'This may include principal plus other amounts depending on the data source.',
        example:
          'Current Balance: $5,100,000',
        buyer:
          '“What is the total current balance?”',
      },
      {
        term: 'Average Balance',
        definition:
          'The average balance per account in the portfolio.',
        why:
          'It helps a buyer quickly understand the typical account size.',
        example:
          '$8,000,000 ÷ 10,000 accounts = $800 average balance',
        buyer:
          '“What is the average balance?”',
        memory:
          'Total balance divided by account count.',
      },
    ],
  },
  {
    title: 'Portfolio Age & Placement',
    subtitle:
      'Terms that tell a buyer how old the accounts are and where they may be in the collection cycle.',
    terms: [
      {
        term: 'Charge-Off Date',
        definition:
          'The date the creditor classified an account as charged off.',
        why:
          'The age of the accounts can affect buyer interest and pricing.',
        example:
          'Charge-Off Date: 2023-09-14',
        buyer:
          '“When were these accounts charged off?”',
      },
      {
        term: 'Average Charge-Off Date',
        definition:
          'The average charge-off date across the accounts in the portfolio.',
        why:
          'It gives a buyer a quick picture of overall portfolio age.',
        example:
          'Average Charge-Off Date: June 2023',
        buyer:
          '“What is the average charge-off date?”',
      },
      {
        term: 'Charge-Off Year',
        definition:
          'The year in which the accounts were charged off.',
        why:
          'Buyers may refer to this as the portfolio vintage.',
        example:
          'Charge-Off Year: 2023',
        buyer:
          '“What vintage is the paper?”',
        memory:
          'Vintage usually means the charge-off period or year.',
      },
      {
        term: 'First Placement',
        definition:
          'Accounts being placed with a collection agency for the first time.',
        why:
          'Placement history can affect expected collectability.',
        example:
          'The accounts have not previously been placed with another agency.',
        buyer:
          '“Is this first placement?”',
        mistake:
          'Do not claim first placement unless it is verified.',
      },
      {
        term: 'Second Placement',
        definition:
          'Accounts that have previously been placed with one collection agency.',
        why:
          'The buyer may assume another agency has already attempted collection.',
        example:
          'The portfolio was previously worked by one agency.',
        buyer:
          '“What placement is this?”',
      },
      {
        term: 'Third Placement',
        definition:
          'Accounts that have already been placed with multiple agencies before the current opportunity.',
        why:
          'More prior collection activity can affect value and buyer expectations.',
        example:
          'The accounts have already been worked by two prior agencies.',
        buyer:
          '“Has this been through multiple agencies?”',
      },
      {
        term: 'Fresh Paper',
        definition:
          'A general industry term for relatively recent accounts with limited prior collection activity.',
        why:
          'Freshness can increase buyer interest.',
        example:
          'Recent charge-offs with little or no prior placement history.',
        buyer:
          '“How fresh is this paper?”',
        mistake:
          'Fresh is not a guarantee of quality. Verify the actual data and history.',
      },
      {
        term: 'Secondary Paper',
        definition:
          'Accounts that are no longer considered fresh and may have prior sale or placement history.',
        why:
          'Buyers price secondary paper differently from fresh paper.',
        buyer:
          '“Is this secondary?”',
      },
      {
        term: 'Tertiary Paper',
        definition:
          'Older or more heavily worked accounts with multiple prior sale or placement cycles.',
        why:
          'Tertiary paper typically carries different expectations and pricing.',
        buyer:
          '“How many hands has this been through?”',
        mistake:
          'Never guess sale or placement history.',
      },
    ],
  },
  {
    title: 'Documentation & Files',
    subtitle:
      'The documents and data buyers care about before and after a transaction.',
    terms: [
      {
        term: 'Chain of Title',
        definition:
          'Documentation showing the ownership path of the accounts from one owner to the next.',
        why:
          'Buyers may need proof that the seller has the right to transfer the accounts.',
        example:
          'Original Creditor → Buyer A → Current Seller',
        buyer:
          '“Do you have chain?”',
        mistake:
          'Never say chain is available unless it has been verified.',
        memory:
          'Think: ownership history.',
      },
      {
        term: 'Bill of Sale',
        definition:
          'A document used to transfer ownership of accounts from seller to buyer.',
        why:
          'It is an important transaction document in portfolio sales.',
        buyer:
          '“Is a bill of sale included?”',
      },
      {
        term: 'Media',
        definition:
          'Supporting account documentation that may be available for individual accounts.',
        why:
          'Buyers may want documentation to support collection or account validation.',
        example:
          'Statements, applications, contracts, or payment records may be forms of media.',
        buyer:
          '“Is media available?”',
        mistake:
          'Do not promise specific media unless the portfolio information confirms it.',
      },
      {
        term: 'Masked File',
        definition:
          'A portfolio file with sensitive consumer-identifying information hidden or removed.',
        why:
          'It lets qualified buyers evaluate a portfolio without exposing full consumer information.',
        example:
          'Names, full SSNs, and other sensitive fields may be hidden.',
        buyer:
          '“Can you send me a masked file?”',
        memory:
          'Masked = enough to evaluate, not enough to fully identify.',
      },
      {
        term: 'Unmasked File',
        definition:
          'The full portfolio file containing information that was hidden in the masked version.',
        why:
          'This is sensitive data and should only be released through the approved process.',
        buyer:
          '“When do I receive the unmasked file?”',
        mistake:
          'Never send the unmasked file without authorization.',
      },
      {
        term: 'Sample',
        definition:
          'A limited portion of portfolio data or documentation provided for review.',
        why:
          'A buyer may want a sample before making a decision.',
        buyer:
          '“Can I see a sample?”',
      },
      {
        term: 'Due Diligence',
        definition:
          'The buyer’s review process before completing a purchase.',
        why:
          'The buyer may review data, documentation, pricing, history, and other information.',
        buyer:
          '“What can I review during due diligence?”',
        memory:
          'Due diligence = buyer checks the opportunity before committing.',
      },
      {
        term: 'AS-IS',
        definition:
          'The portfolio is being offered in its current condition, subject to the transaction agreement.',
        why:
          'The buyer needs to understand what representations or limitations apply.',
        buyer:
          '“Is this being sold AS-IS?”',
        mistake:
          'Do not invent warranties or guarantees.',
      },
    ],
  },
  {
    title: 'Pricing & Deal Language',
    subtitle:
      'The language buyers and sellers use when talking about price and transaction structure.',
    terms: [
      {
        term: 'Basis Points',
        definition:
          'A pricing method where one basis point equals one-hundredth of one percent.',
        why:
          'Debt portfolios are often discussed as a percentage of face value.',
        example:
          '50 basis points = 0.50%',
        buyer:
          '“What are you asking in basis points?”',
        memory:
          '100 basis points = 1%.',
      },
      {
        term: 'Price Per Account',
        definition:
          'The purchase price divided by the number of accounts.',
        why:
          'Some portfolios are easier to discuss on a per-account basis.',
        example:
          '$20,000 ÷ 10,000 accounts = $2.00 per account',
        buyer:
          '“What is the price per account?”',
      },
      {
        term: 'Spot Sale',
        definition:
          'A one-time portfolio transaction.',
        why:
          'It is different from a recurring purchase arrangement.',
        buyer:
          '“Is this a spot sale?”',
        memory:
          'Spot = this individual deal.',
      },
      {
        term: 'Forward Flow',
        definition:
          'An arrangement where portfolios or accounts are sold on a recurring basis according to agreed terms.',
        why:
          'A forward flow can create ongoing inventory for a buyer.',
        buyer:
          '“Is there a forward flow opportunity?”',
        memory:
          'Forward flow = recurring deal stream.',
      },
    ],
  },
];

const questions: Question[] = [
  {
    question:
      'A buyer asks, “Who originated these accounts?” Which field are they asking about?',
    answers: [
      'Current Balance',
      'Original Creditor',
      'Account Count',
      'Bill of Sale',
    ],
    correct: 1,
  },
  {
    question:
      'What does average balance tell a buyer?',
    answers: [
      'How many agencies worked the file',
      'The typical balance per account',
      'The total purchase price',
      'Whether media exists',
    ],
    correct: 1,
  },
  {
    question:
      'A buyer asks, “What vintage is this paper?” What are they usually asking about?',
    answers: [
      'The charge-off period or year',
      'The buyer’s company age',
      'The number of accounts',
      'The payment method',
    ],
    correct: 0,
  },
  {
    question:
      'You are not sure whether the portfolio is first placement. What should you say?',
    answers: [
      'Yes, it probably is',
      'No, I doubt it',
      'Let me verify the placement history for you',
      'Placement does not matter',
    ],
    correct: 2,
  },
  {
    question:
      'What does chain of title show?',
    answers: [
      'The ownership path of the accounts',
      'The buyer’s contact list',
      'The average account balance',
      'The portfolio price',
    ],
    correct: 0,
  },
  {
    question:
      'Which file normally hides sensitive consumer-identifying information?',
    answers: [
      'Unmasked File',
      'Masked File',
      'Bill of Sale',
      'Forward Flow',
    ],
    correct: 1,
  },
  {
    question:
      'When should an employee send an unmasked portfolio file?',
    answers: [
      'Whenever a buyer asks',
      'Before the NDA',
      'Only through the authorized company process',
      'During the first cold email',
    ],
    correct: 2,
  },
  {
    question:
      'What is due diligence?',
    answers: [
      'The buyer’s review process before completing a purchase',
      'A collection call',
      'An employee performance review',
      'A payment plan',
    ],
    correct: 0,
  },
  {
    question:
      '100 basis points equals:',
    answers: [
      '0.10%',
      '0.50%',
      '1%',
      '10%',
    ],
    correct: 2,
  },
  {
    question:
      'A $20,000 portfolio contains 10,000 accounts. What is the price per account?',
    answers: [
      '$0.20',
      '$2.00',
      '$20.00',
      '$200.00',
    ],
    correct: 1,
  },
  {
    question:
      'Which term describes a one-time portfolio transaction?',
    answers: [
      'Forward Flow',
      'Spot Sale',
      'Media',
      'Placement',
    ],
    correct: 1,
  },
  {
    question:
      'Which term describes recurring portfolio purchases under agreed terms?',
    answers: [
      'Spot Sale',
      'Masked File',
      'Forward Flow',
      'Charge-Off',
    ],
    correct: 2,
  },
];

export default function MissionTwo({
  onBack,
  onComplete,
}: Props) {
  const [lessonIndex, setLessonIndex] =
    useState(0);

  const [termIndex, setTermIndex] =
    useState(0);

  const [quizMode, setQuizMode] =
    useState(false);

  const [answers, setAnswers] =
    useState<Record<number, number>>({});

  const [submitted, setSubmitted] =
    useState(false);

  const [complete, setComplete] =
    useState(false);

  const totalTerms =
    lessons.reduce(
      (sum, lesson) =>
        sum + lesson.terms.length,
      0,
    );

  const termsBefore =
    lessons
      .slice(0, lessonIndex)
      .reduce(
        (sum, lesson) =>
          sum + lesson.terms.length,
        0,
      );

  const currentNumber =
    termsBefore + termIndex + 1;

  const learningProgress =
    Math.round(
      (currentNumber / totalTerms) *
        100,
    );

  const lesson =
    lessons[lessonIndex];

  const term =
    lesson?.terms[termIndex];

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

  usePracticeAttemptTelemetry({
    missionNumber: 2,
    attemptOpen: quizMode,
    submitted,
    scorePercent: percent,
    questionCount: questions.length,
    correctCount: score,
    passed,
  });

  function nextTerm() {
    if (
      termIndex <
      lesson.terms.length - 1
    ) {
      setTermIndex(
        termIndex + 1,
      );
      return;
    }

    if (
      lessonIndex <
      lessons.length - 1
    ) {
      setLessonIndex(
        lessonIndex + 1,
      );
      setTermIndex(0);
      return;
    }

    setQuizMode(true);
  }

  function previousTerm() {
    if (termIndex > 0) {
      setTermIndex(
        termIndex - 1,
      );
      return;
    }

    if (lessonIndex > 0) {
      const previousLesson =
        lessons[
          lessonIndex - 1
        ];

      setLessonIndex(
        lessonIndex - 1,
      );

      setTermIndex(
        previousLesson.terms
          .length - 1,
      );
    }
  }

  function retry() {
    setAnswers({});
    setSubmitted(false);
  }

  function finish() {
    if (!passed) return;

    setComplete(true);
    onComplete(percent);
  }

  if (complete) {
    return (
      <div className="min-h-full bg-slate-50 p-5 md:p-8 lg:p-10">
        <div className="mx-auto max-w-3xl">
          <div className="rounded-[32px] bg-slate-950 p-8 text-center text-white shadow-xl md:p-12">
            <div className="mx-auto grid h-20 w-20 place-items-center rounded-full bg-emerald-500/15 text-emerald-300">
              <CheckCircle2
                size={40}
              />
            </div>

            <p className="mt-7 text-xs font-bold uppercase tracking-[.22em] text-emerald-300">
              Mission Complete
            </p>

            <h1 className="mt-3 text-3xl font-semibold md:text-4xl">
              You Speak the Language
            </h1>

            <p className="mx-auto mt-4 max-w-xl leading-7 text-slate-300">
              You now understand the core
              portfolio terms you are most
              likely to hear during your
              first buyer conversations.
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
              <ArrowRight
                size={17}
              />
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (quizMode) {
    return (
      <div className="min-h-full bg-slate-50 p-5 md:p-8 lg:p-10">
        <div className="mx-auto max-w-4xl">
          <button
            onClick={() => {
              setQuizMode(false);
              setSubmitted(false);
            }}
            className="inline-flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-slate-900"
          >
            <ArrowLeft
              size={17}
            />
            Review terms
          </button>

          <div className="mt-6 rounded-[30px] bg-slate-950 p-7 text-white md:p-9">
            <div className="flex items-center gap-3">
              <GraduationCap className="text-blue-300" />

              <p className="text-xs font-bold uppercase tracking-[.2em] text-blue-300">
                Mission 2 Check
              </p>
            </div>

            <h1 className="mt-3 text-3xl font-semibold">
              Speak the Language
            </h1>

            <p className="mt-3 max-w-2xl leading-7 text-slate-300">
              Answer all 12 questions.
              Mission 2 requires a 90%
              passing score.
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
                      {questionIndex +
                        1}
                    </div>

                    <div className="flex-1">
                      <h2 className="font-semibold leading-6 text-slate-950">
                        {
                          question.question
                        }
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
                                key={
                                  answer
                                }
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
                                    <Check
                                      size={
                                        14
                                      }
                                    />
                                  ) : wrong ? (
                                    <XCircle
                                      size={
                                        14
                                      }
                                    />
                                  ) : selected ? (
                                    <Check
                                      size={
                                        14
                                      }
                                    />
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
                    <CheckCircle2
                      size={25}
                    />
                  ) : (
                    <XCircle
                      size={25}
                    />
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
                        You passed Mission
                        2 and are ready to
                        move into reading a
                        real portfolio.
                      </p>

                      <button
                        onClick={
                          finish
                        }
                        className="mt-5 inline-flex min-h-12 items-center gap-2 rounded-xl bg-emerald-600 px-6 text-sm font-semibold text-white hover:bg-emerald-700"
                      >
                        Complete Mission 2
                        <CheckCircle2
                          size={17}
                        />
                      </button>
                    </>
                  ) : (
                    <>
                      <p className="mt-3 text-sm leading-6 text-red-900">
                        Mission 2 requires
                        90%. Review the
                        incorrect answers
                        and try again.
                      </p>

                      <button
                        onClick={
                          retry
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

  return (
    <div className="min-h-full bg-slate-50 p-5 md:p-8 lg:p-10">
      <div className="mx-auto max-w-5xl">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-slate-900"
        >
          <ArrowLeft
            size={17}
          />
          Academy
        </button>

        <div className="mt-6 rounded-[30px] bg-slate-950 p-7 text-white md:p-9">
          <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[.2em] text-blue-300">
                Mission 2
              </p>

              <h1 className="mt-2 text-3xl font-semibold">
                Speak the Language
              </h1>

              <p className="mt-3 max-w-2xl leading-7 text-slate-300">
                Learn only the portfolio
                terminology you are likely
                to hear immediately from
                real buyers.
              </p>

              <div className="mt-4 flex flex-wrap gap-4 text-xs text-slate-300">
                <span className="inline-flex items-center gap-2">
                  <Clock3
                    size={14}
                  />
                  About 30 minutes
                </span>

                <span className="inline-flex items-center gap-2">
                  <Target
                    size={14}
                  />
                  Buyer conversation
                  readiness
                </span>

                <span className="inline-flex items-center gap-2">
                  <BookOpen
                    size={14}
                  />
                  {totalTerms} core terms
                </span>
              </div>
            </div>

            <div className="min-w-56">
              <div className="flex justify-between text-xs text-slate-400">
                <span>
                  Mission progress
                </span>

                <span>
                  {learningProgress}%
                </span>
              </div>

              <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-blue-500 transition-all"
                  style={{
                    width:
                      `${learningProgress}%`,
                  }}
                />
              </div>

              <p className="mt-2 text-xs text-slate-500">
                Term {currentNumber} of{' '}
                {totalTerms}
              </p>
            </div>
          </div>
        </div>

        <div className="mt-6 rounded-[30px] border border-slate-200 bg-white p-7 shadow-sm md:p-9">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-5">
            <div>
              <p className="text-xs font-bold uppercase tracking-[.18em] text-blue-600">
                Module {lessonIndex + 1}
              </p>

              <h2 className="mt-1 text-xl font-semibold">
                {lesson.title}
              </h2>

              <p className="mt-1 text-sm text-slate-500">
                {lesson.subtitle}
              </p>
            </div>

            <span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-500">
              {termIndex + 1} /{' '}
              {lesson.terms.length}
            </span>
          </div>

          <div className="mt-7">
            <p className="text-xs font-semibold uppercase tracking-[.18em] text-slate-400">
              Term
            </p>

            <h3 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">
              {term.term}
            </h3>

            <div className="mt-7 grid gap-4 lg:grid-cols-2">
              <div className="rounded-2xl bg-slate-50 p-5">
                <div className="flex items-center gap-2 text-blue-600">
                  <BookOpen
                    size={18}
                  />
                  <p className="text-xs font-bold uppercase tracking-[.14em]">
                    What is it?
                  </p>
                </div>

                <p className="mt-3 text-sm leading-6 text-slate-700">
                  {term.definition}
                </p>
              </div>

              <div className="rounded-2xl bg-slate-50 p-5">
                <div className="flex items-center gap-2 text-violet-600">
                  <Target
                    size={18}
                  />
                  <p className="text-xs font-bold uppercase tracking-[.14em]">
                    Why it matters
                  </p>
                </div>

                <p className="mt-3 text-sm leading-6 text-slate-700">
                  {term.why}
                </p>
              </div>

              {term.example && (
                <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-5">
                  <div className="flex items-center gap-2 text-emerald-700">
                    <Lightbulb
                      size={18}
                    />

                    <p className="text-xs font-bold uppercase tracking-[.14em]">
                      Example
                    </p>
                  </div>

                  <p className="mt-3 text-sm font-medium leading-6 text-emerald-950">
                    {term.example}
                  </p>
                </div>
              )}

              <div className="rounded-2xl border border-blue-100 bg-blue-50 p-5">
                <div className="flex items-center gap-2 text-blue-700">
                  <MessageSquareText
                    size={18}
                  />

                  <p className="text-xs font-bold uppercase tracking-[.14em]">
                    Buyer might ask
                  </p>
                </div>

                <p className="mt-3 text-sm font-semibold leading-6 text-blue-950">
                  {term.buyer}
                </p>
              </div>
            </div>

            {(term.mistake ||
              term.memory) && (
              <div className="mt-4 grid gap-4 lg:grid-cols-2">
                {term.mistake && (
                  <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
                    <div className="flex items-center gap-2 text-amber-700">
                      <AlertTriangle
                        size={18}
                      />

                      <p className="text-xs font-bold uppercase tracking-[.14em]">
                        Common mistake
                      </p>
                    </div>

                    <p className="mt-3 text-sm leading-6 text-amber-950">
                      {term.mistake}
                    </p>
                  </div>
                )}

                {term.memory && (
                  <div className="rounded-2xl border border-violet-100 bg-violet-50 p-5">
                    <div className="flex items-center gap-2 text-violet-700">
                      <Lightbulb
                        size={18}
                      />

                      <p className="text-xs font-bold uppercase tracking-[.14em]">
                        Remember it
                      </p>
                    </div>

                    <p className="mt-3 text-sm leading-6 text-violet-950">
                      {term.memory}
                    </p>
                  </div>
                )}
              </div>
            )}

            <div className="mt-7 rounded-2xl border border-slate-200 bg-slate-950 p-5 text-white">
              <div className="flex gap-3">
                <ShieldCheck
                  size={20}
                  className="mt-0.5 shrink-0 text-blue-300"
                />

                <div>
                  <p className="text-sm font-semibold">
                    DMHOUSE Rule
                  </p>

                  <p className="mt-1 text-sm leading-6 text-slate-300">
                    Knowing the term does
                    not mean guessing
                    portfolio facts. If the
                    information is not
                    verified, tell the
                    buyer you will confirm
                    it.
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-8 flex flex-col gap-3 border-t border-slate-100 pt-6 sm:flex-row sm:items-center sm:justify-between">
              <button
                onClick={previousTerm}
                disabled={
                  lessonIndex === 0 &&
                  termIndex === 0
                }
                className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold ${
                  lessonIndex === 0 &&
                  termIndex === 0
                    ? 'cursor-not-allowed bg-slate-100 text-slate-300'
                    : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                <ArrowLeft
                  size={17}
                />
                Previous
              </button>

              <button
                onClick={nextTerm}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 text-sm font-semibold text-white hover:bg-blue-700"
              >
                {lessonIndex ===
                  lessons.length - 1 &&
                termIndex ===
                  lesson.terms.length -
                    1
                  ? 'Take Mission Check'
                  : 'Continue'}

                <ArrowRight
                  size={17}
                />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
