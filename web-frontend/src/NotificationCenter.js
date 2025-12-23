import React, { useRef, useEffect, useMemo, useState, useCallback } from 'react';

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
  const prevGmRecordsRef = useRef([]);
  const notificationTimersRef = useRef({});
  const isInitialLoadRef = useRef(true);
  
  const [activeBalls, setActiveBalls] = useState([]);
  const [centerNotification, setCenterNotification] = useState(null);
  const [lastQueryTime, setLastQueryTime] = useState(0);
  const [queryInterval, setQueryInterval] = useState(null);


  const formatShortAddress = useCallback((address) => {
    return address ? `${address.slice(0, 6)}...${address.slice(-4)}` : '';
  }, []);

  const normalizeTimestamp = useCallback((timestamp) => {
    if (!timestamp) return 0;
    
    let num = Number(timestamp);
    if (isNaN(num)) {
      const date = new Date(timestamp);
      if (!isNaN(date.getTime())) {
        return date.getTime();
      }
      return 0;
    }
    
    const currentTime = Date.now();
    const reasonableStart = new Date('2020-01-01').getTime();
    const reasonableEnd = new Date('2030-01-01').getTime();
    
    try {
      const bigNum = BigInt(timestamp);

      if (bigNum > 1000000000000000n) {
        const result = Number(bigNum / 1000000n);
        if (result > reasonableStart && result < reasonableEnd) {
          return result;
        }
      }

      if (bigNum > 1000000000000n && bigNum < 1000000000000000n) {
        const result = Number(bigNum / 1000n);
        if (result > reasonableStart && result < reasonableEnd) {
          return result;
        }
      }
    } catch (e) {
    }

    const len = num.toString().length;
    if (len <= 12) {
      const result = num * 1000;
      if (result > reasonableStart && result < reasonableEnd) {
        return result;
      }
    } else if (len > 16) {
      const result = num / 1000000;
      if (result > reasonableStart && result < reasonableEnd) {
        return result;
      }
    } else {
      const result = len > 13 ? num / 1000 : num;
      if (result > reasonableStart && result < reasonableEnd) {
        return result;
      }
    }
    
    return 0;
  }, []);

  const formatTimestamp = useCallback((timestamp) => {
    if (!timestamp) return '';
    const date = new Date(normalizeTimestamp(timestamp));
    return date.toLocaleString('en-US', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  }, [normalizeTimestamp]);

  const getRandomPosition = useCallback(() => ({
    left: Math.floor(Math.random() * 280) + 20,
    bottom: Math.floor(Math.random() * 180) + 20
  }), []);

  const memoizedNotifications = useMemo(() => 
    Array.isArray(notifications) ? notifications : [],
    [notifications]
  );


  const showNotification = useCallback((recipientRecord, notificationId) => {
    const oldTimer = notificationTimersRef.current[notificationId];
    if (oldTimer) {
      clearTimeout(oldTimer.autoHideTimer);
      clearInterval(oldTimer.countdownInterval);
    }

    const timerState = {
      remainingTime: 8000,
      startTime: Date.now(),
      isPaused: false,
      autoHideTimer: null,
      countdownInterval: null
    };
    notificationTimersRef.current[notificationId] = timerState;

    const executeCountdown = () => {
      const timer = notificationTimersRef.current[notificationId];
      if (!timer || timer.isPaused) return;

      const elapsed = Date.now() - timer.startTime;
      const remaining = Math.max(0, timer.remainingTime - elapsed);
      timer.remainingTime = remaining;

      setCenterNotification(prev => 
        prev?.id === notificationId 
          ? { ...prev, countdown: Math.ceil(remaining / 1000) } 
          : prev
      );

      if (remaining <= 0) {
        clearInterval(timer.countdownInterval);
        delete notificationTimersRef.current[notificationId];
        setCenterNotification(null);
      }
    };

    const startAutoHideTimer = () => {
      const timer = notificationTimersRef.current[notificationId];
      if (!timer) return;

      timer.isPaused = false;
      const remaining = timer.remainingTime || 8000;
      timer.startTime = Date.now();

      clearTimeout(timer.autoHideTimer);
      clearInterval(timer.countdownInterval);

      executeCountdown();
      timer.countdownInterval = setInterval(executeCountdown, 1000);

      timer.autoHideTimer = setTimeout(() => {
        const finalTimer = notificationTimersRef.current[notificationId];
        if (!finalTimer || finalTimer.isPaused) return;

        delete notificationTimersRef.current[notificationId];
        setCenterNotification(null);
      }, remaining);
    };

    const pauseAutoHide = () => {
      const timer = notificationTimersRef.current[notificationId];
      if (!timer) return;

      timer.isPaused = true;
      clearTimeout(timer.autoHideTimer);
      clearInterval(timer.countdownInterval);

      const elapsed = Date.now() - timer.startTime;
      timer.remainingTime = Math.max(0, timer.remainingTime - elapsed);
    };



    setCenterNotification({
      id: notificationId,
      sender: recipientRecord.recipient,
      timestamp: formatTimestamp(recipientRecord.timestamp),
      content: recipientRecord.content || 'Gmicrochains',
      countdown: 8,
      visible: true,
      startAutoHideTimer,
      pauseAutoHide
    });
    startAutoHideTimer();
  }, [gmOperations, chainId, formatShortAddress, formatTimestamp]);

  const closeNotificationAndShowNext = useCallback(() => {
    if (centerNotification?.id) {
      const timer = notificationTimersRef.current[centerNotification.id];
      if (timer) {
        clearTimeout(timer.autoHideTimer);
        clearInterval(timer.countdownInterval);
        delete notificationTimersRef.current[centerNotification.id];
      }
    }
    setCenterNotification(null);
  }, [centerNotification?.id]);


  useEffect(() => {
    return () => {
      activeBalls.forEach(ball => clearTimeout(ball.removeTimer));
      if (queryInterval) clearInterval(queryInterval);
      Object.values(notificationTimersRef.current).forEach(timer => {
        clearTimeout(timer.autoHideTimer);
        clearInterval(timer.countdownInterval);
      });
    };
  }, [activeBalls, queryInterval]);


  useEffect(() => {
    if (!gmOperations || !currentAccount) return;

    const handleSubscriptionEvent = () => {
      const now = Date.now();
      if (now - lastQueryTime < 5000) return;

      setLastQueryTime(now);
      Promise.allSettled([
        gmOperations.refetchGmEvents?.(),
        gmOperations.refetchStreamEvents?.(),
        gmOperations.refetchWalletMessages?.()
      ]);
    };

    const interval = setInterval(handleSubscriptionEvent, 10000);
    setQueryInterval(interval);

    return () => {
      clearInterval(interval);
      if (queryInterval) clearInterval(queryInterval);
    };
  }, [gmOperations, currentAccount, lastQueryTime]);


  useEffect(() => {
    if (!gmRecords?.length) return;

    if (isInitialLoadRef.current && gmRecords.length > 3) {
      isInitialLoadRef.current = false;
      prevGmRecordsRef.current = [...gmRecords];
      return;
    }
    
    isInitialLoadRef.current = false;

    const prevIds = new Set(prevGmRecordsRef.current.map(r => `${r.sender}-${r.timestamp}`));
    const newRecords = gmRecords.filter(r => !prevIds.has(`${r.sender}-${r.timestamp}`));
    
    prevGmRecordsRef.current = [...gmRecords];

    newRecords.forEach(record => {
      const position = getRandomPosition();
      const recordId = `${record.sender}-${record.timestamp}`;

      setActiveBalls(prev => {
        if (prev.some(b => b.id === recordId)) return prev;

        const removeTimer = setTimeout(() => {
          setActiveBalls(p => p.filter(b => b.id !== recordId));
        }, 5000);

        return [...prev, {
          id: recordId,
          sender: record.sender,
          timestamp: new Date().toLocaleTimeString(),
          position,
          visible: true,
          removeTimer
        }];
      });
    });

    const recipientRecords = newRecords
      .filter(r => r.recipient?.toLowerCase().trim() === currentAccount?.toLowerCase().trim())
      .map(r => ({
        sender: r.recipient,
        recipient: r.sender,
        timestamp: r.timestamp,
        content: r.content || 'Gmicrochains'
      }));

    recipientRecords.forEach(r => {
      const id = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      showNotification(r, id);
    });
  }, [gmRecords, currentAccount, getRandomPosition, showNotification]);

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
          <button className="retry-btn" onClick={() => window.location.reload()}>Retry</button>
        </div>
      )}

      {/* Top-right notification list */}
      <div className="notifications-container">
        {memoizedNotifications.map(notification => (
          <div key={notification.id} className={`notification notification-${notification.type}`}>
            <span className="notification-message">
              {notification.type === 'success' ? '✓ ' : ''}{notification.message}
            </span>
            <span className="notification-timestamp">
              {new Date(notification.timestamp).toLocaleTimeString()}
            </span>
            <button
              className="notification-close"
              onClick={(e) => {
                e.stopPropagation();
                onRemoveNotification(notification.id);
              }}
            >
              ×
            </button>
          </div>
        ))}
      </div>

      {/* Floating bubble notifications */}
      <div className="gm-notification-container">
        {activeBalls.map(ball => (
          <div
            key={ball.id}
            className={`gm-notification-ball ${ball.visible ? 'visible' : 'hidden'}`}
            style={{ left: `${ball.position.left}px`, bottom: `${ball.position.bottom}px` }}
          >
            <div className="ball-content">
              <div className="sender-address">{formatShortAddress(ball.sender)}</div>
              <div className="action-text">Sent GMIC</div>
              <div className="plus-one">+1</div>
            </div>
          </div>
        ))}
      </div>

      {/* Center notification modal */}
      {centerNotification && (
        <div className="center-notification-overlay">
          <div
            className="center-notification"
            onMouseEnter={() => centerNotification.pauseAutoHide?.()}
            onMouseLeave={() => centerNotification.startAutoHideTimer?.()}
          >
            <div className="notification-header">
              <div className="notification-icon">🎉</div>
              <div className="notification-title">New GMIC Received!</div>
              <button
                className="notification-close"
                onClick={closeNotificationAndShowNext}
              >
                ×
              </button>
            </div>

            <div className="notification-content">
              <div className="notification-message">
                <span className="sender-label">From:</span>
                <span className="sender-address">{formatShortAddress(centerNotification.sender)}</span>
              </div>
              <div className="notification-message-content">
                <span className="message-label">Message:</span>
                <span className="message-text">{centerNotification.content}</span>
              </div>
              <div className="notification-time">{centerNotification.timestamp}</div>
              <div className="notification-countdown">
                Auto-close countdown: {centerNotification.countdown || 8} seconds
              </div>
            </div>

            <div className="notification-actions">
              <button
                className="action-btn dismiss-btn"
                onClick={closeNotificationAndShowNext}
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