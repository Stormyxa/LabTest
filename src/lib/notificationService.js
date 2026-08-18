// Web Notifications Service for LabTest Active Quizzes Reminder
// Primary delivery path: Service Worker (runs in separate thread, not throttled on mobile).
// Fallback: page-level setTimeout + localStorage timestamp checked on return.

let pageLevelTimers = {}; // fallback timers when SW unavailable

// ─── Helpers ──────────────────────────────────────────────────────────────────

export const isNotificationSupported = () =>
  typeof window !== 'undefined' && 'Notification' in window;

export const requestNotificationPermission = async () => {
  if (!isNotificationSupported()) return 'unsupported';
  try {
    if (Notification.permission === 'granted') return 'granted';
    if (Notification.permission !== 'denied') {
      return await Notification.requestPermission();
    }
    return Notification.permission;
  } catch (e) {
    console.warn('[Notif] requestPermission error:', e);
    return 'denied';
  }
};

export const getNotificationPermission = () => {
  if (!isNotificationSupported()) return 'unsupported';
  return Notification.permission;
};

/**
 * Retrieve the active (controlling) Service Worker registration.
 * Uses `navigator.serviceWorker.ready` which resolves when an active SW exists.
 * Times out after 2 s to avoid blocking the caller.
 */
const getActiveSW = async () => {
  if (!('serviceWorker' in navigator)) return null;
  try {
    const reg = await Promise.race([
      navigator.serviceWorker.ready,
      new Promise((_, reject) => setTimeout(() => reject(new Error('SW ready timeout')), 2000))
    ]);
    return reg?.active ?? null;
  } catch {
    // SW not ready or timed-out
    return null;
  }
};

/**
 * Send a message to the active SW. Returns true on success.
 */
const postToSW = async (message) => {
  const sw = await getActiveSW();
  if (!sw) return false;
  try {
    sw.postMessage(message);
    return true;
  } catch (e) {
    console.warn('[Notif] postMessage to SW failed:', e);
    return false;
  }
};

// ─── Page-level fallback ───────────────────────────────────────────────────────

const _dispatchReminderNotif = (quizId, quizTitle) => {
  if (!isNotificationSupported() || Notification.permission !== 'granted') return;
  try {
    const notif = new Notification('⏰ LabTest: незавершённый тест!', {
      body: `Вы проходите тест «${quizTitle}». Нажмите, чтобы вернуться к выполнению!`,
      icon: '/favicon.ico',
      badge: '/favicon.ico',
      tag: `quiz_reminder_${quizId}`,
      renotify: true
    });
    notif.onclick = () => {
      window.focus();
      window.location.href = `/quiz/${quizId}`;
      notif.close();
    };
  } catch (e) {
    console.warn('[Notif] page-level notification failed:', e);
  }
};

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Schedule a reminder notification `delaySeconds` after the user leaves the quiz.
 * Only meaningful during the FIRST attempt (caller is responsible for the guard).
 *
 * Flow:
 *  1. Store absolute `fireAt` in localStorage (always — for checkPendingReminderOnReturn).
 *  2. Try to delegate to the SW (preferred — SW is not throttled on mobile).
 *  3. If SW unavailable, fall back to a page-level setTimeout.
 */
export const scheduleQuizReminder = async (quizId, quizTitle, delaySeconds = 60) => {
  if (!isNotificationSupported() || Notification.permission !== 'granted') return;

  // Cancel any existing reminder first
  await clearQuizReminder(quizId);

  const fireAt = Date.now() + delaySeconds * 1000;

  // Always persist so checkPendingReminderOnReturn works even if both timers got killed
  localStorage.setItem(
    `quiz_reminder_pending_${quizId}`,
    JSON.stringify({ fireAt, quizTitle })
  );

  // Primary: delegate to SW
  const sentToSW = await postToSW({ type: 'SCHEDULE_REMINDER', quizId, quizTitle, fireAt });
  if (sentToSW) {
    console.log(`[Notif] Reminder delegated to SW for quiz ${quizId} (${delaySeconds}s)`);
    return;
  }

  // Fallback: page-level timer
  console.log(`[Notif] SW unavailable — using page-level timer for quiz ${quizId}`);
  pageLevelTimers[quizId] = setTimeout(() => {
    if (document.hidden) {
      _dispatchReminderNotif(quizId, quizTitle);
      localStorage.removeItem(`quiz_reminder_pending_${quizId}`);
    }
  }, delaySeconds * 1000);
};

/**
 * Call when the tab becomes visible again.
 * If the fire deadline already passed while the app was in the background
 * (and neither the SW timer nor the page timer fired), dispatch immediately.
 */
export const checkPendingReminderOnReturn = (quizId) => {
  if (!isNotificationSupported() || Notification.permission !== 'granted') return;
  try {
    const raw = localStorage.getItem(`quiz_reminder_pending_${quizId}`);
    if (!raw) return;
    const { fireAt, quizTitle } = JSON.parse(raw);
    if (Date.now() >= fireAt) {
      console.log(`[Notif] Firing overdue reminder for quiz ${quizId} on return`);
      _dispatchReminderNotif(quizId, quizTitle);
      localStorage.removeItem(`quiz_reminder_pending_${quizId}`);
    }
  } catch (e) {
    console.warn('[Notif] checkPendingReminderOnReturn error:', e);
  }
};

/**
 * Cancel any scheduled reminder for a quiz (both SW and page-level).
 */
export const clearQuizReminder = async (quizId) => {
  // Cancel page-level timer
  if (pageLevelTimers[quizId]) {
    clearTimeout(pageLevelTimers[quizId]);
    delete pageLevelTimers[quizId];
  }
  // Cancel in-SW timer (fire-and-forget, don't block)
  postToSW({ type: 'CLEAR_REMINDER', quizId }).catch(() => {});
  // Remove localStorage marker
  localStorage.removeItem(`quiz_reminder_pending_${quizId}`);
};

/**
 * Send an immediate notification when the quiz timer expires while the user is away.
 */
export const sendQuizExpiredDeviceNotification = (quizId, quizTitle, score, total, percent) => {
  if (!isNotificationSupported() || Notification.permission !== 'granted') return;
  try {
    const notif = new Notification(`⏰ Время вышло: «${quizTitle}»`, {
      body: `Тест автоматически завершён. Ваш результат: ${score}/${total} (${percent}%). Нажмите, чтобы открыть результаты.`,
      icon: '/favicon.ico',
      badge: '/favicon.ico',
      tag: `quiz_expired_${quizId}`,
      renotify: true,
      requireInteraction: true
    });
    notif.onclick = () => {
      window.focus();
      window.location.href = `/quiz/${quizId}`;
      notif.close();
    };
  } catch (e) {
    console.warn('[Notif] sendQuizExpiredDeviceNotification failed:', e);
  }
};
