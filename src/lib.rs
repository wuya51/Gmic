// lib.rs
#![cfg_attr(target_arch = "wasm32", no_main)]

use serde::{Deserialize, Serialize};
use linera_sdk::linera_base_types::{AccountOwner, Timestamp};

// Define message types (also used for events)
#[derive(Clone, Serialize, Deserialize, Debug)]
pub enum GmMessage {
    Gm {
        sender: AccountOwner,
        recipient: Option<AccountOwner>,
        timestamp: Timestamp, // Changed to use Timestamp type
    },
}

// Define the ABI
pub struct GmAbi;

impl linera_sdk::abi::ContractAbi for GmAbi {
    type Operation = GmOperation;
    type Response = ();
}

impl linera_sdk::abi::ServiceAbi for GmAbi {
    type Query = async_graphql::Request;
    type QueryResponse = async_graphql::Response;
}

// Define operation types
#[derive(Clone, Serialize, Deserialize, Debug)]
pub enum GmOperation {
    Gm { sender: AccountOwner, recipient: AccountOwner },
    GmTo { sender: AccountOwner, recipient: AccountOwner },    
}
