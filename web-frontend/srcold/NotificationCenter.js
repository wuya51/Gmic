import React, { useRef, useEffect, useMemo, useState } from 'react';

const NotificationCenter = ({ 
  notifications, 
  onRemoveNotification, 
  gmRecords, 
  currentAccount, 
  gmOperations, 
  chainId,
  isLoading = false,
  error = null 
}) => {
  const prevNotificationsRef = useRef(notifications);
  
  const [activeBalls, setActiveBalls] = useState([]);
  
  const [centerNotification, setCenterNotification] = useState(null);
  const [notificationQueue, setNotificationQueue] = useState([]);
  
  const memoizedNotifications = useMemo(() => {
    return Array.isArray(notifications) ? notifications : [];
  }, [notifications]);
  
  const hasNotificationsChanged = useMemo(() => {
    const prev = prevNotificationsRef.current;
    const current = notifications;
    
    if (prev?.length !== current?.length) {
      prevNotificationsRef.current = current;
      return true;
    }
    
    if (!prev?.length && !current?.length) {
      return false;
    }
    
    const hasChange = prev?.some((prevNotif, index) => {
      const currentNotif = current?.[index];
      return !currentNotif || 
             prevNotif.id !== currentNotif.id || 
             prevNotif.message !== currentNotif.message ||
             prevNotif.type !== currentNotif.type;
    });
    
    if (hasChange) {
      prevNotificationsRef.current = current;
    }
    
    return hasChange;
  }, [notifications]);
  

  
  const prevGmRecordsRef = useRef([]);
  const lastProcessedTimeRef = useRef(0);
  const componentInitTimeRef = useRef(Date.now() * 1000);

  useEffect(() => {
    if (gmRecords && gmRecords.length > 0) {
      
      const newRecords = gmRecords.filter((record, index) => {
        let recordTime = Number(record.timestamp);
        const currentTime = Date.now() * 1000;
        
        if (recordTime < Date.now()) {
          recordTime = recordTime * 1000;
        }
        
        const lastProcessedTime = lastProcessedTimeRef.current;
        
        const isNewRecord = recordTime > lastProcessedTime;
        
        const isAfterInit = recordTime > componentInitTimeRef.current;
        
        const isDuplicate = prevGmRecordsRef.current.some(prevRecord => {
          let prevRecordTime = Number(prevRecord.timestamp);
          if (prevRecordTime < Date.now()) {
            prevRecordTime = prevRecordTime * 1000;
          }
          return prevRecord.sender === record.sender && prevRecordTime === recordTime;
        });
               
        const shouldProcess = isNewRecord && !isDuplicate && isAfterInit;
        return shouldProcess;
      });
      
    newRecords.forEach(newRecord => {
        
        const getRandomPosition = () => {
          const minLeft = 20;
          const maxLeft = 300;
          const minBottom = 20;
          const maxBottom = 200;
          
          return {
            left: Math.floor(Math.random() * (maxLeft - minLeft)) + minLeft,
            bottom: Math.floor(Math.random() * (maxBottom - minBottom)) + minBottom
          };
        };

        const position = getRandomPosition();
        
        const newBall = {
          id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}-${performance.now()}`,
          sender: newRecord.sender,
          timestamp: new Date().toLocaleTimeString(),
          position: position,
          visible: true
        };

        setActiveBalls(prev => {
        const updated = [...prev, newBall];
        return updated;
      });

      setTimeout(() => {
        setActiveBalls(prev => {
          const updated = prev.filter(ball => ball.id !== newBall.id);
          return updated;
        });
      }, 5000);
      });
      
      const recipientRecords = newRecords.filter(record => {
        const normalizedCurrentAccount = currentAccount ? currentAccount.toLowerCase().trim() : '';
        const normalizedRecipient = record.recipient ? record.recipient.toLowerCase().trim() : '';
        const isRecipient = normalizedRecipient && normalizedRecipient === normalizedCurrentAccount;
       
     
        return isRecipient;
      }).map(record => ({
        sender: record.recipient,
        recipient: record.sender,
        timestamp: record.timestamp
      }));
           
      recipientRecords.forEach(recipientRecord => {
        if (centerNotification) {
          const notificationId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}-${performance.now()}`;
          
          setNotificationQueue(prev => [...prev, {
            id: notificationId,
            sender: recipientRecord.recipient,
            recipientRecord: recipientRecord,
            timestamp: new Date().toLocaleTimeString()
          }]);
          
          return;
        }
        
        const notificationId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}-${performance.now()}`;
        showNotification(recipientRecord, notificationId);
      });
      
      if (newRecords.length > 0) {
        const latestRecordTime = Math.max(...newRecords.map(record => {
          let recordTime = Number(record.timestamp);
          if (recordTime < Date.now()) {
            recordTime = recordTime * 1000;
          }
          return recordTime;
        }));
        lastProcessedTimeRef.current = latestRecordTime;
      }
      
      if (gmRecords && gmRecords.length > 0) {
        const allLatestTime = Math.max(...gmRecords.map(record => {
          let recordTime = Number(record.timestamp);
          if (recordTime < Date.now()) {
            recordTime = recordTime * 1000;
          }
          return recordTime;
        }));
        
        if (allLatestTime > lastProcessedTimeRef.current) {
          lastProcessedTimeRef.current = allLatestTime;
        }
      }
      
      prevGmRecordsRef.current = gmRecords;
    }
  }, [gmRecords]);

  const showNotification = (recipientRecord, notificationId) => {
    let autoHideTimer = null;
    let remainingTime = 8;
    let countdownInterval = null;
    
    const startAutoHideTimer = () => {
      if (autoHideTimer) {
        clearTimeout(autoHideTimer);
      }
      if (countdownInterval) {
        clearInterval(countdownInterval);
      }
      
      setCenterNotification(prev => prev ? {
        ...prev,
        countdown: remainingTime
      } : null);
      
      countdownInterval = setInterval(() => {
        remainingTime--;
        setCenterNotification(prev => prev ? {
          ...prev,
          countdown: remainingTime
        } : null);
        
        if (remainingTime <= 0) {
          clearInterval(countdownInterval);
        }
      }, 1000);
      
      autoHideTimer = setTimeout(() => {
        setCenterNotification(null);
        if (notificationQueue.length > 0) {
          const nextNotification = notificationQueue[0];
          setNotificationQueue(prev => prev.slice(1));
          
          setTimeout(() => {
            showNotification(nextNotification.recipientRecord, nextNotification.id);
          }, 500);
        }
      }, remainingTime * 1000);
    };
    
    const pauseAutoHide = () => {
      if (autoHideTimer) {
        clearTimeout(autoHideTimer);
      }
      if (countdownInterval) {
        clearInterval(countdownInterval);
      }
    };
    
    const handleReply = async () => {
      if (!gmOperations || !gmOperations.handleSendGMTo || !gmOperations.formatAccountOwner || !gmOperations.isValidAccountOwner) {
        console.error('GM operations not available for reply');
        return;
      }
      
      if (!recipientRecord.recipient) {
        console.error('Recipient address is null or undefined in notification');
        if (gmOperations.setMessage) {
          gmOperations.setMessage('Reply target address is empty, cannot reply', 'error');
        }
        return;
      }
      
      let formattedAddress = gmOperations.formatAccountOwner(recipientRecord.recipient);
      
      if (!gmOperations.isValidAccountOwner(formattedAddress)) {
        console.error('Formatted address is invalid:', formattedAddress);
        console.error('Original recipient address:', recipientRecord.recipient);
        console.error('Address type:', typeof recipientRecord.recipient);
        
        if (!gmOperations.isValidAccountOwner(recipientRecord.recipient)) {
          console.error('Original address is also invalid');
          if (gmOperations.setMessage) {
          gmOperations.setMessage('Invalid reply target address format, cannot reply', 'error');
        }
          return;
        }
        
        formattedAddress = recipientRecord.recipient;
      }
      
      try {
        const originalTargetChainId = gmOperations.targetChainId;
        
        gmOperations.targetChainId = chainId;
        
        await gmOperations.handleSendGMToWithAddress(formattedAddress);
        
        gmOperations.targetChainId = originalTargetChainId;
        
        setCenterNotification(null);
        
        if (gmOperations.setMessage) {
          gmOperations.setMessage(`Replied GMIC to ${formatShortAddress(recipientRecord.recipient)}`, 'success');
        }
      } catch (error) {
        // Reply GMIC failed
        if (gmOperations.setMessage) {
          gmOperations.setMessage('Failed to reply GMIC, please try again later', 'error');
        }
      }
    };
    
    setCenterNotification({
      id: notificationId,
      sender: recipientRecord.recipient,
      timestamp: new Date().toLocaleTimeString(),
      countdown: 5,
      visible: true,
      startAutoHideTimer,
      pauseAutoHide,
      handleReply
    });
    startAutoHideTimer();
  };

  const formatShortAddress = (address) => {
    if (!address) return '';
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };
  
  return (
    <>
      {isLoading && (
        <div className="notification-loading">
          <div className="loading-spinner"></div>
          <span>Loading notifications...</span>
        </div>
      )}
      
      {error && (
        <div className="notification-error">
          <span className="error-icon">⚠️</span>
          <span>Failed to load notifications: {error}</span>
          <button className="retry-btn" onClick={() => window.location.reload()}>
            Retry
          </button>
        </div>
      )}
      
      <div className="notifications-container">
        {notifications.map(notification => (
          <div 
            key={notification.id} 
            className={`notification notification-${notification.type}`}
            onClick={() => onRemoveNotification(notification.id)}
          >
            <span className="notification-message">{notification.message}</span>
            <span className="notification-timestamp">
              {new Date(notification.timestamp).toLocaleTimeString()}
            </span>
          </div>
        ))}
      </div>
      
      <div className="gm-notification-container">
        {activeBalls.map((ball) => (
          <div
            key={ball.id}
            className={`gm-notification-ball ${ball.visible ? 'visible' : 'hidden'}`}
            style={{
              left: `${ball.position.left}px`,
              bottom: `${ball.position.bottom}px`
            }}
          >
            <div className="ball-content">
              <div className="sender-address">{formatShortAddress(ball.sender)}</div>
              <div className="action-text">Sent GMIC</div>
              <div className="plus-one">+1</div>
            </div>
          </div>
        ))}
      </div>

      {centerNotification && (
        <div className="center-notification-overlay">
          <div 
            className="center-notification"
            onMouseEnter={() => centerNotification.pauseAutoHide && centerNotification.pauseAutoHide()}
            onMouseLeave={() => centerNotification.startAutoHideTimer && centerNotification.startAutoHideTimer()}
          >
            <div className="notification-header">
              <div className="notification-icon">🎉</div>
              <div className="notification-title">New GMIC Received!</div>
              <button 
                className="notification-close"
                onClick={() => setCenterNotification(null)}
                title="Close notification"
              >
                ×
              </button>
            </div>
            <div className="notification-content">
              <div className="notification-message">
                <span className="sender-label">From:</span>
                <span className="sender-address">{formatShortAddress(centerNotification.sender)}</span>
              </div>
              <div className="notification-time">
                {centerNotification.timestamp}
              </div>
              <div className="notification-countdown">
                Auto-close countdown: {centerNotification.countdown || 8} seconds
              </div>
            </div>
            <div className="notification-actions">
              <button 
                className="action-btn reply-btn" 
                onClick={() => centerNotification.handleReply && centerNotification.handleReply()}
                title="Reply GMIC to sender"
              >
                Reply GMIC
              </button>
              <button 
                className="action-btn dismiss-btn" 
                onClick={() => setCenterNotification(null)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default NotificationCenter;