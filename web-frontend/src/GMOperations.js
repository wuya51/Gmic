import React, { useCallback, useEffect, useState, useMemo } from 'react';
import { useQuery, useMutation, useSubscription } from '@apollo/client';
import { 
  GET_GM_STATS, 
  GET_WALLET_MESSAGES, 
  GET_GM_RECORD, 
  GET_INVITATION_STATS, 
  GET_LEADERBOARD, 
  CHECK_COOLDOWN, 
  GET_COOLDOWN_STATUS, 
  GET_GM_EVENTS, 
  GET_STREAM_EVENTS,
  IS_USER_WHITELISTED,
  SEND_GM, 
  SEND_GM_TO, 
  SEND_GM_WITH_INVITATION, 
  CLAIM_INVITATION_REWARDS,
  SET_COOLDOWN_ENABLED,
  SUBSCRIBE_GM_EVENTS
} from './queries';

const isValidAccountOwner = (owner) => {
  if (!owner) return false;
  const cleanAddress = owner.trim();
    
  if (/^0x[a-fA-F0-9]{40}$/.test(cleanAddress) || /^0x[a-fA-F0-9]{64}$/.test(cleanAddress)) {
    return true;
  }
  if (/^[a-fA-F0-9]{40}$/.test(cleanAddress) || /^[a-fA-F0-9]{64}$/.test(cleanAddress)) {
    return true;
  }
  return false;
};

const isValidChainId = (chainId) => {
  if (!chainId) return false;
  return /^[0-9a-fA-F]{64}$/.test(chainId);
};

const isLineraChainId = (chainId) => {
  if (!chainId) return false;
  return /^[0-9a-fA-F]{64}$/.test(chainId);
};

const getQueryChainId = (currentChainId, contractChainId) => {
  return isLineraChainId(currentChainId) ? currentChainId : contractChainId;
};

const formatAccountOwner = (address) => {
  if (!address) return '';
  const cleanAddress = address.trim();
  if (cleanAddress.startsWith('0x')) {
    return cleanAddress.toLowerCase();
  }
  return `0x${cleanAddress.toLowerCase()}`;
};

const formatCooldown = (remainingMs, returnObject = false) => {
  if (!remainingMs || remainingMs <= 0) {
    return returnObject ? { hours: 0, minutes: 0, seconds: 0 } : "Ready";
  }
  const hours = Math.floor(remainingMs / (1000 * 60 * 60));
  const minutes = Math.floor((remainingMs % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((remainingMs % (1000 * 60)) / 1000);
  
  if (returnObject) {
    return { hours, minutes, seconds };
  }
  
  if (hours > 0) {
    return `${hours}h ${minutes}m ${seconds}s`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  } else {
    return `${seconds}s`;
  }
};

const GMOperations = ({
  chainId,
  currentAccount,
  currentChainId,
  walletMode,
  queryRetryCount,
  setQueryRetryCount,
  setOperationStatus,
  setClaimStatus,
  setMessage,
  targetChainId,
  recipientAddress,
  onMutationComplete,
  onMutationError,
  customMessage,
  customMessageEnabled,
  cooldownStatus
}) => {
  const queryChainId = getQueryChainId(currentChainId, chainId);
  const [subscriptionData, setSubscriptionData] = useState({
    gmEvents: []
  });

  const [subscriptionStatus, setSubscriptionStatus] = useState({
    gmEvents: { active: false, lastUpdate: null, error: null }
  });

  const [subscriptionConnectionStatus, setSubscriptionConnectionStatus] = useState({
    connected: false,
    lastConnectionCheck: null,
    retryCount: 0
  });

  const [processedEventIds, setProcessedEventIds] = useState(new Set());
  const [lastProcessedTime, setLastProcessedTime] = useState(0);
  
  const [pageLoadTime, setPageLoadTime] = useState(0);

  useEffect(() => {
    if (pageLoadTime === 0) {
      setPageLoadTime(Date.now());
    }
  }, []);

  useEffect(() => {
    if (!chainId) return;

    const checkSubscriptionStatus = () => {
      const now = new Date().toISOString();
      
      const isActive = !subscriptionStatus.gmEvents.error && 
                      subscriptionStatus.gmEvents.lastUpdate && 
                      (Date.now() - new Date(subscriptionStatus.gmEvents.lastUpdate).getTime()) < 60000;
      
      setSubscriptionConnectionStatus(prev => {
        const newRetryCount = isActive ? 0 : prev.retryCount + 1;
        
        if (!isActive && newRetryCount < 3) {
        }
        
        return {
          connected: isActive,
          lastConnectionCheck: now,
          retryCount: newRetryCount
        };
      });
    };

    const intervalId = setInterval(checkSubscriptionStatus, 10000);
    
    checkSubscriptionStatus();

    return () => clearInterval(intervalId);
  }, [chainId, subscriptionStatus.gmEvents.error, subscriptionStatus.gmEvents.lastUpdate]);

  const { data: gmEventsSubscriptionData, loading: gmEventsLoading, error: gmEventsError } = useSubscription(SUBSCRIBE_GM_EVENTS, {
    variables: { chainId: queryChainId },
    skip: !isValidChainId(queryChainId),
    shouldResubscribe: false,
    onData: ({ data }) => {
      
      if (data) {
        setSubscriptionStatus(prev => ({
          ...prev,
          gmEvents: {
            active: true,
            lastUpdate: new Date().toISOString(),
            error: null
          }
        }));
        
        try {
          const notificationData = data?.data?.notifications || data?.notifications;
          
          if (!notificationData) {
            return;
          }
          
          const blockInfo = notificationData?.reason?.NewBlock;
          const blockHeight = blockInfo?.height;
          const blockHash = blockInfo?.hash;
          
          if (!blockHeight || !blockHash) {
            return;
          }
          
          const eventId = `block-${blockHeight}-${blockHash.substring(0, 16)}`;
          
          if (processedEventIds.has(eventId)) {
            console.log('Skipping duplicate subscription event:', eventId);
            return;
          }
          
          setProcessedEventIds(prev => {
            const newSet = new Set([...prev, eventId]);
            if (newSet.size > 100) {
              const array = Array.from(newSet);
              return new Set(array.slice(-50));
            }
            return newSet;
          });
          
          const currentTime = Date.now();
          
          setSubscriptionData(prev => ({
            ...prev,
            gmEvents: [...prev.gmEvents, {
              blockHeight,
              blockHash,
              timestamp: Date.now(),
              type: 'new_block'
            }]
          }));
          
          setSubscriptionStatus(prev => ({
            ...prev,
            gmEvents: {
              ...prev.gmEvents,
              internalRefresh: true,
              lastUpdate: new Date().toISOString()
            }
          }));
          
          console.log('New subscription event:', eventId);

          if (refetchGmEvents) refetchGmEvents();
          if (refetchStreamEvents) refetchStreamEvents();
          if (refetchWalletMessages) refetchWalletMessages();
          if (refetch) refetch(); 
          
          setTimeout(() => {
            setSubscriptionStatus(prev => ({
              ...prev,
              gmEvents: {
                ...prev.gmEvents,
                internalRefresh: false
              }
            }));
          }, 100);
          
        } catch (error) {
          console.error('Subscription event processing failed:', error);
        }
      }
    },
    onError: (error) => {
      setSubscriptionStatus(prev => ({
        ...prev,
        gmEvents: {
          active: false,
          lastUpdate: prev.gmEvents.lastUpdate,
          error: error.message
        }
      }));
    }
  });

  useEffect(() => {
    if (gmEventsError) {
      const retryTimeout = setTimeout(() => {
        if (chainId && subscriptionConnectionStatus.retryCount < 5) {
        }
      }, 5000);

      return () => clearTimeout(retryTimeout);
    }
  }, [gmEventsError, chainId, subscriptionConnectionStatus.retryCount]);

  const { data, refetch, error: queryError, loading } = useQuery(GET_GM_STATS, {
    variables: { chainId: queryChainId, owner: currentAccount ? formatAccountOwner(currentAccount) : null },
    fetchPolicy: "no-cache",
    skip: !isValidChainId(queryChainId),

    onCompleted: (data) => {
    },
    
    onError: (err) => {
      if (err.message && err.message.includes('Failed to parse')) {
        console.warn('ChainId parsing error, skipping retry:', err.message);
        return;
      }
      
      if (err.networkError?.statusCode === 500 && queryRetryCount < 3) {
        setTimeout(() => {
          setQueryRetryCount((prev) => prev + 1);
          refetch();
        }, 2000 * (queryRetryCount + 1));
      }
    },
  });

  const { data: gmRecordData, refetch: refetchGmRecord } = useQuery(GET_GM_RECORD, {
    variables: { owner: formatAccountOwner(currentAccount) },
    skip: !currentAccount,
    fetchPolicy: "no-cache",
  });

  const { data: walletMessagesData, refetch: refetchWalletMessages } = useQuery(GET_WALLET_MESSAGES, {
    variables: { owner: formatAccountOwner(currentAccount) },
    skip: !currentAccount,
    fetchPolicy: "no-cache",
  });

  const { data: invitationStatsData, refetch: refetchInvitationStats } = useQuery(GET_INVITATION_STATS, {
    variables: { user: formatAccountOwner(currentAccount) },
    skip: !currentAccount,
    fetchPolicy: "no-cache",
  });

  const { data: leaderboardData, refetch: refetchLeaderboard } = useQuery(GET_LEADERBOARD, {
    variables: { limit: 15 },
    fetchPolicy: "cache-only",
  });

  const { data: cooldownStatusData, refetch: refetchCooldownStatus } = useQuery(GET_COOLDOWN_STATUS, {
    fetchPolicy: "network-only",
  });

  const { data: whitelistData, refetch: refetchWhitelist } = useQuery(IS_USER_WHITELISTED, {
    variables: { 
      user: formatAccountOwner(currentAccount) 
    },
    fetchPolicy: "no-cache",
    skip: !currentAccount,
  });

  const { data: cooldownCheckData, refetch: refetchCooldownCheck } = useQuery(CHECK_COOLDOWN, {
    variables: { 
      user: formatAccountOwner(currentAccount) 
    },
    fetchPolicy: "no-cache",
    skip: !currentAccount,
  });

  const { data: gmEventsData, refetch: refetchGmEvents } = useQuery(GET_GM_EVENTS, {
    variables: { sender: formatAccountOwner(currentAccount) },
    skip: !currentAccount,
    fetchPolicy: "no-cache",
  });

  const { data: streamEventsData, refetch: refetchStreamEvents, error: streamEventsError } = useQuery(GET_STREAM_EVENTS, {
    variables: { 
      chainId: queryChainId,
      limit: 100
    },
    skip: !isValidChainId(queryChainId),
    fetchPolicy: "cache-first",

  });

  const filterNewEvents = useCallback((events) => {
    if (!events || !Array.isArray(events) || pageLoadTime === 0) {
      return [];
    }
    
    return events.filter(event => {
      if (!event || !event.timestamp) return false;
      
      const eventTime = event.timestamp > 1000000000000 ? event.timestamp : event.timestamp * 1000;
      return eventTime > pageLoadTime;
    });
  }, [pageLoadTime]);

  const filteredGmEvents = useMemo(() => {
    if (!gmEventsData?.getGmEvents) return [];
    return filterNewEvents(gmEventsData.getGmEvents);
  }, [gmEventsData, filterNewEvents]);

  const filteredStreamEvents = useMemo(() => {
    if (!streamEventsData?.getStreamEvents) return [];
    return filterNewEvents(streamEventsData.getStreamEvents);
  }, [streamEventsData, filterNewEvents]);

  const [sendGm] = useMutation(SEND_GM, {
    onCompleted: (data) => {
      const result = typeof data === 'string' ? { hash: data } : data;
      onMutationComplete(result, 'sendGM');
    },
    onError: onMutationError,
    update: () => {},
    errorPolicy: 'ignore',
    fetchPolicy: 'no-cache',
    context: {
      fetchOptions: {
        useGETForQueries: false,
      },
    },
  });

  const [sendGmTo] = useMutation(SEND_GM_TO, {
    onCompleted: (data) => {
      const result = typeof data === 'string' ? { hash: data } : data;
      onMutationComplete(result, 'sendGM');
    },
    onError: onMutationError,
    update: () => {},
    errorPolicy: 'ignore',
    fetchPolicy: 'no-cache',
    context: {
      fetchOptions: {
        useGETForQueries: false,
      },
    },
  });

  const [sendGmWithInvitation] = useMutation(SEND_GM_WITH_INVITATION, {
    onCompleted: (data) => {
      const result = typeof data === 'string' ? { hash: data } : data;
      onMutationComplete(result, 'sendGM');
    },
    onError: onMutationError,
    update: () => {},
    errorPolicy: 'ignore',
  });

  const [claimInvitationRewards] = useMutation(CLAIM_INVITATION_REWARDS, {
    onCompleted: (data) => {
      onMutationComplete(data, 'invitation');
      setClaimStatus("success");
      setTimeout(() => setClaimStatus(null), 5000);
    },
    onError: (error) => {
      onMutationError(error);
      setClaimStatus("error");
      setTimeout(() => setClaimStatus(null), 5000);
    },
    update: () => {},
  });

  const [setCooldownEnabled] = useMutation(SET_COOLDOWN_ENABLED, {
    onCompleted: (data) => onMutationComplete(data, 'setCooldown'),
    onError: onMutationError,
    update: () => {},
  });

  const handleSendGM = useCallback(async (content = "Gmicrochains") => {
    if (!isValidAccountOwner(currentAccount)) {
      setMessage("Invalid wallet account", "error");
      setOperationStatus("error");
      return;
    }
    
    if (cooldownStatus?.enabled === true && cooldownCheckData?.checkCooldown?.inCooldown) {
      const remainingTime = cooldownCheckData.checkCooldown.remainingTime;
      const formattedTime = formatCooldown(remainingTime);
      setMessage(`Within 24-hour cooldown period, please wait ${formattedTime} before sending`, "warning");
      setOperationStatus("error");
      return;
    }
    
    try {
      setOperationStatus("processing");
      await sendGm({
        variables: {
          chainId: targetChainId || currentChainId,
          sender: formatAccountOwner(currentAccount),
          content: content,
        },
      });
    } catch (error) {
      onMutationError(error);
    }
  }, [currentAccount, currentChainId, targetChainId, sendGm, onMutationError, cooldownCheckData, setMessage]);

  const handleSendGMTo = useCallback(async (content = "Gmicrochains") => {
    const formattedAddress = formatAccountOwner(recipientAddress);
    const formattedSender = formatAccountOwner(currentAccount);
    
    if (!isValidAccountOwner(formattedAddress)) {
      setMessage("Invalid recipient address (must be 0x followed by 64 or 40 hex characters)", "error");
      setOperationStatus("error");
      return;
    }
    
    if (formattedAddress === formattedSender) {
      setMessage("Cannot send GMicrochains to yourself", "error");
      setOperationStatus("error");
      return;
    }
    
    if (cooldownStatus?.enabled === true && cooldownCheckData?.checkCooldown?.inCooldown) {
      const remainingTime = cooldownCheckData.checkCooldown.remainingTime;
      const formattedTime = formatCooldown(remainingTime);
      setMessage(`Within 24-hour cooldown period, please wait ${formattedTime} before sending`, "warning");
      setOperationStatus("error");
      return;
    }
    
    try {
      setOperationStatus("processing");
      await sendGmTo({
        variables: {
          chainId: targetChainId || currentChainId,
          sender: formattedSender,
          recipient: formattedAddress,
          content: content,
        },
      });
    } catch (error) {
      onMutationError(error);
    }
  }, [currentAccount, currentChainId, targetChainId, recipientAddress, sendGmTo, onMutationError, cooldownCheckData, setMessage]);

  const handleSendGMToWithAddress = useCallback(async (address, content = "Gmicrochains") => {
    const formattedAddress = formatAccountOwner(address);
    const formattedSender = formatAccountOwner(currentAccount);
    
    if (!isValidAccountOwner(formattedAddress)) {
      setMessage("Invalid recipient address (must be 0x followed by 64 or 40 hex characters)", "error");
      setOperationStatus("error");
      return;
    }
    
    if (formattedAddress === formattedSender) {
      setMessage("Cannot send GMicrochains to yourself", "error");
      setOperationStatus("error");
      return;
    }
    
    if (cooldownStatus?.enabled === true && cooldownCheckData?.checkCooldown?.inCooldown) {
      const remainingTime = cooldownCheckData.checkCooldown.remainingTime;
      const formattedTime = formatCooldown(remainingTime);
      setMessage(`Within 24-hour cooldown period, please wait ${formattedTime} before sending`, "warning");
      setOperationStatus("error");
      return;
    }
    
    try {
      setOperationStatus("processing");
      await sendGmTo({
        variables: {
          chainId: targetChainId || currentChainId,
          sender: formattedSender,
          recipient: formattedAddress,
          content: content,
        },
      });
    } catch (error) {
      onMutationError(error);
    }
  }, [currentAccount, currentChainId, targetChainId, sendGmTo, onMutationError, cooldownCheckData, setMessage]);

  const handleSendGMWithInvitation = useCallback(async (content = "Gmicrochains") => {
    const formattedAddress = formatAccountOwner(recipientAddress);
    if (!isValidAccountOwner(formattedAddress)) {
      setMessage("Invalid recipient address (must be 0x followed by 64 or 40 hex characters)", "error");
      setOperationStatus("error");
      return;
    }
    if (formattedAddress === currentAccount) {
      setMessage("Cannot send GMicrochains to yourself", "error");
      setOperationStatus("error");
      return;
    }
    
    if (cooldownStatus?.enabled === true && cooldownCheckData?.checkCooldown?.inCooldown) {
      const remainingTime = cooldownCheckData.checkCooldown.remainingTime;
      const formattedTime = formatCooldown(remainingTime);
      setMessage(`Within 24-hour cooldown period, please wait ${formattedTime} before sending`, "warning");
      setOperationStatus("error");
      return;
    }
    
    try {
      setOperationStatus("processing");
      await sendGmWithInvitation({
        variables: {
          chainId: targetChainId || currentChainId,
          sender: currentAccount,
          recipient: formattedAddress,
          content: content,
        },
      });
    } catch (error) {
      onMutationError(error);
    }
  }, [currentAccount, currentChainId, targetChainId, recipientAddress, sendGmWithInvitation, onMutationError, cooldownCheckData, setMessage]);

  const handleClaimInvitationRewards = useCallback(async () => {
    try {
      setClaimStatus("processing");
      await claimInvitationRewards({
        variables: {
          user: formatAccountOwner(currentAccount),
        },
      });
    } catch (error) {
      onMutationError(error);
    }
  }, [currentAccount, currentChainId, targetChainId, claimInvitationRewards, onMutationError, setClaimStatus]);

  const handleSetCooldownEnabled = useCallback(async (enabled) => {
    if (!isValidAccountOwner(currentAccount)) {
      setMessage("Invalid wallet account", "error");
      setOperationStatus("error");
      return;
    }
    
    try {
      setOperationStatus("processing");
      const result = await setCooldownEnabled({
        variables: {
          caller: formatAccountOwner(currentAccount),
          enabled: enabled,
        },
      });
      
      const success = result?.data?.setCooldownEnabled?.success === true;
      if (!success) {
        setMessage("Insufficient permissions: only whitelist addresses can set the 24-hour limit switch", "warning");
        setOperationStatus("error");
        return;
      }
      await (refetchCooldownStatus && refetchCooldownStatus());
      await (refetchCooldownCheck && refetchCooldownCheck());
      setOperationStatus("success");
      
    } catch (error) {
      if (error && error.message && !error.message.includes('Mutation completed')) {
        onMutationError(error);
      } else {
        await (refetchCooldownStatus && refetchCooldownStatus());
        await (refetchCooldownCheck && refetchCooldownCheck());
        setOperationStatus("success");
      }
    }
  }, [currentAccount, setCooldownEnabled, onMutationError, setMessage, refetchCooldownStatus, refetchCooldownCheck]);

  const validateRecipientAddress = useCallback((address) => {
    if (!address) {
      return { isValid: true, error: "" };
    }
    
    const formattedAddress = formatAccountOwner(address);
    if (!isValidAccountOwner(formattedAddress)) {
      return {
        isValid: false,
        error: "Invalid recipient address (must be 0x followed by 64 or 40 hex characters)"
      };
    }
    
    if (formattedAddress === currentAccount) {
      return {
        isValid: false,
        error: "Cannot send GMicrochains to yourself"
      };
    }
    
    return { isValid: true, error: "" };
  }, [currentAccount]);



  return {
    data,
    walletMessagesData,
    gmEventsData: filteredGmEvents,
    streamEventsData: filteredStreamEvents,
    loading,
    queryError,    
    refetch,
    refetchGmEvents,
    refetchStreamEvents,    
    handleSendGM,
    handleSendGMTo,
    handleSendGMToWithAddress,
    handleSendGMWithInvitation,
    handleClaimInvitationRewards,
    handleSetCooldownEnabled,    
    validateRecipientAddress,
    formatCooldown,
    isValidAccountOwner,
    formatAccountOwner
  };
};

export const useGMAdditionalData = ({
  chainId,
  currentAccount,
  currentChainId,
  walletMode,
  queryRetryCount,
  setQueryRetryCount
}) => {
  const { data: gmRecordData, loading: gmRecordLoading, error: gmRecordError, refetch: refetchGmRecord } = useQuery(GET_GM_RECORD, {
    variables: { 
      owner: currentAccount ? formatAccountOwner(currentAccount) : null,
      chainId: chainId 
    },
    skip: !currentAccount || !chainId,
    fetchPolicy: 'cache-and-network',
    notifyOnNetworkStatusChange: true,
    onError: (error) => {
      console.error('Error fetching GM record:', error);
      if (queryRetryCount < 3) {
        setTimeout(() => {
          setQueryRetryCount(prev => prev + 1);
          refetchGmRecord();
        }, 1000);
      }
    }
  });

  const { data: invitationStatsData, loading: invitationStatsLoading, error: invitationStatsError, refetch: refetchInvitationStats } = useQuery(GET_INVITATION_STATS, {
    variables: { 
      user: currentAccount ? formatAccountOwner(currentAccount) : null,
      chainId: chainId 
    },
    skip: !currentAccount || !chainId,
    fetchPolicy: 'cache-and-network',
    notifyOnNetworkStatusChange: true,
    onError: (error) => {
      console.error('Error fetching invitation stats:', error);
      if (queryRetryCount < 3) {
        setTimeout(() => {
          setQueryRetryCount(prev => prev + 1);
          refetchInvitationStats();
        }, 1000);
      }
    }
  });

  const { data: leaderboardData, loading: leaderboardLoading, error: leaderboardError, refetch: refetchLeaderboard } = useQuery(GET_LEADERBOARD, {
    variables: { 
      limit: 15 
    },
    skip: false, // 默认启用查询，确保数据可用
    fetchPolicy: 'cache-first',
    notifyOnNetworkStatusChange: false,
    pollInterval: 0,
    nextFetchPolicy: 'cache-first',
    onError: (error) => {
      console.error('Error fetching leaderboard:', error);
      // 移除自动重试逻辑，避免持续轮询
    }
  });

  const { data: cooldownStatusData, loading: cooldownStatusLoading, error: cooldownStatusError, refetch: refetchCooldownStatus } = useQuery(GET_COOLDOWN_STATUS, {
    fetchPolicy: 'cache-first',
    notifyOnNetworkStatusChange: false,
    skip: false, // 始终查询，但使用缓存策略
    onError: (error) => {
      console.error('Error fetching cooldown status:', error);
      // 移除自动重试逻辑，避免轮询
    }
  });

  const { data: cooldownCheckData, loading: cooldownCheckLoading, error: cooldownCheckError, refetch: refetchCooldownCheck } = useQuery(CHECK_COOLDOWN, {
    variables: { 
      user: currentAccount ? formatAccountOwner(currentAccount) : null 
    },
    skip: !currentAccount,
    fetchPolicy: 'cache-first',
    notifyOnNetworkStatusChange: false,
    pollInterval: 0,
    nextFetchPolicy: 'cache-first',
    onError: (error) => {
      console.error('Error checking cooldown:', error);
      // 移除自动重试逻辑，避免持续轮询
    }
  });

  const { data: whitelistData, loading: whitelistLoading, error: whitelistError, refetch: refetchWhitelist } = useQuery(IS_USER_WHITELISTED, {
    variables: { 
      user: currentAccount ? formatAccountOwner(currentAccount) : null
    },
    skip: !currentAccount,
    fetchPolicy: 'network-only',
    notifyOnNetworkStatusChange: true,
    onError: (error) => {
      console.error('Error checking whitelist:', error);
      if (queryRetryCount < 3) {
        setTimeout(() => {
          setQueryRetryCount(prev => prev + 1);
          refetchWhitelist();
        }, 1000);
      }
    }
  });

  const loading = gmRecordLoading || invitationStatsLoading || leaderboardLoading || cooldownStatusLoading || cooldownCheckLoading || whitelistLoading;
  const queryError = gmRecordError || invitationStatsError || leaderboardError || cooldownStatusError || cooldownCheckError || whitelistError;

  return {
    gmRecordData,
    invitationStatsData,
    leaderboardData,
    cooldownStatusData,
    cooldownCheckData,
    whitelistData,
    loading,
    queryError,
    refetchGmRecord,
    refetchInvitationStats,
    refetchLeaderboard,
    refetchCooldownStatus,
    refetchCooldownCheck,
    refetchWhitelist
  };
};

export default GMOperations;
