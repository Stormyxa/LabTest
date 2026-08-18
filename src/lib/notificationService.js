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
 * Schedule a reminder notification if user leaves tab
 * @param {string} quizId 
 * @param {string} quizTitle 
 * @param {number} delaySeconds (default 30s)
 */
export const scheduleQuizReminder = (quizId, quizTitle, delaySeconds = 60) => {
  if (!isNotificationSupported() || Notification.permission !== 'granted') return;

  // Clear existing
  clearQuizReminder(quizId);

  scheduledTimeouts[quizId] = setTimeout(() => {
    // Only send notification if document is still hidden/backgrounded
    if (document.hidden) {
      try {
        const raw = localStorage.getItem(`quiz_timer_${quizId}`);
        let remainingStr = '';
        if (raw) {
          const parsed = JSON.parse(raw);
          const elapsed = Math.round((Date.now() - (parsed.ts || Date.now())) / 1000);
          const remaining = Math.max(0, (parsed.timeLeft || 0) - elapsed);
          if (remaining > 0) {
            const mins = Math.ceil(remaining / 60);
            remainingStr = `Осталось: ~${mins} мин.`;
          } else {
            return; // expired
          }
        }

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
    }
  }, delaySeconds * 1000);
};

/**
 * Clear reminder for a quiz
 */
export const clearQuizReminder = (quizId) => {
  if (scheduledTimeouts[quizId]) {
    clearTimeout(scheduledTimeouts[quizId]);
    delete scheduledTimeouts[quizId];
  }
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
