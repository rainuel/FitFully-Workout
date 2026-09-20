// Achievements: the list, and the rule for each. Pure data and functions.
//
// Every achievement is "a stat reached a target", so adding one later is one
// more line here. Nothing is ever taken away once unlocked.

export const ACHIEVEMENTS = [
  { code: 'first_workout', title: 'First Workout', description: 'Finish your first workout.', metric: 'workouts', target: 1 },
  { code: 'workouts_10', title: '10 Workouts', description: 'Finish 10 workouts.', metric: 'workouts', target: 10 },
  { code: 'workouts_25', title: '25 Workouts', description: 'Finish 25 workouts.', metric: 'workouts', target: 25 },
  { code: 'workouts_50', title: '50 Workouts', description: 'Finish 50 workouts.', metric: 'workouts', target: 50 },
  { code: 'workouts_100', title: '100 Workouts', description: 'Finish 100 workouts.', metric: 'workouts', target: 100 },
  {
    code: 'first_increase',
    title: 'First Weight Increase',
    description: 'Commit to a heavier working weight.',
    metric: 'weightIncreases',
    target: 1,
  },
  {
    code: 'progressed_10',
    title: '10 Exercises Progressed',
    description: 'Increase the weight on 10 different exercises.',
    metric: 'exercisesProgressed',
    target: 10,
  },
  {
    code: 'consistent_4_weeks',
    title: '4-Week Consistency',
    description: 'Complete every scheduled workout for 4 weeks in a row.',
    metric: 'perfectWeeks',
    target: 4,
  },
];

/** True when the stats reach this achievement's target. */
export function isReached(achievement, stats) {
  return Number(stats[achievement.metric] ?? 0) >= achievement.target;
}

/** Achievements that are reached but not yet unlocked. `unlockedCodes` is a Set. */
export function findUnlockable(stats, unlockedCodes) {
  return ACHIEVEMENTS.filter((a) => !unlockedCodes.has(a.code) && isReached(a, stats));
}

/** { current, target } for a progress hint such as "7 / 10". `current` never exceeds the target. */
export function progressToward(achievement, stats) {
  return { current: Math.min(Number(stats[achievement.metric] ?? 0), achievement.target), target: achievement.target };
}
