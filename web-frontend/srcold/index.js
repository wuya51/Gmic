import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import "./App.css";
import App from "./App";
import { BrowserRouter, Route, Routes, useParams, useSearchParams } from "react-router-dom";
import GraphQLProvider from "./GraphQLProvider";
import { WalletProvider } from './WalletProvider';
import { DynamicContextProvider } from '@dynamic-labs/sdk-react-core';
import { EthereumWalletConnectors } from '@dynamic-labs/ethereum';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    const isCriticalError = !(
      error?.message?.includes('ApolloError') ||
      error?.message?.includes('Network error') ||
      error?.message?.includes('502') ||
      error?.message?.includes('503') ||
      error?.message?.includes('504') ||
      error?.name?.includes('ApolloError')
    );
    
    if (isCriticalError) {
      console.error('Critical error caught by ErrorBoundary:', error);
      return { hasError: true, error };
    } else {
      console.warn('Non-critical error ignored by ErrorBoundary:', error?.message);
      return { hasError: false, error: null };
    }
  }

  componentDidCatch(error, errorInfo) {
    const isCriticalError = !(
      error?.message?.includes('ApolloError') ||
      error?.message?.includes('Network error') ||
      error?.message?.includes('502') ||
      error?.message?.includes('503') ||
      error?.message?.includes('504') ||
      error?.name?.includes('ApolloError')
    );
    
    if (isCriticalError) {
      console.error("Critical error caught by ErrorBoundary:", error, errorInfo);
    } else {
      console.warn('Non-critical error ignored by ErrorBoundary:', error?.message);
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="app-container">
          <header className="app-header">
            <h1 className="app-title">Linera GM Demo</h1>
          </header>
          <main className="main-content">
            <div className="game-setup">
              <h2>应用出现错误</h2>
              <p>抱歉，应用遇到了一个错误：</p>
              <pre style={{ color: 'red', overflow: 'auto' }}>
                {this.state.error && this.state.error.toString()}
              </pre>
              <p>请刷新页面重试，或检查URL参数是否正确。</p>
            </div>
          </main>
        </div>
      );
    }

    return this.props.children;
  }
}

const root = ReactDOM.createRoot(document.getElementById("root"));

root.render(
    <ErrorBoundary>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<DefaultGraphQLApp />} />
          <Route path=":id" element={<GraphQLApp />} />
        </Routes>
      </BrowserRouter>
    </ErrorBoundary>
);

function DefaultGraphQLApp() {
  // 使用默认参数，与nginx配置中的参数保持一致
  const CHAIN_ID = "5babbf494cbc90185102b731daa36a117dec5565497b0d80dd8bae0cb10ddaaa";
  const APP_ID = "dface6992023ba88e59ae34c93341ccba68a99bc07ff043e7dc052e5698edcd9";
  const OWNER_ID = "0xfee4148c7bd7a824b1dc6e2b4be10476cfaec92783c7db06a9b8d7559bb3f9d9";
  const PORT = "8080";
  const HOST = "gmic.top";
  const INVITER = null;
  
  try {
    
    return (
      <ErrorBoundary>
        <DynamicContextProvider
          settings={{
            environmentId: '2a6a2498-e013-4b1b-983a-cb2a53cd7d9d',
            appName: 'GM App',
            initialAuthenticationMode: 'connect-only',
            walletConnectors: [EthereumWalletConnectors],
            events: {
              onAuthSuccess: (event) => {
              },
              onAuthError: (error) => {
              },
              onLogout: () => {
              }
            }
          }}
        >
          <WalletProvider appChainId={CHAIN_ID}>
            <GraphQLProvider 
              chainId={CHAIN_ID} 
              applicationId={APP_ID} 
              ownerId={OWNER_ID} 
              port={PORT}
              host={HOST}
            >
              <App 
                chainId={CHAIN_ID} 
                ownerId={OWNER_ID} 
                appId={APP_ID}
                appChainId={CHAIN_ID}
                port={PORT}
                inviter={INVITER}
              />
            </GraphQLProvider>
          </WalletProvider>
        </DynamicContextProvider>
      </ErrorBoundary>
    );
  } catch (error) {
    return (
      <div className="app-container">
        <header className="app-header">
          <h1 className="app-title">Linera GM Demo</h1>
        </header>
        <main className="main-content">
          <div className="game-setup">
            <h2>Application Initialization Error</h2>
            <p>Sorry, the application encountered an error during initialization:</p>
            <pre style={{ color: 'red', overflow: 'auto' }}>
              {error && error.toString()}
            </pre>
            <p>Please refresh the page to try again, or check if the URL parameters are correct.</p>
          </div>
        </main>
      </div>
    );
  }
}

function GraphQLApp() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  
  try {
    const CHAIN_ID = id;
    const APP_ID = searchParams.get("app") || import.meta.env.VITE_APP_ID;
    const OWNER_ID = searchParams.get("owner") || import.meta.env.VITE_OWNER_ID;
    const PORT = searchParams.get("port") || import.meta.env.VITE_PORT || "8080";
    const HOST = searchParams.get("host") || import.meta.env.VITE_HOST || "localhost";
    const INVITER = searchParams.get("inviter"); // 获取inviter参数
    
    return (
      <ErrorBoundary>
        <DynamicContextProvider
          settings={{
            environmentId: '2a6a2498-e013-4b1b-983a-cb2a53cd7d9d',
            appName: 'GM App',
            initialAuthenticationMode: 'connect-only',
            walletConnectors: [EthereumWalletConnectors],
            events: {
              onAuthSuccess: (event) => {
              },
              onAuthError: (error) => {
              },
              onLogout: () => {
              }
            }
          }}
        >
          <WalletProvider appChainId={CHAIN_ID}>
            <GraphQLProvider 
              chainId={CHAIN_ID} 
              applicationId={APP_ID} 
              ownerId={OWNER_ID} 
              port={PORT}
              host={HOST}
            >
              <App 
                chainId={CHAIN_ID} 
                ownerId={OWNER_ID} 
                appId={APP_ID}
                appChainId={CHAIN_ID}
                port={PORT}
                inviter={INVITER}
              />
            </GraphQLProvider>
          </WalletProvider>
        </DynamicContextProvider>
      </ErrorBoundary>
    );
  } catch (error) {
    return (
      <div className="app-container">
        <header className="app-header">
          <h1 className="app-title">Linera GM Demo</h1>
        </header>
        <main className="main-content">
          <div className="game-setup">
            <h2>Application Initialization Error</h2>
            <p>Sorry, the application encountered an error during initialization:</p>
            <pre style={{ color: 'red', overflow: 'auto' }}>
              {error && error.toString()}
            </pre>
            <p>Please refresh the page to try again, or check if the URL parameters are correct.</p>
          </div>
        </main>
      </div>
    );
  }
}