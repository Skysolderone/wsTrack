export interface VolumeSetLike {
  weight?: number | null;
  reps?: number | null;
  isWarmup?: boolean;
  isCompleted?: boolean;
}

export const calculateVolume = (sets: ReadonlyArray<VolumeSetLike>): number => {
  const volume = sets.reduce((total, currentSet) => {
    if (currentSet.isWarmup || currentSet.isCompleted === false) {
      return total;
    }

    const weight = currentSet.weight ?? 0;
    const reps = currentSet.reps ?? 0;

    return total + weight * reps;
  }, 0);

  return Number(volume.toFixed(2));
};
