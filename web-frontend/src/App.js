import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useWallet, WalletConnector } from './WalletProvider';
import { DynamicConnectButton, useDynamicContext } from '@dynamic-labs/sdk-react-core';
import "./App.css";
import GMOperations, { useGMAdditionalData } from './GMOperations';
import NotificationCenter from './NotificationCenter';

// 添加全局错误处理器，记录完整的错误堆栈信息
window.onerror = function(message, source, lineno, colno, error) {
  console.error('Global error captured:', {
    message,
    source,
    lineno,
    colno,
    error,
    stack: error ? error.stack : null
  });
  return true;
};

window.onunhandledrejection = function(event) {
  console.error('Global unhandled promise rejection captured:', {
    reason: event.reason,
    stack: event.reason ? event.reason.stack : null,
    promise: event.promise
  });
  return true;
};

const formatAccountOwner = (address) => {
  if (!address) return '';
  const cleanAddress = address.trim();
  if (cleanAddress.startsWith('0x')) {
    return cleanAddress.toLowerCase();
  }
  return `0x${cleanAddress.toLowerCase()}`;
};

const formatAddressForDisplay = (address, isMobile = false, startChars = 6, endChars = 4) => {
  if (!address) return '';
  return isMobile 
    ? `${address.slice(0, startChars)}...${address.slice(-endChars)}`
    : address;
};

const isButtonDisabled = (operationStatus, currentAccount, gmOps, cooldownRemaining = 0, localCooldownEnabled = false) => {
    return operationStatus === "processing" || 
      (currentAccount && !gmOps.isValidAccountOwner(currentAccount)) || 
      (currentAccount && localCooldownEnabled && cooldownRemaining > 0);
  };

  const MAX_MESSAGE_LENGTH = 280;
  const WARNING_THRESHOLD = 250;

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('React component error captured by ErrorBoundary:', {
      error,
      errorInfo,
      stack: errorInfo.componentStack
    });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="error-boundary">
          <h2>Something went wrong.</h2>
          <details style={{ whiteSpace: 'pre-wrap' }}>
            {this.state.error && this.state.error.toString()}
            <br />
            {this.state.errorInfo && this.state.errorInfo.componentStack}
          </details>
          <button onClick={() => this.setState({ hasError: false })}>Try Again</button>
        </div>
      );
    }

    return this.props.children;
  }
}

function App({ chainId, appId, ownerId, inviter, port }) {
  const appRenderCountRef = useRef(0);
  appRenderCountRef.current += 1;
  
  const forceUpdateRef = useRef(0);
  const cooldownRemainingRef = useRef(0);
  const activeTabRef = useRef('unknown');
  
  const pageLoadTime = useRef(0);
  
  // 解析URL参数中的邀请者信息
  const [urlInviter, setUrlInviter] = useState(null);
  
  useEffect(() => {
    // 解析URL参数
    const urlParams = new URLSearchParams(window.location.search);
    const inviterParam = urlParams.get('inviter');
    
    if (inviterParam) {
      const formattedInviter = formatAccountOwner(inviterParam);
      setUrlInviter(formattedInviter);
      console.log('Detected inviter from URL:', formattedInviter);
      localStorage.setItem('urlInviter', formattedInviter); 
      addNotification(`You were invited by: ${formattedInviter.slice(0, 8)}...${formattedInviter.slice(-6)}`, 'info');
    }
    
    const savedPageLoadTime = localStorage.getItem('pageLoadTime');
    if (!savedPageLoadTime) {
      pageLoadTime.current = Date.now();
      localStorage.setItem('pageLoadTime', pageLoadTime.current.toString());
    } else {
      pageLoadTime.current = parseInt(savedPageLoadTime);
    }
    
    pageLoadTimestampRef.current = pageLoadTime.current;
  }, []);
  
  const [connectionError, setConnectionError] = useState("");
  
  let walletState = {};
  try {
    if (typeof useWallet !== 'function') {
      throw new Error('useWallet is not available - WalletProvider may not be properly configured');
    }
    
    walletState = useWallet();
    
    if (!walletState || typeof walletState !== 'object') {
      throw new Error('Invalid wallet state returned from useWallet hook');
    }
    
    if (typeof walletState.connectWallet !== 'function') {
      walletState.connectWallet = () => Promise.reject(new Error('Wallet connection not available'));
    }
    
    if (typeof walletState.disconnectWallet !== 'function') {
      walletState.disconnectWallet = () => Promise.resolve();
    }
    
  } catch (error) {
    walletState = {
      account: null,
      isConnected: false,
      chainId: chainId || null,
      walletChainId: null,
      walletType: null,
      isLoading: false,
      error: error.message || 'Wallet initialization failed',
      connectWallet: () => {
        return Promise.reject(new Error('Wallet is in error state'));
      },
      disconnectWallet: () => {
        return Promise.resolve();
      },
      isValidAccountOwner: () => false,
      formatCooldown: (seconds) => `${Math.floor(seconds / 60)}m ${seconds % 60}s`
    };
    
    setConnectionError(error.message || 'Wallet connection failed');
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
  const [queryRetryCount, setQueryRetryCount] = useState(0);
  const [cooldownRemaining, setCooldownRemaining] = useState(0);
  const [addressValidationError, setAddressValidationError] = useState("");
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);
  const [previousTotalMessages, setPreviousTotalMessages] = useState(null);
  const [forceUpdate, setForceUpdate] = useState(0);
  const [showLeaderboard, setShowLeaderboard] = useState(true);
  const getInitialActiveTab = () => {
    const savedActiveTab = localStorage.getItem('activeTab');
    return savedActiveTab || 'messages';
  };
  const [activeTab, setActiveTab] = useState(getInitialActiveTab());
  const [cooldownStatus, setCooldownStatus] = useState(null);
  const [localCooldownEnabled, setLocalCooldownEnabled] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [gmRecords, setGmRecords] = useState([]);
  const previousEventCountRef = useRef(0);
  const previousLatestTimestampRef = useRef(0);
  const pageLoadTimestampRef = useRef(0);
  const [historyRecords, setHistoryRecords] = useState([]);
  const [showHistoryDropdown, setShowHistoryDropdown] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [customMessageEnabled, setCustomMessageEnabled] = useState(true);
  const [customMessage, setCustomMessage] = useState('');
  const [selectedMessage, setSelectedMessage] = useState('gm');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showShareReferralModal, setShowShareReferralModal] = useState(false);
  const [showInvitedUsersDropdown, setShowInvitedUsersDropdown] = useState(false);
  const [invitedUsersList, setInvitedUsersList] = useState([]);
  const [invitedUsers, setInvitedUsers] = useState([]);
  const [invitedUsersLoading, setInvitedUsersLoading] = useState(false);
  const [windowWidth, setWindowWidth] = useState(typeof window !== 'undefined' ? window.innerWidth : 0);
  const dropdownRef = useRef(null);
  useEffect(() => {
    const handleResize = () => {
      setWindowWidth(window.innerWidth);
    };
    
    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  const formatAddress = (address) => {
 
    const threshold = 768;
    if (windowWidth > threshold) {
      return address; 
    } else {
      return `${address.substring(0, 6)}...${address.substring(address.length - 4)}`; // 小窗口显示短地址
    }
  };

  forceUpdateRef.current = forceUpdate;
  cooldownRemainingRef.current = cooldownRemaining;
  activeTabRef.current = activeTab;
  
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
  
  const handleCustomMessageToggle = useCallback(() => {
    setCustomMessageEnabled(!customMessageEnabled);
    if (!customMessageEnabled) {
      setSelectedMessage(customMessage || 'gm');
    } else {
      setSelectedMessage('gm');
    }
  }, [customMessageEnabled, customMessage]);

  const isMessageContentValid = useCallback((content) => {
    if (content.length > 280) {
      addNotification("Message too long. Maximum 280 characters allowed.", "error");
      return false;
    }
    
    if (content.includes('<script') || content.includes('</script>') || 
       content.includes('<iframe') || content.includes('javascript:')) {
      addNotification("Invalid content. HTML tags and scripts are not allowed.", "error");
      return false;
    }
    
    const sensitiveWords = [
      "spam", "abuse", "hate", "violence", "illegal", "scam", "fraud"
    ];
    
    const contentLower = content.toLowerCase();
    for (const word of sensitiveWords) {
      if (contentLower.includes(word)) {
        addNotification(`Invalid content. Please remove inappropriate words like "${word}".`, "error");
        return false;
      }
    }
    
    return true;
  }, [addNotification]);

  const handleCustomMessageChange = useCallback((e) => {
    const value = e.target.value;
    setCustomMessage(value);
    if (customMessageEnabled) {
      setSelectedMessage(value || 'gm');
      
      if (value && !isMessageContentValid(value)) {
      }
    }
  }, [customMessageEnabled, isMessageContentValid]);
  
  const addEmojiToMessage = useCallback((emoji) => {
    const newMessage = customMessage + emoji;
    if (newMessage.length <= 280) {
      setCustomMessage(newMessage);
      if (customMessageEnabled) {
        setSelectedMessage(newMessage || 'gm');
      }
    } else {
      addNotification("Cannot add emoji. Message would exceed the 280 character limit.", "error");
    }
  }, [customMessage, customMessageEnabled, addNotification]);
  
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (showEmojiPicker && 
          !event.target.closest('.emoji-picker') && 
          !event.target.closest('.emoji-picker-button')) {
        setShowEmojiPicker(false);
      }
    };
    
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showEmojiPicker]);

  const currentAccount = connectedAccount ? formatAccountOwner(connectedAccount) : null;
  const currentChainId = connectedChainId;
  const currentIsConnected = isConnected;

  const memoizedCurrentAccount = useMemo(() => currentAccount, [currentAccount]);
  const memoizedIsMobile = useMemo(() => isMobile, [isMobile]);
  
  const handleToggleShareReferral = useCallback(() => {
    setShowShareReferralModal(!showShareReferralModal);
  }, [showShareReferralModal]);

  const copyReferralLink = useCallback(() => {
    if (!memoizedCurrentAccount) {
      console.error('No account found');
      alert('Please connect your wallet first');
      return;
    }
    const referralLink = `${window.location.origin}?inviter=${memoizedCurrentAccount}`;
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(referralLink)
        .then(() => {
          const btn = document.querySelector('.copy-btn');
          if (btn) {
            const originalText = btn.textContent;
            btn.textContent = 'Copied!';
            btn.style.backgroundColor = '#4CAF50';
            setTimeout(() => {
              btn.textContent = originalText;
              btn.style.backgroundColor = '';
            }, 2000);
          }
          console.log('Referral link copied to clipboard using Clipboard API!');
        })
        .catch(err => {
          console.error('Failed to copy using Clipboard API:', err);
          fallbackCopyTextToClipboard(referralLink);
        });
    } else {
      fallbackCopyTextToClipboard(referralLink);
    }
  }, [memoizedCurrentAccount]);
  
  const fallbackCopyTextToClipboard = useCallback((text) => {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.left = '-999999px';
    textArea.style.top = '-999999px';
    
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    
    try {
      const successful = document.execCommand('copy');
      if (successful) {
        const btn = document.querySelector('.copy-btn');
        if (btn) {
          const originalText = btn.textContent;
          btn.textContent = 'Copied!';
          btn.style.backgroundColor = '#4CAF50';
          setTimeout(() => {
            btn.textContent = originalText;
            btn.style.backgroundColor = '';
          }, 2000);
        }
        console.log('Referral link copied to clipboard using fallback method!');
      } else {
        throw new Error('Copy command failed');
      }
    } catch (err) {
      console.error('Failed to copy using fallback method:', err);
      alert('Failed to copy referral link');
    } finally {
      document.body.removeChild(textArea);
    }
  }, []);
  
  const { primaryWallet, handleLogOut } = useDynamicContext();
  
  const isDynamicConnected = (primaryWallet && primaryWallet.address) || (walletType === 'dynamic' && isConnected);
  const dynamicAccount = isDynamicConnected ? formatAccountOwner(primaryWallet?.address || currentAccount) : null;
  const isActiveDynamicWallet = (isConnected && walletType === 'dynamic' && currentAccount) || (primaryWallet && primaryWallet.address && walletType === 'dynamic');
  
  useEffect(() => {
    if (primaryWallet && primaryWallet.address && !isActiveDynamicWallet) {
      const timer = setTimeout(() => {
        if (primaryWallet && primaryWallet.address && !isActiveDynamicWallet) {
          connectWallet('dynamic');
        }
      }, 500);
      
      return () => clearTimeout(timer);
    }
  }, [primaryWallet, isActiveDynamicWallet, connectWallet]);
  
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
  
  useEffect(() => {
    localStorage.setItem('activeTab', activeTab);
    activeTabRef.current = activeTab;
    
    const saveTimeout = setTimeout(() => {
      const currentSaved = localStorage.getItem('activeTab');
      if (currentSaved !== activeTab) {
        localStorage.setItem('activeTab', activeTab);
      }
    }, 100);
    
    return () => clearTimeout(saveTimeout);
  }, [activeTab]);

  useEffect(() => {
    const checkAndRestoreActiveTab = () => {
      try {
        const saved = localStorage.getItem('activeTab');
        if (saved && saved !== activeTab && ['messages', 'leaderboards', 'settings'].includes(saved)) {
          setActiveTab(saved);
        }
      } catch (error) {
        console.error('[activeTab] Restoration error:', error);
      }
    };

    checkAndRestoreActiveTab();
    
    const handleErrorBoundaryRecovery = () => {
      setTimeout(checkAndRestoreActiveTab, 100);
    };

    window.addEventListener('error', handleErrorBoundaryRecovery);
    window.addEventListener('unhandledrejection', handleErrorBoundaryRecovery);
    
    return () => {
      window.removeEventListener('error', handleErrorBoundaryRecovery);
      window.removeEventListener('unhandledrejection', handleErrorBoundaryRecovery);
    };
  }, [activeTab]);

  useEffect(() => {
    const tabCheckInterval = setInterval(() => {
      try {
        const saved = localStorage.getItem('activeTab');
        const isValidTab = ['messages', 'leaderboards', 'settings'].includes(activeTab);
        const isSavedValid = saved && ['messages', 'leaderboards', 'settings'].includes(saved);
        
        if (!isValidTab && isSavedValid) {
          setActiveTab(saved);
          activeTabRef.current = saved;
        }
      } catch (error) {
        console.warn('[activeTab] Stability check error:', error);
      }
    }, 10000);

    return () => clearInterval(tabCheckInterval);
  }, [activeTab]);
  
  const disconnectDynamicWallet = async (disconnectWalletFn) => {
    try {
      if (handleLogOut) {
        await handleLogOut();
      }
      await disconnectWalletFn();
      
      await new Promise(resolve => setTimeout(resolve, 500));
    } catch (error) {
      throw error;
    }
  };
  
  const WalletConnectionSection = React.memo((props) => {
    const {
      isDynamicConnected,
      isActiveDynamicWallet,
      currentAccount,
      isDynamicLoading,
      currentIsConnected,
      disconnectDynamicWallet,
      addNotification,
      dynamicAccount,
      connectWallet,
      disconnectWallet,
      walletType,
      isLoading,
      primaryWallet
    } = props;
    
    const isLineraConnected = currentIsConnected && walletType === 'linera';
    const lineraAccount = isLineraConnected ? currentAccount : null;
    
    const handleConnectLineraWallet = async () => {
      try {
        if (!window.linera) {
          addNotification("Linera wallet not installed, please visit https://github.com/respeer-ai/linera-wallet to download and install", "warning");
          return;
        }
        if (currentIsConnected && walletType) {
          if (walletType === 'dynamic') {
            await props.disconnectDynamicWallet();
            addNotification('Dynamic wallet disconnected', 'info');
            await new Promise(resolve => setTimeout(resolve, 500));
          } else if (walletType === 'linera') {
            await props.disconnectWallet();
            addNotification('Linera wallet disconnected successfully', 'success');
            return;
          }
        }
        
        await connectWallet('linera');
        addNotification('Linera wallet connected successfully!', 'success');
      } catch (error) {
        addNotification(`Failed to connect Linera wallet: ${error.message}`, 'error');
      }
    };
    
    const handleDisconnectLineraWallet = async () => {
      try {
        await props.disconnectWallet();
        addNotification('Linera wallet disconnected successfully', 'success');
      } catch (error) {
        addNotification(`Failed to disconnect Linera wallet: ${error.message}`, 'error');
      }
    };
    
    const handleConnectDynamicWallet = async () => {
      try {
        if (isDynamicConnected || isActiveDynamicWallet) {
          await props.disconnectDynamicWallet();
          addNotification('Dynamic wallet disconnected successfully', 'success');
          return;
        }
        if (isLineraConnected) {
          await props.disconnectWallet();
          addNotification('Linera wallet disconnected', 'info');
          await new Promise(resolve => setTimeout(resolve, 500));
        }
        if (!isDynamicConnected && !isActiveDynamicWallet) {
          await props.connectWallet('dynamic');
        }
      } catch (error) {
        addNotification(`Failed to handle Dynamic wallet: ${error.message}`, 'error');
      }
    };
    
    const handleDisconnectDynamicWalletClick = async () => {
      try {
        await props.disconnectDynamicWallet();
        addNotification('Dynamic wallet disconnected successfully', 'success');
      } catch (error) {
        addNotification(`Failed to disconnect Dynamic wallet: ${error.message}`, 'error');
      }
    };
    
    return (
      <div className="wallet-connection-section">
        <div className="wallet-button-container">
          {isLineraConnected ? (
            <div 
              className="wallet-info-card linera clickable"
              onClick={handleDisconnectLineraWallet}
              title="Click to disconnect Linera wallet"
            >
              <div className="wallet-address">
                <span className="status-dot"></span>
                {lineraAccount ? `${lineraAccount.slice(0, 6)}...${lineraAccount.slice(-4)}` : 
                 currentAccount ? `${currentAccount.slice(0, 6)}...${currentAccount.slice(-4)}` : 'Connected'}
              </div>
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
          {(currentIsConnected && walletType === 'dynamic') || (primaryWallet && primaryWallet.address) || isDynamicConnected || isActiveDynamicWallet ? (
            <div 
              className="wallet-info-card dynamic clickable"
              onClick={handleDisconnectDynamicWalletClick}
              title="Click to disconnect Dynamic wallet"
            >
              <div className="wallet-address">
                <span className="status-dot"></span>
                {primaryWallet?.address ? `${formatAccountOwner(primaryWallet.address).slice(0, 6)}...${formatAccountOwner(primaryWallet.address).slice(-4)}` : 
                 (currentAccount && (walletType === 'dynamic' || isDynamicConnected || isActiveDynamicWallet)) ? `${currentAccount.slice(0, 6)}...${currentAccount.slice(-4)}` : 
                 'Connected'}
              </div>
            </div>
          ) : (
            <div className="wallet-connect-card">
              <DynamicConnectButton>
                <button 
                  className="connect-btn dynamic"
                >
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
    invitationLeaderboardData,
    currentAccount,
    isMobile,
    copyToClipboard,
    refetchLeaderboard,
    refetchInvitationLeaderboard,
    onTabChange
  }) => {
    const renderCountRef = useRef(0);
    renderCountRef.current += 1;
    
    const getCallStack = () => {
      try {
        const stack = new Error().stack;
        const stackLines = stack.split('\n').slice(3, 8);
        return stackLines.map(line => line.trim()).join(' <- ');
      } catch (e) {
        return 'Stack trace unavailable';
      }
    };
    
    const propsChanged = {};
    if (renderCountRef.current > 1) {
      propsChanged.showLeaderboard = showLeaderboard !== undefined;
      propsChanged.leaderboardData = leaderboardData !== undefined;
      propsChanged.currentAccount = currentAccount !== undefined;
      propsChanged.isMobile = isMobile !== undefined;
    }
    
    const hasFetchedRef = useRef(false);
    
    useEffect(() => {
      return () => {
      };
    }, []);
    
    const mountTimeRef = useRef(Date.now());

    const gmLeaderboardItems = useMemo(() => {
      if (!leaderboardData?.getTopUsers || leaderboardData.getTopUsers.length === 0) {
        return null;
      }
      
      return leaderboardData.getTopUsers.map((entry, index) => (
        <tr key={`${entry.user}-${index}`} className={entry.user === currentAccount ? "current-user" : ""}>
          <td>{index + 1}</td>
          <td>
            <span 
              className="address-simple" 
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                copyToClipboard(entry.user, e);
              }}
            >
              {isMobile ? `${entry.user.slice(0, 6)}...${entry.user.slice(-4)}` : entry.user}
            </span>
          </td>
          <td>{entry.count}</td>
        </tr>
      ));
    }, [leaderboardData?.getTopUsers, currentAccount, isMobile, copyToClipboard]);
    
    const invitationLeaderboardItems = useMemo(() => {
      if (!invitationLeaderboardData?.getTopInvitors || invitationLeaderboardData.getTopInvitors.length === 0) {
        return null;
      }
      
      return invitationLeaderboardData.getTopInvitors.map((entry, index) => (
        <tr key={`${entry.user}-${index}`} className={entry.user === currentAccount ? "current-user" : ""}>
          <td>{index + 1}</td>
          <td>
            <span 
              className="address-simple" 
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                copyToClipboard(entry.user, e);
              }}
            >
              {isMobile ? `${entry.user.slice(0, 6)}...${entry.user.slice(-4)}` : entry.user}
            </span>
          </td>
          <td>{entry.count}</td>
        </tr>
      ));
    }, [invitationLeaderboardData?.getTopInvitors, currentAccount, isMobile, copyToClipboard]);

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
            <div className="leaderboard-tabs">
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
              {gmLeaderboardItems ? (
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
                      {gmLeaderboardItems}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="no-leaderboard-data">
                  <p>No leaderboard data available yet.</p>
                </div>
              )}
            </div>
            
            <div className="leaderboard-tabs invitation-leaderboard-tab">
              <div className="stats-header">
                <h4>Top Invitors</h4>
                <button 
                  className="refresh-btn"
                  onClick={() => {
                    refetchInvitationLeaderboard && refetchInvitationLeaderboard();
                  }}
                  title="Refresh invitation leaderboard"
                >
                  🔄 Refresh
                </button>
              </div>
              {invitationLeaderboardItems ? (
                <div className="leaderboard-list">
                  <table className="leaderboard-table">
                    <thead>
                      <tr>
                        <th>Rank</th>
                        <th>User</th>
                        <th>Points</th>
                      </tr>
                    </thead>
                    <tbody>
                      {invitationLeaderboardItems}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="no-leaderboard-data">
                  <p>No invitation leaderboard data available yet.</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }, (prevProps, nextProps) => {
    const leaderboardDataChanged = 
      prevProps.leaderboardData?.getTopUsers?.length !== nextProps.leaderboardData?.getTopUsers?.length ||
      JSON.stringify(prevProps.leaderboardData?.getTopUsers) !== JSON.stringify(nextProps.leaderboardData?.getTopUsers);
    
    const showLeaderboardChanged = prevProps.showLeaderboard !== nextProps.showLeaderboard;
    const currentAccountChanged = prevProps.currentAccount !== nextProps.currentAccount;
    const isMobileChanged = prevProps.isMobile !== nextProps.isMobile;
    const invitationLeaderboardDataChanged = 
      prevProps.invitationLeaderboardData?.getTopInvitors?.length !== nextProps.invitationLeaderboardData?.getTopInvitors?.length ||
      JSON.stringify(prevProps.invitationLeaderboardData?.getTopInvitors) !== JSON.stringify(nextProps.invitationLeaderboardData?.getTopInvitors);
    
    if (leaderboardDataChanged || invitationLeaderboardDataChanged || showLeaderboardChanged || currentAccountChanged || isMobileChanged) {
      return false;
    }
    
    return true;
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
  
  const memoizedSetShowLeaderboard = useCallback((value) => {
    setShowLeaderboard(value);
  }, []);

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
        gmOps.refetchInvitationStats && gmOps.refetchInvitationStats();
        
        if (mutationType === 'sendGM') {
          previousEventCountRef.current = 0;
          gmOps.refetchStreamEvents && gmOps.refetchStreamEvents();
        }
      }
      
      if (additionalData) {
        additionalData.refetchGmRecord && additionalData.refetchGmRecord();
      }
    }, 1000);
  }, [addNotification]);
  
  const additionalData = useGMAdditionalData({
    chainId,
    currentAccount,
    currentChainId: connectedWalletChainId,
    walletType,
    queryRetryCount,
    setQueryRetryCount
  });

  const shareModalAdditionalData = useGMAdditionalData({
    chainId,
    currentAccount,
    currentChainId: connectedWalletChainId,
    walletType,
    queryRetryCount,
    setQueryRetryCount
  });

  const memoizedLeaderboardData = useMemo(() => additionalData.leaderboardData, [additionalData.leaderboardData]);

  useEffect(() => {
    if (activeTab === 'leaderboards') {
      if (additionalData.refetchLeaderboard) {
        additionalData.refetchLeaderboard();
      }
      if (additionalData.refetchInvitationLeaderboard) {
        additionalData.refetchInvitationLeaderboard();
      }
    }
  }, [activeTab, additionalData.refetchLeaderboard, additionalData.refetchInvitationLeaderboard]);


  const gmOperationsResult = GMOperations({
    chainId,
    currentAccount,
    currentChainId: connectedWalletChainId,
    targetChainId,
    appId,
    ownerId,
    addNotification,
    setMessage,
    setOperationStatus,
    setClaimStatus,
    onMutationComplete: handleMutationComplete,
    onMutationError: (error) => {
      console.error('Mutation error:', error);
      setOperationStatus("error");
      setTimeout(() => setOperationStatus(null), 5000);
      addNotification(`Operation failed: ${error.message}`, "error");
    },
    inviter,
    queryRetryCount,
    setQueryRetryCount
  }) || {};
  const gmOps = {
    walletMessagesData: { walletMessages: 0 },
    subscriptionStatus: {},
    streamEventsData: [],
    gmEventsData: {},
    loading: false,
    error: null,
    data: { totalMessages: 0 },
    queryError: null,
    invitationStatsData: {
      totalInvited: 0,
      totalRewards: 0,
      lastRewardTime: null
    },
    refetchInvitationRewards: () => Promise.resolve({}),
    refetchLeaderboard: () => Promise.resolve({}),
    refetchGmEvents: () => Promise.resolve({}),
    refetchWalletMessages: () => Promise.resolve({}),
    refetchInvitationStats: () => Promise.resolve({}),
    refetchStreamEvents: () => Promise.resolve({}),
    handleSendGM: () => Promise.resolve({}),
    handleSendGMToWithAddress: () => Promise.resolve({}),
    handleSendGMWithInvitation: () => Promise.resolve({}),
    handleClaimInvitationRewards: () => Promise.resolve({}),
    handleSetCooldownEnabled: () => Promise.resolve({}),
    isValidAccountOwner: () => false,
    formatCooldown: (seconds) => `${Math.floor(seconds / 60)}m ${seconds % 60}s`,
    validateRecipientAddress: () => ({ isValid: false, error: '' }),
    formatAccountOwner: (address) => address || '',
    ...gmOperationsResult
  };
  useEffect(() => {
    if (showShareReferralModal && memoizedCurrentAccount && shareModalAdditionalData?.refetchInvitationStats) {
      shareModalAdditionalData.refetchInvitationStats();
    }
  }, [showShareReferralModal]);

  const handleHistoryToggle = useCallback(async () => {
    if (showHistoryDropdown) {
      setShowHistoryDropdown(false);
      return;
    }
    
    if (!currentAccount) {
      setShowHistoryDropdown(true);
      return;
    }
    
    try {
      setHistoryLoading(true);
      const { data } = await gmOps.refetchGmEvents();
      
      if (data && data.getGmEvents) {
        const sortedRecords = [...data.getGmEvents].sort((a, b) => 
          parseInt(b.timestamp) - parseInt(a.timestamp)
        );
        
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
  
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (showHistoryDropdown && 
          !event.target.closest('.send-action-card') && 
          !event.target.closest('.history-button') &&
          !event.target.closest('.history-dropdown')) {
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
      await gmOps.handleSetCooldownEnabled(enabled);
      const statusResult = await (additionalData?.refetchCooldownStatus && additionalData.refetchCooldownStatus());
      const remoteEnabled = statusResult?.data?.getCooldownStatus?.enabled;
      if (typeof remoteEnabled === 'boolean') {
        setLocalCooldownEnabled(remoteEnabled);
      } else {
        setLocalCooldownEnabled(enabled);
      }
      await (additionalData?.refetchCooldownCheck && additionalData.refetchCooldownCheck());
      setOperationStatus("success");
      setTimeout(() => setOperationStatus(null), 3000);
    } catch (error) {
      addNotification(
        `Failed to ${enabled ? 'enable' : 'disable'} 24-hour limit: ${error.message}`,
        "error"
      );
      setOperationStatus("error");
    }
  }, [currentAccount, setMessage, addNotification]);



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
      const syncCooldownStatus = () => {
        if (additionalData?.refetchCooldownStatus) {
          additionalData.refetchCooldownStatus().then((res) => {
            const currentCooldownStatus = res?.data?.getCooldownStatus?.enabled ?? additionalData.cooldownStatusData?.getCooldownStatus?.enabled;
            if (typeof currentCooldownStatus === 'boolean') {
              setLocalCooldownEnabled(currentCooldownStatus);
              console.log('Syncing 24-hour limit status:', currentCooldownStatus ? 'ENABLED' : 'DISABLED');
            }
          }).catch(error => {
            console.warn('Failed to sync 24-hour limit status (non-critical):', error.message);
            const cachedCooldownStatus = additionalData.cooldownStatusData?.getCooldownStatus?.enabled;
            if (typeof cachedCooldownStatus === 'boolean') {
              setLocalCooldownEnabled(cachedCooldownStatus);
            }
          });
        }
      };

      syncCooldownStatus();
    }
  }, [currentAccount, currentChainId]);

  useEffect(() => {
    const handleUpdateInvitedUsers = (event) => {
      const { invitedUsers } = event.detail;
      setInvitedUsers(invitedUsers);
      setInvitedUsersLoading(false);
    };

    const handleToggleDropdown = () => {
      setInvitedUsersLoading(true);
    };

    window.addEventListener('updateInvitedUsersDropdown', handleUpdateInvitedUsers);
    window.addEventListener('toggleInvitedUsersDropdown', handleToggleDropdown);
    
      const handleClickOutsideDropdown = (event) => {
      const dropdownContainer = document.querySelector('.dropdown-container');
      if (dropdownContainer && !dropdownContainer.contains(event.target)) {
        setShowInvitedUsersDropdown(false);
      }
    };

    document.addEventListener('click', handleClickOutsideDropdown);

    return () => {
      window.removeEventListener('updateInvitedUsersDropdown', handleUpdateInvitedUsers);
      window.removeEventListener('toggleInvitedUsersDropdown', handleToggleDropdown);
      document.removeEventListener('click', handleClickOutsideDropdown);
    };
  }, []);

  const processedEventsRef = useRef(new Set());
  const isFirstLoadRef = useRef(true);
  
  useEffect(() => {
    const streamEvents = gmOps.streamEventsData || [];
    const gmEvents = gmOps.gmEventsData || [];

    const allEvents = streamEvents;
    
    if (allEvents.length > 0) {
      const eventIds = allEvents.map(event => 
        `${event.sender}-${event.recipient}-${event.timestamp}`
      );
      
      if (isFirstLoadRef.current) {
        isFirstLoadRef.current = false;
        
        eventIds.forEach(eventId => {
          processedEventsRef.current.add(eventId);
        });
        
        setGmRecords([]);
      } else {
        const newEvents = allEvents.filter((event, index) => {
          const eventId = eventIds[index];
          const isProcessed = processedEventsRef.current.has(eventId);
          
          return !isProcessed;
        });
        
        if (newEvents.length > 0) {
          newEvents.forEach((event, index) => {
            const eventIndex = allEvents.indexOf(event);
            const eventId = eventIds[eventIndex];
            processedEventsRef.current.add(eventId);
          });
          
          const newRecords = newEvents.map(event => ({
            sender: event.sender,
            recipient: event.recipient,
            timestamp: event.timestamp,
            content: event.content || 'Gmicrochains'
          }));
          
          setGmRecords(prev => {
            const existingTimestamps = new Set(prev.map(r => r.timestamp));
            const filteredNewRecords = newRecords.filter(r => !existingTimestamps.has(r.timestamp));
            
            if (filteredNewRecords.length > 0) {
              return [...prev, ...filteredNewRecords];
            } else {
              return prev;
            }
          });
        }
      }
    }
  }, [gmOps.streamEventsData, gmRecords.length]);

  useEffect(() => {
    if (gmOps.subscriptionStatus?.gmEvents?.lastUpdate) {
      const refreshTimeout = setTimeout(() => {
        console.groupCollapsed('[cause] subscription-update');
        if (gmOps.refetchGmEvents) {
          gmOps.refetchGmEvents();
        }
        console.groupEnd();
      }, 30000);
      
      return () => clearTimeout(refreshTimeout);
    }
  }, [gmOps.subscriptionStatus?.gmEvents?.lastUpdate, gmOps.refetchGmEvents]);

  useEffect(() => {
    if (gmOps.subscriptionStatus?.gmEvents?.lastUpdate) {
      const refreshTimeout = setTimeout(() => {
        console.groupCollapsed('[cause] subscription-event-received');
        if (additionalData.refetchCooldownStatus) {
          additionalData.refetchCooldownStatus({
            fetchPolicy: 'network-only',
            nextFetchPolicy: 'cache-first'
          });
        }
        if (additionalData.refetchGmRecord) {
          additionalData.refetchGmRecord({
            fetchPolicy: 'network-only',
            nextFetchPolicy: 'cache-and-network'
          });
        }
        console.groupEnd();
      }, 1000);
      
      return () => clearTimeout(refreshTimeout);
    }
  }, [gmOps.subscriptionStatus?.gmEvents?.lastUpdate, additionalData.refetchCooldownStatus, additionalData.refetchGmRecord]);

  const [lastProcessedSubscriptionTime, setLastProcessedSubscriptionTime] = useState(null);
  
  useEffect(() => {
    const isCooldownEnabled = additionalData.cooldownStatusData?.getCooldownStatus?.enabled;
    setLocalCooldownEnabled(!!isCooldownEnabled);
  }, [additionalData.cooldownStatusData]);
  
  useEffect(() => {
    const COOLDOWN_MS = 86_400_000;
    
    const isCooldownEnabled = additionalData.cooldownStatusData?.getCooldownStatus?.enabled;
    const hasValidTimestamp = additionalData.gmRecordData?.getGmRecord?.timestamp;
    
    if (isCooldownEnabled && hasValidTimestamp) {
      const timestamp = Number(additionalData.gmRecordData.getGmRecord.timestamp);
      let lastGm;
      if (timestamp > 1e12) {
        lastGm = timestamp / 1000;
      } else if (timestamp > 1e9) {
        lastGm = timestamp * 1000;
      } else {
        lastGm = timestamp;
      }
      
      const currentTs = Date.now();
      if (currentTs < lastGm + COOLDOWN_MS) {
        setCooldownRemaining(lastGm + COOLDOWN_MS - currentTs);
      } else {
        setCooldownRemaining(0);
      }
    } else {
      setCooldownRemaining(0);
    }
  }, [additionalData.gmRecordData, additionalData.cooldownStatusData]);

  const isManualTargetChainChange = useRef(false);
  
  useEffect(() => {
    if (targetChainId && isManualTargetChainChange.current) {
      localStorage.setItem('targetChainId', targetChainId);
      isManualTargetChainChange.current = false;
    }
  }, [targetChainId]);



  const countdown = gmOps.formatCooldown(cooldownRemaining, true);

  const handleSendGMWithInvitation = useCallback(() => {
    const content = customMessageEnabled ? customMessage : "Gmicrochains";
    const inviter = urlInviter; // 获取解析到的邀请者地址
    gmOps.handleSendGMWithInvitation(content, inviter); // 传递inviter参数
  }, [gmOps, customMessageEnabled, customMessage, urlInviter]);

  const handleClaimInvitationRewards = useCallback(() => {
    gmOps.handleClaimInvitationRewards();
  }, [gmOps]);

  const handleSendGM = useCallback(async () => {
    if (!currentIsConnected) {
      if (window.linera) {
        connectWallet('linera');
        addNotification('Connecting Linera wallet...', 'info');
      } else {
        addNotification('Please connect your wallet first using the wallet connection buttons above', 'info');
        const walletSection = document.querySelector('.wallet-connection-section');
        if (walletSection) {
          walletSection.scrollIntoView({ behavior: 'smooth' });
        }
      }
      return;
    }
    
    let formattedRecipient = null;
    if (recipientAddress && recipientAddress.trim() !== '') {
      formattedRecipient = gmOps.formatAccountOwner(recipientAddress);
      const validation = gmOps.validateRecipientAddress(formattedRecipient);
      if (!validation.isValid) {
        setAddressValidationError(validation.error);
        return;
      }
    }
    
    const messageContent = customMessageEnabled ? customMessage : null;
    await gmOps.handleSendGM(messageContent, formattedRecipient, urlInviter);
    
    setTimeout(() => {
      if (additionalData.refetchCooldownStatus) {
        additionalData.refetchCooldownStatus();
      }
      if (additionalData.refetchGmRecord) {
        additionalData.refetchGmRecord();
      }
      if (additionalData.refetchCooldownCheck) {
        additionalData.refetchCooldownCheck();
      }
      if (gmOps.refetchWalletMessages) {
        gmOps.refetchWalletMessages();
      }
    }, 1000);
  }, [currentIsConnected, connectWallet, gmOps, addNotification, customMessageEnabled, customMessage, additionalData, recipientAddress, setAddressValidationError, urlInviter]);

  return (
    <ErrorBoundary>
      <div>

        <button 
          className="referral-floating-btn"
          onClick={handleToggleShareReferral}
          title="Share your referral link"
        >
          🔗 Share Referral
        </button>
        {showShareReferralModal && (
          <div className="modal-overlay" onClick={handleToggleShareReferral}>
            <div className="referral-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Share Your Referral Link ✨</h3>
              <button className="modal-close" onClick={handleToggleShareReferral}>×</button>
            </div>
            <div className="modal-content">
              {memoizedCurrentAccount && (
                <>
                  <div className="referral-stats">
                    <button 
                      className="refresh-btn" 
                      onClick={() => shareModalAdditionalData?.refetchInvitationStats && shareModalAdditionalData.refetchInvitationStats()}
                      title="Refresh invitation stats"
                    >
                      🔄 Refresh
                    </button>
                <div className="referral-stat-item">
                  <div className="dropdown-container">
                    <div 
                      className="referral-stat-label dropdown-toggle"
                      onClick={() => {
                        if (!shareModalAdditionalData?.invitationStatsData?.totalInvited || !currentAccount) return;
                        const event = new CustomEvent('toggleInvitedUsersDropdown', {
                          detail: { userId: currentAccount }
                        });
                        window.dispatchEvent(event);
                        setShowInvitedUsersDropdown(!showInvitedUsersDropdown);
                      }}
                      style={{ cursor: shareModalAdditionalData?.invitationStatsData?.totalInvited > 0 ? 'pointer' : 'default' }}
                    >
                      Invited Users: {showInvitedUsersDropdown ? '▲' : '▼'}
                    </div>
                    <span className="referral-stat-value">{(() => {
                      try {
                        return Number(shareModalAdditionalData?.invitationStatsData?.totalInvited) || 0;
                      } catch (error) {
                        return 0;
                      }
                    })()}</span>
                    <div className={`invited-users-dropdown ${showInvitedUsersDropdown ? 'show' : ''}`}>
            {invitedUsersLoading ? (
              <div className="invitation-loading">Loading...</div>
            ) : invitedUsers.length > 0 ? (
              <div className="invitation-list">
                {invitedUsers.map((user, index) => (
                    <div key={index} className="invitation-item">
                      <div className="invitation-sender">
                          {formatAddress(user.invitee)}
                      </div>
                    </div>
                  ))}
              </div>
            ) : (
              <div className="invitation-empty">No invited users found</div>
            )}
          </div>
                  </div>
                </div>
                <div className="referral-stat-item">
                  <span className="referral-stat-label">Your Reward Points:</span>
                  <span className="referral-stat-value">{(() => {
                    try {
                      return Number(shareModalAdditionalData?.invitationStatsData?.totalRewards) || 0;
                    } catch (error) {
                      return 0;
                    }
                  })()}</span>
                </div>
                {(() => {
                  try {
                    const lastRewardTime = shareModalAdditionalData?.invitationStatsData?.lastRewardTime;
                    return lastRewardTime ? (
                      <div className="referral-stat-item">
                        <span className="referral-stat-label">Last Reward:</span>
                        <span className="referral-stat-value">{new Date(Number(lastRewardTime) / 1000).toLocaleString()}</span>
                      </div>
                    ) : null;
                  } catch (error) {
                    return null;
                  }
                })()}
                </div>
                <div className="referral-link-section">
                    <label>Your Referral Link:</label>
                    <div className="link-container">
                      <input 
                        type="text" 
                        value={`${window.location.origin}?inviter=${memoizedCurrentAccount}`}
                        readOnly
                        className="referral-link-input"
                      />
                      <button onClick={copyReferralLink} className="copy-btn">Copy</button>
                    </div>
                  </div>
                  <div className="share-options">
                    <p className="share-label">Share directly:</p>
                    <div className="social-buttons">
                      <a 
                        href={`https://twitter.com/intent/tweet?text=Join%20GMicrochains%20and%20use%20my%20referral%20link!&url=${encodeURIComponent(window.location.origin + '?inviter=' + memoizedCurrentAccount)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="social-btn twitter"
                      >
                        Twitter
                      </a>
                      <a 
                        href={`https://t.me/share/url?url=${encodeURIComponent(window.location.origin + '?inviter=' + memoizedCurrentAccount)}&text=Join%20GMicrochains%20and%20use%20my%20referral%20link!`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="social-btn telegram"
                      >
                        Telegram
                      </a>
                    </div>
                  </div>
                  <div className="referral-rewards-info">
                    <p>Invite a user to send their first GMIC → 30 points</p>
                    <p>Each GMIC they send after → +10 points</p>
                  </div>
                </>
              )}
              {!memoizedCurrentAccount && (
                <div className="no-wallet-message">
                  <p>Please connect your wallet to access your referral link</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
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
              onClick={() => {
                setActiveTab('leaderboards');
                setShowLeaderboard(true);
                setTimeout(() => {
                  const shouldRefetch = (
                    !additionalData.leaderboardData?.getTopUsers || 
                    additionalData.leaderboardData.getTopUsers.length === 0 ||
                    (additionalData.leaderboardData && !additionalData.leaderboardData.getTopUsers) ||
                    additionalData.leaderboardError
                  );
                  
                  if (shouldRefetch && additionalData.refetchLeaderboard) {
                    additionalData.refetchLeaderboard();
                  }
                  if (additionalData.refetchInvitationLeaderboard) {
                    additionalData.refetchInvitationLeaderboard();
                  }
                }, 0);
              }}
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
            disconnectDynamicWallet={() => disconnectDynamicWallet(disconnectWallet)}
            addNotification={addNotification}
            dynamicAccount={dynamicAccount}
            connectWallet={connectWallet}
            disconnectWallet={disconnectWallet}
            walletType={walletType}
            isLoading={walletLoading}
            primaryWallet={primaryWallet}
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
            {gmOps.queryError && !gmOps.queryError.message.includes('Failed to parse') && (
              <div className="alert error">
                Error: {gmOps.queryError.message}
                {queryRetryCount < 3 && <span> (Retrying... {queryRetryCount}/3)</span>}
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
                  </div>

                  <div className="cooldown-timer-container">
                    <div className="cooldown-timer-header">
                      <div className="cooldown-timer-label">Cooldown Timer</div>
                      <div className="cooldown-timer-status" data-status={localCooldownEnabled ? 'enabled' : 'disabled'}>
                        {localCooldownEnabled ? 'Enabled' : 'Disabled'}
                      </div>
                    </div>
                    <div className="cooldown-timer-bar">
                      <div className="cooldown-timer-track"></div>
                      <div 
                        className={`cooldown-timer-fill ${localCooldownEnabled ? 'active' : 'inactive'} ${cooldownRemaining > 0 ? 'cooldown-remaining' : 'cooldown-complete'}`}
                      ></div>
                    </div>
                  </div>
                </div>
              </>
            )}
        
            {(additionalData.whitelistData?.isUserWhitelisted === true) && activeTab === 'settings' && (
              <div className="card cooldown-control-card">
                <div className="section-header">
                  <h3>24-Hour Limit Control</h3>
                  <span className="whitelist-badge">Whitelist Only</span>
                </div>
                <div className="cooldown-control-content">
                  <div className="cooldown-status-info">
                    <p className="cooldown-status-text">
                      Current Status: <span className={`status ${additionalData.cooldownStatusData?.getCooldownStatus?.enabled ? 'enabled' : 'disabled'}`}>
                        {additionalData.cooldownStatusData?.getCooldownStatus?.enabled ? 'ENABLED' : 'DISABLED'}
                      </span>
                    </p>
                    <p className="cooldown-description">
                      {additionalData.cooldownStatusData?.getCooldownStatus?.enabled 
                        ? '24-hour cooldown is currently active for all users' 
                        : '24-hour cooldown is currently disabled'
                      }
                    </p>
                  </div>
                  <div className="cooldown-control-actions">
                    <button
                      className={`action-btn ${additionalData.cooldownStatusData?.getCooldownStatus?.enabled ? 'danger' : 'primary'}`}
                      onClick={() => handleToggleCooldown(!additionalData.cooldownStatusData?.getCooldownStatus?.enabled)}
                      disabled={operationStatus === "processing"}
                    >
                      {operationStatus === "processing" ? (
                        <span className="button-loading">
                          <span className="spinner">⏳</span> Updating...
                        </span>
                      ) : additionalData.cooldownStatusData?.getCooldownStatus?.enabled ? (
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
                          <span className="chain-name">Contract Chain：</span>
                          <span className="chain-address">
                            {formatAddressForDisplay(chainId, isMobile, 8, 6)}
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
                              <span className="chain-name">Wallet Chain：</span>
                              <span className="chain-address">
                                {formatAddressForDisplay(connectedWalletChainId, isMobile, 8, 6)}
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
                              {formatAddressForDisplay(chainId, isMobile, 8, 6)}
                            </span>
                          </label>
                        </div>
                      </>
                    )}
                  </div>
                </div>
                
                <div className="card chain-info-card">
                  <div className="section-header">
                    <h3>Chain Information</h3>
                  </div>
                  <div className="chain-info">
                    <p>
                      <span className="label">Application ID:</span>
                      <span 
                        className="address-simple"
                        onClick={(e) => copyToClipboard(appId, e)}
                        title="Click to copy Application ID"
                      >
                        {formatAddressForDisplay(appId, isMobile, 8, 6)}
                      </span>
                    </p>
                    <p>
                      <span className="label">Contract Chain:</span>
                      <span 
                        className="address-simple"
                        onClick={(e) => copyToClipboard(chainId, e)}
                        title="Click to copy Contract chain"
                      >
                        {formatAddressForDisplay(chainId, isMobile, 8, 6)}
                      </span>
                    </p>
                    <p>
                      <span className="label">Contract Owner:</span>
                      <span 
                        className="address-simple"
                        onClick={(e) => copyToClipboard(ownerId, e)}
                        title="Click to copy contract owner"
                      >
                        {formatAddressForDisplay(ownerId, isMobile, 8, 6)}
                      </span>
                    </p>
                  </div>
                </div>
              </>
            )}

            {activeTab === 'messages' && (
              <>
                <div className="card custom-message-card">
                  <div className="custom-message-header">
                    <label>Custom Message</label>
                    <div className={`toggle-switch ${customMessageEnabled ? 'active' : ''}`} id="customToggle" onClick={handleCustomMessageToggle}>
                      <div className="toggle-switch-thumb"></div>
                    </div>
                  </div>
                  <div className={`message-editor ${customMessageEnabled ? 'visible' : 'hidden'}`} id="messageEditor">
                    <div className="message-input-container">
                      <textarea 
                        id="customMessage" 
                        placeholder="● Default: GMicrochains"
                        value={customMessage}
                        onChange={handleCustomMessageChange}
                        maxLength={MAX_MESSAGE_LENGTH}
                      ></textarea>
                      <button 
                        className="emoji-picker-button"
                        onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                        title="Add emoji"
                      >
                        😊
                      </button>
                    </div>
                    
                    {showEmojiPicker && (
                      <div className="emoji-picker">
                        <div className="emoji-category">
                          <span className="emoji-category-title">Frequently Used</span>
                          <div className="emoji-grid">
                            {['😀', '😃', '😄', '😁', '😆', '😅', '😂', '🤣', '😊', '😇', '🙂', '🙃', '😉', '😌', '😍', '🥰', '😘', '😗', '😙', '😚', '😋', '😛', '😜', '🤪', '😝', '🤑', '🤗', '🤭', '🤫', '🤔', '🤐'].map(emoji => (
                              <span 
                                key={emoji} 
                                className="emoji-item"
                                onClick={() => addEmojiToMessage(emoji)}
                              >
                                {emoji}
                              </span>
                            ))}
                          </div>
                        </div>
                        
                        <div className="emoji-category">
                          <span className="emoji-category-title">Gestures</span>
                          <div className="emoji-grid">
                            {['👍', '👎', '👌', '✌️', '🤞', '🤟', '🤘', '🤙', '👈', '👉', '👆', '👇', '☝️', '✋', '🤚', '🖐️', '🖖', '👋', '🤙', '💪', '🙏', '👏', '👐', '🤲', '🙌'].map(emoji => (
                              <span 
                                key={emoji} 
                                className="emoji-item"
                                onClick={() => addEmojiToMessage(emoji)}
                              >
                                {emoji}
                              </span>
                            ))}
                          </div>
                        </div>
                        
                        <div className="emoji-category">
                          <span className="emoji-category-title">Crypto & Tech</span>
                          <div className="emoji-grid">
                            {['🚀', '💰', '💎', '🔥', '🌙', '⭐', '✨', '💫', '🌟', '💯', '🔮', '💻', '📱', '⚡', '🔧', '⚙️', '🛠️', '🔗', '📊', '📈', '📉', '💹', '🏦', '💳', '💵', '💴', '💶', '💷', '🪙'].map(emoji => (
                              <span 
                                key={emoji} 
                                className="emoji-item"
                                onClick={() => addEmojiToMessage(emoji)}
                              >
                                {emoji}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                    
                    <div className="message-info">
                      <div className="char-count">
                        {customMessage.length}/{MAX_MESSAGE_LENGTH} characters
                    </div>
                    {customMessage.length > WARNING_THRESHOLD && (
                        <div className="char-warning">
                          Approaching character limit
                        </div>
                      )}
                    </div>

                  </div>
                </div>

                <div className="card send-action-card">
                  <div className="input-group">
                    <label>Recipient Wallet Address (Optional)</label>
                    <div className="input-wrapper">
                      <input 
                        type="text" 
                        id="recipientAddress" 
                        placeholder="0x..., Default to Contract Owner"
                        value={formatAccountOwner(recipientAddress)}
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
                    <button 
                      className="send-button" 
                      id="sendButton"
                      onClick={handleSendGM}
                      disabled={
                        isButtonDisabled(operationStatus, currentAccount, gmOps, cooldownRemaining, localCooldownEnabled)
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
                        `🔓 ${gmOps.formatCooldown(cooldownRemaining)}`
                      ) : (
                        "Send GMicrochains ✨"
                      )}
                    </button>
                    
                    <button 
                      className="history-button" 
                      id="historyButton"
                      onClick={handleHistoryToggle}
                    >
                      History {showHistoryDropdown ? '▲' : '▼'}
                    </button>
                    
                    <div className={`history-dropdown ${showHistoryDropdown ? 'show' : ''}`}>
                      {currentAccount ? (
                        <div className="history-list">
                          {historyLoading ? (
                            <div className="history-loading">
                              <span className="spinner">⏳</span> Loading...
                            </div>
                          ) : historyRecords.length > 0 ? (
                            historyRecords.map((record, index) => (
                              <div key={index} className="history-item">
                                <div className="history-sender">
                                  From: {record.sender ? formatAddressForDisplay(record.sender, isMobile) : 'Unknown'}
                                </div>
                                {record.recipient && (
                                  <div className="history-recipient">
                                    To: {formatAddressForDisplay(record.recipient, isMobile)}
                                  </div>
                                )}
                                <div className="history-content">
                                  Content: {record.content || 'Gmicrochains'}
                                </div>
                                <div className="history-timestamp">
                                  Time: {(() => {
                                    const timestamp = Number(record.timestamp);
                                    const timestampStr = timestamp.toString();
                                    const timestampLength = timestampStr.length;                                   
                                    let recordTime = timestamp;
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
                                  })()}
                                </div>
                              </div>
                            ))
                          ) : (
                            <div className="history-empty">
                              No history records
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="history-empty">
                          Please connect your wallet first
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </>
            )}

        {activeTab === 'leaderboards' && (
          <div className="leaderboards-container">
            <LeaderboardSection
                    showLeaderboard={showLeaderboard}
                    setShowLeaderboard={setShowLeaderboard}
                    leaderboardData={additionalData.leaderboardData}
                    invitationLeaderboardData={additionalData.invitationLeaderboardData}
                    currentAccount={currentAccount}
                    isMobile={isMobile}
                    copyToClipboard={copyToClipboard}
                    refetchLeaderboard={additionalData.refetchLeaderboard}
                    refetchInvitationLeaderboard={additionalData.refetchInvitationLeaderboard}
                  />
          </div>
        )}

      </header>
    </div>
  </div>
  
  <NotificationCenter 
    notifications={notifications}
    onRemoveNotification={removeNotification}
    gmRecords={gmRecords}
    currentAccount={currentAccount}
    gmOperations={gmOps}
    chainId={chainId}
  />
</div>
  </ErrorBoundary>
  );
}

export default App;
