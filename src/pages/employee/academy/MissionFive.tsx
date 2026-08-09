import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Clock3,
  FileCheck2,
  FileSignature,
  GraduationCap,
  Handshake,
  LockKeyhole,
  ShieldCheck,
  Target,
  WalletCards,
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
  result: string;
  coaching: string;
};

type Step = {
  stage: string;
  title: string;
  situation: string;
  choices: Choice[];
};

const steps: Step[] = [
  {
    stage: 'Buyer Interest',
    title: 'The Buyer Responds',
    situation:
      'A qualified buyer replies to your outreach and says they are interested in reviewing the portfolio.',
    choices: [
      {
        text: 'Immediately send the unmasked file.',
        correct: false,
        result:
          'Sensitive portfolio data was released before the transaction process was completed.',
        coaching:
          'Never release unmasked data at the beginning of a buyer conversation.',
      },
      {
        text: 'Start the NDA process and continue the buyer conversation.',
        correct: true,
        result:
          'The buyer is moved into the approved due-diligence process.',
        coaching:
          'Correct. Interest should move the buyer toward the NDA and controlled review process.',
      },
      {
        text: 'Ask the buyer to pay before they can review anything.',
        correct: false,
        result:
          'The buyer cannot reasonably evaluate the opportunity.',
        coaching:
          'Payment happens later. The buyer first needs to complete the approved review process.',
      },
    ],
  },
  {
    stage: 'NDA',
    title: 'NDA Sent',
    situation:
      'The NDA has been sent to the buyer, but it has not been signed yet.',
    choices: [
      {
        text: 'Send the masked file anyway because the buyer seems serious.',
        correct: false,
        result:
          'The portfolio review process was bypassed.',
        coaching:
          'Follow the approved sequence. If the file requires an NDA first, wait for the signed NDA.',
      },
      {
        text: 'Wait for the signed NDA and follow up professionally if needed.',
        correct: true,
        result:
          'The buyer remains in the correct transaction stage.',
        coaching:
          'Correct. Do not skip required steps just because a buyer is interested.',
      },
      {
        text: 'Send the purchase agreement before the NDA is signed.',
        correct: false,
        result:
          'The transaction jumped ahead before due diligence even began.',
        coaching:
          'The buyer has not reached that stage yet.',
      },
    ],
  },
  {
    stage: 'NDA Signed',
    title: 'Buyer Signs the NDA',
    situation:
      'The buyer signs the NDA. The portfolio record confirms the masked file is available after NDA.',
    choices: [
      {
        text: 'Move the masked file through the approved buyer review process.',
        correct: true,
        result:
          'The buyer can now review the opportunity while sensitive information remains protected.',
        coaching:
          'Correct. The signed NDA unlocks the next approved due-diligence step.',
      },
      {
        text: 'Release the unmasked file now.',
        correct: false,
        result:
          'Sensitive information was released before payment and authorization.',
        coaching:
          'A signed NDA is not the same as a completed purchase.',
      },
      {
        text: 'Close the deal automatically.',
        correct: false,
        result:
          'No purchase terms or payment have been completed.',
        coaching:
          'The NDA is only one step in the transaction.',
      },
    ],
  },
  {
    stage: 'Due Diligence',
    title: 'Buyer Reviews the Portfolio',
    situation:
      'The buyer reviews the masked file and asks basic questions about the portfolio.',
    choices: [
      {
        text: 'Answer verified questions and verify anything you are unsure about.',
        correct: true,
        result:
          'The buyer receives accurate information without unsupported promises.',
        coaching:
          'Correct. Due diligence is where accuracy and buyer trust matter most.',
      },
      {
        text: 'Guess whenever the buyer asks something not shown in the file.',
        correct: false,
        result:
          'The buyer receives information that may be inaccurate.',
        coaching:
          'Never guess portfolio facts.',
      },
      {
        text: 'Tell the buyer no questions are allowed until payment.',
        correct: false,
        result:
          'The buyer cannot complete meaningful due diligence.',
        coaching:
          'Reasonable portfolio questions are part of the review process.',
      },
    ],
  },
  {
    stage: 'Offer',
    title: 'Buyer Makes an Offer',
    situation:
      'The buyer says, “I will pay $38,000 for the portfolio.”',
    choices: [
      {
        text: 'Accept the offer yourself immediately.',
        correct: false,
        result:
          'A pricing decision was made without proper authority.',
        coaching:
          'Employees should capture and escalate offers according to company authority rules.',
      },
      {
        text: 'Record the offer accurately and move it to the owner/management decision stage.',
        correct: true,
        result:
          'The offer is preserved and management can make the pricing decision.',
        coaching:
          'Correct. Capture the opportunity without exceeding your authority.',
      },
      {
        text: 'Reject it because it is below asking price.',
        correct: false,
        result:
          'A potentially viable deal was killed without management review.',
        coaching:
          'A lower offer may still be negotiable. Do not make owner-level decisions unless authorized.',
      },
    ],
  },
  {
    stage: 'Negotiation',
    title: 'Owner Responds',
    situation:
      'Management approves a counteroffer of $42,000. The buyer accepts.',
    choices: [
      {
        text: 'Move the transaction to the purchase agreement stage.',
        correct: true,
        result:
          'The accepted terms are ready to be documented.',
        coaching:
          'Correct. Once commercial terms are agreed, the transaction moves into the purchase agreement.',
      },
      {
        text: 'Release the unmasked file because the price is agreed.',
        correct: false,
        result:
          'The buyer has not signed the purchase agreement or paid.',
        coaching:
          'Agreement on price is not the same as a completed transaction.',
      },
      {
        text: 'Restart the NDA process.',
        correct: false,
        result:
          'The transaction moved backward unnecessarily.',
        coaching:
          'The NDA stage has already been completed.',
      },
    ],
  },
  {
    stage: 'Purchase Agreement',
    title: 'Purchase Agreement Sent',
    situation:
      'The purchase agreement has been prepared and sent to the buyer.',
    choices: [
      {
        text: 'Wait for the buyer to sign the purchase agreement.',
        correct: true,
        result:
          'The transaction remains in the correct stage.',
        coaching:
          'Correct. The agreement should be signed before moving toward funding and release.',
      },
      {
        text: 'Mark the portfolio sold immediately.',
        correct: false,
        result:
          'The deal was treated as closed before the agreement was executed.',
        coaching:
          'Do not treat an unsigned agreement as a completed sale.',
      },
      {
        text: 'Send the unmasked file with the agreement.',
        correct: false,
        result:
          'Sensitive data was released before the transaction was completed.',
        coaching:
          'The unmasked file remains locked.',
      },
    ],
  },
  {
    stage: 'Agreement Signed',
    title: 'Buyer Signs the Purchase Agreement',
    situation:
      'The signed purchase agreement is back. Payment has not yet been confirmed.',
    choices: [
      {
        text: 'Release the final file immediately.',
        correct: false,
        result:
          'The file was released before payment confirmation.',
        coaching:
          'A signed agreement alone does not complete the funding requirement.',
      },
      {
        text: 'Move the transaction to payment confirmation.',
        correct: true,
        result:
          'The buyer is now at the funding stage.',
        coaching:
          'Correct. Payment must be confirmed before final release.',
      },
      {
        text: 'Send another NDA.',
        correct: false,
        result:
          'The process moved backward for no reason.',
        coaching:
          'The NDA stage was already completed.',
      },
    ],
  },
  {
    stage: 'Payment',
    title: 'Buyer Says Payment Was Sent',
    situation:
      'The buyer emails a screenshot saying payment was sent, but the owner has not confirmed the funds.',
    choices: [
      {
        text: 'Release the unmasked file because the buyer sent proof.',
        correct: false,
        result:
          'The final file was released before authorized payment confirmation.',
        coaching:
          'Buyer-provided proof is not the same as the owner confirming payment.',
      },
      {
        text: 'Wait for the owner or authorized payment process to confirm the funds.',
        correct: true,
        result:
          'The file remains protected until funding is verified.',
        coaching:
          'Correct. Payment confirmation controls final file release.',
      },
      {
        text: 'Tell the buyer the deal is cancelled.',
        correct: false,
        result:
          'The buyer may have legitimately paid.',
        coaching:
          'The correct action is verification, not cancellation.',
      },
    ],
  },
  {
    stage: 'Payment Confirmed',
    title: 'Funds Are Confirmed',
    situation:
      'The owner confirms full payment has been received and all required transaction documents are complete.',
    choices: [
      {
        text: 'Unlock/release the authorized unmasked file through the secure process.',
        correct: true,
        result:
          'The buyer receives the final file after the deal is properly funded.',
        coaching:
          'Correct. This is the controlled final-release stage.',
      },
      {
        text: 'Send a random local copy by personal email.',
        correct: false,
        result:
          'The approved secure release process was bypassed.',
        coaching:
          'Use the authorized DMHOUSE release workflow.',
      },
      {
        text: 'Ask the buyer to sign another purchase agreement.',
        correct: false,
        result:
          'The already-completed transaction was unnecessarily delayed.',
        coaching:
          'All required documents are already complete.',
      },
    ],
  },
];

type Screen =
  | 'intro'
  | 'simulation'
  | 'results'
  | 'complete';

export default function MissionFive({
  onBack,
  onComplete,
}: Props) {
  const [screen, setScreen] =
    useState<Screen>('intro');

  const [stepIndex, setStepIndex] =
    useState(0);

  const [selections, setSelections] =
    useState<Record<number, number>>({});

  const [answered, setAnswered] =
    useState(false);

  const [selectedChoice, setSelectedChoice] =
    useState<number | null>(null);

  const step =
    steps[stepIndex];

  const correctCount = useMemo(
    () =>
      steps.reduce(
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
        steps.length) *
        100,
    );

  const passed =
    percent >= 90;

  usePracticeAttemptTelemetry({
    missionNumber: 5,
    attemptOpen:
      screen === 'simulation' ||
      screen === 'results',

    submitted:
      screen === 'results',

    scorePercent: percent,

    questionCount:
      steps.length,

    correctCount:
      Math.round(
        (percent / 100) *
          steps.length,
      ),

    passed,
  });

  const selected =
    selectedChoice == null
      ? null
      : step.choices[
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
        [stepIndex]: index,
      }),
    );
  }

  function nextStep() {
    if (
      stepIndex <
      steps.length - 1
    ) {
      setStepIndex(
        stepIndex + 1,
      );

      setSelectedChoice(null);
      setAnswered(false);
      return;
    }

    setScreen('results');
  }

  function retry() {
    setSelections({});
    setStepIndex(0);
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
              You Ran the Process
            </h1>

            <p className="mx-auto mt-4 max-w-xl leading-7 text-slate-300">
              You successfully moved a
              simulated buyer from initial
              interest through NDA, due
              diligence, offer,
              agreement, payment, and
              secure file release.
            </p>

            <div className="mt-8 rounded-3xl border border-white/10 bg-white/5 p-5">
              <p className="text-sm text-slate-400">
                Deal Simulator Score
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
              Deal Simulator Results
            </p>

            <h1 className="mt-2 text-4xl font-semibold">
              {percent}%
            </h1>

            <p className="mt-3 text-lg font-semibold">
              {correctCount} of{' '}
              {steps.length}{' '}
              process decisions correct
            </p>

            {passed ? (
              <>
                <p className="mt-4 max-w-2xl leading-7 text-emerald-900">
                  You passed. You
                  demonstrated that you
                  understand the correct
                  sequence and know when a
                  deal may advance to the
                  next stage.
                </p>

                <button
                  onClick={finish}
                  className="mt-6 inline-flex min-h-12 items-center gap-2 rounded-xl bg-emerald-600 px-6 text-sm font-semibold text-white hover:bg-emerald-700"
                >
                  Complete Mission 5
                  <CheckCircle2
                    size={17}
                  />
                </button>
              </>
            ) : (
              <>
                <p className="mt-4 max-w-2xl leading-7 text-red-900">
                  Mission 5 requires 90%.
                  Repeat the simulator and
                  focus on the correct
                  transaction sequence.
                </p>

                <button
                  onClick={retry}
                  className="mt-6 rounded-xl bg-slate-950 px-6 py-3 text-sm font-semibold text-white hover:bg-slate-800"
                >
                  Repeat Deal Simulator
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
        ((stepIndex + 1) /
          steps.length) *
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
                  Deal Simulator
                </p>

                <h1 className="mt-2 text-3xl font-semibold">
                  {step.title}
                </h1>

                <p className="mt-2 text-sm font-semibold text-blue-200">
                  Stage: {step.stage}
                </p>
              </div>

              <div className="min-w-56">
                <div className="flex justify-between text-xs text-slate-400">
                  <span>
                    Deal progress
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
                  Step {stepIndex + 1} of{' '}
                  {steps.length}
                </p>
              </div>
            </div>
          </div>

          <div className="mt-7 grid gap-6 lg:grid-cols-[.75fr_1.25fr]">
            <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
              <div className="grid h-12 w-12 place-items-center rounded-2xl bg-blue-50 text-blue-700">
                <Handshake
                  size={22}
                />
              </div>

              <p className="mt-5 text-xs font-bold uppercase tracking-[.16em] text-slate-400">
                Current Situation
              </p>

              <p className="mt-3 text-lg font-semibold leading-7 text-slate-950">
                {step.situation}
              </p>

              {answered &&
                selected && (
                  <div
                    className={`mt-6 rounded-2xl p-5 ${
                      selected.correct
                        ? 'bg-emerald-50'
                        : 'bg-red-50'
                    }`}
                  >
                    <p className="text-xs font-bold uppercase tracking-[.14em] text-slate-500">
                      Result
                    </p>

                    <p className="mt-2 text-sm font-semibold leading-6">
                      {
                        selected.result
                      }
                    </p>
                  </div>
                )}
            </div>

            <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
              <p className="text-xs font-bold uppercase tracking-[.18em] text-blue-600">
                What is the next action?
              </p>

              <div className="mt-5 space-y-3">
                {step.choices.map(
                  (
                    choice,
                    index,
                  ) => {
                    const chosen =
                      selectedChoice ===
                      index;

                    return (
                      <button
                        key={choice.text}
                        disabled={answered}
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
                            ? 'Correct next step'
                            : 'Process coaching'}
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
                  disabled={!answered}
                  onClick={nextStep}
                  className={`inline-flex min-h-11 items-center gap-2 rounded-xl px-5 text-sm font-semibold ${
                    answered
                      ? 'bg-blue-600 text-white hover:bg-blue-700'
                      : 'cursor-not-allowed bg-slate-100 text-slate-300'
                  }`}
                >
                  {stepIndex ===
                  steps.length - 1
                    ? 'See Results'
                    : 'Move Deal Forward'}

                  <ArrowRight size={17} />
                </button>
              </div>
            </div>
          </div>

          <div className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white">
            <div className="grid grid-cols-5 divide-x divide-slate-100 text-center text-[11px] font-semibold text-slate-400 md:grid-cols-10">
              {steps.map(
                (item, index) => (
                  <div
                    key={item.stage}
                    className={`p-3 ${
                      index < stepIndex
                        ? 'bg-emerald-50 text-emerald-700'
                        : index === stepIndex
                          ? 'bg-blue-50 text-blue-700'
                          : ''
                    }`}
                  >
                    {index < stepIndex
                      ? '✓'
                      : index + 1}
                  </div>
                ),
              )}
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
          <div className="grid gap-8 lg:grid-cols-[1fr_300px] lg:items-center">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-blue-200">
                <FileSignature size={15} />
                Mission 5
              </div>

              <h1 className="mt-5 text-3xl font-semibold md:text-4xl">
                Run the Process
              </h1>

              <p className="mt-4 max-w-2xl leading-7 text-slate-300">
                A good salesperson does
                not just know what to say.
                They know exactly where a
                buyer is in the deal and
                what must happen next.
              </p>

              <div className="mt-6 flex flex-wrap gap-3 text-xs text-slate-300">
                <span className="inline-flex items-center gap-2 rounded-xl bg-white/5 px-3 py-2">
                  <Clock3 size={14} />
                  About 30 minutes
                </span>

                <span className="inline-flex items-center gap-2 rounded-xl bg-white/5 px-3 py-2">
                  <Target size={14} />
                  10 transaction stages
                </span>

                <span className="inline-flex items-center gap-2 rounded-xl bg-white/5 px-3 py-2">
                  <WalletCards size={14} />
                  Buyer to payment
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
                Start Deal Simulator
                <ArrowRight size={17} />
              </button>
            </div>

            <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
              <FileCheck2
                className="text-blue-300"
                size={34}
              />

              <p className="mt-4 text-sm font-semibold">
                Your objective
              </p>

              <p className="mt-2 text-sm leading-6 text-slate-400">
                Always know the current
                deal stage, the required
                next action, and what must
                remain locked until the
                transaction is ready.
              </p>
            </div>
          </div>
        </div>

        <div className="mt-6 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-[.18em] text-slate-400">
            DMHOUSE Deal Path
          </p>

          <div className="mt-5 flex flex-wrap items-center gap-2 text-xs font-semibold">
            {[
              'Interest',
              'NDA',
              'NDA Signed',
              'Due Diligence',
              'Offer',
              'Negotiation',
              'Purchase Agreement',
              'Agreement Signed',
              'Payment',
              'Release',
            ].map(
              (
                stage,
                index,
                array,
              ) => (
                <div
                  key={stage}
                  className="flex items-center gap-2"
                >
                  <span className="rounded-xl bg-slate-100 px-3 py-2 text-slate-700">
                    {stage}
                  </span>

                  {index <
                    array.length -
                      1 && (
                    <ArrowRight
                      size={14}
                      className="text-slate-300"
                    />
                  )}
                </div>
              ),
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
