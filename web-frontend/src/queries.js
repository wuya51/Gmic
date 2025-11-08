import { gql } from '@apollo/client';

// Queries
export const GET_GM_STATS = gql`
  query GetGmStats($chainId: ChainId!) {
    totalMessages: getTotalMessages
    chainMessages: getChainMessages(chainId: $chainId)
  }
`;

export const GET_WALLET_MESSAGES = gql`
  query GetWalletMessages($owner: AccountOwner!) {
    walletMessages: getWalletMessages(owner: $owner)
  }
`;

export const GET_GM_RECORD = gql`
  query GetGmRecord($owner: AccountOwner!) {
    getGmRecord(owner: $owner) {
      owner
      timestamp
    }
  }
`;

export const GET_INVITATION_STATS = gql`
  query GetInvitationStats($user: AccountOwner!) {
    getInvitationStats(user: $user) {
      totalInvited
      totalRewards
      lastRewardTime
    }
  }
`;

export const GET_LEADERBOARD = gql`
  query GetLeaderboard($limit: Int) {
    getTopUsers(limit: $limit) {
      user
      count
    }
  }
`;

export const CHECK_COOLDOWN = gql`
  query CheckCooldown($user: AccountOwner!) {
    checkCooldownStatus(user: $user) {
      inCooldown
      remainingTime
      enabled
    }
  }
`;

export const IS_USER_WHITELISTED = gql`
  query IsUserWhitelisted($user: AccountOwner!) {
    isUserWhitelisted(user: $user)
  }
`;

export const GET_COOLDOWN_STATUS = gql`
  query GetCooldownStatus {
    getCooldownStatus {
      enabled
    }
  }
`;

export const GET_GM_EVENTS = gql`
  query GetGmEvents($sender: AccountOwner!) {
    getGmEvents(sender: $sender) {
      sender
      recipient
      timestamp
      content
    }
  }
`;

export const GET_STREAM_EVENTS = gql`
  query GetStreamEvents($chainId: ChainId!) {
    getStreamEvents(chainId: $chainId) {
      sender
      recipient
      timestamp
      content
    }
  }
`;

// 订阅查询 - 应用服务使用智能轮询策略
export const SUBSCRIBE_GM_EVENTS = gql`
  subscription SubscribeGmEvents($chainId: ChainId!) {
    notifications(chainId: $chainId)
  }
`;

// Mutations
export const SEND_GM = gql`
  mutation SendGm($chainId: ChainId!, $sender: AccountOwner!, $content: String) {
    sendGm(chainId: $chainId, sender: $sender, content: $content) {
      success
      message
      timestamp
    }
  }
`;

export const SEND_GM_TO = gql`
  mutation SendGmTo($chainId: ChainId!, $sender: AccountOwner!, $recipient: AccountOwner!, $content: String) {
    sendGmTo(chainId: $chainId, sender: $sender, recipient: $recipient, content: $content) {
      success
      message
      timestamp
    }
  }
`;

export const SEND_GM_WITH_INVITATION = gql`
  mutation SendGmWithInvitation($chainId: ChainId!, $sender: AccountOwner!, $recipient: AccountOwner!, $inviter: AccountOwner, $content: String) {
    sendGmWithInvitation(chainId: $chainId, sender: $sender, recipient: $recipient, inviter: $inviter, content: $content) {
      success
      message
      timestamp
    }
  }
`;

export const CLAIM_INVITATION_REWARDS = gql`
  mutation ClaimInvitationRewards($user: AccountOwner!) {
    claimInvitationRewards(user: $user) {
      success
      message
      timestamp
    }
  }
`;

export const SET_COOLDOWN_ENABLED = gql`
  mutation SetCooldownEnabled($caller: AccountOwner!, $enabled: Boolean!) {
    setCooldownEnabled(caller: $caller, enabled: $enabled) {
      success
      message
    }
  }
`;