// Coach tips for the Home dashboard. Pure functions: no database, no DOM.
//
// Every tip is { id, label, title, body }. Advice is general and gentle; it is
// not medical advice, and nothing here blames the user.

import { parseLocalDate } from '../utils/dates.js';

export const UNEVEN_SPREAD = 3; // reps between the best and worst set that count as "uneven"
export const STALE_DAYS = 7; // days without training a muscle group before we suggest it

export const QUOTES = [
  'Small steps, done often, beat big plans left for tomorrow.',
  'You don’t have to be perfect. You just have to show up.',
  'Strong is built one rep at a time.',
  'Progress is progress, even when it’s slow.',
  'The hardest rep is the first one. You’ve already done that before.',
  'Consistency turns effort into results.',
  'Rest is part of training. Recover well, come back stronger.',
  'Compare yourself to who you were last week, not to anyone else.',
  'A short workout beats no workout.',
  'Tired today, proud tomorrow.',
  'Your future self is watching. Give them something to thank you for.',
  'Form first, weight second, ego last.',
  'Motivation gets you started. Habit keeps you going.',
  'Every workout you finish is a vote for the person you’re becoming.',
  'Don’t wait to feel ready. Start, and the feeling follows.',
  'Missed a day? The next workout is a fresh start.',
  'Lift with patience. Strength arrives on its own schedule.',
  'Celebrate the small wins. They add up quicker than you think.',
  'Sleep, food, water, training. Simple, and it works.',
  'You’re not behind. You’re exactly where your effort has brought you.',
];

/** The same quote all day, a different one tomorrow. `date` is a Date. */
export function quoteForDate(date = new Date()) {
  const dayNumber = Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86400000);
  return QUOTES[((dayNumber % QUOTES.length) + QUOTES.length) % QUOTES.length];
}

// ---- Weight / BMI ---------------------------------------------------------------------

const WEIGHT_TIPS = {
  none: {
    title: 'Get weight guidance',
    body: 'Add your height and bodyweight in Profile and this card will give you tips that fit you.',
  },
  below: {
    title: 'Your BMI is on the low side',
    body: 'To build weight in a healthy way, eat slightly more than you burn, include protein at every meal, and lean on compound lifts like squats, presses and rows. Sleep well, and add weight gradually. If you’re unsure or feel unwell, a doctor or dietitian can help.',
  },
  within: {
    title: 'Your BMI is in the standard range',
    body: 'Nice. Keep your routine steady and judge progress by your strength and how you feel, not by one number.',
  },
  above: {
    title: 'Your BMI is on the higher side',
    body: 'Muscle weighs a lot, so this number can read high for people who train. If fat loss is your goal, try a small, sustainable calorie deficit, plenty of protein and vegetables, daily walking, and keep lifting to protect your muscle.',
  },
};

/** `category` is 'below' | 'within' | 'above' from profile-rules, or null when there is no BMI yet. */
export function weightTip(category) {
  const tip = WEIGHT_TIPS[category] ?? WEIGHT_TIPS.none;
  return { id: 'weight', label: 'Weight', ...tip };
}

// ---- Reps ---------------------------------------------------------------------------

/**
 * Feedback on the sets of the latest finished workout.
 * `exercises`: [{ name, sets: [{ kind, completed, reps }] }]. Returns a tip.
 */
export function repsTip(exercises) {
  if (!exercises || exercises.length === 0) {
    return { id: 'reps', label: 'Your sets', title: 'Log your first workout', body: 'Finish a workout and I’ll look at your reps and tell you how to improve.' };
  }
  for (const ex of exercises) {
    const reps = ex.sets.filter((s) => s.kind === 'working' && s.completed && Number.isInteger(s.reps)).map((s) => s.reps);
    if (reps.length < 2) continue;
    const spread = Math.max(...reps) - Math.min(...reps);
    if (spread >= UNEVEN_SPREAD) {
      return {
        id: 'reps',
        label: 'Your sets',
        title: `${ex.name}: your reps were uneven`,
        body: `You did ${reps.join(', ')} reps. Uneven sets usually mean the weight is a bit heavy or the rest was short. Try resting a little longer, or lower the weight until every set lands within 1–2 reps of each other. Then add weight.`,
      };
    }
  }
  return { id: 'reps', label: 'Your sets', title: 'Your sets were even', body: 'Your reps stayed steady across sets last workout. That’s a good sign. When you hit the top of your rep range on every set, it’s time to add weight.' };
}

// ---- Suggested workout ------------------------------------------------------------------

/**
 * `muscles`: [{ muscle, lastDate: 'YYYY-MM-DD' | null, exercises: [name, ...] }] (lastDate null = never trained).
 * `workouts` is how many workouts are finished, `isRestDay` whether today is a rest day.
 */
export function workoutTip({ muscles, workouts, isRestDay, todayKey }) {
  const days = (m) => (m.lastDate ? Math.round((parseLocalDate(todayKey) - parseLocalDate(m.lastDate)) / 86400000) : Infinity);
  const candidates = muscles.filter((m) => m.exercises.length > 0 && days(m) >= STALE_DAYS).sort((a, b) => days(b) - days(a));

  if (workouts === 0) {
    return { id: 'workout', label: 'Try this', title: 'Start simple', body: 'For your first workout, pick 3 exercises (something for legs, a press and a row) and do 3 sets of 8–12 reps each. Keep the weight light and focus on form.' };
  }
  if (candidates.length > 0) {
    const m = candidates[0];
    const picks = m.exercises.slice(0, 2).join(' or ');
    const ago = m.lastDate ? `in ${days(m)} days` : 'yet';
    return { id: 'workout', label: 'Try this', title: `Train ${m.muscle.toLowerCase()} next`, body: `You haven’t trained ${m.muscle.toLowerCase()} ${ago}. Try ${picks}${isRestDay ? ' on your next training day' : ' as an extra exercise'}.` };
  }
  if (isRestDay) {
    return { id: 'workout', label: 'Try this', title: 'Active recovery', body: 'It’s a rest day. A 15–20 minute walk or some light stretching helps your muscles recover without adding strain.' };
  }
  return { id: 'workout', label: 'Try this', title: 'Balanced week', body: 'You’ve trained your main muscle groups recently. Stay consistent, and keep your form clean as the weights go up.' };
}

/** All four dashboard tips in display order. */
export function buildCoachTips({ date, bmiCategory, lastWorkoutExercises, muscles, workouts, isRestDay, todayKey }) {
  return [
    { id: 'quote', label: 'Today’s thought', title: null, body: quoteForDate(date) },
    weightTip(bmiCategory),
    repsTip(lastWorkoutExercises),
    workoutTip({ muscles, workouts, isRestDay, todayKey }),
  ];
}