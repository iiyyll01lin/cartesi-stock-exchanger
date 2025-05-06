import React, { createContext, useContext, useMemo } from 'react';
import { useNotifications } from '../hooks/useNotifications';
import { Notification } from '../types';

interface NotificationContextType {
  notifications: Notification[];
  addNotification: (type: 'success' | 'error' | 'warning' | 'info', message: string, autoClose?: boolean) => string;
  removeNotification: (id: string) => void;
}

const NotificationContext = createContext<NotificationContextType>({
  notifications: [],
  addNotification: () => '',
  removeNotification: () => {}
});

export const useNotificationContext = () => useContext(NotificationContext);

export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { notifications, addNotification, removeNotification } = useNotifications();
  
  const value = useMemo(() => ({
    notifications,
    addNotification,
    removeNotification
  }), [notifications, addNotification, removeNotification]);
  
  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
};
