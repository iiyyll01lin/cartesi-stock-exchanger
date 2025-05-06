import React from 'react';
import { Notification as NotificationType } from '../../types';

interface NotificationsProps {
  notifications: NotificationType[];
  removeNotification: (id: string) => void;
}

const Notifications: React.FC<NotificationsProps> = ({ notifications, removeNotification }) => {
  if (notifications.length === 0) return null;
  
  return (
    <div className="notifications">
      {notifications.map(notification => (
        <div key={notification.id} className={`notification ${notification.type}`}>
          {notification.message}
          <button 
            className="close-notification" 
            onClick={() => removeNotification(notification.id)}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
};

export default Notifications;
