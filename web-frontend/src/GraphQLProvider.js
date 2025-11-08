import {
  ApolloClient,
  ApolloProvider,
  HttpLink,
  InMemoryCache,
  split,
} from "@apollo/client";
import React from "react";
import { GraphQLWsLink } from "@apollo/client/link/subscriptions";
import { createClient } from "graphql-ws";
import { getMainDefinition } from "@apollo/client/utilities";

function GraphQLProvider({ chainId, applicationId, port, host = 'localhost', children }) {
  let client = apolloClient(chainId, applicationId, port, host);
  return <ApolloProvider client={client}>{children}</ApolloProvider>;
}

function apolloClient(chainId, applicationId, port, host = 'localhost') {
  // 使用相对路径，通过nginx代理
  const wsUrl = `/ws`;
  const httpUrl = `/chains/${chainId}/applications/${applicationId}`;
  
  console.log('🔧 GraphQL客户端配置:', {
    chainId,
    applicationId,
    port,
    host,
    wsUrl,
    httpUrl
  });
    
  const wsLink = new GraphQLWsLink(
    createClient({
      url: wsUrl,
      connectionParams: () => ({
        // 添加连接参数以确保订阅正常工作
        chainId: chainId,
        applicationId: applicationId
      }),
      shouldRetry: () => true,
      retryAttempts: 10, 
      retryWait: async (retries) => {

        const delay = Math.min(500 * Math.pow(1.2, retries), 3000);
        await new Promise(resolve => setTimeout(resolve, delay));
      },
      keepAlive: 5000, // 
      on: {
        connected: () => {
          console.log('WebSocket连接已建立');
        },
        error: (error) => {
          console.error('WebSocket连接错误:', error);
        },
        closed: (event) => {
          console.log('WebSocket连接已关闭:', event);
        },
        ping: () => {
          // 自定义ping处理
        },
        pong: () => {
          // 自定义pong处理
        }
      }
    })
  );

  const httpLink = new HttpLink({
    uri: httpUrl,
  });

  const splitLink = split(
    ({ query }) => {
      const definition = getMainDefinition(query);
      return (
        definition.kind === "OperationDefinition" &&
        definition.operation === "subscription"
      );
    },
    wsLink,
    httpLink
  );
  return new ApolloClient({
    link: splitLink,
    cache: new InMemoryCache({
      typePolicies: {
        Query: {
          fields: {
            getTotalMessages: {
              merge: false,
            },
            getChainMessages: {
              merge: false,
            },
            getWalletMessages: {
              merge: false,
            },
            getStreamEvents: {
              merge: false,
            },
            getTopUsers: {
              merge: false,
            }
          }
        }
      }
    }),
    defaultOptions: {
      watchQuery: {
        errorPolicy: 'all',
        notifyOnNetworkStatusChange: true,
        fetchPolicy: 'no-cache',
        pollInterval: 10000, // 减少到10秒自动刷新一次数据，提高实时性
      },
      query: {
        errorPolicy: 'all',
        fetchPolicy: 'no-cache',
      },
      mutate: {
        errorPolicy: 'all',
      }
    },
  });
}

export default GraphQLProvider;