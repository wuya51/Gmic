import React, { useCallback, useEffect, useState } from 'react';
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

const formatAccountOwner = (address) => {
  if (!address) return '';
  const cleanAddress = address.trim();
  if (cleanAddress.startsWith('0x')) {
    return cleanAddress.toLowerCase();
  }
  return `0x${cleanAddress.toLowerCase()}`;
};

const formatCooldown = (remainingMicroseconds, returnObject = false) => {
  if (!remainingMicroseconds || remainingMicroseconds <= 0) {
    return returnObject ? { hours: 0, minutes: 0, seconds: 0 } : "Ready";
  }
  const remainingMs = remainingMicroseconds / 1000;
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
  cooldownStatus
}) => {
  const [subscriptionData, setSubscriptionData] = useState({
    gmEvents: []
  });

  const [subscriptionStatus, setSubscriptionStatus] = useState({
    gmEvents: { active: false, lastUpdate: null, error: null }
  });

  const { data: gmEventsSubscriptionData, loading: gmEventsLoading, error: gmEventsError } = useSubscription(SUBSCRIBE_GM_EVENTS, {
    variables: { chainId: chainId },
    skip: !chainId,
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
          if (data.data && data.data.notifications) {
            const notifications = data.data.notifications;
            
            if (notifications.reason && notifications.reason.NewBlock) {
              // 新区块时，更新所有相关数据
              refetch();
              refetchStreamEvents();
              refetchLeaderboard && refetchLeaderboard();
              
              if (currentAccount) {
                refetchWalletMessages && refetchWalletMessages();
                refetchGmRecord && refetchGmRecord();
                refetchCooldownCheck && refetchCooldownCheck();
              }
            }
          } else if (typeof data === 'string') {
            const parsedData = JSON.parse(data);
            
            if (parsedData.sender && parsedData.recipient) {
              let timestamp = parsedData.timestamp || Date.now() * 1000;
              
              if (timestamp < Date.now()) {
                timestamp = timestamp * 1000;
              }
              
              setSubscriptionData(prev => {
                const newEvent = {
                  type: 'gm_event',
                  sender: parsedData.sender,
                  recipient: parsedData.recipient,
                  timestamp: timestamp,
                  content: parsedData.content || 'Gmicrochains'
                };
                
                const updatedData = {
                  ...prev,
                  gmEvents: [...prev.gmEvents, newEvent]
                };
                return updatedData;
              });
              
              // 新事件时，更新所有相关数据
              refetch();
              refetchStreamEvents();
              refetchLeaderboard && refetchLeaderboard();
              
              if (currentAccount) {
                refetchWalletMessages && refetchWalletMessages();
                refetchGmRecord && refetchGmRecord();
                refetchCooldownCheck && refetchCooldownCheck();
              }
            }
          } else if (data.sender && data.recipient) {
            let timestamp = data.timestamp || Date.now() * 1000;
            
            if (timestamp < Date.now()) {
              timestamp = timestamp * 1000;
            }
            
            setSubscriptionData(prev => {
              const newEvent = {
                type: 'gm_event',
                sender: data.sender,
                recipient: data.recipient,
                timestamp: timestamp,
                content: data.content || 'Gmicrochains'
              };
              
              const updatedData = {
              ...prev,
              gmEvents: [...prev.gmEvents, newEvent]
            };
              return updatedData;
            });
            
            // 新事件时，更新所有相关数据
            refetch();
            refetchStreamEvents();
            refetchLeaderboard && refetchLeaderboard();
            
            if (currentAccount) {
              refetchWalletMessages && refetchWalletMessages();
              refetchGmRecord && refetchGmRecord();
              refetchCooldownCheck && refetchCooldownCheck();
            }
          } else {
            refetch();
            refetchStreamEvents();
            refetchLeaderboard && refetchLeaderboard();
          }
        } catch (error) {
          refetch();
          refetchStreamEvents();
          refetchLeaderboard && refetchLeaderboard();
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
      setTimeout(() => {
        refetch();
        refetchStreamEvents();
        refetchLeaderboard && refetchLeaderboard();
      }, 5000);
    }
  });

  const { data, refetch, error: queryError, loading } = useQuery(GET_GM_STATS, {
    variables: { chainId: currentChainId || chainId, owner: currentAccount ? formatAccountOwner(currentAccount) : null },
    fetchPolicy: "no-cache",
    skip: !currentChainId,
    onCompleted: (data) => {
    },
    onError: (err) => {
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
    fetchPolicy: "cache-first",
  });

  const { data: cooldownStatusData, refetch: refetchCooldownStatus } = useQuery(GET_COOLDOWN_STATUS, {
    fetchPolicy: "no-cache",
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

  const { data: streamEventsData, refetch: refetchStreamEvents } = useQuery(GET_STREAM_EVENTS, {
    variables: { 
      chainId: chainId
    },
    skip: !chainId,
    fetchPolicy: "no-cache",
  });

  const [sendGm] = useMutation(SEND_GM, {
    onCompleted: (data) => onMutationComplete(data, 'sendGM'),
    onError: onMutationError,
  });

  const [sendGmTo] = useMutation(SEND_GM_TO, {
    onCompleted: (data) => onMutationComplete(data, 'sendGM'),
    onError: onMutationError,
  });

  const [sendGmWithInvitation] = useMutation(SEND_GM_WITH_INVITATION, {
    onCompleted: (data) => onMutationComplete(data, 'sendGM'),
    onError: onMutationError,
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
  });

  const [setCooldownEnabled] = useMutation(SET_COOLDOWN_ENABLED, {
    onCompleted: (data) => onMutationComplete(data, 'setCooldown'),
    onError: onMutationError,
  });

  const handleSendGM = useCallback(async () => {
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
          content: "Gmicrochains",
        },
      });
    } catch (error) {
      onMutationError(error);
    }
  }, [currentAccount, currentChainId, targetChainId, sendGm, onMutationError, cooldownCheckData, setMessage]);

  const handleSendGMTo = useCallback(async () => {
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
          content: "Gmicrochains",
        },
      });
    } catch (error) {
      onMutationError(error);
    }
  }, [currentAccount, currentChainId, targetChainId, recipientAddress, sendGmTo, onMutationError, cooldownCheckData, setMessage]);

  const handleSendGMToWithAddress = useCallback(async (address) => {
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
          content: "Gmicrochains",
        },
      });
    } catch (error) {
      onMutationError(error);
    }
  }, [currentAccount, currentChainId, targetChainId, sendGmTo, onMutationError, cooldownCheckData, setMessage]);

  const handleSendGMWithInvitation = useCallback(async () => {
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
          content: "Gmicrochains",
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
      await setCooldownEnabled({
        variables: {
          caller: formatAccountOwner(currentAccount),
          enabled: enabled,
        },
      });
      
      refetchCooldownStatus && refetchCooldownStatus();
      refetchCooldownCheck && refetchCooldownCheck();
      
    } catch (error) {
      onMutationError(error);
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

useEffect(() => {
  const statusInterval = setInterval(() => {
  }, 30000);
  
  return () => {
    clearInterval(statusInterval);
  };
}, [subscriptionStatus, currentChainId, chainId, currentAccount, gmEventsLoading, gmEventsError]);

  return {
    data,
    gmRecordData,
    walletMessagesData,
    invitationStatsData,
    leaderboardData,
    cooldownStatusData,
    cooldownCheckData,
    whitelistData,
    gmEventsData,
    streamEventsData,
    loading,
    queryError,    
    subscriptionData,
    subscriptionStatus,    
    refetch,
    refetchGmRecord,
    refetchWalletMessages,
    refetchInvitationStats,
    refetchLeaderboard,
    refetchCooldownStatus,
    refetchCooldownCheck,
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

export default GMOperations;