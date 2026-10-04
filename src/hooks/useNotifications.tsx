import { useState, useCallback } from 'react';

export interface Notification {
  id: string | number;
  variant: 'success' | 'error';
  title?: string;
  message: string;
  duration?: number;
}

export const useNotifications = () => {
  const [notifications, setNotifications] = useState<Notification[]>([]);

  const removeNotification = useCallback((id: string | number) => {
    setNotifications(prev => prev.filter(notification => notification.id !== id));
  }, []);

  const addNotification = useCallback((notification: Omit<Notification, 'id'> & { id?: string | number }) => {
    const id = notification.id || Date.now() + Math.random();
    const newNotification: Notification = {
      ...notification,
      id,
      duration: notification.duration ?? (notification.variant === "error" ? 0 : 3000),
    };

    setNotifications(prev => [...prev, newNotification]);

    // Auto remove after duration
    if (newNotification.duration && newNotification.duration > 0) {
      setTimeout(() => {
        removeNotification(id);
      }, newNotification.duration);
    }

    return id;
  }, [removeNotification]);

  const clearAllNotifications = useCallback(() => {
    setNotifications([]);
  }, []);

  return {
    notifications,
    addNotification,
    removeNotification,
    clearAllNotifications,
  };
};
