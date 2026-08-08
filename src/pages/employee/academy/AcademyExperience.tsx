import { useState } from 'react';
import {
  AcademyProvider,
  useAcademy,
} from '../../../store/AcademyStore';
import AcademyHome from './AcademyHome';
import MissionOne from './MissionOne';
import MissionTwo from './MissionTwo';
import MissionThree from './MissionThree';
import MissionFour from './MissionFour';
import MissionFive from './MissionFive';

type Screen =
  | 'home'
  | 'mission1'
  | 'mission2'
  | 'mission3'
  | 'mission4'
  | 'mission5';

function AcademyExperienceInner() {
  const [screen, setScreen] =
    useState<Screen>('home');

  const {
    getMission,
    startMission,
    completeMission,
  } = useAcademy();

  function openMission(
    missionNumber: number,
  ) {
    const mission =
      getMission(missionNumber);

    if (
      mission.status === 'locked'
    ) {
      return;
    }

    startMission(missionNumber);

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
  }

  if (screen === 'mission1') {
    return (
      <MissionOne
        onBack={() =>
          setScreen('home')
        }
        onComplete={(score) =>
          completeMission(
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
          completeMission(
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
          completeMission(
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
          completeMission(
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
          completeMission(
            5,
            score,
          )
        }
      />
    );
  }

  return (
    <AcademyHome
      onOpenMission={
        openMission
      }
    />
  );
}

export default function AcademyExperience() {
  return (
    <AcademyProvider>
      <AcademyExperienceInner />
    </AcademyProvider>
  );
}
