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
    if (Notification.permission === 'granted') {
      return 'granted';
    }
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
 * Immediately dispatch a reminder notification (call when returning to page if deadline passed while away)
 */
const _dispatchReminderNotif = (quizId, quizTitle) => {
  try {
    const raw = localStorage.getItem(`quiz_timer_${quizId}`);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    const elapsed = Math.round((Date.now() - (parsed.ts || Date.now())) / 1000);
    const remaining = Math.max(0, (parsed.timeLeft || 0) - elapsed);
    if (remaining <= 0) return; // already expired — expiry notif handles this

    const mins = Math.ceil(remaining / 60);
    const remainingStr = remaining < 60
      ? `Осталось: ~${remaining} сек.`
      : `Осталось: ~${mins} мин.`;

    const notif = new Notification('⏰ LabTest: незавершенный тест!', {
      body: `Вы проходите тест «${quizTitle}». ${remainingStr} Нажмите, чтобы вернуться к выполнению!`,
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
    console.warn('Failed to dispatch notification:', e);
  }
};

/**
 * Schedule a reminder notification if user leaves tab.
 * Stores the planned fire-time in localStorage so that even if the browser
 * throttles/kills the setTimeout, the notification fires immediately when the
 * user returns and `checkPendingReminderOnReturn` is called.
 *
 * @param {string} quizId
 * @param {string} quizTitle
 * @param {number} delaySeconds (default 60s)
 */
export const scheduleQuizReminder = (quizId, quizTitle, delaySeconds = 60) => {
  if (!isNotificationSupported() || Notification.permission !== 'granted') return;

  // Clear any existing reminder first
  clearQuizReminder(quizId);

  // Store the target fire-time in localStorage so it survives browser throttling
  const fireAt = Date.now() + delaySeconds * 1000;
  localStorage.setItem(`quiz_reminder_pending_${quizId}`, JSON.stringify({ fireAt, quizTitle }));

  // Best-effort setTimeout — may fire late on mobile but that's ok,
  // because checkPendingReminderOnReturn() corrects it on visibility restore.
  scheduledTimeouts[quizId] = setTimeout(() => {
    if (document.hidden) {
      _dispatchReminderNotif(quizId, quizTitle);
      localStorage.removeItem(`quiz_reminder_pending_${quizId}`);
    }
  }, delaySeconds * 1000);
};

/**
 * Call this when the tab/app becomes visible again.
 * Fires a pending reminder immediately if the scheduled time has passed while the app was in background.
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
 * Clear reminder for a quiz
 */
export const clearQuizReminder = (quizId) => {
  if (scheduledTimeouts[quizId]) {
    clearTimeout(scheduledTimeouts[quizId]);
    delete scheduledTimeouts[quizId];
  }
  localStorage.removeItem(`quiz_reminder_pending_${quizId}`);
};

/**
 * Send immediate OS/device notification when timer expires while away
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
