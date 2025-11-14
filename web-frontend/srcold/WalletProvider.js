import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import Web3 from 'web3';
import PropTypes from 'prop-types';
import { useDynamicContext, DynamicConnectButton } from '@dynamic-labs/sdk-react-core';
import { EthereumWalletConnectors } from '@dynamic-labs/ethereum';

const WalletContext = createContext();
const getFormattedAccount = (account) => {
  if (!account) return null;
  return account.startsWith('0x') ? account : `0x${account}`;
};

const getLineraChainId = async (provider) => {
  try {
    try {
      const chainId = await provider.request({ 
        method: 'linera_getChainId' 
      });
      if (chainId) {
        return chainId.toString();
      }
    } catch (error) {
    }
    
    try {
      const state = await provider.request({ 
        method: 'metamask_getProviderState' 
      });
      
      if (state && state.chainId) {
        let chainId = state.chainId;
        if (chainId.startsWith('0x')) {
          chainId = chainId.slice(2);
        }
        if (typeof chainId === 'number') {
          chainId = chainId.toString();
        }
        return chainId;
      }
    } catch (error) {
    }
    
    try {
      const web3 = new Web3(provider);
      const accounts = await web3.eth.getAccounts();
      if (accounts && accounts.length > 0) {
        const account = accounts[0];
        
        if (account && account.length === 66 && account.startsWith('0x')) {
          const potentialChainId = account.slice(2);
          return potentialChainId;
        }
      }
    } catch (error) {
    }
    
    try {
      const chainId = await provider.request({ method: 'eth_chainId' });
      if (chainId) {
        let processedChainId = chainId;
        if (processedChainId.startsWith('0x')) {
          processedChainId = processedChainId.slice(2);
        }
        return processedChainId;
      }
    } catch (error) {
    }
    
    try {
      const chainId = await provider.request({ method: 'net_version' });
      if (chainId) {
        return chainId;
      }
    } catch (error) {
    }
    
    if (provider.chainId) {
      let chainId = provider.chainId;
      if (chainId.startsWith('0x')) {
        chainId = chainId.slice(2);
      }
      return chainId;
    }
    
    if (provider.networkVersion) {
      return provider.networkVersion;
    }
    
    return '1';
  } catch (error) {
    return '1';
  }
};

const getEthereumChainId = async (provider) => {
  try {
    return await provider.request({ 
      method: 'eth_chainId' 
    });
  } catch (error) {
    throw error;
  }
};

const handleConnectionError = (error, setError, defaultMessage = 'Failed to connect wallet') => {
  const message = error.message || defaultMessage;
  setError(message);
  return message;
};

const shouldUseAppChainId = (walletType, appChainId) => {
  return walletType === 'ethereum' && appChainId;
};

export const useWallet = () => {
  const context = useContext(WalletContext);
  if (!context) {
    throw new Error('useWallet must be used within a WalletProvider');
  }
  return context;
};

export const WalletProvider = ({ children, appChainId }) => {
  // 钱包状态缓存
  const WALLET_CACHE_KEY = 'gm_wallet_cache';
  
  const getCachedWalletState = () => {
    try {
      const cached = localStorage.getItem(WALLET_CACHE_KEY);
      if (cached) {
        const state = JSON.parse(cached);
        if (Date.now() - state.timestamp < 5 * 60 * 1000) {
          return state;
        }
      }
    } catch (error) {
    }
    return null;
  };
  
  const cacheWalletState = (state) => {
    try {
      const cacheData = {
        ...state,
        timestamp: Date.now()
      };
      localStorage.setItem(WALLET_CACHE_KEY, JSON.stringify(cacheData));
    } catch (error) {
    }
  };
  
  const clearWalletCache = () => {
    try {
      localStorage.removeItem(WALLET_CACHE_KEY);
    } catch (error) {
    }
  };
  
  const cachedState = getCachedWalletState();
  const [account, setAccount] = useState(cachedState?.account || null);
  const [isConnected, setIsConnected] = useState(cachedState?.isConnected || false);
  const [chainId, setChainId] = useState(cachedState?.chainId || appChainId || null);
  const [walletChainId, setWalletChainId] = useState(cachedState?.walletChainId || null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [walletType, setWalletType] = useState(cachedState?.walletType || null);
  
  // Dynamic钱包相关状态
  const { primaryWallet, handleLogOut } = useDynamicContext();
  const reconnectTimeoutRef = useRef(null);
  const lastConnectionCheckRef = useRef(0);

  const connectToWallet = useCallback(async (walletTypeToConnect, provider, requestMethod = 'eth_requestAccounts') => {
    try {
      if (isConnected && walletTypeToConnect !== walletType) {
        if (walletType === 'dynamic' && handleLogOut) {
          await handleLogOut();
        }
        setAccount(null);
        setIsConnected(false);
        setWalletType(null);
        clearWalletCache();
      }
      
      let accounts;
      
      if (walletTypeToConnect === 'linera') {
        const lineraProvider = window.linera || provider;
        if (!lineraProvider) {
          throw new Error('Linera wallet not found. Please install the Linera wallet extension.');
        }
        
        const web3 = new Web3(lineraProvider);
        if (requestMethod === 'eth_requestAccounts') {
          accounts = await web3.eth.requestAccounts();
        } else {
          accounts = await web3.eth.getAccounts();
        }
      } else if (walletTypeToConnect === 'dynamic') {
        if (!primaryWallet) {
          throw new Error('Dynamic wallet not connected. Please connect through Dynamic widget first.');
        }
        accounts = [primaryWallet.address];
      } else {
        accounts = await provider.request({ method: requestMethod });
      }
      
      if (accounts.length === 0) {
        throw new Error('User rejected the request or no accounts available');
      }

      // 处理多个账户 - 使用第一个账户
      const selectedAccount = accounts[0];
      const formattedAccount = getFormattedAccount(selectedAccount);
      
      if (!formattedAccount) {
        throw new Error('Invalid account format');
      }

      setAccount(formattedAccount);
      setIsConnected(true);
      setWalletType(walletTypeToConnect);
      setError(null);

  let walletChainIdValue;
  try {
    if (walletTypeToConnect === 'linera') {
      // 使用更新后的getLineraChainId函数获取Linera钱包的chainId
      const lineraProvider = window.linera || provider;
      walletChainIdValue = await getLineraChainId(lineraProvider);
    } else if (walletTypeToConnect === 'dynamic') {
      walletChainIdValue = appChainId || '1';
    } else {
      walletChainIdValue = await getEthereumChainId(provider);
    }
    setWalletChainId(walletChainIdValue);
  } catch (chainError) {
    console.warn('Failed to get chainId, using default:', chainError);
    walletChainIdValue = '1';
    setWalletChainId(walletChainIdValue);
  }

      // 设置最终链ID
      if (shouldUseAppChainId(walletTypeToConnect, appChainId)) {
    setChainId(appChainId);
    if (process.env.NODE_ENV === 'development') {
      console.log(`${walletTypeToConnect} wallet connected: ${formattedAccount}, Using app chain ID: ${appChainId} instead of wallet chain ID: ${walletChainIdValue}`);
    }
  } else {
    setChainId(walletChainIdValue);
    if (process.env.NODE_ENV === 'development') {
      console.log(`${walletTypeToConnect} wallet connected: ${formattedAccount}, Chain ID: ${walletChainIdValue}`);
    }
  }

      // 缓存钱包状态
      cacheWalletState({
        account: formattedAccount,
        isConnected: true,
        chainId: shouldUseAppChainId(walletTypeToConnect, appChainId) ? appChainId : walletChainIdValue,
        walletChainId: walletChainIdValue,
        walletType: walletTypeToConnect
      });

      return { account: formattedAccount, chainId: walletChainIdValue };
    } catch (error) {
      setAccount(null);
      setIsConnected(false);
      setWalletType(null);
      clearWalletCache();
      throw error;
    }
  }, [appChainId, primaryWallet, isConnected, walletType, handleLogOut]);

  useEffect(() => {
    const now = Date.now();
    if (now - lastConnectionCheckRef.current < 1000) {
      return;
    }
    lastConnectionCheckRef.current = now;
    
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    
    const handleDynamicWalletChange = async () => {
      if (primaryWallet && primaryWallet.address) {
        const formattedAccount = getFormattedAccount(primaryWallet.address);
        
        if (!isConnected || walletType !== 'dynamic') {
          
          reconnectTimeoutRef.current = setTimeout(async () => {
            try {
              await connectToWallet('dynamic', null);
            } catch (error) {
              console.warn('Failed to connect dynamic wallet:', error);
            }
          }, 500);
        } else if (account !== formattedAccount && account !== '已连接') {
          setAccount(formattedAccount);
          cacheWalletState({
            account: formattedAccount,
            isConnected: true,
            chainId: appChainId || '1',
            walletChainId: appChainId || '1',
            walletType: 'dynamic'
          });
        }
        
      } else if (isConnected && walletType === 'dynamic') {
        
        reconnectTimeoutRef.current = setTimeout(() => {
          setAccount(null);
          setIsConnected(false);
          setWalletType(null);
          clearWalletCache();
        }, 1000);
      }
    };
    
    handleDynamicWalletChange();
  }, [primaryWallet, isConnected, walletType, connectToWallet, account, appChainId]);

  const checkConnection = useCallback(async () => {
    // 检查缓存状态
    const now = Date.now();
    if (now - lastConnectionCheckRef.current < 2000) {
      return;
    }
    lastConnectionCheckRef.current = now;
    
    if (cachedState && cachedState.isConnected) {
      setAccount(cachedState.account);
      setIsConnected(true);
      setChainId(cachedState.chainId);
      setWalletChainId(cachedState.walletChainId);
      setWalletType(cachedState.walletType);
      return;
    }
    
    // 优先检查Dynamic钱包
    if (primaryWallet && primaryWallet.address) {
      try {
        await connectToWallet('dynamic', null, 'eth_requestAccounts');
        cacheWalletState({
          account: getFormattedAccount(primaryWallet.address),
          isConnected: true,
          chainId: appChainId || '1',
          walletChainId: appChainId || '1',
          walletType: 'dynamic'
        });
        return;
      } catch (err) {
        if (process.env.NODE_ENV === 'development') {
          console.error('Error checking Dynamic wallet connection:', err);
        }
      }
    }
    
    // 检查Linera钱包
    if (window.linera) {
      try {
        const web3 = new Web3(window.linera);
        const accounts = await web3.eth.requestAccounts();
        if (accounts.length > 0) {
          // 获取Linera钱包的实际chainId
          const lineraChainId = await getLineraChainId(window.linera);
          await connectToWallet('linera', window.linera, 'eth_requestAccounts');
          cacheWalletState({
            account: getFormattedAccount(accounts[0]),
            isConnected: true,
            chainId: lineraChainId,
            walletChainId: lineraChainId,
            walletType: 'linera'
          });
        }
      } catch (err) {
        if (process.env.NODE_ENV === 'development') {
          console.error('Error checking Linera wallet connection:', err);
        }
      }
    }
    
    // 检查以太坊钱包
    if (window.ethereum) {
      try {
        await connectToWallet('ethereum', window.ethereum, 'eth_accounts');
      } catch (err) {
        if (process.env.NODE_ENV === 'development') {
          console.error('Error checking Ethereum wallet connection:', err);
        }
      }
    }
    
    // 处理特殊状态
    if (isConnected && (account === '已连接' || account === '未连接')) {
      if (primaryWallet && primaryWallet.address) {
        const formattedAccount = getFormattedAccount(primaryWallet.address);
        setAccount(formattedAccount);
        cacheWalletState({
          account: formattedAccount,
          isConnected: true,
          chainId: appChainId || '1',
          walletChainId: appChainId || '1',
          walletType: 'dynamic'
        });
      } else if (window.linera) {
        try {
          const web3 = new Web3(window.linera);
          const accounts = await web3.eth.requestAccounts();
          if (accounts.length > 0) {
            const formattedAccount = getFormattedAccount(accounts[0]);
            setAccount(formattedAccount);
            cacheWalletState({
              account: formattedAccount,
              isConnected: true,
              chainId: appChainId || '1',
              walletChainId: appChainId || '1',
              walletType: 'linera'
            });
          }
        } catch (err) {
        }
      }
    }
  }, [appChainId, primaryWallet, connectToWallet, isConnected, account, cachedState]);

  // 连接钱包
  const connectWallet = async (walletType = null) => {
    setIsLoading(true);
    setError(null);

    try {
      // 自动检测钱包类型
      const detectedWalletType = walletType || 
        (primaryWallet && primaryWallet.address ? 'dynamic' : 
         window.linera ? 'linera' : 
         window.ethereum ? 'ethereum' : null);
      
      if (!detectedWalletType) {
        throw new Error('No wallet detected. Please connect through Dynamic widget or install MetaMask/Linera wallet.');
      }

      let provider = null;
      if (detectedWalletType === 'dynamic') {
        // Dynamic钱包不需要provider
        provider = null;
      } else if (detectedWalletType === 'linera') {
        provider = window.linera;
      } else {
        provider = window.ethereum;
      }
      
      if (detectedWalletType !== 'dynamic' && !provider) {
        // 提供更具体的错误信息
        if (detectedWalletType === 'linera') {
          throw new Error('Linera wallet not detected. Please install Linera wallet from https://github.com/respeer-ai/linera-wallet');
        } else {
          throw new Error('MetaMask wallet not detected. Please install MetaMask from https://metamask.io/');
        }
      }

      await connectToWallet(detectedWalletType, provider, 'eth_requestAccounts');
      
    } catch (err) {
      const errorMessage = handleConnectionError(err, setError);
      
      // 特定错误处理
      if (err.message.includes('User rejected')) {
        setError('User rejected the connection request');
      } else if (err.message.includes('not detected')) {
        setError(err.message);
      }
    } finally {
      setIsLoading(false);
    }
  };

  // 断开钱包连接
  const disconnectWallet = useCallback(() => {
    setAccount(null);
    setIsConnected(false);
    setChainId(appChainId || null); // 恢复为应用链ID
    setWalletChainId(null);
    setError(null);
    console.log('Wallet disconnected');
  }, [appChainId]);

  // 切换账户处理
  useEffect(() => {
    const handleAccountsChanged = (accounts) => {
      if (accounts.length === 0) {
        // User disconnected
        disconnectWallet();
      } else {
        // User switched account
        setAccount(accounts[0]);
      }
    };

    const handleChainChanged = (walletChainId) => {
      setWalletChainId(walletChainId);
      
      const currentWalletType = typeof walletType !== 'undefined' ? walletType : 'unknown';
      
      if (appChainId) {
        setChainId(appChainId);
        window.dispatchEvent(new CustomEvent('walletChainChanged', {
          detail: { 
            walletChainId, 
            appChainId,
            walletType: currentWalletType,
            usingAppChain: true 
          }
        }));
      } else {
        setChainId(walletChainId);
        window.dispatchEvent(new CustomEvent('walletChainChanged', {
          detail: { 
            walletChainId, 
            appChainId: null,
            walletType: currentWalletType,
            usingAppChain: false 
          }
        }));
      }
    };

    if (window.linera) {
      window.linera.on('accountsChanged', handleAccountsChanged);
      window.linera.on('chainChanged', handleChainChanged);
    }

    if (window.ethereum) {
      window.ethereum.on('accountsChanged', handleAccountsChanged);
      window.ethereum.on('chainChanged', handleChainChanged);
    }

    checkConnection();

    return () => {
      if (window.linera) {
        window.linera.removeListener('accountsChanged', handleAccountsChanged);
        window.linera.removeListener('chainChanged', handleChainChanged);
      }
      
      if (window.ethereum) {
        window.ethereum.removeListener('accountsChanged', handleAccountsChanged);
        window.ethereum.removeListener('chainChanged', handleChainChanged);
      }
    };
  }, [checkConnection, appChainId, disconnectWallet, walletType]);

  const value = {
    account,
    isConnected,
    chainId,
    walletChainId,
    walletType,
    isLoading,
    error,
    setError,
    connectWallet,
    disconnectWallet,
    checkConnection
  };

  return (
    <WalletContext.Provider value={value}>
      {children}
    </WalletContext.Provider>
  );
};

WalletProvider.propTypes = {
  children: PropTypes.node.isRequired,
  appChainId: PropTypes.string
};

WalletProvider.defaultProps = {
  appChainId: null
};

export {
  getFormattedAccount,
  getLineraChainId,
  getEthereumChainId,
  handleConnectionError,
  shouldUseAppChainId
};

const WalletConnector = ({ setMessage }) => {
  const { 
    account, 
    isConnected, 
    isLoading, 
    error, 
    setError,
    walletType, 
    connectWallet, 
    disconnectWallet 
  } = useWallet();
  
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);
  const buttonRef = useRef(null);
  
  const { primaryWallet, handleLogOut } = useDynamicContext();
  const isDynamicConnected = primaryWallet && primaryWallet.address;
  const dynamicAccount = isDynamicConnected ? primaryWallet.address : null;
  
  const isLineraConnected = isConnected && walletType === 'linera' && account;
  const lineraAccount = isLineraConnected ? account : null;
  
  const isActiveDynamicWallet = isConnected && walletType === 'dynamic' && account;

  useEffect(() => {
    if (!isDropdownOpen) {
      return;
    }
    
    const handleClickOutside = (event) => {
      const isClickOutsideDropdown = dropdownRef.current && !dropdownRef.current.contains(event.target);
      const isClickOutsideButton = buttonRef.current && !buttonRef.current.contains(event.target);
      
      if (isClickOutsideDropdown && isClickOutsideButton) {
        setIsDropdownOpen(false);
      }
    };

    document.addEventListener('click', handleClickOutside, true);
    
    return () => {
      document.removeEventListener('click', handleClickOutside, true);
    };
  }, [isDropdownOpen]);

  const toggleDropdown = () => {
    setIsDropdownOpen(!isDropdownOpen);
  };

  const closeDropdown = () => {
    setIsDropdownOpen(false);
  };

  const disconnectDynamicWallet = async () => {
    try {
      if (handleLogOut) {
        await handleLogOut();
        disconnectWallet();
      }
    } catch (error) {
    }
  };

  const [isDynamicLoading, setIsDynamicLoading] = useState(false);
  
  useEffect(() => {
    if (primaryWallet && primaryWallet.address) {
      setIsDynamicLoading(false);
    }
  }, [primaryWallet]);

  return (
    <div className="wallet-section top-right">
      <div className="linera-wallet-section">
        {isLineraConnected ? (
          <button 
            className={`linera-wallet-button active`}
            onClick={() => {
              disconnectWallet();
            }}
            title="Disconnect Linera"
            disabled={isLoading && walletType === 'linera'}
          >
            <span className="linera-wallet-text">
              {`${lineraAccount?.slice(0, 6)}...${lineraAccount?.slice(-4)}`}
            </span>
          </button>
        ) : (
          <button 
            className="linera-wallet-button"
            onClick={async () => {
              if (!window.linera) {
                setMessage("Linera wallet not installed. Please visit https://github.com/linera-io/linera-protocol/releases to download and install", "warning");
                return;
              }
              connectWallet('linera');
            }}
            disabled={isLoading && walletType === 'linera'}
          >
            <span className="linera-wallet-text">
              {isLoading && walletType === 'linera' ? "Connecting..." : 'Linera Wallet'}
            </span>
          </button>
        )}
        
        {error && <div className="wallet-error">{error}</div>}
      </div>
    </div>
  );
};

export default WalletProvider;
export { WalletConnector };