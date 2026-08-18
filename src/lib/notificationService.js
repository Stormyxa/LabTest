// Web Notifications Service for LabTest Active Quizzes Reminder

let scheduledTimeouts = {};

/**
 * Check if notifications are supported
 */
export const isNotificationSupported = () => {
  return typeof window !== 'undefined' && 'Notification' in window;
};

/**
 * Request notification permission from user
 */
export const requestNotificationPermission = async () => {
  if (!isNotificationSupported()) return 'unsupported';
  try {
    if (Notification.permission === 'granted') return 'granted';
    if (Notification.permission !== 'denied') {
      const permission = await Notification.requestPermission();
      return permission;
    }
    return Notification.permission;
  } catch (e) {
    console.warn('Error requesting notification permission:', e);
    return 'denied';
  }
};

/**
 * Get current notification permission
 */
export const getNotificationPermission = () => {
  if (!isNotificationSupported()) return 'unsupported';
  return Notification.permission;
};

/**
 * Get the active Service Worker registration (if available).
 */
const getSWRegistration = async () => {
  if (!('serviceWorker' in navigator)) return null;
  try {
    const reg = await navigator.serviceWorker.ready;
    return reg;
  } catch {
    return null;
  }
};

/**
 * Schedule a reminder notification 60 seconds after the user leaves the quiz.
 * Primary: delegates to the Service Worker (not throttled by browser on mobile).
 * Fallback: page-level setTimeout (for browsers without SW support).
 *
 * Only fires during first attempt (enforced by caller).
 *
 * @param {string} quizId
 * @param {string} quizTitle
 * @param {number} delaySeconds (default 60s)
 */
export const scheduleQuizReminder = async (quizId, quizTitle, delaySeconds = 60) => {
  if (!isNotificationSupported() || Notification.permission !== 'granted') return;

  // Clear any existing reminder first
  clearQuizReminder(quizId);

  const fireAt = Date.now() + delaySeconds * 1000;

  // Store fireAt in localStorage so checkPendingReminderOnReturn can fire
  // immediately when user returns if the browser killed/throttled both timers.
  localStorage.setItem(
    `quiz_reminder_pending_${quizId}`,
    JSON.stringify({ fireAt, quizTitle })
  );

  // Primary path: tell the Service Worker to schedule the notification.
  // SW timers run in a separate thread and are NOT throttled on mobile.
  const reg = await getSWRegistration();
  if (reg && reg.active) {
    reg.active.postMessage({
      type: 'SCHEDULE_REMINDER',
      quizId,
      quizTitle,
      fireAt
    });
    return; // SW will handle it — no need for page-level timer
  }

  // Fallback: page-level setTimeout (may be throttled on mobile background)
  scheduledTimeouts[quizId] = setTimeout(() => {
    if (document.hidden) {
      _dispatchReminderNotif(quizId, quizTitle);
      localStorage.removeItem(`quiz_reminder_pending_${quizId}`);
    }
  }, delaySeconds * 1000);
};

/**
 * Internal: show a reminder notification directly from the page context.
 */
const _dispatchReminderNotif = (quizId, quizTitle) => {
  try {
    const notif = new Notification('⏰ LabTest: незавершенный тест!', {
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
    console.warn('Failed to dispatch reminder notification:', e);
  }
};

/**
 * Call when the tab becomes visible again.
 * If the scheduled fire-time has already passed while the app was in the background,
 * dispatch the notification immediately (handles both SW-killed and throttled cases).
 *
 * @param {string} quizId
 */
export const checkPendingReminderOnReturn = (quizId) => {
  if (!isNotificationSupported() || Notification.permission !== 'granted') return;
  try {
    const raw = localStorage.getItem(`quiz_reminder_pending_${quizId}`);
    if (!raw) return;
    const { fireAt, quizTitle } = JSON.parse(raw);
    if (Date.now() >= fireAt) {
      // Timer would have fired while we were away — dispatch now
      _dispatchReminderNotif(quizId, quizTitle);
      localStorage.removeItem(`quiz_reminder_pending_${quizId}`);
      clearQuizReminder(quizId);
    }
  } catch (e) {
    console.warn('checkPendingReminderOnReturn error:', e);
  }
};

/**
 * Cancel a scheduled reminder for a quiz.
 */
export const clearQuizReminder = async (quizId) => {
  // Cancel page-level timer if any
  if (scheduledTimeouts[quizId]) {
    clearTimeout(scheduledTimeouts[quizId]);
    delete scheduledTimeouts[quizId];
  }
  // Cancel in-SW timer
  const reg = await getSWRegistration().catch(() => null);
  if (reg && reg.active) {
    reg.active.postMessage({ type: 'CLEAR_REMINDER', quizId });
  }
  // Clear persisted reminder
  localStorage.removeItem(`quiz_reminder_pending_${quizId}`);
};

/**
 * Send immediate OS/device notification when timer expires while away.
 */
export const sendQuizExpiredDeviceNotification = (quizId, quizTitle, score, total, percent) => {
  if (!isNotificationSupported() || Notification.permission !== 'granted') return;
  try {
    const notif = new Notification(`⏰ Время вышло: «${quizTitle}»`, {
      body: `Тест автоматически завершен. Ваш результат: ${score}/${total} (${percent}%). Нажмите, чтобы открыть результаты и разбор ошибок.`,
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
    console.warn('Failed to send expired device notification:', e);
  }
};
