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
  const notificationTimersRef = useRef({});
  const currentTimerStateRef = useRef({
    remainingTime: 8000,
    startTime: Date.now(),
    isPaused: false,
    autoHideTimer: null,
    countdownInterval: null
  });
  
  const [lastQueryTime, setLastQueryTime] = useState(0);
  const [queryInterval, setQueryInterval] = useState(null);
  const [lastBlockHeight, setLastBlockHeight] = useState(0);
  
  const [pageLoadTime, setPageLoadTime] = useState(() => {
    const savedPageLoadTime = localStorage.getItem('pageLoadTime');
    if (savedPageLoadTime) {
      return parseInt(savedPageLoadTime);
    } else {
      const currentTime = Date.now();
      localStorage.setItem('pageLoadTime', currentTime.toString());
      return currentTime;
    }
  });
  
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

  useEffect(() => {
    return () => {
      activeBalls.forEach(ball => {
        if (ball.removeTimer) {
          clearTimeout(ball.removeTimer);
        }
      });
      
      if (queryInterval) {
        clearInterval(queryInterval);
      }
    };
  }, [activeBalls, queryInterval]);

  useEffect(() => {
    if (!gmOperations || !currentAccount) {
      return;
    }

    const handleSubscriptionEvent = () => {
      const currentTime = Date.now();
      
      if (currentTime - lastQueryTime < 5000) {
        return;
      }

      setLastQueryTime(currentTime);

      if (gmOperations.refetchGmEvents) {
        gmOperations.refetchGmEvents().catch(error => {
          console.error('GM events data query failed:', error);
        });
      }

      if (gmOperations.refetchStreamEvents) {
        gmOperations.refetchStreamEvents().catch(error => {
          console.error('Stream events data query failed:', error);
        });
      }

      if (gmOperations.refetchWalletMessages) {
        gmOperations.refetchWalletMessages().catch(error => {
          console.error('Wallet messages data query failed:', error);
        });
      }
    };

    // 设置10秒定时器
    const interval = setInterval(handleSubscriptionEvent, 10000);
    setQueryInterval(interval);

    return () => {
      if (interval) {
        clearInterval(interval);
      }
      if (queryInterval) {
        clearInterval(queryInterval);
      }
    };
  }, [gmOperations, currentAccount, lastQueryTime]);

  useEffect(() => {
    if (gmRecords && gmRecords.length > 0) {
      
      const savedPageLoadTime = localStorage.getItem('pageLoadTime');
      const pageLoadTime = savedPageLoadTime ? parseInt(savedPageLoadTime) : 0;
      
      const recentRecords = gmRecords.filter(record => {
        let recordTime = Number(record.timestamp);
        const timestampStr = record.timestamp.toString();
        const timestampLength = timestampStr.length;
        
        if (timestampLength > 16) {
          recordTime = recordTime / 1000000;
        } else if (timestampLength <= 12) {
          recordTime = recordTime * 1000;
        } else if (timestampLength >= 13 && timestampLength <= 16) {
          recordTime = recordTime / 1000;
        }
        
        const isRecent = recordTime > pageLoadTime;
        
        return isRecent;
      });
      
      const currentRecordIds = new Set(recentRecords.map(record => 
        `${record.sender}-${record.timestamp}`
      ));
      
      const prevRecordIds = new Set(prevGmRecordsRef.current.map(record => 
        `${record.sender}-${record.timestamp}`
      ));
      
      const newRecords = recentRecords.filter(record => {
        const recordId = `${record.sender}-${record.timestamp}`;
        return !prevRecordIds.has(recordId);
      });
      
      prevGmRecordsRef.current = [...recentRecords];
      
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
        
        const recordId = `${newRecord.sender}-${newRecord.timestamp}`;
        const newBall = {
          id: recordId,
          sender: newRecord.sender,
          timestamp: new Date().toLocaleTimeString(),
          position: position,
          visible: true,
          removeTimer: null
        };

        setActiveBalls(prev => {
          const existingBall = prev.find(ball => ball.id === recordId);
          if (existingBall) {
            return prev;
          }
          
          if (newBall.removeTimer) {
            clearTimeout(newBall.removeTimer);
          }
          const removeTimer = setTimeout(() => {
            setActiveBalls(prev => {
              const updated = prev.filter(ball => ball.id !== recordId);
              return updated;
            });
          }, 5000);
          
          const ballWithTimer = {
            ...newBall,
            removeTimer: removeTimer
          };
          
          const updated = [...prev, ballWithTimer];
          return updated;
        });
      });
      
      const recipientRecords = newRecords.filter(record => {
        const normalizedCurrentAccount = currentAccount ? currentAccount.toLowerCase().trim() : '';
        const normalizedRecipient = record.recipient ? record.recipient.toLowerCase().trim() : '';
        const isRecipient = normalizedRecipient && normalizedRecipient === normalizedCurrentAccount;
     
        return isRecipient;
      }).map(record => ({
        sender: record.recipient,
        recipient: record.sender,
        timestamp: record.timestamp,
        content: record.content || 'Gmicrochains'
      }));
           
      recipientRecords.forEach(recipientRecord => {
        if (centerNotification) {
          const notificationId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}-${performance.now()}`;
          
          setNotificationQueue(prev => {
            const updated = [...prev, {
              id: notificationId,
              sender: recipientRecord.recipient,
              recipientRecord: recipientRecord,
              timestamp: formatTimestamp(recipientRecord.timestamp)
            }];
            return updated;
          });
          
          return;
        }
        
        const notificationId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}-${performance.now()}`;
        showNotification(recipientRecord, notificationId);
      });
      
      if (newRecords.length > 0) {
        const latestRecordTime = Math.max(...newRecords.map(record => {
          let recordTime = Number(record.timestamp);
          const timestampStr = record.timestamp.toString();
          const timestampLength = timestampStr.length;
          
          if (timestampLength <= 12) {
            recordTime = recordTime * 1000;
          } else if (timestampLength >= 13 && timestampLength <= 16) {
            recordTime = recordTime / 1000;
          }
          return recordTime;
        }));
        
        if (latestRecordTime > lastProcessedTimeRef.current) {
          lastProcessedTimeRef.current = latestRecordTime;
        }
      }
      
      if (gmRecords && gmRecords.length > 0) {
        const allLatestTime = Math.max(...gmRecords.map(record => {
          let recordTime = Number(record.timestamp);
          const timestampStr = record.timestamp.toString();
          const timestampLength = timestampStr.length;
          
          if (timestampLength <= 12) {
            recordTime = recordTime * 1000;
          } else if (timestampLength >= 13 && timestampLength <= 16) {
            recordTime = recordTime / 1000;
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
    // 清理之前可能存在的计时器状态
    if (notificationTimersRef.current[notificationId]) {
      const oldTimerState = notificationTimersRef.current[notificationId];
      if (oldTimerState.autoHideTimer) {
        clearTimeout(oldTimerState.autoHideTimer);
      }
      if (oldTimerState.countdownInterval) {
        clearInterval(oldTimerState.countdownInterval);
      }
      delete notificationTimersRef.current[notificationId];
    }
    
    // 为每个通知创建独立的计时器状态
    const timerState = {
      remainingTime: 8000,
      startTime: Date.now(),
      isPaused: false,
      autoHideTimer: null,
      countdownInterval: null
    };
    
    notificationTimersRef.current[notificationId] = timerState;
    
    // 创建独立的倒计时函数，绑定到当前通知ID
    const executeCountdown = () => {
      const currentTimerState = notificationTimersRef.current[notificationId];
      if (!currentTimerState || currentTimerState.isPaused) return;
      
      const elapsedTime = Date.now() - currentTimerState.startTime;
      const newRemainingTime = Math.max(0, currentTimerState.remainingTime - elapsedTime);
      currentTimerState.remainingTime = newRemainingTime;
      const newCountdown = Math.ceil(newRemainingTime / 1000);
      
      // 更新UI显示
      setCenterNotification(prev => {
        if (prev && prev.id === notificationId) {
          return {
            ...prev,
            countdown: newCountdown
          };
        }
        return prev;
      });
      
      if (newRemainingTime <= 0) {
        clearInterval(currentTimerState.countdownInterval);
        
        // 自动隐藏当前通知
        delete notificationTimersRef.current[notificationId];
        setCenterNotification(prev => {
          if (prev && prev.id === notificationId) {
            return null;
          }
          return prev;
        });
        
        // 处理队列中的下一个通知
        setNotificationQueue(prev => {
          if (prev.length > 0) {
            const nextNotification = prev[0];
            const remainingQueue = prev.slice(1);
            
            setTimeout(() => {
              showNotification(nextNotification.recipientRecord, nextNotification.id);
            }, 500);
            
            return remainingQueue;
          }
          return prev;
        });
      }
    };
    
    const startAutoHideTimer = () => {
      const currentTimerState = notificationTimersRef.current[notificationId];
      if (!currentTimerState) return;
      
      if (currentTimerState.isPaused) {
        currentTimerState.isPaused = false;
      }
      
      // 使用剩余时间而不是总是重置为8秒
      const remainingTime = currentTimerState.remainingTime || 8000;
      currentTimerState.startTime = Date.now();
      
      // 清理之前的计时器
      if (currentTimerState.autoHideTimer) {
        clearTimeout(currentTimerState.autoHideTimer);
      }
      if (currentTimerState.countdownInterval) {
        clearInterval(currentTimerState.countdownInterval);
      }
      
      // 立即执行一次倒计时更新
      executeCountdown();
      
      // 设置每秒更新
      currentTimerState.countdownInterval = setInterval(executeCountdown, 1000);
      
      // 设置自动隐藏计时器（使用剩余时间）
      currentTimerState.autoHideTimer = setTimeout(() => {
        const finalTimerState = notificationTimersRef.current[notificationId];
        if (!finalTimerState || finalTimerState.isPaused) return;
        
        // 清理计时器状态
        delete notificationTimersRef.current[notificationId];
        
        // 隐藏当前通知
        setCenterNotification(prev => {
          if (prev && prev.id === notificationId) {
            return null;
          }
          return prev;
        });
        
        // 处理队列中的下一个通知
        setNotificationQueue(prev => {
          if (prev.length > 0) {
            const nextNotification = prev[0];
            const remainingQueue = prev.slice(1);
            
            setTimeout(() => {
              showNotification(nextNotification.recipientRecord, nextNotification.id);
            }, 500);
            
            return remainingQueue;
          }
          return prev;
        });
      }, remainingTime);
    };
    
    const pauseAutoHide = () => {
      const currentTimerState = notificationTimersRef.current[notificationId];
      if (!currentTimerState) return;
      
      currentTimerState.isPaused = true;
      
      // 清理计时器
      if (currentTimerState.autoHideTimer) {
        clearTimeout(currentTimerState.autoHideTimer);
      }
      if (currentTimerState.countdownInterval) {
        clearInterval(currentTimerState.countdownInterval);
      }
      
      // 正确计算剩余时间
      const elapsedTime = Date.now() - currentTimerState.startTime;
      currentTimerState.remainingTime = Math.max(0, currentTimerState.remainingTime - elapsedTime);
    };
    
    const handleReply = async () => {
      if (!gmOperations || !gmOperations.handleSendGM || !gmOperations.formatAccountOwner || !gmOperations.isValidAccountOwner) {
        return;
      }
      
      if (!recipientRecord.recipient) {
        if (gmOperations.setMessage) {
          gmOperations.setMessage('Reply target address is empty, cannot reply', 'error');
        }
        return;
      }
      
      let formattedAddress = gmOperations.formatAccountOwner(recipientRecord.recipient);
      
      if (!gmOperations.isValidAccountOwner(formattedAddress)) {
        if (!gmOperations.isValidAccountOwner(recipientRecord.recipient)) {
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

        const urlParams = new URLSearchParams(window.location.search);
        let inviterParam = urlParams.get('inviter');        
        if (!inviterParam) {
          const currentUrl = window.location.href;
          const inviterMatch = currentUrl.match(/[?&]inviter=([^&]+)/i);
          if (inviterMatch) {
            inviterParam = inviterMatch[1];
          }
        }
        
        await gmOperations.handleSendGM('Gmicrochains', formattedAddress, inviterParam);
        
        gmOperations.targetChainId = originalTargetChainId;
        
        setCenterNotification(null);
        
        if (gmOperations.setMessage) {
          gmOperations.setMessage(`Replied GMIC to ${formatShortAddress(recipientRecord.recipient)}`, 'success');
        }
      } catch (error) {
        if (gmOperations.setMessage) {
          gmOperations.setMessage('Failed to reply GMIC, please try again later', 'error');
        }
      }
    };
    
    setCenterNotification({
      id: notificationId,
      sender: recipientRecord.recipient,
      timestamp: formatTimestamp(recipientRecord.timestamp),
      content: recipientRecord.content || 'Gmicrochains',
      countdown: 8, 
      visible: true,
      startAutoHideTimer,
      pauseAutoHide,
      handleReply
    });
    startAutoHideTimer();
  };

  const formatTimestamp = (timestamp) => {
    if (!timestamp) return '';
    
    let recordTime = Number(timestamp);
    const timestampStr = timestamp.toString();
    const timestampLength = timestampStr.length;

    if (timestampLength <= 12) {
      recordTime = recordTime * 1000;  
    } else if (timestampLength >= 13 && timestampLength <= 16) {
      recordTime = recordTime / 1000; 
    }
    
    const date = new Date(recordTime);
    return date.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
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
          >
            <span className="notification-message">{notification.message}</span>
            <span className="notification-timestamp">{new Date(notification.timestamp).toLocaleTimeString()}</span>
            <button 
              className="notification-close"
              onClick={(e) => {
                e.stopPropagation();
                onRemoveNotification(notification.id);
              }}
              title="Close notification"
            >
              ×
            </button>
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
                onClick={() => {
                  if (centerNotification && centerNotification.id) {
                    delete notificationTimersRef.current[centerNotification.id];
                  }
                  setCenterNotification(null);
                  
                  setNotificationQueue(prev => {
                    if (prev.length > 0) {
                      const nextNotification = prev[0];
                      const remainingQueue = prev.slice(1);
                      
                      setTimeout(() => {
                        showNotification(nextNotification.recipientRecord, nextNotification.id);
                      }, 500);
                      
                      return remainingQueue;
                    }
                    return prev;
                  });
                }}
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
              <div className="notification-message-content">
                <span className="message-label">Message:</span>
                <span className="message-text">{centerNotification.content}</span>
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
                onClick={() => {
                  if (centerNotification && centerNotification.id) {
                    delete notificationTimersRef.current[centerNotification.id];
                  }
                  setCenterNotification(null);
                  
                  setNotificationQueue(prev => {
                    if (prev.length > 0) {
                      const nextNotification = prev[0];
                      const remainingQueue = prev.slice(1);
                      
                      setTimeout(() => {
                        showNotification(nextNotification.recipientRecord, nextNotification.id);
                      }, 500);
                      
                      return remainingQueue;
                    }
                    return prev;
                  });
                }}
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