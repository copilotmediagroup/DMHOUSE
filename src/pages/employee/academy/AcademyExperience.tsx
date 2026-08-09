import {
  useEffect,
  useState,
} from 'react';
import { LogOut } from 'lucide-react';

import {
  AcademyProvider,
  useAcademy,
} from '../../../store/AcademyStore';
import { supabase } from '../../../lib/supabase';

import AcademyHome from './AcademyHome';
import MissionOne from './MissionOne';
import MissionTwo from './MissionTwo';
import MissionThree from './MissionThree';
import MissionFour from './MissionFour';
import MissionFive from './MissionFive';
import MissionSix from './MissionSix';

import {
  useAcademyIntelligence,
} from './useAcademyIntelligence';
import { useLearningSession } from './useLearningSession';

type Screen =
  | 'home'
  | 'mission1'
  | 'mission2'
  | 'mission3'
  | 'mission4'
  | 'mission5'
  | 'mission6';

function missionFromScreen(
  screen: Screen,
) {
  if (screen === 'mission1') return 1;
  if (screen === 'mission2') return 2;
  if (screen === 'mission3') return 3;
  if (screen === 'mission4') return 4;
  if (screen === 'mission5') return 5;

  return null;
}

function AcademyExperienceInner() {
  const [screen, setScreen] =
    useState<Screen>('home');

  const [signingOut, setSigningOut] =
    useState(false);

  const {
    getMission,
    startMission,
    completeMission,
  } = useAcademy();

  const intelligence =
    useAcademyIntelligence();

  const learningMission =
    missionFromScreen(screen);

  useLearningSession(
    learningMission,
  );

  async function logoutAcademy() {
    if (signingOut) return;

    setSigningOut(true);

    const { error } =
      await supabase.auth.signOut();

    if (error) {
      console.error(
        'Academy sign out failed:',
        error,
      );

      setSigningOut(false);
      return;
    }

    window.location.replace('/');
  }

  async function openMission(
    missionNumber: number,
  ) {
    const mission =
      getMission(missionNumber);

    if (
      mission.status === 'locked'
    ) {
      return;
    }

    /*
      Learning deadline applies to
      Missions 1-5.

      Mission 6 has its own server
      authorization inside its RPC.
    */
    if (
      missionNumber <= 5 &&
      intelligence.state
        ?.learningPace === 'expired'
    ) {
      return;
    }

    startMission(missionNumber);

    if (missionNumber <= 5) {
      try {
        await intelligence.record(
          missionNumber,
          'open',
        );
      } catch (error) {
        console.error(
          'Academy mission open audit failed:',
          error,
        );
      }
    }

    if (missionNumber === 1) {
      setScreen('mission1');
    }

    if (missionNumber === 2) {
      setScreen('mission2');
    }

    if (missionNumber === 3) {
      setScreen('mission3');
    }

    if (missionNumber === 4) {
      setScreen('mission4');
    }

    if (missionNumber === 5) {
      setScreen('mission5');
    }

    if (missionNumber === 6) {
      setScreen('mission6');
    }
  }

  /*
    Detailed active/idle/hidden timing is now
    owned by useLearningSession().
  */



  async function finishLearningMission(
    missionNumber: number,
    score: number,
  ) {
    /*
      The score reported here is the
      candidate's successful Mission Check.

      Individual failed practice attempts
      remain inside each lesson today.
      We will expand those later without
      disturbing these working missions.
    */
    try {
      /*
        Practice attempts are now recorded
        at the moment each Mission Check is
        submitted.

        Completion remains a separate
        Academy milestone.
      */
      await intelligence.record(
        missionNumber,
        'complete',
        score,
      );
    } catch (error) {
      console.error(
        'Academy completion audit failed:',
        error,
      );
    }

    completeMission(
      missionNumber,
      score,
    );

    await intelligence.refresh();
  }

  function renderAcademyScreen() {
  if (screen === 'mission1') {
    return (
      <MissionOne
        onBack={() =>
          setScreen('home')
        }
        onComplete={(score) =>
          void finishLearningMission(
            1,
            score,
          )
        }
      />
    );
  }

  if (screen === 'mission2') {
    return (
      <MissionTwo
        onBack={() =>
          setScreen('home')
        }
        onComplete={(score) =>
          void finishLearningMission(
            2,
            score,
          )
        }
      />
    );
  }

  if (screen === 'mission3') {
    return (
      <MissionThree
        onBack={() =>
          setScreen('home')
        }
        onComplete={(score) =>
          void finishLearningMission(
            3,
            score,
          )
        }
      />
    );
  }

  if (screen === 'mission4') {
    return (
      <MissionFour
        onBack={() =>
          setScreen('home')
        }
        onComplete={(score) =>
          void finishLearningMission(
            4,
            score,
          )
        }
      />
    );
  }

  if (screen === 'mission5') {
    return (
      <MissionFive
        onBack={() =>
          setScreen('home')
        }
        onComplete={(score) =>
          void finishLearningMission(
            5,
            score,
          )
        }
      />
    );
  }

  if (screen === 'mission6') {
    return (
      <MissionSix
        onBack={() =>
          setScreen('home')
        }
      />
    );
  }

  return (
    <AcademyHome
      onOpenMission={openMission}
      intelligence={
        intelligence.state
      }
      refreshIntelligence={
        intelligence.refresh
      }
    />
  );
  }

  return (
    <div className="relative min-h-screen">
      <div className="fixed right-5 top-5 z-[100] md:right-7 md:top-7">
        <button
          type="button"
          onClick={() =>
            void logoutAcademy()
          }
          disabled={signingOut}
          className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white/95 px-4 text-sm font-semibold text-slate-700 shadow-lg shadow-slate-900/10 backdrop-blur transition hover:bg-slate-50 hover:text-slate-950 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <LogOut size={17} />

          {signingOut
            ? 'Signing out…'
            : 'Log out'}
        </button>
      </div>

      {renderAcademyScreen()}
    </div>
  );
}

export default function AcademyExperience() {
  return (
    <AcademyProvider>
      <AcademyExperienceInner />
    </AcademyProvider>
  );
}
