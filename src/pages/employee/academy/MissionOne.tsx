import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  Clock3,
  GraduationCap,
  ShieldCheck,
  Target,
  XCircle,
} from 'lucide-react';
import { useMemo, useState } from 'react';

type Props = {
  onBack: () => void;
  onComplete: (score: number) => void;
};

type Question = {
  question: string;
  answers: string[];
  correct: number;
};

const cards = [
  {
    eyebrow: 'Welcome',
    title: 'Welcome to Data Market House',
    body: [
      'You are beginning DMHOUSE QuickStart™, the certification program designed to prepare you to professionally represent Data Market House.',
      'QuickStart is not designed to teach you everything about the debt industry.',
      'It is designed to prepare you for your first buyer conversation.',
    ],
    highlight:
      'You are not expected to know everything. You are expected to communicate professionally and never guess.',
  },
  {
    eyebrow: 'Who We Are',
    title: 'What Data Market House Does',
    body: [
      'Data Market House connects debt portfolio sellers with qualified buyers and collection agencies.',
      'We help market debt portfolios to organizations interested in purchasing accounts.',
      'Data Market House is not a collection agency. We do not contact consumers to collect debts.',
    ],
    highlight:
      'Our role is to connect available portfolio opportunities with qualified business buyers.',
  },
  {
    eyebrow: 'The Product',
    title: 'What Is a Debt Portfolio?',
    body: [
      'A debt portfolio is a group of accounts offered for sale together.',
      'Instead of purchasing one individual account, a buyer may purchase hundreds, thousands, or tens of thousands of accounts in one transaction.',
      'Portfolio information can include the original creditor, number of accounts, balances, charge-off dates, states, account types, and documentation availability.',
    ],
    highlight:
      'Example: 9,600 accounts with $8.2 million in total balances may be offered together as one portfolio.',
  },
  {
    eyebrow: 'Your Role',
    title: 'What You Are Responsible For',
    body: [
      'Research qualified collection agencies and buyers.',
      'Introduce available portfolio opportunities.',
      'Answer basic portfolio questions accurately.',
      'Help manage NDAs, buyer conversations, offers, and follow-up activity.',
      'Escalate pricing, negotiation, or complex portfolio questions when needed.',
    ],
    highlight:
      'You are not expected to know every answer on Day 1. You are expected to know when to ask for help.',
  },
  {
    eyebrow: 'Critical Rule',
    title: 'Never Guess',
    body: [
      'If a buyer asks a question and you are unsure of the answer, do not make something up.',
      'Do not assume.',
      'Do not give an answer simply because it sounds correct.',
    ],
    highlight:
      'Say: “Let me verify that information for you and get back to you.”',
  },
  {
    eyebrow: 'Confidentiality',
    title: 'Protect Confidential Information',
    body: [
      'Debt portfolios can contain sensitive business and account information.',
      'Some portfolio information may only be shared after the buyer completes required steps such as signing an NDA.',
      'Never send confidential or unmasked information without authorization.',
    ],
    highlight:
      'If you are unsure whether something can be shared, stop and ask management.',
  },
  {
    eyebrow: 'Professional Standards',
    title: 'Every Conversation Represents DMHOUSE',
    body: [
      'Be respectful.',
      'Be clear.',
      'Be accurate.',
      'Follow up when you say you will.',
      'Keep communication organized.',
      'Never argue with a buyer.',
      'Never pretend to know something you do not know.',
    ],
    highlight:
      'Professional does not mean complicated. Clear and accurate communication matters more than sounding like an expert.',
  },
  {
    eyebrow: 'Your First Goal',
    title: 'Earn the Buyer’s Trust',
    body: [
      'Your first goal is not immediately closing a sale.',
      'Buyers may purchase multiple portfolios over time, so a strong professional relationship can become more valuable than one transaction.',
      'Trust is built by providing accurate information, responding when promised, being honest, and following company procedures.',
    ],
    highlight:
      'If buyers trust the information coming from Data Market House, they are more likely to continue doing business with us.',
  },
  {
    eyebrow: 'Escalation',
    title: 'Know When to Ask for Help',
    body: [
      'Handle basic questions you have been trained to answer.',
      'Ask management for help with complex pricing, negotiation strategy, legal questions, ownership questions, unusual document requests, unmasked data requests, or anything you cannot verify.',
    ],
    highlight:
      'Asking for help is not a failure. Giving incorrect information is.',
  },
];

const questions: Question[] = [
  {
    question: 'What does Data Market House primarily do?',
    answers: [
      'Collect payments directly from consumers',
      'Connect debt portfolio sellers with qualified buyers',
      'Provide consumer credit repair',
      'Operate collection call centers',
    ],
    correct: 1,
  },
  {
    question: 'Is Data Market House a collection agency?',
    answers: ['Yes', 'No'],
    correct: 1,
  },
  {
    question:
      'A buyer asks you a portfolio question and you do not know the answer. What should you do?',
    answers: [
      'Give your best guess',
      'Tell the buyer the question is not important',
      'Verify the information and follow up',
      'Ignore the question',
    ],
    correct: 2,
  },
  {
    question:
      'Which activity is part of a Data Market House employee’s role?',
    answers: [
      'Calling consumers to collect debts',
      'Contacting qualified buyers about portfolio opportunities',
      'Changing consumer credit reports',
      'Providing legal advice',
    ],
    correct: 1,
  },
  {
    question:
      'A buyer asks whether a portfolio has been sold before, but you are unsure. What is the best response?',
    answers: [
      'I don’t think so.',
      'Probably not.',
      'Let me verify the portfolio history for you.',
      'It doesn’t matter.',
    ],
    correct: 2,
  },
  {
    question:
      'Protecting confidential portfolio information is part of your job.',
    answers: ['True', 'False'],
    correct: 0,
  },
  {
    question:
      'What should be your first goal when working with a new buyer?',
    answers: [
      'Close the sale immediately',
      'Earn the buyer’s trust',
      'Convince them to buy the largest portfolio',
      'Avoid asking management questions',
    ],
    correct: 1,
  },
];

export default function MissionOne({ onBack, onComplete }: Props) {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [submitted, setSubmitted] = useState(false);
  const [pledge, setPledge] = useState(false);
  const [complete, setComplete] = useState(false);

  const learningComplete = step >= cards.length;
  const quizAnswered = Object.keys(answers).length === questions.length;

  const score = useMemo(
    () =>
      questions.reduce(
        (total, question, index) =>
          total + (answers[index] === question.correct ? 1 : 0),
        0,
      ),
    [answers],
  );

  const passed = score >= 6;

  function submitQuiz() {
    if (!quizAnswered) return;
    setSubmitted(true);
  }

  function retry() {
    setAnswers({});
    setSubmitted(false);
  }

  function finishMission() {
    if (!passed || !pledge) return;
    setComplete(true);
    onComplete(
      Math.round(
        (score / questions.length) * 100,
      ),
    );
  }

  if (complete) {
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
              Welcome to Data Market House
            </h1>

            <p className="mx-auto mt-4 max-w-xl leading-7 text-slate-300">
              You understand who Data Market House is, what your role is,
              why confidentiality matters, and why accuracy always comes
              before guessing.
            </p>

            <div className="mt-8 rounded-3xl border border-white/10 bg-white/5 p-5">
              <p className="text-sm text-slate-400">
                Mission Check
              </p>
              <p className="mt-2 text-3xl font-semibold">
                {score} / 7
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

  if (!learningComplete) {
    const card = cards[step];
    const progress = Math.round(((step + 1) / cards.length) * 100);

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

          <div className="mt-6 flex flex-col gap-5 rounded-[30px] bg-slate-950 p-6 text-white md:flex-row md:items-end md:justify-between md:p-8">
            <div>
              <p className="text-xs font-bold uppercase tracking-[.2em] text-blue-300">
                Mission 1
              </p>
              <h1 className="mt-2 text-3xl font-semibold">
                Welcome to Data Market House
              </h1>
              <div className="mt-4 flex flex-wrap gap-3 text-xs text-slate-300">
                <span className="inline-flex items-center gap-2">
                  <Clock3 size={14} />
                  10–15 minutes
                </span>
                <span className="inline-flex items-center gap-2">
                  <Target size={14} />
                  First buyer readiness
                </span>
              </div>
            </div>

            <div className="min-w-52">
              <div className="flex justify-between text-xs text-slate-400">
                <span>Learning progress</span>
                <span>{progress}%</span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-blue-500"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          </div>

          <div className="mt-7 rounded-[30px] border border-slate-200 bg-white p-7 shadow-sm md:p-10">
            <p className="text-xs font-bold uppercase tracking-[.2em] text-blue-600">
              {card.eyebrow}
            </p>

            <h2 className="mt-3 text-2xl font-semibold tracking-tight text-slate-950 md:text-3xl">
              {card.title}
            </h2>

            <div className="mt-6 space-y-4">
              {card.body.map((paragraph) => (
                <p
                  key={paragraph}
                  className="text-base leading-7 text-slate-600"
                >
                  {paragraph}
                </p>
              ))}
            </div>

            <div className="mt-7 rounded-2xl border border-blue-100 bg-blue-50 p-5">
              <div className="flex gap-3">
                <ShieldCheck
                  size={21}
                  className="mt-0.5 shrink-0 text-blue-600"
                />
                <p className="text-sm font-semibold leading-6 text-blue-950">
                  {card.highlight}
                </p>
              </div>
            </div>

            <div className="mt-8 flex items-center justify-between border-t border-slate-100 pt-6">
              <p className="text-sm text-slate-400">
                Card {step + 1} of {cards.length}
              </p>

              <button
                onClick={() => setStep(step + 1)}
                className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-blue-600 px-5 text-sm font-semibold text-white hover:bg-blue-700"
              >
                {step === cards.length - 1
                  ? 'Take Mission Check'
                  : 'Continue'}
                <ArrowRight size={17} />
              </button>
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
          onClick={() => {
            setStep(cards.length - 1);
            setSubmitted(false);
          }}
          className="inline-flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-slate-900"
        >
          <ArrowLeft size={17} />
          Review learning cards
        </button>

        <div className="mt-6 rounded-[30px] bg-slate-950 p-7 text-white md:p-9">
          <div className="flex items-center gap-3">
            <GraduationCap className="text-blue-300" />
            <p className="text-xs font-bold uppercase tracking-[.2em] text-blue-300">
              Mission Check
            </p>
          </div>

          <h1 className="mt-3 text-3xl font-semibold">
            Prove what you learned.
          </h1>

          <p className="mt-3 max-w-2xl leading-7 text-slate-300">
            Answer all seven questions. You need at least 6 correct
            answers to complete Mission 1.
          </p>
        </div>

        <div className="mt-6 space-y-5">
          {questions.map((question, questionIndex) => (
            <div
              key={question.question}
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
                    {question.answers.map((answer, answerIndex) => {
                      const selected =
                        answers[questionIndex] === answerIndex;

                      const correctAnswer =
                        submitted &&
                        answerIndex === question.correct;

                      const wrongSelection =
                        submitted &&
                        selected &&
                        answerIndex !== question.correct;

                      return (
                        <button
                          key={answer}
                          disabled={submitted}
                          onClick={() =>
                            setAnswers((current) => ({
                              ...current,
                              [questionIndex]: answerIndex,
                            }))
                          }
                          className={`flex w-full items-center gap-3 rounded-2xl border p-4 text-left text-sm transition ${
                            correctAnswer
                              ? 'border-emerald-300 bg-emerald-50 text-emerald-900'
                              : wrongSelection
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
                            {correctAnswer && submitted ? (
                              <Check size={14} />
                            ) : wrongSelection ? (
                              <XCircle size={14} />
                            ) : selected ? (
                              <Check size={14} />
                            ) : null}
                          </span>

                          {answer}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {!submitted && (
          <div className="mt-6 flex justify-end">
            <button
              disabled={!quizAnswered}
              onClick={submitQuiz}
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
            <div className="flex items-start gap-4">
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
                  {score} / 7
                </p>

                {passed ? (
                  <>
                    <p className="mt-3 text-sm leading-6 text-emerald-900">
                      You passed the Mission Check. Accept the
                      Professional Commitment to complete Mission 1.
                    </p>

                    <label className="mt-6 flex cursor-pointer items-start gap-3 rounded-2xl border border-emerald-200 bg-white p-5">
                      <input
                        type="checkbox"
                        checked={pledge}
                        onChange={(event) =>
                          setPledge(event.target.checked)
                        }
                        className="mt-1 h-4 w-4"
                      />

                      <span>
                        <span className="font-semibold text-slate-950">
                          I accept the DMHOUSE Professional Commitment
                        </span>

                        <span className="mt-2 block text-sm leading-6 text-slate-600">
                          As a representative of Data Market House, I
                          understand that I am expected to communicate
                          professionally, protect confidential
                          information, represent the company honestly,
                          provide accurate information, and seek
                          guidance whenever I am unsure.
                        </span>
                      </span>
                    </label>

                    <button
                      disabled={!pledge}
                      onClick={finishMission}
                      className={`mt-5 inline-flex min-h-12 items-center gap-2 rounded-xl px-6 text-sm font-semibold ${
                        pledge
                          ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                          : 'cursor-not-allowed bg-emerald-200 text-emerald-500'
                      }`}
                    >
                      Complete Mission 1
                      <CheckCircle2 size={17} />
                    </button>
                  </>
                ) : (
                  <>
                    <p className="mt-3 text-sm leading-6 text-red-900">
                      You need at least 6 correct answers. Review the
                      questions you missed and try again.
                    </p>

                    <button
                      onClick={retry}
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
