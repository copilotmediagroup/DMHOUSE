import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

export type AcademyMissionStatus =
  | 'locked'
  | 'available'
  | 'in_progress'
  | 'complete';

export type AcademyMissionProgress = {
  missionNumber: number;
  status: AcademyMissionStatus;
  score: number | null;
  completedAt: string | null;
  startedAt: string | null;
};

export type AcademyState = {
  version: 1;
  currentMission: number;
  certified: boolean;
  certificationDate: string | null;
  missions: AcademyMissionProgress[];
};

type AcademyStoreValue = {
  state: AcademyState;
  progressPercent: number;
  completedCount: number;

  getMission: (
    missionNumber: number,
  ) => AcademyMissionProgress;

  startMission: (
    missionNumber: number,
  ) => void;

  completeMission: (
    missionNumber: number,
    score?: number,
  ) => void;

  resetMission: (
    missionNumber: number,
  ) => void;

  resetAcademy: () => void;
};

const STORAGE_KEY = 'dmhouse_academy_progress_v1';

function initialState(): AcademyState {
  return {
    version: 1,
    currentMission: 1,
    certified: false,
    certificationDate: null,
    missions: [
      {
        missionNumber: 1,
        status: 'available',
        score: null,
        completedAt: null,
        startedAt: null,
      },
      {
        missionNumber: 2,
        status: 'locked',
        score: null,
        completedAt: null,
        startedAt: null,
      },
      {
        missionNumber: 3,
        status: 'locked',
        score: null,
        completedAt: null,
        startedAt: null,
      },
      {
        missionNumber: 4,
        status: 'locked',
        score: null,
        completedAt: null,
        startedAt: null,
      },
      {
        missionNumber: 5,
        status: 'locked',
        score: null,
        completedAt: null,
        startedAt: null,
      },
      {
        missionNumber: 6,
        status: 'locked',
        score: null,
        completedAt: null,
        startedAt: null,
      },
    ],
  };
}

function loadState(): AcademyState {
  if (typeof window === 'undefined') {
    return initialState();
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);

    if (!raw) {
      return initialState();
    }

    const parsed = JSON.parse(raw) as AcademyState;

    if (
      !parsed ||
      parsed.version !== 1 ||
      !Array.isArray(parsed.missions)
    ) {
      return initialState();
    }

    return parsed;
  } catch {
    return initialState();
  }
}

function persist(state: AcademyState) {
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(state),
    );
  } catch {
    // Academy should remain usable even if storage is unavailable.
  }
}

const AcademyContext =
  createContext<AcademyStoreValue | null>(null);

export function AcademyProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [state, setState] =
    useState<AcademyState>(() => loadState());

  function update(
    updater: (
      current: AcademyState,
    ) => AcademyState,
  ) {
    setState((current) => {
      const next = updater(current);
      persist(next);
      return next;
    });
  }

  function getMission(
    missionNumber: number,
  ): AcademyMissionProgress {
    return (
      state.missions.find(
        (mission) =>
          mission.missionNumber === missionNumber,
      ) || {
        missionNumber,
        status: 'locked',
        score: null,
        completedAt: null,
        startedAt: null,
      }
    );
  }

  function startMission(
    missionNumber: number,
  ) {
    update((current) => {
      const mission = current.missions.find(
        (item) =>
          item.missionNumber === missionNumber,
      );

      if (!mission) {
        return current;
      }

      if (
        mission.status === 'locked' ||
        mission.status === 'complete'
      ) {
        return current;
      }

      const now = new Date().toISOString();

      return {
        ...current,
        currentMission: missionNumber,
        missions: current.missions.map(
          (item) =>
            item.missionNumber === missionNumber
              ? {
                  ...item,
                  status: 'in_progress',
                  startedAt:
                    item.startedAt || now,
                }
              : item,
        ),
      };
    });
  }

  function completeMission(
    missionNumber: number,
    score = 100,
  ) {
    update((current) => {
      const now = new Date().toISOString();
      const nextMissionNumber =
        missionNumber + 1;

      const updatedMissions =
        current.missions.map((mission) => {
          if (
            mission.missionNumber ===
            missionNumber
          ) {
            return {
              ...mission,
              status:
                'complete' as AcademyMissionStatus,
              score,
              completedAt: now,
              startedAt:
                mission.startedAt || now,
            };
          }

          if (
            mission.missionNumber ===
              nextMissionNumber &&
            mission.status === 'locked'
          ) {
            return {
              ...mission,
              status:
                'available' as AcademyMissionStatus,
            };
          }

          return mission;
        });

      const allComplete =
        updatedMissions.every(
          (mission) =>
            mission.status === 'complete',
        );

      return {
        ...current,
        currentMission:
          missionNumber < 6
            ? nextMissionNumber
            : 6,
        certified: allComplete,
        certificationDate:
          allComplete
            ? now
            : current.certificationDate,
        missions: updatedMissions,
      };
    });
  }

  function resetMission(
    missionNumber: number,
  ) {
    update((current) => ({
      ...current,
      currentMission: missionNumber,
      certified: false,
      certificationDate: null,
      missions: current.missions.map(
        (mission) =>
          mission.missionNumber === missionNumber
            ? {
                ...mission,
                status:
                  missionNumber === 1
                    ? 'available'
                    : mission.status ===
                        'complete'
                      ? 'available'
                      : mission.status,
                score: null,
                completedAt: null,
                startedAt: null,
              }
            : mission,
      ),
    }));
  }

  function resetAcademy() {
    const clean = initialState();
    persist(clean);
    setState(clean);
  }

  const completedCount =
    state.missions.filter(
      (mission) =>
        mission.status === 'complete',
    ).length;

  const progressPercent = Math.round(
    (completedCount / 6) * 100,
  );

  const value = useMemo<AcademyStoreValue>(
    () => ({
      state,
      completedCount,
      progressPercent,
      getMission,
      startMission,
      completeMission,
      resetMission,
      resetAcademy,
    }),
    [state, completedCount, progressPercent],
  );

  return (
    <AcademyContext.Provider value={value}>
      {children}
    </AcademyContext.Provider>
  );
}

export function useAcademy() {
  const context =
    useContext(AcademyContext);

  if (!context) {
    throw new Error(
      'useAcademy must be used inside AcademyProvider.',
    );
  }

  return context;
}
