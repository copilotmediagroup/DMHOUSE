import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Clock3,
  GraduationCap,
  MessageSquareText,
  Phone,
  ShieldCheck,
  Target,
  UserRound,
  XCircle,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { usePracticeAttemptTelemetry } from './usePracticeAttemptTelemetry';

type Props = {
  onBack: () => void;
  onComplete: (score: number) => void;
};

type Choice = {
  text: string;
  correct: boolean;
  buyerReaction: string;
  coaching: string;
};

type Scenario = {
  title: string;
  context: string;
  buyer: string;
  choices: Choice[];
};

const scenarios: Scenario[] = [
  {
    title: 'Average Balance',
    context:
      'You are speaking with a buyer who has opened the portfolio summary.',
    buyer:
      '“What is the average balance on this file?”',
    choices: [
      {
        text: '“I think it is around $900.”',
        correct: false,
        buyerReaction:
          '“Around $900? I need the actual number.”',
        coaching:
          'Never estimate a portfolio fact when the exact number should be available.',
      },
      {
        text: '“The average balance is $850.”',
        correct: true,
        buyerReaction:
          '“Great, thank you.”',
        coaching:
          'Correct. The verified portfolio summary shows an $850 average balance.',
      },
      {
        text: '“Average balance does not really matter.”',
        correct: false,
        buyerReaction:
          '“It matters to our purchasing model.”',
        coaching:
          'Buyer questions should be taken seriously even when the employee does not personally think the field is important.',
      },
    ],
  },
  {
    title: 'Chain of Title',
    context:
      'The portfolio summary does not confirm whether complete chain documentation is available.',
    buyer:
      '“Do you have full chain on this portfolio?”',
    choices: [
      {
        text: '“Yes, full chain is available.”',
        correct: false,
        buyerReaction:
          '“Perfect. Send it to me.”',
        coaching:
          'You just made a representation you could not verify. Never promise documentation that has not been confirmed.',
      },
      {
        text: '“Let me verify the chain documentation and get back to you.”',
        correct: true,
        buyerReaction:
          '“Sounds good. Let me know what you find.”',
        coaching:
          'Correct. Verification protects both the relationship and Data Market House.',
      },
      {
        text: '“Chain is not important.”',
        correct: false,
        buyerReaction:
          '“It is very important to us.”',
        coaching:
          'Chain can be a major buyer requirement. Never dismiss a legitimate due-diligence question.',
      },
    ],
  },
  {
    title: 'Sale History',
    context:
      'You know the portfolio is secondary paper, but you do not have verified ownership-history details.',
    buyer:
      '“How many times has this portfolio been sold?”',
    choices: [
      {
        text: '“Only once.”',
        correct: false,
        buyerReaction:
          '“Can you prove that?”',
        coaching:
          'Secondary paper does not automatically tell you the exact number of prior sales.',
      },
      {
        text: '“I do not have the verified sale history in front of me. Let me confirm it.”',
        correct: true,
        buyerReaction:
          '“Okay, send me the history when you have it.”',
        coaching:
          'Correct. Answer only what the available information supports.',
      },
      {
        text: '“Probably two or three times.”',
        correct: false,
        buyerReaction:
          '“Probably?”',
        coaching:
          'Words like “probably” are still guesses when discussing portfolio facts.',
      },
    ],
  },
  {
    title: 'Media',
    context:
      'The portfolio summary says: Media — Available on request.',
    buyer:
      '“Is media available?”',
    choices: [
      {
        text: '“Yes. The portfolio indicates media is available on request.”',
        correct: true,
        buyerReaction:
          '“Good. We may request some during due diligence.”',
        coaching:
          'Correct. You accurately repeated the verified portfolio information without promising more than it says.',
      },
      {
        text: '“Yes, every account has complete media.”',
        correct: false,
        buyerReaction:
          '“Every single account?”',
        coaching:
          'The portfolio does not say that. Never expand a limited statement into a guarantee.',
      },
      {
        text: '“No, there is no media.”',
        correct: false,
        buyerReaction:
          '“The sheet says media is available.”',
        coaching:
          'Read the portfolio carefully before responding.',
      },
    ],
  },
  {
    title: 'Masked Sample',
    context:
      'The buyer has expressed interest but has not yet completed the NDA.',
    buyer:
      '“Can you email me the masked file right now?”',
    choices: [
      {
        text: '“Sure, I will send it now.”',
        correct: false,
        buyerReaction:
          '“Thanks.”',
        coaching:
          'The sample portfolio says the masked file becomes available after NDA. Follow the company process.',
      },
      {
        text: '“Once the NDA is completed, I can move the masked file through our approved process.”',
        correct: true,
        buyerReaction:
          '“Send me the NDA.”',
        coaching:
          'Correct. You kept the conversation moving while protecting the file.',
      },
      {
        text: '“We never share masked files.”',
        correct: false,
        buyerReaction:
          '“Then how am I supposed to evaluate it?”',
        coaching:
          'That is inaccurate. The file can be shared through the approved process.',
      },
    ],
  },
  {
    title: 'Unmasked File',
    context:
      'A buyer is interested but the transaction has not been completed.',
    buyer:
      '“Just send me the unmasked file so my team can review it.”',
    choices: [
      {
        text: '“No problem.”',
        correct: false,
        buyerReaction:
          '“Great, send it over.”',
        coaching:
          'Never release sensitive unmasked data outside the authorized process.',
      },
      {
        text: '“The unmasked file is released only through the approved transaction process.”',
        correct: true,
        buyerReaction:
          '“Understood.”',
        coaching:
          'Correct. Sensitive information must remain controlled.',
      },
      {
        text: '“I can send a few unmasked accounts instead.”',
        correct: false,
        buyerReaction:
          '“That works.”',
        coaching:
          'A smaller unauthorized disclosure is still unauthorized.',
      },
    ],
  },
  {
    title: 'Pricing',
    context:
      'The buyer wants a discount. Employees are expected to escalate complex pricing and negotiation decisions.',
    buyer:
      '“I will buy it today if you knock $15,000 off the price.”',
    choices: [
      {
        text: '“Deal.”',
        correct: false,
        buyerReaction:
          '“Perfect. Send the agreement.”',
        coaching:
          'Do not authorize a major pricing concession unless you have authority to do so.',
      },
      {
        text: '“I can take that offer to management and get you a response.”',
        correct: true,
        buyerReaction:
          '“Okay. Let me know what they say.”',
        coaching:
          'Correct. Capture the opportunity and escalate the decision.',
      },
      {
        text: '“Absolutely not.”',
        correct: false,
        buyerReaction:
          '“Then I guess we are done.”',
        coaching:
          'You may have killed a viable negotiation. Do not reject meaningful offers outside your authority.',
      },
    ],
  },
  {
    title: 'Legal Question',
    context:
      'The buyer asks a question about whether a particular collection strategy is legally permitted in a state.',
    buyer:
      '“Can we legally collect these accounts using this strategy in Florida?”',
    choices: [
      {
        text: '“Yes, that is completely legal.”',
        correct: false,
        buyerReaction:
          '“Good, I will rely on that.”',
        coaching:
          'Employees should not provide legal advice or make legal guarantees.',
      },
      {
        text: '“I cannot give you legal advice. I can escalate the question and provide the portfolio information we have.”',
        correct: true,
        buyerReaction:
          '“Fair enough.”',
        coaching:
          'Correct. Know the boundary between sales information and legal advice.',
      },
      {
        text: '“I am pretty sure it is okay.”',
        correct: false,
        buyerReaction:
          '“Pretty sure?”',
        coaching:
          'Uncertainty plus legal advice is especially dangerous. Escalate.',
      },
    ],
  },
  {
    title: 'Buyer Pushback',
    context:
      'The buyer thinks the asking price is high.',
    buyer:
      '“This file is overpriced. I have seen cheaper paper.”',
    choices: [
      {
        text: '“Then buy the cheaper paper.”',
        correct: false,
        buyerReaction:
          '“Okay, I will.”',
        coaching:
          'Never turn normal negotiation into an argument.',
      },
      {
        text: '“I understand. What price range would make the portfolio worth reviewing for you?”',
        correct: true,
        buyerReaction:
          '“If we were closer to $38,000, I would take a serious look.”',
        coaching:
          'Correct. You turned pushback into useful negotiation information.',
      },
      {
        text: '“You are wrong. This is a great price.”',
        correct: false,
        buyerReaction:
          '“We clearly see the market differently.”',
        coaching:
          'Arguing does not move the deal forward. Ask questions and gather information.',
      },
    ],
  },
  {
    title: 'Follow-Up Promise',
    context:
      'You told the buyer you would verify the portfolio sale history.',
    buyer:
      '“You said you would get back to me with the sale history. Did you find out?”',
    choices: [
      {
        text: '“I forgot.”',
        correct: false,
        buyerReaction:
          '“That does not give me much confidence.”',
        coaching:
          'Trust is damaged when you fail to follow through.',
      },
      {
        text: '“I am still waiting on verification. I wanted to update you rather than leave you waiting.”',
        correct: true,
        buyerReaction:
          '“Thanks for the update. Let me know when you have it.”',
        coaching:
          'Correct. Professional follow-up includes communicating even when the final answer is not ready.',
      },
      {
        text: '“Yes. I think it was sold once.”',
        correct: false,
        buyerReaction:
          '“You think?”',
        coaching:
          'Do not turn an unanswered question into an invented answer just because the buyer followed up.',
      },
    ],
  },
];

type Screen =
  | 'intro'
  | 'simulation'
  | 'results'
  | 'complete';

export default function MissionFour({
  onBack,
  onComplete,
}: Props) {
  const [screen, setScreen] =
    useState<Screen>('intro');

  const [scenarioIndex, setScenarioIndex] =
    useState(0);

  const [selections, setSelections] =
    useState<Record<number, number>>({});

  const [answered, setAnswered] =
    useState(false);

  const [selectedChoice, setSelectedChoice] =
    useState<number | null>(null);

  const scenario =
    scenarios[scenarioIndex];

  const correctCount = useMemo(
    () =>
      scenarios.reduce(
        (total, item, index) => {
          const choiceIndex =
            selections[index];

          if (
            choiceIndex == null
          ) {
            return total;
          }

          return (
            total +
            (item.choices[
              choiceIndex
            ]?.correct
              ? 1
              : 0)
          );
        },
        0,
      ),
    [selections],
  );

  const percent =
    Math.round(
      (correctCount /
        scenarios.length) *
        100,
    );

  const passed =
    percent >= 90;

  usePracticeAttemptTelemetry({
    missionNumber: 4,
    attemptOpen:
      screen === 'simulation' ||
      screen === 'results',

    submitted:
      screen === 'results',

    scorePercent: percent,

    questionCount:
      scenarios.length,

    correctCount:
      Math.round(
        (percent / 100) *
          scenarios.length,
      ),

    passed,
  });

  const selected =
    selectedChoice == null
      ? null
      : scenario.choices[
          selectedChoice
        ];

  function choose(
    index: number,
  ) {
    if (answered) return;

    setSelectedChoice(index);
    setAnswered(true);

    setSelections(
      (current) => ({
        ...current,
        [scenarioIndex]: index,
      }),
    );
  }

  function nextScenario() {
    if (
      scenarioIndex <
      scenarios.length - 1
    ) {
      setScenarioIndex(
        scenarioIndex + 1,
      );

      setSelectedChoice(null);
      setAnswered(false);
      return;
    }

    setScreen('results');
  }

  function retry() {
    setSelections({});
    setScenarioIndex(0);
    setSelectedChoice(null);
    setAnswered(false);
    setScreen('simulation');
  }

  function finish() {
    if (!passed) return;

    onComplete(percent);
    setScreen('complete');
  }

  if (
    screen === 'complete'
  ) {
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
              Your First Buyer
            </h1>

            <p className="mx-auto mt-4 max-w-xl leading-7 text-slate-300">
              You demonstrated that you
              can answer verified
              questions, protect
              confidential information,
              handle buyer pushback, and
              escalate when necessary.
            </p>

            <div className="mt-8 rounded-3xl border border-white/10 bg-white/5 p-5">
              <p className="text-sm text-slate-400">
                Buyer Simulator Score
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

  if (
    screen === 'results'
  ) {
    return (
      <div className="min-h-full bg-slate-50 p-5 md:p-8 lg:p-10">
        <div className="mx-auto max-w-4xl">
          <div
            className={`rounded-[32px] border p-8 md:p-10 ${
              passed
                ? 'border-emerald-200 bg-emerald-50'
                : 'border-red-200 bg-red-50'
            }`}
          >
            <div
              className={`grid h-16 w-16 place-items-center rounded-2xl ${
                passed
                  ? 'bg-emerald-100 text-emerald-700'
                  : 'bg-red-100 text-red-700'
              }`}
            >
              {passed ? (
                <CheckCircle2
                  size={32}
                />
              ) : (
                <XCircle
                  size={32}
                />
              )}
            </div>

            <p className="mt-6 text-xs font-bold uppercase tracking-[.2em] text-slate-500">
              Buyer Simulator Results
            </p>

            <h1 className="mt-2 text-4xl font-semibold">
              {percent}%
            </h1>

            <p className="mt-3 text-lg font-semibold">
              {correctCount} of{' '}
              {scenarios.length}{' '}
              buyer decisions correct
            </p>

            {passed ? (
              <>
                <p className="mt-4 max-w-2xl leading-7 text-emerald-900">
                  You passed. You showed
                  the judgment required to
                  handle a basic buyer
                  conversation without
                  guessing or exceeding
                  your authority.
                </p>

                <button
                  onClick={finish}
                  className="mt-6 inline-flex min-h-12 items-center gap-2 rounded-xl bg-emerald-600 px-6 text-sm font-semibold text-white hover:bg-emerald-700"
                >
                  Complete Mission 4
                  <CheckCircle2
                    size={17}
                  />
                </button>
              </>
            ) : (
              <>
                <p className="mt-4 max-w-2xl leading-7 text-red-900">
                  Mission 4 requires 90%.
                  Repeat the simulator and
                  focus on accuracy,
                  confidentiality, buyer
                  trust, and escalation.
                </p>

                <button
                  onClick={retry}
                  className="mt-6 rounded-xl bg-slate-950 px-6 py-3 text-sm font-semibold text-white hover:bg-slate-800"
                >
                  Repeat Buyer Simulator
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (
    screen === 'simulation'
  ) {
    const progress =
      Math.round(
        ((scenarioIndex + 1) /
          scenarios.length) *
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
                  Buyer Simulator™
                </p>

                <h1 className="mt-2 text-3xl font-semibold">
                  {scenario.title}
                </h1>

                <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">
                  {scenario.context}
                </p>
              </div>

              <div className="min-w-56">
                <div className="flex justify-between text-xs text-slate-400">
                  <span>
                    Simulation progress
                  </span>

                  <span>
                    {progress}%
                  </span>
                </div>

                <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
                  <div
                    className="h-full rounded-full bg-blue-500"
                    style={{
                      width:
                        `${progress}%`,
                    }}
                  />
                </div>

                <p className="mt-2 text-xs text-slate-500">
                  Scenario{' '}
                  {scenarioIndex + 1} of{' '}
                  {scenarios.length}
                </p>
              </div>
            </div>
          </div>

          <div className="mt-7 grid gap-6 lg:grid-cols-[.75fr_1.25fr]">
            <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-center gap-4">
                <div className="grid h-12 w-12 place-items-center rounded-2xl bg-slate-950 text-white">
                  <UserRound
                    size={22}
                  />
                </div>

                <div>
                  <p className="font-semibold">
                    Portfolio Buyer
                  </p>

                  <p className="text-xs text-slate-500">
                    Live practice
                    conversation
                  </p>
                </div>
              </div>

              <div className="mt-6 rounded-2xl bg-slate-100 p-5">
                <p className="text-sm font-semibold leading-7 text-slate-900">
                  {scenario.buyer}
                </p>
              </div>

              {answered &&
                selected && (
                  <div
                    className={`mt-4 rounded-2xl p-5 ${
                      selected.correct
                        ? 'bg-emerald-50'
                        : 'bg-red-50'
                    }`}
                  >
                    <p className="text-xs font-bold uppercase tracking-[.14em] text-slate-500">
                      Buyer Reaction
                    </p>

                    <p className="mt-2 text-sm font-semibold leading-6">
                      {
                        selected.buyerReaction
                      }
                    </p>
                  </div>
                )}
            </div>

            <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
              <p className="text-xs font-bold uppercase tracking-[.18em] text-blue-600">
                What do you say?
              </p>

              <div className="mt-5 space-y-3">
                {scenario.choices.map(
                  (
                    choice,
                    index,
                  ) => {
                    const chosen =
                      selectedChoice ===
                      index;

                    return (
                      <button
                        key={
                          choice.text
                        }
                        disabled={
                          answered
                        }
                        onClick={() =>
                          choose(index)
                        }
                        className={`w-full rounded-2xl border p-5 text-left text-sm font-medium leading-6 transition ${
                          answered &&
                          chosen &&
                          choice.correct
                            ? 'border-emerald-300 bg-emerald-50 text-emerald-950'
                            : answered &&
                                chosen &&
                                !choice.correct
                              ? 'border-red-300 bg-red-50 text-red-950'
                              : answered &&
                                  choice.correct
                                ? 'border-emerald-200 bg-emerald-50/40'
                                : 'border-slate-200 hover:border-blue-300 hover:bg-blue-50'
                        }`}
                      >
                        {choice.text}
                      </button>
                    );
                  },
                )}
              </div>

              {answered &&
                selected && (
                  <div
                    className={`mt-6 rounded-2xl border p-5 ${
                      selected.correct
                        ? 'border-emerald-200 bg-emerald-50'
                        : 'border-amber-200 bg-amber-50'
                    }`}
                  >
                    <div className="flex gap-3">
                      {selected.correct ? (
                        <CheckCircle2
                          className="mt-0.5 shrink-0 text-emerald-700"
                          size={20}
                        />
                      ) : (
                        <ShieldCheck
                          className="mt-0.5 shrink-0 text-amber-700"
                          size={20}
                        />
                      )}

                      <div>
                        <p className="text-sm font-semibold">
                          {selected.correct
                            ? 'Good decision'
                            : 'Coaching'}
                        </p>

                        <p className="mt-2 text-sm leading-6 text-slate-700">
                          {
                            selected.coaching
                          }
                        </p>
                      </div>
                    </div>
                  </div>
                )}

              <div className="mt-7 flex justify-end border-t border-slate-100 pt-6">
                <button
                  disabled={
                    !answered
                  }
                  onClick={
                    nextScenario
                  }
                  className={`inline-flex min-h-11 items-center gap-2 rounded-xl px-5 text-sm font-semibold ${
                    answered
                      ? 'bg-blue-600 text-white hover:bg-blue-700'
                      : 'cursor-not-allowed bg-slate-100 text-slate-300'
                  }`}
                >
                  {scenarioIndex ===
                  scenarios.length -
                    1
                    ? 'See Results'
                    : 'Continue Conversation'}

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
                <Phone size={15} />
                Mission 4
              </div>

              <h1 className="mt-5 text-3xl font-semibold md:text-4xl">
                Your First Buyer
              </h1>

              <p className="mt-4 max-w-2xl leading-7 text-slate-300">
                You know the terminology
                and you can read a
                portfolio. Now prove you
                can use that knowledge
                during a real buyer
                conversation.
              </p>

              <div className="mt-6 flex flex-wrap gap-3 text-xs text-slate-300">
                <span className="inline-flex items-center gap-2 rounded-xl bg-white/5 px-3 py-2">
                  <Clock3
                    size={14}
                  />
                  20–30 minutes
                </span>

                <span className="inline-flex items-center gap-2 rounded-xl bg-white/5 px-3 py-2">
                  <Target
                    size={14}
                  />
                  10 buyer scenarios
                </span>

                <span className="inline-flex items-center gap-2 rounded-xl bg-white/5 px-3 py-2">
                  <MessageSquareText
                    size={14}
                  />
                  Interactive decisions
                </span>
              </div>

              <button
                onClick={() =>
                  setScreen(
                    'simulation',
                  )
                }
                className="mt-7 inline-flex min-h-12 items-center gap-2 rounded-xl bg-blue-600 px-6 text-sm font-semibold text-white hover:bg-blue-700"
              >
                Start Buyer Simulator
                <ArrowRight
                  size={17}
                />
              </button>
            </div>

            <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
              <GraduationCap
                className="text-blue-300"
                size={34}
              />

              <p className="mt-4 text-sm font-semibold">
                Your objective
              </p>

              <p className="mt-2 text-sm leading-6 text-slate-400">
                Answer when you know.
                Verify when you do not.
                Escalate when the decision
                exceeds your authority.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
