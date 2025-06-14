// contract.rs
#![cfg_attr(target_arch = "wasm32", no_main)]

mod state;
use crate::state::GmState;
use linera_sdk::{Contract, ContractRuntime};
use linera_sdk::linera_base_types::{AccountOwner, StreamName};
use linera_sdk::views::{View, RootView, RegisterView, MapView};
use log::{error, info};
use std::sync::Arc;
use tokio::sync::Mutex;
use gm::{GmAbi, GmMessage, GmOperation};

linera_sdk::contract!(GmContract);

pub struct GmContract {
    state: Arc<Mutex<GmState>>,
    runtime: ContractRuntime<Self>,
}

impl Contract for GmContract {
    type Message = GmMessage;
    type Parameters = ();
    type InstantiationArgument = serde_json::Value;
    type EventValue = GmMessage;

    async fn load(runtime: ContractRuntime<Self>) -> Self {
        let context = runtime.root_view_storage_context();
        let state = match GmState::load(context.clone()).await {
            Ok(state) => {
                log::info!("加载成功后的 owner: {:?}", state.owner.get());  // 新增：验证加载的 owner
                state
            }
            Err(e) => {
                log::error!("Failed to load state (initializing empty state): {:#?}", e);
                GmState {
                    owner: RegisterView::new(context.clone()).expect("Failed to create owner register"),
                    last_gm: MapView::new(context.clone()).expect("Failed to create last_gm map"),
                    total_messages: RegisterView::new(context.clone()).expect("Failed to create total_messages register"),
                    chain_messages: MapView::new(context.clone()).expect("Failed to create chain_messages map"),
                    wallet_messages: MapView::new(context.clone()).expect("Failed to create wallet_messages map"),
                    events: MapView::new(context.clone()).expect("Failed to create events map"),
                }
            }
        };
        Self {
            state: Arc::new(Mutex::new(state)),
            runtime,
        }
    }

    async fn instantiate(&mut self, argument: Self::InstantiationArgument) {
        let mut state = self.state.lock().await;
        if state.owner.get().is_some() {
            info!("合约已初始化，跳过重复初始化");
            return;
        }
        info!("Initializing contract with argument: {:?}", argument);
        match argument.get("owner") {
            Some(owner_value) => {
                match serde_json::from_value::<AccountOwner>(owner_value.clone()) {
                    Ok(owner) => {
                        info!("成功解析 owner: {:?}", owner);
                        match state.set_owner(owner).await {
                            Ok(()) => info!("set_owner 执行成功"),
                            Err(e) => error!("设置 owner 失败: {}", e),
                        }
                    }
                    Err(e) => error!("解析 AccountOwner 失败: {}", e),
                }
            }
            None => error!("JSON 参数缺少 'owner' 字段"),
        }        
    }

    async fn execute_operation(&mut self, operation: GmOperation) {
        info!("Starting execute_operation with operation: {:?}", operation);
        /* 绕过签名验证，直接从操作参数中获取sender
        let sender = match self.runtime.authenticated_signer() {
            Some(signer) => {
                info!("Authenticated signer: {:?}", signer);
                signer
            }
            None => {
                error!("No authenticated signer");
                return;
            }
        };
        */
        let sender = match operation {
            GmOperation::Gm { sender, .. } => sender,
            GmOperation::GmTo { sender, .. } => sender,
        };
        let chain_id = self.runtime.chain_id();
        let mut state = self.state.lock().await;
        let owner = match state.owner.get() {
            Some(owner) => owner.clone(),
            None => {
                error!("Owner not set");
                return;
            }
        };
        let timestamp = self.runtime.system_time();
        info!("Executing operation: chain_id={:?}, sender={:?}, timestamp={:?}, owner={:?}", chain_id, sender, timestamp, owner);
        match operation {
            GmOperation::Gm { sender: _, recipient: _ } => {
                info!("Recording Gm");
                if let Err(e) = state.record_gm(chain_id, sender, Some(owner.clone()), timestamp).await {
                    error!("Failed to record Gm: {}", e);
                    return;
                }
                info!("Gm recorded, total_messages={}", state.get_total_messages().await);
                self.runtime.emit(
                    StreamName::from("gm_events"),
                    &GmMessage::Gm { sender, recipient: Some(owner), timestamp },
                );
            }
            GmOperation::GmTo { sender, recipient } => {
                info!("Recording GmTo");
                if let Err(e) = state.record_gm(chain_id, sender, Some(recipient.clone()), timestamp).await {
                    error!("Failed to record GmTo: {}", e);
                    return;
                }
                info!("GmTo recorded, total_messages={}", state.get_total_messages().await);
                self.runtime.emit(
                    StreamName::from("gm_events"),
                    &GmMessage::Gm { sender, recipient: Some(recipient), timestamp },
                );
            }
        }
    }

    async fn execute_message(&mut self, message: Self::Message) {
        let mut state = self.state.lock().await;
        match message {
            GmMessage::Gm {
                sender,
                recipient,
                timestamp,
            } => {
                info!(
                    "Received Gm message: sender={:?}, recipient={:?}, timestamp={}",
                    sender, recipient, timestamp
                );
                if let Err(e) = state.record_gm(self.runtime.chain_id(), sender, recipient, timestamp).await {
                    error!("Failed to record cross-chain Gm: {}", e);
                }
            }
        }
    }

    async fn store(self) {
        info!("Attempting to save GmContract state");
        let mut state = self.state.lock().await;
        match state.save().await {
            Ok(()) => info!("State saved successfully"),
            Err(e) => error!("Failed to save state: {}", e),
        }
    }
}

impl linera_sdk::abi::WithContractAbi for GmContract {
    type Abi = GmAbi;
}