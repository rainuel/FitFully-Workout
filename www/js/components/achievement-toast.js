import { safeEvaluateAchievements } from '../services/achievement-service.js';
import { showToast } from './toast.js';

/** Says which achievements were just unlocked ([{ code, title }]). Returns true if there were any. */
export function showUnlocked(unlocked) {
  if (!unlocked || unlocked.length === 0) return false;
  const label = unlocked.length === 1 ? 'Achievement unlocked' : 'Achievements unlocked';
  showToast(`${label}: ${unlocked.map((a) => a.title).join(', ')}`, { ms: 4500 });
  return true;
}

/**
 * Checks for newly unlocked achievements and, if there are any, says so.
 * Otherwise shows `fallbackMessage` (if given). Returns true if something unlocked.
 */
export async function announceAchievements(db, fallbackMessage = null) {
  const unlocked = await safeEvaluateAchievements(db);
  if (showUnlocked(unlocked)) return true;
  if (fallbackMessage) showToast(fallbackMessage);
  return false;
}
