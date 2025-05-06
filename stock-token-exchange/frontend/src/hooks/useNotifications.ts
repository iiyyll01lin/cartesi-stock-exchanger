// Notification hook
import { useState, useCallback } from 'react';
import { Notification } from '../types';
import { v4 as uuidv4 } from 'uuid';

export function useNotifications() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  
  // Remove notification
  const removeNotification = useCallback((id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  }, []);
  
  // Add notification
  const addNotification = useCallback((
    type: 'success' | 'error' | 'warning' | 'info', 
    message: string, 
    autoClose: boolean = true
  ) => {
    const id = uuidv4();
    const notification: Notification = {
      id,
      type,
      message,
      timestamp: Date.now(),
      autoClose
    };
    
    setNotifications(prev => [...prev, notification]);
    
    // Auto-remove notification after 5 seconds if autoClose is true
    if (autoClose) {
      setTimeout(() => {
        removeNotification(id);
      }, 5000);
    }
    
    return id;
  }, [removeNotification]);
  
  return {
    notifications,
    addNotification,
    removeNotification
  };
}
