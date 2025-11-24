import { gql } from '@apollo/client';

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

export const GET_LEADERBOARD = gql`
  query GetLeaderboard($limit: Int) {
    getTopUsers(limit: $limit) {
      user
      count
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

export const GET_INVITATION_LEADERBOARD = gql`
  query GetInvitationLeaderboard($limit: Int) {
    getTopInvitors(limit: $limit) {
      user
      count
    }
  }
`;

export const GET_INVITATION_RANK = gql`
  query GetInvitationRank($user: AccountOwner!) {
    getInvitationRank(user: $user)
  }
`;

export const GET_INVITATION_RECORD = gql`
  query GetInvitationRecord($inviter: AccountOwner!) {
    getInvitationRecord(inviter: $inviter) {
      inviter
      invitee
      invitedAt
      rewarded
      rewardedAt
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

export const SUBSCRIBE_GM_EVENTS = gql`
  subscription SubscribeGmEvents($chainId: ChainId!) {
    notifications(chainId: $chainId)
  }
`;

export const SEND_GM = gql`
  mutation SendGm($chainId: ChainId!, $sender: AccountOwner!, $recipient: AccountOwner, $content: String, $inviter: AccountOwner) {
    sendGm(chainId: $chainId, sender: $sender, recipient: $recipient, content: $content, inviter: $inviter) {
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