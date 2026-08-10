import {
  ArrowLeft,
  ArrowRight,
  BriefcaseBusiness,
  Building2,
  CheckCircle2,
  FileSignature,
  Mail,
  MapPinned,
  Phone,
  Search,
  X,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

export const EMPLOYEE_TOUR_PREVIEW_EVENT = 'dmh:employee-tour-preview';
export const EMPLOYEE_TOUR_STORAGE_PREFIX = 'dmh_employee_first_run_tour_v1';

type TourStep = {
  title: string;
  eyebrow: string;
  detail: string;
  path: string;
  action: string;
  icon: typeof Search;
};

const steps: TourStep[] = [
  {
    eyebrow: 'Step 1',
    title: 'Start with the portfolio you are selling',
    detail:
      'Before contacting anyone, understand the active portfolio, asking price, selling points and masked-file information available to you.',
    path: '/employee/portfolio',
    action: 'View Portfolio',
    icon: BriefcaseBusiness,
  },
  {
    eyebrow: 'Step 2',
    title: 'Find potential agencies',
    detail:
      'Next, search for collection agencies and other qualified business buyers inside your assigned prospecting territory.',
    path: '/employee/prospect',
    action: 'Search Maps',
    icon: Search,
  },
  {
    eyebrow: 'Step 3',
    title: 'Import the agency',
    detail:
      'When you find a qualified prospect, import it into DMHOUSE. This creates the agency record you will work from.',
    path: '/employee/agencies',
    action: 'Open Agencies',
    icon: Building2,
  },
  {
    eyebrow: 'Step 4',
    title: 'Work from the agency record',
    detail:
      'Open the agency to review its business information, contacts, phone numbers, email addresses, notes and sales history.',
    path: '/employee/agencies',
    action: 'View Agencies',
    icon: MapPinned,
  },
  {
    eyebrow: 'Step 5',
    title: 'Call or email the agency',
    detail:
      'Make your outreach from DMHOUSE whenever possible. Calls, emails and outcomes should stay connected to the agency record.',
    path: '/employee/outreach',
    action: 'Open Outreach',
    icon: Phone,
  },
  {
    eyebrow: 'Step 6',
    title: 'Record the outcome and next action',
    detail:
      'After every contact, record what happened. Add notes and a follow-up so you always know exactly what should happen next.',
    path: '/employee/agencies',
    action: 'Manage Follow-Up',
    icon: Mail,
  },
  {
    eyebrow: 'Step 7',
    title: 'Move serious interest into a transaction',
    detail:
      'When a buyer is ready to move forward, use the transaction workflow. DMHOUSE will show the required next action as the deal advances.',
    path: '/employee/transactions',
    action: 'Open Transactions',
    icon: FileSignature,
  },
  {
    eyebrow: 'Step 8',
    title: 'Send the NDA',
    detail:
      'The NDA begins the secure buyer process. The buyer signs through the Buyer Portal before protected portfolio information is released.',
    path: '/employee/transactions',
    action: 'View NDA Workflow',
    icon: FileSignature,
  },
  {
    eyebrow: 'Step 9',
    title: 'Advance the Purchase Agreement',
    detail:
      'After the NDA is complete and the buyer moves forward, continue from the same transaction and advance the Purchase Agreement.',
    path: '/employee/transactions',
    action: 'Continue Transaction',
    icon: FileSignature,
  },
  {
    eyebrow: 'Step 10',
    title: 'Follow the transaction through closing',
    detail:
      'Keep working from Transactions through agreement, payment and final release. DMHOUSE keeps the deal path together so you do not have to hunt for the next step.',
    path: '/employee/transactions',
    action: 'Open Transaction Desk',
    icon: CheckCircle2,
  },
];

function storageKey(userId?: string) {
  return `${EMPLOYEE_TOUR_STORAGE_PREFIX}:${userId || 'employee'}`;
}

export function resetEmployeeTour(userId?: string) {
  try {
    localStorage.removeItem(storageKey(userId));
  } catch {
    // Storage unavailable.
  }
}

export function launchEmployeeTourPreview(step = 0) {
  window.dispatchEvent(
    new CustomEvent(EMPLOYEE_TOUR_PREVIEW_EVENT, {
      detail: { step },
    }),
  );
}

export default function EmployeeFirstRunTour({
  userId,
  enabled,
  preview = false,
}: {
  userId?: string;
  enabled: boolean;
  preview?: boolean;
}) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (!enabled) return;

    if (preview) {
      setStep(0);
      setOpen(true);
      return;
    }

    try {
      const raw = localStorage.getItem(storageKey(userId));

      if (!raw) {
        setStep(0);
        setOpen(true);
        return;
      }

      const saved = JSON.parse(raw) as {
        completed?: boolean;
        step?: number;
      };

      if (!saved.completed) {
        setStep(
          Math.min(
            Math.max(Number(saved.step) || 0, 0),
            steps.length - 1,
          ),
        );
        setOpen(true);
      }
    } catch {
      setStep(0);
      setOpen(true);
    }
  }, [enabled, preview, userId]);

  useEffect(() => {
    const handler = (event: Event) => {
      const custom = event as CustomEvent<{ step?: number }>;
      const requested = Number(custom.detail?.step) || 0;

      setStep(
        Math.min(
          Math.max(requested, 0),
          steps.length - 1,
        ),
      );
      setOpen(true);
    };

    window.addEventListener(
      EMPLOYEE_TOUR_PREVIEW_EVENT,
      handler,
    );

    return () =>
      window.removeEventListener(
        EMPLOYEE_TOUR_PREVIEW_EVENT,
        handler,
      );
  }, []);

  if (!open) return null;

  const current = steps[step];
  const Icon = current.icon;
  const last = step === steps.length - 1;

  function persist(nextStep: number) {
    if (preview) return;

    try {
      localStorage.setItem(
        storageKey(userId),
        JSON.stringify({
          completed: false,
          step: nextStep,
        }),
      );
    } catch {
      // Storage unavailable.
    }
  }

  function goNext() {
    if (last) {
      if (!preview) {
        try {
          localStorage.setItem(
            storageKey(userId),
            JSON.stringify({
              completed: true,
              step: steps.length - 1,
              completedAt: new Date().toISOString(),
            }),
          );
        } catch {
          // Storage unavailable.
        }
      }

      setOpen(false);

      if (!preview) {
        navigate('/employee');
      }

      return;
    }

    const next = step + 1;
    persist(next);
    setStep(next);

    if (!preview) {
      navigate(steps[next].path);
    }
  }

  function goBack() {
    if (step === 0) return;

    const previous = step - 1;
    persist(previous);
    setStep(previous);

    if (!preview) {
      navigate(steps[previous].path);
    }
  }

  function exitTour() {
    persist(step);
    setOpen(false);
  }

  function openCurrent() {
    if (preview) {
      return;
    }

    navigate(current.path);
  }

  return (
    <div className="fixed inset-0 z-[100] bg-slate-950/70 backdrop-blur-[2px]">
      <div className="flex min-h-full items-end justify-center p-4 sm:items-center">
        <div className="w-full max-w-xl overflow-hidden rounded-[28px] border border-white/10 bg-white shadow-2xl">
          <div className="bg-[#08101f] px-6 py-5 text-white sm:px-8">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-[.18em] text-blue-400">
                  {preview ? 'Owner Preview · ' : ''}
                  Employee Quick Start
                </p>

                <p className="mt-2 text-sm text-slate-400">
                  {step + 1} of {steps.length}
                </p>
              </div>

              <button
                type="button"
                onClick={exitTour}
                className="rounded-xl border border-white/10 p-2 text-slate-400 transition hover:bg-white/10 hover:text-white"
                aria-label="Exit tour"
              >
                <X size={18} />
              </button>
            </div>

            <div className="mt-5 h-1.5 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-blue-500 transition-all"
                style={{
                  width: `${((step + 1) / steps.length) * 100}%`,
                }}
              />
            </div>
          </div>

          <div className="p-6 sm:p-8">
            <div className="grid h-12 w-12 place-items-center rounded-2xl bg-blue-50 text-blue-600">
              <Icon size={23} />
            </div>

            <p className="mt-6 text-xs font-bold uppercase tracking-[.16em] text-blue-600">
              {current.eyebrow}
            </p>

            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
              {current.title}
            </h2>

            <p className="mt-3 text-sm leading-7 text-slate-600">
              {current.detail}
            </p>

            <button
              type="button"
              onClick={openCurrent}
              disabled={preview}
              className="mt-6 w-full rounded-2xl border border-blue-200 bg-blue-50 px-5 py-4 text-left transition hover:border-blue-300 hover:bg-blue-100 disabled:cursor-default disabled:hover:border-blue-200 disabled:hover:bg-blue-50"
            >
              <span className="text-xs font-bold uppercase tracking-wider text-blue-600">
                Where to go
              </span>
              <span className="mt-1 flex items-center justify-between text-sm font-semibold text-blue-950">
                {current.action}
                <ArrowRight size={17} />
              </span>
            </button>

            {last && (
              <div className="mt-5 rounded-2xl bg-emerald-50 p-5">
                <p className="font-semibold text-emerald-950">
                  Your everyday sales path
                </p>
                <p className="mt-2 text-sm leading-6 text-emerald-800">
                  Portfolio → Find Agency → Import → Contact →
                  Follow Up → Transaction → NDA → Purchase
                  Agreement → Close
                </p>
              </div>
            )}

            <div className="mt-7 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={goBack}
                disabled={step === 0}
                className="inline-flex items-center rounded-xl px-4 py-3 text-sm font-semibold text-slate-500 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-30"
              >
                <ArrowLeft className="mr-2" size={17} />
                Back
              </button>

              <button
                type="button"
                onClick={goNext}
                className="inline-flex items-center rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-blue-700"
              >
                {last ? 'Finish Tour' : 'Next'}
                {!last && (
                  <ArrowRight className="ml-2" size={17} />
                )}
              </button>
            </div>

            {!preview && !last && (
              <p className="mt-4 text-center text-xs text-slate-400">
                You can exit now and continue from this step later.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export const employeeTourSteps = steps;
