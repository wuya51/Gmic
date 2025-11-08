#![cfg_attr(target_arch = "wasm32", no_main)]

use serde::{Deserialize, Serialize};
use linera_sdk::linera_base_types::{AccountOwner, Timestamp};

#[derive(Clone, Serialize, Deserialize, Debug)]
pub enum GmMessage {
    Gm {
        sender: AccountOwner,
        recipient: Option<AccountOwner>,
        timestamp: Timestamp,
        content: Option<String>,
    },
}

pub struct GmAbi;

impl linera_sdk::abi::ContractAbi for GmAbi {
    type Operation = GmOperation;
    type Response = ();
}

impl linera_sdk::abi::ServiceAbi for GmAbi {
    type Query = async_graphql::Request;
    type QueryResponse = async_graphql::Response;
}

#[derive(Clone, Serialize, Deserialize, Debug)]
pub enum GmOperation {
    Gm { sender: AccountOwner, recipient: AccountOwner, content: Option<String> },
    GmTo { sender: AccountOwner, recipient: AccountOwner, content: Option<String> },
    GmWithInvitation { sender: AccountOwner, recipient: AccountOwner, content: Option<String>, inviter: Option<AccountOwner> },
    ClaimInvitationRewards { sender: AccountOwner },
    SetCooldownEnabled { enabled: bool },
}

#[derive(Clone, Serialize, Deserialize, Debug, async_graphql::SimpleObject)]
pub struct InvitationRecord {
    pub inviter: AccountOwner,
    pub invitee: AccountOwner,
    pub invited_at: Timestamp,
    pub rewarded: bool,
    pub rewarded_at: Option<Timestamp>,
}

#[derive(Clone, Serialize, Deserialize, Debug, async_graphql::SimpleObject)]
pub struct InvitationStats {
    pub total_invited: u32,
    pub total_rewards: u32,
    pub last_reward_time: Option<Timestamp>,
}
