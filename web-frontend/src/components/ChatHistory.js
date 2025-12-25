import React, { useState, useEffect } from 'react';

const normalizeTimestamp = (timestamp) => {
  if (!timestamp) return Date.now();
  
  let num = Number(timestamp);
  if (isNaN(num)) {
    const date = new Date(timestamp);
    if (!isNaN(date.getTime())) {
      return date.getTime();
    }
    return Date.now();
  }
  
  if (num > 1e15) {
    return Math.floor(num / 1000);
  } else if (num > 1e12) {
    return num;
  } else if (num > 1e9) {
    return num * 1000;
  }
  
  return num;
};

const ChatHistory = ({ currentAccount, isMobile, gmOps, currentChatPartner = null, onChatPartnerChange, currentIsConnected }) => {
  const [chatConversations, setChatConversations] = useState([]);
  const [expandedChats, setExpandedChats] = useState({});
  const [playingVoice, setPlayingVoice] = useState(null);
  const [expandedGif, setExpandedGif] = useState(null);
  const [audioElements, setAudioElements] = useState({});
  const [pendingPartnerChange, setPendingPartnerChange] = useState(null);

  const toggleChatExpansion = (address) => {
    setExpandedChats(prev => {
      const isCurrentlyExpanded = !!prev[address];
      const newState = isCurrentlyExpanded ? {} : { [address]: true };
      const newPartner = isCurrentlyExpanded ? null : address;

      if (onChatPartnerChange) {
        onChatPartnerChange(newPartner);
      }
      
      return newState;
    });
  };

  const playVoice = (voiceId, audioUrl) => {
    Object.values(audioElements).forEach(audio => {
      if (!audio.paused) {
        audio.pause();
        audio.currentTime = 0;
      }
    });

    if (playingVoice === voiceId) {
      setPlayingVoice(null);
      return;
    }

    setPlayingVoice(voiceId);
    
    if (!audioElements[voiceId]) {
      const audio = new Audio(audioUrl);
      audioElements[voiceId] = audio;
      setAudioElements({...audioElements});
      
      audio.onended = () => {
        setPlayingVoice(null);
      };
      
      audio.onerror = () => { 
 
         setPlayingVoice(null); 
       }; 
       
       audio.play().catch(err => { 
 
         setPlayingVoice(null); 
       }); 
     } else { 
       audioElements[voiceId].play().catch(err => { 
 
         setPlayingVoice(null);
      });
    }
  };

  const toggleGifExpansion = (gifUrl) => {
    setExpandedGif(expandedGif === gifUrl ? null : gifUrl);
  };

  useEffect(() => {
    if (pendingPartnerChange !== null) {
      if (onChatPartnerChange) {
        onChatPartnerChange(pendingPartnerChange);
      }
      setPendingPartnerChange(null);
    }
  }, [pendingPartnerChange, onChatPartnerChange]);

  useEffect(() => {
    if (currentChatPartner === null) {
      setExpandedChats({});
    } else if (currentChatPartner) {
      setExpandedChats(prev => {
        if (!prev[currentChatPartner]) {
          return { [currentChatPartner]: true };
        }
        return prev;
      });
    }
  }, [currentChatPartner]);

  useEffect(() => {
    if (!currentAccount || !gmOps || !currentIsConnected) {
      setChatConversations([]);
      return;
    }

    try {
      const streamEvents = Array.isArray(gmOps.streamEventsData) ? gmOps.streamEventsData : [];
      
      let gmEvents, receivedGmEvents;
      if (currentChatPartner) {
        const mySentEvents = Array.isArray(gmOps.mySentEventsData) ? gmOps.mySentEventsData : [];
        const partnerSentEvents = Array.isArray(gmOps.partnerSentEventsData) ? gmOps.partnerSentEventsData : [];
        const myReceivedEvents = Array.isArray(gmOps.myReceivedEventsData) ? gmOps.myReceivedEventsData : [];
        const partnerReceivedEvents = Array.isArray(gmOps.partnerReceivedEventsData) ? gmOps.partnerReceivedEventsData : [];
        
        gmEvents = [...mySentEvents, ...partnerReceivedEvents];
        receivedGmEvents = [...partnerSentEvents, ...myReceivedEvents];
      } else {
        gmEvents = Array.isArray(gmOps.gmEventsData) ? gmOps.gmEventsData : [];
        receivedGmEvents = Array.isArray(gmOps.receivedGmEventsData) ? gmOps.receivedGmEventsData : [];
      }
      
      const allEvents = [...streamEvents, ...gmEvents, ...receivedGmEvents];
      
      const supportedRecords = allEvents.filter(event => {
        if (!event.content) return false;
        
        const messageType = event.content.messageType || 'text';
        const supportedTypes = ['text', 'gif', 'voice'];
        
        return supportedTypes.includes(messageType);
      });
      
      const chatGroups = {};
      
      supportedRecords.forEach(event => {
        let chatPartner = '';
        if (event.sender === currentAccount) {
          chatPartner = event.recipient;
        } else if (event.recipient === currentAccount) {
          chatPartner = event.sender;
        }
        
        if (chatPartner) {
          if (!chatGroups[chatPartner]) {
            chatGroups[chatPartner] = [];
          }
          chatGroups[chatPartner].push({
            ...event,
            isSent: event.sender === currentAccount,
            timestamp: normalizeTimestamp(event.timestamp || Date.now().toString())
          });
        }
      });
      
      Object.keys(chatGroups).forEach(partner => {
        chatGroups[partner].sort((a, b) => normalizeTimestamp(b.timestamp) - normalizeTimestamp(a.timestamp));
      });
      
      const chatRecords = Object.keys(chatGroups).map(partner => {
        const messages = chatGroups[partner];
        const latestMessage = messages[0];
        
        if (!latestMessage || typeof latestMessage !== 'object') {
          return null;
        }
        
        const sanitizedLatestMessage = {
          ...latestMessage,
          content: latestMessage.content || '',
          timestamp: normalizeTimestamp(latestMessage.timestamp || Date.now().toString())
        };
        
        const sanitizedMessages = messages.map(msg => ({
          ...msg,
          content: msg.content || '',
          timestamp: normalizeTimestamp(msg.timestamp || Date.now().toString())
        }));
        
        const uniqueMessages = [];
        const seenMessages = new Set();
        sanitizedMessages.forEach(msg => {
          const key = `${msg.content}-${msg.timestamp}-${msg.isSent}`;
          if (!seenMessages.has(key)) {
            seenMessages.add(key);
            uniqueMessages.push(msg);
          }
        });
        
        return {
          partnerAddress: partner,
          latestMessage: sanitizedLatestMessage,
          messageCount: uniqueMessages.length,
          allMessages: uniqueMessages,
          lastTimestamp: sanitizedLatestMessage.timestamp
        };
      }).filter(record => record !== null);
      
      chatRecords.sort((a, b) => Number(b.lastTimestamp) - Number(a.lastTimestamp));
      
      setChatConversations(chatRecords);
      
    } catch (error) {
      setChatConversations([]);
    }
  }, [currentAccount, gmOps, currentIsConnected]);

  const renderMessageContent = (message) => {
    try {
      if (!message || typeof message !== 'object') {
                        return <span className="error-message">[Invalid message]</span>;
                      }
      
      let messageData = message;
      if (message.__typename || message.data) {
        messageData = message.data || message;
      }
      
      let contentData = messageData.content;
      
      if (contentData && typeof contentData === 'object') {
        if (contentData.content) {
          contentData = contentData.content;
        } else if (contentData.text) {
          contentData = contentData.text;
        } else if (contentData.message) {
          contentData = contentData.message;
        } else if (Object.keys(contentData).length > 0) {
          const possibleFields = ['content', 'text', 'message', 'data', 'value'];
          for (const field of possibleFields) {
            if (contentData[field] !== undefined) {
              contentData = contentData[field];
              break;
            }
          }
          if (typeof contentData === 'object') {
            contentData = JSON.stringify(contentData);
          }
        }
      }
      
      const messageType = (messageData.content?.messageType || messageData.messageType || 'text').toString();
      let content = contentData || '';
      
      if (content && typeof content === 'object') {
        if (content.text) {
          content = content.text;
        } else if (content.content) {
          content = content.content;
        } else {
          content = JSON.stringify(content);
        }
      }
      
      content = String(content || '');

      
      switch (messageType) {
        case 'text':
          const displayText = content.length > 30 ? content.substring(0, 30) + '...' : content;
          return <span className="text-message">{displayText}</span>;
          
        case 'gif':
          const isExpanded = expandedGif === content;
          return (
            <div className="gif-message">
              <div 
                className={`gif-thumbnail ${isExpanded ? 'expanded' : ''}`}
                onClick={() => toggleGifExpansion(content)}
              >
                {isExpanded ? (
                  <img 
                    src={content} 
                    alt="GIF" 
                    className="gif-expanded"
                    onError={(e) => {
                      e.target.style.display = 'none';
                      e.target.nextSibling.style.display = 'block';
                    }}
                  />
                ) : (
                  <>
                    <img 
                      src={content} 
                      alt="GIF Thumbnail" 
                      className="gif-preview"
                      onError={(e) => {
                        e.target.style.display = 'none';
                        e.target.nextSibling.style.display = 'block';
                      }}
                    />
                    <div className="gif-placeholder" style={{display: 'none'}}>
                      <span className="gif-icon">🖼️</span>
                      <span>GIF</span>
                    </div>
                  </>
                )}
              </div>
              {isExpanded && (
                <div className="gif-controls">
                  <button 
                    className="gif-close-btn"
                    onClick={() => toggleGifExpansion(null)}
                  >
                    ✕
                  </button>
                </div>
              )}
            </div>
          );
          
        case 'voice':
          const voiceId = `${message.sender}-${message.timestamp}`;
          const isPlaying = playingVoice === voiceId;
          const audio = audioElements[voiceId];
          const duration = audio ? Math.round(audio.duration) : 3;
          const currentTime = audio ? Math.round(audio.currentTime) : 0;
          const progress = audio && duration > 0 ? (currentTime / duration) * 100 : 0;
          
          return (
            <div className={`voice-message ${isPlaying ? 'playing' : ''}`}>
              <div className="voice-bar" onClick={() => playVoice(voiceId, content)}>
                <div className="voice-duration">{isPlaying ? `${duration - currentTime}"` : `${duration}"`}</div>
                <div className="voice-wave">
                  {[1, 2, 3, 4, 5].map(i => (
                    <div 
                      key={i} 
                      className={`wave-bar ${isPlaying ? 'animate' : ''}`}
                      style={{
                        height: isPlaying ? `${Math.random() * 100}%` : '40%',
                        animationDelay: `${i * 0.1}s`
                      }}
                    ></div>
                  ))}
                </div>
                <div className={`voice-icon ${isPlaying ? 'speaker' : 'play'}`}>
                  {isPlaying ? '🔊' : '▶️'}
                </div>
              </div>
              {isPlaying && (
                <div className="voice-progress">
                  <div 
                    className="progress-bar" 
                    style={{width: `${progress}%`}}
                  ></div>
                </div>
              )}
            </div>
          );
          
        default:
          return <span className="unknown-message">[Unknown message type: {messageType}]</span>;
      }
    } catch (error) {
      return <span className="error-message">[Error displaying message]</span>;
    }
  };

  if (!currentAccount) {
    return (
      <div className="chat-history">
        <div className="chat-empty">
          <div className="default-chat-item">
            <div className="chat-content">
              Please connect wallet to view chat history
            </div>
          </div>
        </div>
      </div>
    );
  }

  const isInChatView = currentChatPartner && currentChatPartner !== '' && currentChatPartner !== null && currentChatPartner !== undefined;
  
  return (
    <div className={`chat-history ${isInChatView ? 'chat-view' : 'history-view'}`}>

      <div className="chat-list">
        {chatConversations.length === 0 ? (
          <div className="chat-empty">
            <div className="default-chat-item">
              <div className="chat-content">
                No chat history yet, please select a contact to start chatting
              </div>
            </div>
          </div>
        ) : (
          chatConversations.map((chat) => {
            const isExpanded = expandedChats[chat.partnerAddress];
            const latestMessage = chat.latestMessage;            
            const hasAnyExpanded = Object.keys(expandedChats).length > 0;
            if (hasAnyExpanded && !isExpanded) {
              return null;
            }
            
            if (!chat || typeof chat !== 'object') {
              return null;
            }
            
            if (!chat.partnerAddress || typeof chat.partnerAddress !== 'string') {
              return null;
            }
            
            if (!chat.latestMessage || typeof chat.latestMessage !== 'object') {
              return null;
            }
            
            const getContactInfo = (address) => {
              if (address === '0xfe609ad118ba733dafb3ce2b6094c86a441b10de4ffd1651251fffe973efd959') {
                return { name: 'wuya51', avatar: '👤' };
              }
              return { name: '', avatar: '👤' };
            };
            
            const contactInfo = getContactInfo(chat.partnerAddress);

            
            return (
              <div 
                key={chat.partnerAddress} 
                className={`chat-conversation ${isExpanded ? 'expanded' : ''} ${hasAnyExpanded && !isExpanded ? 'hidden' : ''}`}
              >
                <div 
                  className="chat-summary"
                  onClick={() => toggleChatExpansion(chat.partnerAddress)}
                >
                  <div className="chat-header">
                    <div className="partner-info">
                      <span className="partner-avatar">{contactInfo.avatar}</span>
                      <span className="partner-name">{contactInfo.name}</span>
                      <span className="partner-address">
                        {chat.partnerAddress.substring(0, 6)}...{chat.partnerAddress.substring(chat.partnerAddress.length - 4)}
                      </span>
                      <span className="message-count">
                        {chat.messageCount} 💬
                      </span>
                      <span className="chat-time">
                        {new Date(normalizeTimestamp(latestMessage.timestamp)).toLocaleTimeString()}
                      </span>
                      <span className="expand-icon">
                        {isExpanded ? '▼' : '▶'}
                      </span>
                    </div>
                  </div>
                  <div className="latest-message">
                    {latestMessage && typeof latestMessage === 'object' ? renderMessageContent(latestMessage) : <span className="error-message">[Invalid message]</span>}
                  </div>
                </div>
                
                {isExpanded && (
                  <div className="chat-details">
                    {chat.allMessages.map((message, msgIndex) => {
                      const isSent = message.isSent;
                      const senderAddress = isSent ? currentAccount : chat.partnerAddress;
                      
                      if (!senderAddress || typeof senderAddress !== 'string') {
                        return null;
                      }
                      
                      const displayAddress = `${senderAddress.substring(0, 6)}...${senderAddress.substring(senderAddress.length - 4)}`;
                      const senderLabel = isSent ? 'Me' : 'Them';
                      
                      return (
                        <div 
                          key={msgIndex} 
                          className={`message-container ${isSent ? 'sent' : 'received'}`}
                        >
                          {!isSent && (
                            <div className="message-avatar">
                              <span className="avatar-icon">👤</span>
                            </div>
                          )}
                          
                          <div className="message-content-wrapper">
                            <div className={`message-info ${isSent ? 'sent' : 'received'}`}>
                              {isSent && <span className="message-sender">{senderLabel}</span>}
                              <span className="message-time">
                                {new Date(normalizeTimestamp(message.timestamp)).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                              </span>
                            </div>                            
                            <div className={`message-bubble ${isSent ? 'sent' : 'received'}`}>
                              {renderMessageContent(message)}
                            </div>
                          </div>
                          
                          {isSent && (
                            <div className="message-avatar">
                              <span className="avatar-icon">👤</span>
                            </div>
                          )}
                        </div>
                      );
                    }).filter(Boolean)}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default ChatHistory;