import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useWallet, WalletConnector } from './WalletProvider';
import { DynamicConnectButton, useDynamicContext } from '@dynamic-labs/sdk-react-core';
import "./App.css";
import GMOperations from './GMOperations';
import NotificationCenter from './NotificationCenter';

function App({ chainId, appId, ownerId }) {
  
  const useDarkMode = () => {
    const [isDarkMode, setIsDarkMode] = useState(() => {
      return localStorage.getItem('darkMode') === 'true';
    });

    useEffect(() => {
      if (isDarkMode) {
        document.body.classList.add('dark-mode');
      } else {
        document.body.classList.remove('dark-mode');
      }
      localStorage.setItem('darkMode', isDarkMode);
    }, [isDarkMode]);

    return [isDarkMode, setIsDarkMode];
  };
  
  const [isDarkMode, setIsDarkMode] = useDarkMode();
  
  let walletState = {};
  try {
    walletState = useWallet();
  } catch (error) {
    walletState = {
      account: null,
      isConnected: false,
      chainId: chainId || null,
      walletChainId: null,
      walletType: null,
      isLoading: false,
      error: null,
      connectWallet: () => {},
      disconnectWallet: () => {}
    };
  }
  
  const { 
    account: connectedAccount, 
    isConnected, 
    chainId: connectedChainId,
    walletChainId: connectedWalletChainId,
    walletType,
    isLoading: walletLoading,
    error: walletError,
    connectWallet, 
    disconnectWallet 
  } = walletState;

  const [recipientAddress, setRecipientAddress] = useState("");
  const getInitialTargetChainId = () => {
    const savedTargetChainId = localStorage.getItem('targetChainId');
    return savedTargetChainId || chainId;
  };
  const [targetChainId, setTargetChainId] = useState(getInitialTargetChainId());
  const [operationStatus, setOperationStatus] = useState(null);
  const [claimStatus, setClaimStatus] = useState(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [connectionError, setConnectionError] = useState("");
  const [queryRetryCount, setQueryRetryCount] = useState(0);
  const [cooldownRemaining, setCooldownRemaining] = useState(0);
  const [addressValidationError, setAddressValidationError] = useState("");
  
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);
  
  const [showPlusOne, setShowPlusOne] = useState(false);
  const [previousTotalMessages, setPreviousTotalMessages] = useState(null);
  const plusOneTimer = useRef(null);
  
  const [showInvitationSection, setShowInvitationSection] = useState(false);
  const [showLeaderboard, setShowLeaderboard] = useState(true);
  
  const [activeTab, setActiveTab] = useState('messages');
  
  const [cooldownStatus, setCooldownStatus] = useState(null);
  
  const [localCooldownEnabled, setLocalCooldownEnabled] = useState(false);
  
  const [notifications, setNotifications] = useState([]);
  
  const [gmRecords, setGmRecords] = useState([]);
  const previousEventCountRef = useRef(0);
  
  // History states
  const [historyRecords, setHistoryRecords] = useState([]);
  const [showHistoryDropdown, setShowHistoryDropdown] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  
  // Custom message states
  const [customMessageEnabled, setCustomMessageEnabled] = useState(false);
  const [customMessage, setCustomMessage] = useState('');
  const [selectedMessage, setSelectedMessage] = useState('gm');
  
  // Custom message handlers
  const handleCustomMessageToggle = useCallback(() => {
    setCustomMessageEnabled(!customMessageEnabled);
    if (!customMessageEnabled) {
      setSelectedMessage(customMessage || 'gm');
    } else {
      setSelectedMessage('gm');
    }
  }, [customMessageEnabled, customMessage]);

  const handleCustomMessageChange = useCallback((e) => {
    const value = e.target.value;
    setCustomMessage(value);
    if (customMessageEnabled) {
      setSelectedMessage(value || 'gm');
    }
  }, [customMessageEnabled]);

  const currentAccount = connectedAccount;
  const currentChainId = connectedChainId;
  const currentIsConnected = isConnected;
  
  const { primaryWallet, handleLogOut } = useDynamicContext();
  const isDynamicConnected = primaryWallet && primaryWallet.address;
  const dynamicAccount = isDynamicConnected ? primaryWallet.address : null;
  const isActiveDynamicWallet = isConnected && walletType === 'dynamic' && currentAccount;
  
  const [isDynamicLoading, setIsDynamicLoading] = useState(false);
  
  useEffect(() => {
    if (primaryWallet && primaryWallet.address) {
      setIsDynamicLoading(false);
    }
  }, [primaryWallet]);

  useEffect(() => {
    if (walletType === 'dynamic') {
      isManualTargetChainChange.current = false;
      setTargetChainId(chainId);
    } else if (walletType === 'linera' && connectedWalletChainId) {
      if (!localStorage.getItem('targetChainId')) {
        isManualTargetChainChange.current = false;
        setTargetChainId(connectedWalletChainId);
      }
    }
  }, [walletType, connectedWalletChainId, chainId]);
  
  const disconnectDynamicWallet = async () => {
    try {
      if (handleLogOut) {
        await handleLogOut();
        disconnectWallet();
      }
    } catch (error) {
    }
  };
  
  const addNotification = useCallback((message, type = 'info') => {
    const id = Date.now().toString();
    const newNotification = {
      id,
      message,
      type,
      timestamp: Date.now()
    };
    
    setNotifications(prev => [...prev, newNotification]);
    
    setTimeout(() => {
      removeNotification(id);
    }, 5000);
  }, []);
  
  const removeNotification = useCallback((id) => {
    setNotifications(prev => prev.filter(notif => notif.id !== id));
  }, []);
  
  const WalletConnectionSection = React.memo(({
    isDynamicConnected,
    isActiveDynamicWallet,
    currentAccount,
    isDynamicLoading,
    currentIsConnected,
    disconnectDynamicWallet,
    setMessage,
    dynamicAccount,
    connectWallet,
    disconnectWallet,
    walletType,
    isLoading
  }) => {
    const isLineraConnected = currentIsConnected && walletType === 'linera' && currentAccount;
    const lineraAccount = isLineraConnected ? currentAccount : null;
    
    const handleConnectLineraWallet = async () => {
      try {
        if (!window.linera) {
          setMessage("Linera wallet not installed, please visit https://github.com/respeer-ai/linera-wallet to download and install", "warning");
          return;
        }
        
        if (currentIsConnected && walletType && walletType !== 'linera') {
          await disconnectWallet();
        }
        
        await connectWallet('linera');
        setMessage('Linera wallet connected successfully!', 'success');
      } catch (error) {
        setMessage(`Failed to connect Linera wallet: ${error.message}`, 'error');
      }
    };
    
    const handleDisconnectLineraWallet = async () => {
      try {
        await disconnectWallet();
        setMessage('Linera wallet disconnected successfully', 'success');
      } catch (error) {
        setMessage(`Failed to disconnect Linera wallet: ${error.message}`, 'error');
      }
    };
    
    const handleConnectDynamicWallet = async () => {
      try {
        if (currentIsConnected && walletType && walletType !== 'dynamic') {
          await disconnectWallet();
        }
      } catch (error) {
        setMessage(`Failed to connect Dynamic wallet: ${error.message}`, 'error');
      }
    };
    
    const handleDisconnectDynamicWallet = async () => {
      try {
        await disconnectDynamicWallet();
        setMessage('Dynamic wallet disconnected successfully', 'success');
      } catch (error) {
        setMessage(`Failed to disconnect Dynamic wallet: ${error.message}`, 'error');
      }
    };
    
    return (
      <div className="wallet-connection-section">
        <div className="wallet-button-container">
          {isLineraConnected ? (
            <div className="wallet-info-card linera">
              <div className="wallet-address">
                {lineraAccount ? `${lineraAccount.slice(0, 6)}...${lineraAccount.slice(-4)}` : 'Connected'}
              </div>
              <button 
                className="disconnect-btn linera"
                onClick={handleDisconnectLineraWallet}
                disabled={isLoading && walletType === 'linera'}
              >
                Disconnect
              </button>
            </div>
          ) : (
            <button 
              className="connect-btn linera"
              onClick={handleConnectLineraWallet}
              disabled={isLoading && walletType === 'linera'}
            >
              {isLoading && walletType === 'linera' ? "Connecting..." : 'Linera Wallet'}
            </button>
          )}
        </div>
        
        <div className="wallet-button-container">
          {isDynamicConnected ? (
            <div className="wallet-info-card dynamic">
              <div className="wallet-address">
                {dynamicAccount ? `${dynamicAccount.slice(0, 6)}...${dynamicAccount.slice(-4)}` : 'Connected'}
              </div>
              <button 
                className="disconnect-btn dynamic"
                onClick={handleDisconnectDynamicWallet}
                disabled={isDynamicLoading}
              >
                Disconnect
              </button>
            </div>
          ) : (
            <div className="wallet-connect-card">
              <DynamicConnectButton>
                <button className="connect-btn dynamic">
                  Dynamic Wallet
                </button>
              </DynamicConnectButton>
            </div>
          )}
        </div>
      </div>
    );
  });
  
  const LeaderboardSection = React.memo(({
    showLeaderboard,
    setShowLeaderboard,
    leaderboardData,
    currentAccount,
    isMobile,
    copyToClipboard,
    refetchLeaderboard
  }) => {
    const leaderboardItems = useMemo(() => {
      if (!leaderboardData?.getTopUsers || leaderboardData.getTopUsers.length === 0) {
        return null;
      }
      
      return leaderboardData.getTopUsers.map((entry, index) => (
        <tr key={`${entry.user}-${index}`} className={entry.user === currentAccount ? "current-user" : ""}>
          <td>{index + 1}</td>
          <td>
            <span 
              className="address-simple" 
              onClick={(e) => copyToClipboard(entry.user, e)}
            >
              {isMobile ? `${entry.user.slice(0, 6)}...${entry.user.slice(-4)}` : entry.user}
            </span>
          </td>
          <td>{entry.count}</td>
        </tr>
      ));
    }, [leaderboardData?.getTopUsers, currentAccount, isMobile, copyToClipboard]);

    return (
      <div className="card leaderboard-card">
        <div className="section-header">
          <h3>Leaderboard</h3>
          <button 
            className="toggle-btn"
            onClick={() => setShowLeaderboard(!showLeaderboard)}
          >
            {showLeaderboard ? "▼" : "▶"}
          </button>
        </div>
        {showLeaderboard && (
          <div className="leaderboard-content">
            <div className="stats-header">
              <h4>Top GMicrochains Senders</h4>
              <button 
                className="refresh-btn"
                onClick={() => {
                  refetchLeaderboard && refetchLeaderboard();
                }}
                title="Refresh leaderboard"
              >
                🔄 Refresh
              </button>
            </div>
            {leaderboardItems ? (
              <div className="leaderboard-list">
                <table className="leaderboard-table">
                  <thead>
                    <tr>
                      <th>Rank</th>
                      <th>User</th>
                      <th>Count</th>
                    </tr>
                  </thead>
                  <tbody>
                    {leaderboardItems}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="no-leaderboard-data">
                <p>No leaderboard data available yet.</p>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }, (prevProps, nextProps) => {
    return (
      prevProps.showLeaderboard === nextProps.showLeaderboard &&
      prevProps.leaderboardData === nextProps.leaderboardData &&
      prevProps.currentAccount === nextProps.currentAccount &&
      prevProps.isMobile === nextProps.isMobile
    );
  });
  
  const handleConnectWallet = useCallback(async (newWalletType) => {
    try {
      if (currentIsConnected && walletType && newWalletType !== walletType) {
        await disconnectWallet();
      }
      
      await connectWallet(newWalletType);
      addNotification(`${newWalletType === 'linera' ? 'Linera' : 'Dynamic'} wallet connected successfully!`, 'success');
    } catch (error) {
      addNotification(`Failed to connect ${newWalletType === 'linera' ? 'Linera' : 'Dynamic'} wallet: ${error.message}`, 'error');
    }
  }, [connectWallet, disconnectWallet, currentIsConnected, walletType, addNotification]);
  
  const handleDisconnectWallet = useCallback(async () => {
    try {
      await disconnectWallet();
      addNotification('Wallet disconnected successfully!', 'success');
    } catch (error) {
      addNotification(`Failed to disconnect wallet: ${error.message}`, 'error');
    }
  }, [disconnectWallet, addNotification]);
  
  const setMessage = useCallback((message, type = 'error') => {
    addNotification(message, type);
  }, [addNotification]);
  
  const copyToClipboard = useCallback((text, event) => {
    const copyText = async (textToCopy) => {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        try {
          await navigator.clipboard.writeText(textToCopy);
          return Promise.resolve();
        } catch (err) {
          return fallbackCopyToClipboard(textToCopy);
        }
      } else {
        return fallbackCopyToClipboard(textToCopy);
      }
    };
    
    const fallbackCopyToClipboard = (textToCopy) => {
      return new Promise((resolve, reject) => {
        const textArea = document.createElement('textarea');
        textArea.value = textToCopy;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        textArea.style.top = '-999999px';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        
        try {
          const successful = document.execCommand('copy');
          document.body.removeChild(textArea);
          if (!successful) {
            throw new Error('Copy command failed');
          }
          resolve();
        } catch (err) {
          document.body.removeChild(textArea);
          alert(`Cannot copy address automatically, please copy manually: ${textToCopy}`);
          reject(err);
        }
      });
    };
    
    copyText(text).then(() => {
      const element = event.target;
      const originalText = element.innerHTML;
      element.innerHTML = 'Copied!';
      element.classList.add('copy-success');
      setTimeout(() => {
        element.innerHTML = originalText;
        element.classList.remove('copy-success');
      }, 1000);
    }).catch((err) => {
    });
  }, []);

  const handleMutationComplete = useCallback((data, mutationType) => {
    if (mutationType === 'invitation') {
      setClaimStatus("success");
      setTimeout(() => setClaimStatus(null), 5000);
    } else {
      setOperationStatus("success");
      setTimeout(() => setOperationStatus(null), 5000);
    }
    
    let successMessage = "Operation completed successfully!";
    if (mutationType === 'sendGM') {
      successMessage = "GMicrochains sent successfully!";
    } else if (mutationType === 'setCooldown') {
      successMessage = "24-hour limit updated successfully!";
    } else if (mutationType === 'invitation') {
      successMessage = "Invitation operation completed successfully!";
    }
    
    addNotification(successMessage, "success");
    
    setTimeout(() => {
      if (gmOps) {
        gmOps.refetchWalletMessages && gmOps.refetchWalletMessages();
        gmOps.refetch && gmOps.refetch();
        gmOps.refetchGmRecord && gmOps.refetchGmRecord();
        gmOps.refetchInvitationStats && gmOps.refetchInvitationStats();
        
        if (mutationType === 'sendGM') {
          previousEventCountRef.current = 0;
          gmOps.refetchStreamEvents && gmOps.refetchStreamEvents();
        }
      }
    }, 1000);
  }, [addNotification]);

  const previousLatestTimestampRef = useRef(0);
  const pageLoadTimestampRef = useRef(Date.now() * 1000);
  
  const gmOps = GMOperations({
    chainId: currentChainId || chainId,
    currentAccount,
    currentChainId,
    walletMode: 'connected',
    queryRetryCount,
    setQueryRetryCount,
    setOperationStatus,
    setClaimStatus,
    setMessage,
    targetChainId,
    recipientAddress,
    onMutationComplete: handleMutationComplete,

    cooldownStatus: { enabled: localCooldownEnabled }
  });

  // History toggle handler
  const handleHistoryToggle = useCallback(async () => {
    // If dropdown is already open, just close it
    if (showHistoryDropdown) {
      setShowHistoryDropdown(false);
      return;
    }
    
    // If no account is connected, just show the dropdown with empty state
    if (!currentAccount) {
      setShowHistoryDropdown(true);
      return;
    }
    
    // Otherwise, fetch history and then show dropdown
    try {
      setHistoryLoading(true);
      const { data } = await gmOps.refetchGmEvents();
      
      if (data && data.getGmEvents) {
        // Sort by timestamp in descending order (newest first)
        const sortedRecords = [...data.getGmEvents].sort((a, b) => 
          parseInt(b.timestamp) - parseInt(a.timestamp)
        );
        
        // Limit to 15 records
        setHistoryRecords(sortedRecords.slice(0, 15));
      } else {
        setHistoryRecords([]);
      }
    } catch (error) {
      console.error('Error fetching history:', error);
      setHistoryRecords([]);
    } finally {
      setHistoryLoading(false);
      setShowHistoryDropdown(true);
    }
  }, [showHistoryDropdown, currentAccount, gmOps]);
  
  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (showHistoryDropdown && !event.target.closest('.send-action-card')) {
        setShowHistoryDropdown(false);
      }
    };
    
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showHistoryDropdown]);

  const handleToggleCooldown = useCallback(async (enabled) => {
    if (!gmOps.isValidAccountOwner(currentAccount)) {
      setMessage("Invalid account address", "error");
      return;
    }

    setOperationStatus("processing");
    
    try {
      setLocalCooldownEnabled(enabled);
      
      await gmOps.handleSetCooldownEnabled(enabled);
      
      gmOps.refetchCooldownStatus && gmOps.refetchCooldownStatus();
      gmOps.refetchCooldownCheck && gmOps.refetchCooldownCheck();
      
      setOperationStatus("success");
      setTimeout(() => setOperationStatus(null), 3000);
    } catch (error) {
      setLocalCooldownEnabled(!enabled);
      addNotification(
        `Failed to ${enabled ? 'enable' : 'disable'} 24-hour limit: ${error.message}`,
        "error"
      );
      setOperationStatus("error");
    }
  }, [currentAccount, setMessage, gmOps, addNotification]);



  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth <= 768);
    };
    
    window.addEventListener('resize', handleResize);
    
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, []);
  
  useEffect(() => {
    if (currentAccount && currentChainId) {
      setTimeout(() => {
        gmOps.refetchInvitationStats && gmOps.refetchInvitationStats();
      }, 100);
    }
  }, [currentAccount, currentChainId]);
  
  useEffect(() => {
    if (currentAccount && currentChainId) {
      setTimeout(() => {
        if (gmOps.refetchCooldownStatus) {
          gmOps.refetchCooldownStatus().then(() => {
            const currentCooldownStatus = gmOps.cooldownStatusData?.getCooldownStatus?.enabled;
            if (currentCooldownStatus !== undefined) {
              setLocalCooldownEnabled(currentCooldownStatus);
            }
          });
        }
      }, 200);
    }
  }, [currentAccount, currentChainId]);

  useEffect(() => {
    const events = gmOps.streamEventsData?.getStreamEvents;
    
    if (events && events.length > 0) {
      const currentEventCount = events.length;
      const previousEventCount = previousEventCountRef.current || 0;
      
      const latestEvent = events[0];
      const latestTimestamp = latestEvent ? Number(latestEvent.timestamp) : 0;
      const previousLatestTimestamp = previousLatestTimestampRef.current || 0;
      
      if (currentEventCount !== previousEventCount || latestTimestamp !== previousLatestTimestamp) {
        const newRecords = events.map(event => ({
          sender: event.sender,
          recipient: event.recipient,
          timestamp: event.timestamp,
          content: event.content
        })).filter(event => {
          let eventTime = Number(event.timestamp);
          if (eventTime < Date.now()) {
            eventTime = eventTime * 1000;
          }
          return eventTime > pageLoadTimestampRef.current;
        });   
        
        setGmRecords(newRecords);
        previousEventCountRef.current = currentEventCount;
        previousLatestTimestampRef.current = latestTimestamp;
      }
    }
  }, [gmOps.streamEventsData]);

  useEffect(() => {
    const subscriptionEvents = gmOps.subscriptionData?.gmEvents;
    
    if (subscriptionEvents && subscriptionEvents.length > 0) {
      const newRecords = subscriptionEvents.map(event => ({
        sender: event.sender,
        recipient: event.recipient,
        timestamp: event.timestamp,
        content: event.content
      }));
      
      setGmRecords(prev => {
        const existingTimestamps = new Set(prev.map(r => r.timestamp));
        const filteredNewRecords = newRecords.filter(r => !existingTimestamps.has(r.timestamp));
        
        if (filteredNewRecords.length > 0) {
          const updatedRecords = [...prev, ...filteredNewRecords];

          if (gmOps) {
            gmOps.refetch && gmOps.refetch();

            gmOps.refetchStreamEvents && gmOps.refetchStreamEvents();

            gmOps.refetchLeaderboard && gmOps.refetchLeaderboard();

            const isCurrentUserInvolved = filteredNewRecords.some(
              record => record.sender === currentAccount || record.recipient === currentAccount
            );
            
            if (isCurrentUserInvolved && currentAccount) {
              gmOps.refetchWalletMessages && gmOps.refetchWalletMessages();
              gmOps.refetchGmRecord && gmOps.refetchGmRecord();
              gmOps.refetchCooldownCheck && gmOps.refetchCooldownCheck();
            }
            
            // 显示通知，告知用户有新消息
            const lastEvent = filteredNewRecords[filteredNewRecords.length - 1];
            if (lastEvent) {
              const isFromCurrentUser = lastEvent.sender === currentAccount;
              const isToCurrentUser = lastEvent.recipient === currentAccount;
              
              if (!isFromCurrentUser && isToCurrentUser) {
                addNotification(`You received a new GM from ${lastEvent.sender.slice(0, 8)}...${lastEvent.sender.slice(-6)}`, 'info');
              } else if (!isFromCurrentUser && !isToCurrentUser) {
                addNotification(`New GM sent between ${lastEvent.sender.slice(0, 8)}... and ${lastEvent.recipient.slice(0, 8)}...`, 'info');
              }
            }
          }
          
          return updatedRecords;
        } else {
          return prev;
        }
      });
    }
  }, [gmOps.subscriptionData, currentAccount, gmOps, addNotification]);

  useEffect(() => {
    if (operationStatus === "success") {
      setTimeout(() => {
        if (gmOps) {
          gmOps.refetchStreamEvents && gmOps.refetchStreamEvents();
        }
      }, 1000);
    }
  }, [operationStatus, gmOps]);

  useEffect(() => {
    if (gmOps.data) {
      if (
        typeof previousTotalMessages === 'number' && 
        typeof gmOps.data?.totalMessages === 'number' && 
        gmOps.data.totalMessages > previousTotalMessages
      ) {
        setShowPlusOne(true);
        if (plusOneTimer.current) {
          clearTimeout(plusOneTimer.current);
        }
        plusOneTimer.current = setTimeout(() => {
          setShowPlusOne(false);
        }, 1000);
      }
      if (typeof gmOps.data?.totalMessages === 'number') {
        setPreviousTotalMessages(gmOps.data.totalMessages);
      }
    }
  }, [gmOps.data, previousTotalMessages, currentAccount, currentChainId, chainId]);

  useEffect(() => {
    const COOLDOWN_MS = 86_400_000_000;
    let intervalId;

    if (gmOps.gmRecordData?.getGmRecord?.timestamp) {
      const lastGm = Number(gmOps.gmRecordData?.getGmRecord?.timestamp);
      const updateCooldown = () => {
        const currentTs = Date.now() * 1000;
        if (currentTs < lastGm + COOLDOWN_MS) {
          setCooldownRemaining(lastGm + COOLDOWN_MS - currentTs);
        } else {
          setCooldownRemaining(0);
          clearInterval(intervalId);
        }
      };

      updateCooldown();
      intervalId = setInterval(updateCooldown, 1000);
    } else {
      setCooldownRemaining(0);
    }

    return () => clearInterval(intervalId);
  }, [gmOps.gmRecordData]);

  const isManualTargetChainChange = useRef(false);
  
  useEffect(() => {
    if (targetChainId && isManualTargetChainChange.current) {
      localStorage.setItem('targetChainId', targetChainId);
      isManualTargetChainChange.current = false;
    }
  }, [targetChainId]);

  const validateRecipientAddress = useCallback((address) => {
    const validation = gmOps.validateRecipientAddress(address);
    setAddressValidationError(validation.error);
    return validation.isValid;
  }, [gmOps.validateRecipientAddress, currentAccount]);

  const countdown = gmOps.formatCooldown(cooldownRemaining, true);

  const handleSendGMWithInvitation = useCallback(() => {
    gmOps.handleSendGMWithInvitation();
  }, [gmOps]);

  const handleClaimInvitationRewards = useCallback(() => {
    gmOps.handleClaimInvitationRewards();
  }, [gmOps]);

  const handleSendGM = useCallback(() => {
    if (!currentIsConnected) {
      if (window.linera) {
        connectWallet('linera');
        setMessage('Connecting Linera wallet...', 'info');
      } else {
        setMessage('Linera wallet not installed, please click the Dynamic Wallet button in the top right corner to connect', 'info');
      }
      return;
    }
    
    gmOps.handleSendGM();
  }, [currentIsConnected, connectWallet, gmOps, setMessage]);

  const handleSendGMTo = useCallback(() => {
    gmOps.handleSendGMTo();
  }, [gmOps]);

  return (
    <ErrorBoundary>
      <header className="top-navbar">
        <div className="navbar-container">
          <div className="logo">
            <img src="/GMic.png" alt="GMIC Logo" className="logo-img" />
          </div>
          <nav className="nav-links">
          <button 
            className={`nav-tab ${activeTab === 'messages' ? 'active' : ''}`}
            onClick={() => setActiveTab('messages')}
          >
            Messages
          </button>
          <button 
            className={`nav-tab ${activeTab === 'leaderboards' ? 'active' : ''}`}
            onClick={() => setActiveTab('leaderboards')}
          >
            Leaderboards
          </button>
          <button 
            className={`nav-tab ${activeTab === 'settings' ? 'active' : ''}`}
            onClick={() => setActiveTab('settings')}
          >
            Settings
          </button>
        </nav>
          
          <WalletConnectionSection 
            isDynamicConnected={isDynamicConnected}
            isActiveDynamicWallet={isActiveDynamicWallet}
            currentAccount={currentAccount}
            isDynamicLoading={isDynamicLoading}
            currentIsConnected={currentIsConnected}
            disconnectDynamicWallet={disconnectDynamicWallet}
            setMessage={setMessage}
            dynamicAccount={dynamicAccount}
            connectWallet={connectWallet}
            disconnectWallet={disconnectWallet}
            walletType={walletType}
            isLoading={walletLoading}
          />
        </div>
      </header>

      <div className="App-content">
        <div className="App">
          <header className="App-header">
            {walletError && (
              <div className="alert error">{walletError}</div>
            )}

            {activeTab === 'settings' && currentIsConnected && (
              <div className="card wallet-card">
                <div className="wallet-info">
                  <div className="wallet-status">
                    <div className="wallet-item">
                      <span className="label">Wallet Type:</span>
                      <span className="wallet-type">
                        {walletType === 'dynamic' ? 'Dynamic Wallet' : 'Linera Wallet'}
                      </span>
                    </div>
                    {currentAccount && (
                      <div className="wallet-item">
                        <span className="label">Wallet Address:</span>
                        <span 
                          className="address-simple"
                          onClick={(e) => copyToClipboard(currentAccount, e)}
                          title="Click to copy wallet address"
                        >
                          {isMobile ? `${currentAccount.slice(0, 8)}...${currentAccount.slice(-6)}` : currentAccount}
                        </span>
                      </div>
                    )}
                    {connectedWalletChainId && (
                      <div className="wallet-item">
                        <span className="label">Wallet Chain:</span>
                        <span 
                          className="address-simple"
                          onClick={(e) => copyToClipboard(connectedWalletChainId, e)}
                          title="Click to copy wallet chain"
                        >
                          {isMobile ? `${connectedWalletChainId.slice(0, 8)}...${connectedWalletChainId.slice(-6)}` : connectedWalletChainId}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {connectionError && <div className="alert error">{connectionError}</div>}
            {gmOps.queryError && (
              <div className="alert error">
                Error: {gmOps.queryError.message}
                {queryRetryCount < 3 && <span> (Retrying... {queryRetryCount}/3)</span>}
              </div>
            )}

            {activeTab === 'settings' && (
              <div className="card theme-settings-card">
                <div className="theme-settings-content">
                  <div className="theme-option">
                    <div className="theme-info">
                      <h4>Dark Mode</h4>
                      <p>Toggle between light and dark theme</p>
                    </div>
                    <div className="theme-toggle-container">
                      <button 
                        className={`theme-toggle-btn ${isDarkMode ? 'active' : ''}`}
                        onClick={() => setIsDarkMode(!isDarkMode)}
                      >
                        <span className="toggle-slider"></span>
                        <span className="toggle-icon">{isDarkMode ? "🌙" : "☀️"}</span>
                      </button>
                      <span className="toggle-label">{isDarkMode ? "Dark" : "Light"}</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'messages' && (
              <>
                {gmOps.loading && !gmOps.data && <div className="loading">Loading statistics...</div>}
                <div className="card stats-card">                  
                  <div className="stats-panel">
                    <div className="stats-left">
                      <div className="stats-grid">
                        <div className="stat-item">
                          <div className="stat-value">{gmOps.data?.totalMessages || (gmOps.loading ? '***' : 'No data')}</div>
                          <div className="stat-label">Total GMIC</div>
                        </div>
                        <div className="stat-item">
                          <div className="stat-value">
                            {currentIsConnected && gmOps.isValidAccountOwner(currentAccount) ? (
                              gmOps.walletMessagesData?.walletMessages !== undefined && gmOps.walletMessagesData?.walletMessages !== null ? gmOps.walletMessagesData.walletMessages : '0'
                            ) : (
                              <span className="connect-wallet-prompt">？</span>
                            )}
                          </div>
                          <div className="stat-label">Your GMIC</div>
                        </div>
                      </div>
                    </div>
                    <div className="stats-right">
                      {currentIsConnected && gmOps.isValidAccountOwner(currentAccount) ? (
                        
                        <>
                          
                          {gmOps.cooldownCheckData?.checkCooldown ? (
                            <div className="cooldown-status">
                              <div className="cooldown-title">24-HOUR LIMIT</div>
                              
                              {localCooldownEnabled && gmOps.cooldownCheckData.checkCooldown.inCooldown ? (
                                <div className="cooldown-active">
                                  <div className="cooldown-timer">
                                    <span className="cooldown-label">NEXT GMIC IN:</span>
                                    <span className="cooldown-time">
                                      {gmOps.formatCooldown(gmOps.cooldownCheckData.checkCooldown.remainingTime)}
                                    </span>
                                  </div>
                                  <div className="cooldown-note">24-hour cooldown active</div>
                                </div>
                              ) : (
                                <div className="cooldown-ready">
                                  <div className="ready-icon">✓</div>
                                  <div className="ready-text">Ready to send</div>
                                  <div className="cooldown-note">
                                    {localCooldownEnabled ? 'Cooldown Disabled' : 'Cooldown Enabled'}
                                  </div>
                                </div>
                              )}
                            </div>
                          ) : (
                            
                            <>
                              {localCooldownEnabled && cooldownRemaining > 0 ? (
                                <div className="next-gm-countdown">
                                  <div className="countdown-title">NEXT GMIC IN</div>
                                  <div className="countdown-timer">
                                    <span className="countdown-hours">{countdown.hours}</span>h
                                    <span className="countdown-minutes"> {countdown.minutes}</span>m
                                    <span className="countdown-seconds"> {countdown.seconds}</span>s
                                  </div>
                                </div>
                              ) : (
                                <div className="next-gm-ready">
                                  <div className="ready-title">READY TO SEND</div>
                                  <div className="ready-subtitle">Next GMIC Available</div>
                                </div>
                              )}
                            </>
                          )}
                        </>
                      ) : (
                        
                        <div className="next-gm-ready">
                          <div className="connect-wallet-title">24-HOUR LIMIT</div>
                          <div className="connect-wallet-prompt-box">
                          </div>
                          <div className="connect-note">
                            {localCooldownEnabled ? 'Cooldown Disabled' : 'Cooldown Enabled'}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </>
            )}

            
            {gmOps.whitelistData?.isUserWhitelisted && activeTab === 'settings' && (
              <div className="card cooldown-control-card">
                <div className="section-header">
                  <h3>24-Hour Limit Control</h3>
                  <span className="whitelist-badge">Whitelist Only</span>
                </div>
                <div className="cooldown-control-content">
                  <div className="cooldown-status-info">
                    <p className="cooldown-status-text">
                      Current Status: <span className={`status ${gmOps.cooldownStatusData?.getCooldownStatus?.enabled ? 'enabled' : 'disabled'}`}>
                        {gmOps.cooldownStatusData?.getCooldownStatus?.enabled ? 'ENABLED' : 'DISABLED'}
                      </span>
                    </p>
                    <p className="cooldown-description">
                      {gmOps.cooldownStatusData?.getCooldownStatus?.enabled 
                        ? '24-hour cooldown is currently active for all users' 
                        : '24-hour cooldown is currently disabled'
                      }
                    </p>
                  </div>
                  <div className="cooldown-control-actions">
                    <button
                      className={`action-btn ${gmOps.cooldownStatusData?.getCooldownStatus?.enabled ? 'danger' : 'primary'}`}
                      onClick={() => handleToggleCooldown(!gmOps.cooldownStatusData?.getCooldownStatus?.enabled)}
                      disabled={operationStatus === "processing"}
                    >
                      {operationStatus === "processing" ? (
                        <span className="button-loading">
                          <span className="spinner">⏳</span> Updating...
                        </span>
                      ) : gmOps.cooldownStatusData?.getCooldownStatus?.enabled ? (
                        "🔓 Disable 24-Hour Limit"
                      ) : (
                        "🔒 Enable 24-Hour Limit"
                      )}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'settings' && (
              <>
                <div className="card chain-selection-card">
                  <div className="section-header">
                    <h3>Target Chain</h3>
                  </div>
                  <div className="chain-options">
                    {walletType === 'dynamic' ? (
                      <div className="chain-option">
                        <input
                          type="radio"
                          id="contract-chain"
                          name="targetChain"
                          value={chainId}
                          checked={true}
                          disabled={true}
                        />
                        <label htmlFor="contract-chain" className="chain-label">
                          <span className="chain-name">Contract Chain</span>
                          <span className="chain-address">
                            {isMobile ? `${chainId.slice(0, 8)}...${chainId.slice(-6)}` : chainId}
                          </span>
                        </label>
                      </div>
                    ) : (
                      <>
                        {connectedWalletChainId && (
                          <div className="chain-option">
                            <input
                              type="radio"
                              id="wallet-chain"
                              name="targetChain"
                              value={connectedWalletChainId}
                              checked={targetChainId === connectedWalletChainId}
                              onChange={() => {
                                isManualTargetChainChange.current = true;
                                setTargetChainId(connectedWalletChainId);
                              }}
                            />
                            <label htmlFor="wallet-chain" className="chain-label">
                              <span className="chain-name">Wallet Chain</span>
                              <span className="chain-address">
                                {isMobile ? `${connectedWalletChainId.slice(0, 8)}...${connectedWalletChainId.slice(-6)}` : connectedWalletChainId}
                              </span>
                            </label>
                          </div>
                        )}
                        <div className="chain-option">
                          <input
                            type="radio"
                            id="contract-chain"
                            name="targetChain"
                            value={chainId}
                            checked={targetChainId === chainId}
                            onChange={() => {
                              isManualTargetChainChange.current = true;
                              setTargetChainId(chainId);
                            }}
                          />
                          <label htmlFor="contract-chain" className="chain-label">
                            <span className="chain-name">Contract Chain</span>
                            <span className="chain-address">
                              {isMobile ? `${chainId.slice(0, 8)}...${chainId.slice(-6)}` : chainId}
                            </span>
                          </label>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </>
            )}

            {activeTab === 'messages' && (
              <>
                {/* Custom Message Card */}
                <div className="card custom-message-card">
                  <div className="custom-message-header">
                    <label>Custom Message</label>
                    <div className={`toggle-switch ${customMessageEnabled ? 'active' : ''}`} id="customToggle" onClick={handleCustomMessageToggle}>
                      <div className="toggle-switch-thumb"></div>
                    </div>
                  </div>
                  <div className="message-editor" id="messageEditor" style={{display: customMessageEnabled ? 'block' : 'none'}}>
                    <textarea 
                      id="customMessage" 
                      placeholder="Enter your custom GMicrochains message..."
                      value={customMessage}
                      onChange={handleCustomMessageChange}
                    ></textarea>
                    <div className="message-preview" id="messagePreview">
                    Preview: {customMessageEnabled && customMessage ? selectedMessage : 'Custom message feature is not available'}
                  </div>
                  </div>
                </div>

                {/* Send Action Card */}
                <div className="card send-action-card">
                  {/* Recipient Address */}
                  <div className="input-group">
                    <label>Recipient Wallet Address (Optional)</label>
                    <div className="input-wrapper">
                      <input 
                        type="text" 
                        id="recipientAddress" 
                        placeholder="0x..., leave empty to interact with Contract Owner"
                        value={recipientAddress}
                        onChange={(e) => {
                          setRecipientAddress(e.target.value);
                          if (addressValidationError) {
                            setAddressValidationError("");
                          }
                        }}
                        onBlur={() => validateRecipientAddress(recipientAddress)}
                        className={addressValidationError ? 'error' : ''}
                      />
                    </div>
                    {addressValidationError && (
                      <div className="address-validation-error">
                        {addressValidationError}
                      </div>
                    )}
                  </div>

                  <div className="send-actions">
                    {/* Send Button */}
                    <button 
                      className="send-button" 
                      id="sendButton"
                      onClick={recipientAddress ? handleSendGMTo : handleSendGM}
                      disabled={
                        operationStatus === "processing" || 
                        (currentIsConnected && !gmOps.isValidAccountOwner(currentAccount)) || 
                        (currentIsConnected && localCooldownEnabled && cooldownRemaining > 0)
                      }
                    >
                      {operationStatus === "processing" ? (
                        <span className="button-loading">
                          <span className="spinner">⏳</span> Sending...
                        </span>
                      ) : !currentIsConnected ? (
                        "🔒 Connect wallet"
                      ) : !gmOps.isValidAccountOwner(currentAccount) ? (
                        "🔒 Invalid account"
                      ) : localCooldownEnabled && cooldownRemaining > 0 ? (
                        `⏳ ${gmOps.formatCooldown(cooldownRemaining)}`
                      ) : (
                        "Send GMicrochains ✨"
                      )}
                    </button>
                    
                    {/* History Button */}
                    <button 
                      className="history-button" 
                      id="historyButton"
                      onClick={handleHistoryToggle}
                    >
                      History ▼
                    </button>
                    
                    {/* History Dropdown */}
                    {showHistoryDropdown && (
                      <div className="history-dropdown">
                        {historyLoading ? (
                          <div className="history-loading">
                            <span className="spinner">⏳</span> Loading...
                          </div>
                        ) : currentAccount ? (
                          historyRecords.length > 0 ? (
                            <div className="history-list">
                              {historyRecords.map((record, index) => (
                                <div key={index} className="history-item">
                                  <div className="history-sender">
                                    From: {record.sender ? (isMobile ? `${record.sender.slice(0, 6)}...${record.sender.slice(-4)}` : record.sender) : 'Unknown'}
                                  </div>
                                  {record.recipient && (
                                    <div className="history-recipient">
                                      To: {isMobile ? `${record.recipient.slice(0, 6)}...${record.recipient.slice(-4)}` : record.recipient}
                                    </div>
                                  )}
                                  <div className="history-content">
                                    Content: {record.content || 'Gmicrochains'}
                                  </div>
                                  <div className="history-timestamp">
                                    Time: {new Date(record.timestamp / 1000).toLocaleString()}
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="history-empty">
                              No history records
                            </div>
                          )
                        ) : (
                          <div className="history-empty">
                            Please connect your wallet first
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}

        {activeTab === 'leaderboards' && (
          <LeaderboardSection
            showLeaderboard={showLeaderboard}
            setShowLeaderboard={setShowLeaderboard}
            leaderboardData={gmOps.leaderboardData}
            currentAccount={currentAccount}
            isMobile={isMobile}
            copyToClipboard={copyToClipboard}
            refetchLeaderboard={gmOps.refetchLeaderboard}
          />
        )}
       {activeTab === 'messages' && (
          <div className="card invitation-card">
            <div className="section-header">
              <h3>Invitation System</h3>
              <button 
                className="toggle-btn"
                onClick={() => setShowInvitationSection(!showInvitationSection)}
              >
                {showInvitationSection ? "▼" : "▶"}
              </button>
            </div>
            
            {showInvitationSection && (
              <div className="invitation-content">
                {gmOps.invitationStatsData?.getInvitationStats && (
                  <div className="invitation-stats">
                    <p className="stats-item">
                      <span className="label">Invited Users:</span> 
                      <span className="stats-value">{gmOps.invitationStatsData.getInvitationStats.totalInvited}</span>
                    </p>
                    <p className="stats-item">
                      <span className="label">Total Rewards:</span> 
                      <span className="stats-value">{gmOps.invitationStatsData.getInvitationStats.totalRewards}</span>
                    </p>
                  </div>
                )}
                
                <div className="invitation-actions">
                  <button
                    className="action-btn secondary"
                    onClick={handleSendGMWithInvitation}
                    disabled={
                      operationStatus === "processing" ||
                      (currentIsConnected && !gmOps.isValidAccountOwner(currentAccount)) ||
                      (currentIsConnected && !recipientAddress) ||
                      (currentIsConnected && localCooldownEnabled && cooldownRemaining > 0)
                    }
                  >
                    {operationStatus === "processing" ? (
                      <span className="button-loading">
                        <span className="spinner">⏳</span> Sending...
                      </span>
                    ) : localCooldownEnabled && cooldownRemaining > 0 ? (
                      `⏳ ${gmOps.formatCooldown(cooldownRemaining)}`
                    ) : (
                      "🎁 Send with Invitation"
                    )}
                  </button>
                  
                  <button
                    className="action-btn secondary"
                    onClick={handleClaimInvitationRewards}
                    disabled={claimStatus === "processing" || !gmOps.isValidAccountOwner(currentAccount)}
                  >
                    {claimStatus === "processing" ? (
                      <span className="button-loading">
                        <span className="spinner">⏳</span> Claiming...
                      </span>
                    ) : (
                      "💰 Claim Rewards"
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
        <div className="card chain-info-card">
            <div className="chain-info">
              <p><span className="label">Contract Address:</span> 
                <span 
                  className="address-simple" 
                  onClick={(e) => copyToClipboard(appId, e)}
                  title="Click to copy contract address"
                >
                  {isMobile ? `${appId.slice(0, 8)}...${appId.slice(-6)}` : appId}
                </span>
              </p>
              <p><span className="label">Contract Chain:</span> 
                <span 
                  className="address-simple"
                  onClick={(e) => copyToClipboard(chainId, e)}
                  title="Click to copy contract chain"
                >
                  {isMobile ? `${chainId.slice(0, 8)}...${chainId.slice(-6)}` : chainId}
                </span>
              </p>
              <p><span className="label">Contract Owner:</span> 
                <span 
                  className="address-simple"
                  onClick={(e) => copyToClipboard(gmOps.formatAccountOwner(ownerId), e)}
                  title="Click to copy contract owner"
                >
                  {isMobile ? `${gmOps.formatAccountOwner(ownerId).slice(0, 8)}...${gmOps.formatAccountOwner(ownerId).slice(-6)}` : gmOps.formatAccountOwner(ownerId)}
                </span>
              </p>
            </div>
          </div>


      </header>
    </div>
  </div>
  
  {/* Notification Center */}
  <NotificationCenter 
    notifications={notifications}
    onRemoveNotification={removeNotification}
    gmRecords={gmRecords}
    currentAccount={currentAccount}
    gmOperations={gmOps}
    chainId={chainId}
  />
</ErrorBoundary>
  );
}

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { 
      hasError: false,
      error: null,
      errorInfo: null
    };
  }

  static getDerivedStateFromError(error) {
    return { 
      hasError: true,
      error: error
    };
  }

  componentDidCatch(error, errorInfo) {
    this.setState({
      error: error,
      errorInfo: errorInfo
    });
  }

  render() {
    if (this.state.hasError) {
      const userLang = navigator.language || navigator.userLanguage;
      const isEnglish = userLang.startsWith('en');
      
      return (
        <div className="error-fallback">
          <div className="error-container">
            <h2 className="error-title">
              Application Error
            </h2>
            <p className="error-message">
              Sorry, the application encountered an error:
            </p>
            <div className="error-details">
              {this.state.error && (
                <div className="error-text">
                  {this.state.error.toString()}
                </div>
              )}
              {this.state.errorInfo && (
                <details className="error-stack">
                  <summary>
                    Error Details
                  </summary>
                  <pre>{this.state.errorInfo.componentStack}</pre>
                </details>
              )}
            </div>
            <p className="error-suggestion">
              Please refresh the page to try again, or check if the URL parameters are correct.
            </p>
            <button 
              className="error-retry-button"
              onClick={() => window.location.reload()}
            >
              Refresh Page
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default App;
