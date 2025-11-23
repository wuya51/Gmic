#![cfg_attr(target_arch = "wasm32", no_main)]

mod state;
use crate::state::GmState;
use linera_sdk::{Contract, ContractRuntime};
use linera_sdk::linera_base_types::{AccountOwner, StreamName, StreamUpdate};
use linera_sdk::views::{View, RootView, RegisterView, MapView};
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
            Ok(state) => state,
            Err(_) => {
                GmState {
                    owner: RegisterView::new(context.clone()).expect("Failed to create owner register"),
                    last_gm: MapView::new(context.clone()).expect("Failed to create last_gm map"),
                    total_messages: RegisterView::new(context.clone()).expect("Failed to create total_messages register"),
                    chain_messages: MapView::new(context.clone()).expect("Failed to create chain_messages map"),
                    wallet_messages: MapView::new(context.clone()).expect("Failed to create wallet_messages map"),
                    events: MapView::new(context.clone()).expect("Failed to create events map"),
                    user_events: MapView::new(context.clone()).expect("Failed to create user_events map"),
                    hourly_stats: MapView::new(context.clone()).expect("Failed to create hourly_stats map"),
                    daily_stats: MapView::new(context.clone()).expect("Failed to create daily_stats map"),
                    monthly_stats: MapView::new(context.clone()).expect("Failed to create monthly_stats map"),
                    top_users_cache: RegisterView::new(context.clone()).expect("Failed to create top_users_cache register"),
                    top_chains_cache: RegisterView::new(context.clone()).expect("Failed to create top_chains_cache register"),
                    cache_timestamp: RegisterView::new(context.clone()).expect("Failed to create cache_timestamp register"),
                    invitations: MapView::new(context.clone()).expect("Failed to create invitations map"),
                    invitation_stats: MapView::new(context.clone()).expect("Failed to create invitation_stats map"),
                    cooldown_enabled: RegisterView::new(context.clone()).expect("Failed to create cooldown_enabled register"),
                    cooldown_whitelist: MapView::new(context.clone()).expect("Failed to create cooldown_whitelist map"),
                    stream_events: MapView::new(context.clone()).expect("Failed to create stream_events map"),
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
            return;
        }
        
        if let Some(owner_value) = argument.get("owner") {
            if let Ok(owner) = serde_json::from_value::<AccountOwner>(owner_value.clone()) {
                let _ = state.set_owner(owner).await;
            }
        }
        
        let chain_id = self.runtime.chain_id();
        let application_id = self.runtime.application_id().forget_abi();
        let stream_name = StreamName::from("gm_events");
        
        self.runtime.subscribe_to_events(chain_id, application_id, stream_name);
    }

    async fn execute_operation(&mut self, operation: GmOperation) {
        let sender = match &operation {
            GmOperation::SetCooldownEnabled { .. } => {
                match self.runtime.authenticated_signer() {
                    Some(sender) => sender,
                    None => return,
                }
            }
            GmOperation::Gm { sender, recipient: _, content: _, inviter: _ } => sender.clone(),
            GmOperation::ClaimInvitationRewards { sender } => sender.clone(),
        };
        
        let chain_id = self.runtime.chain_id();
        let mut state = self.state.lock().await;
        let _owner = match state.owner.get() {
            Some(owner) => owner.clone(),
            None => return,
        };
        let timestamp = self.runtime.system_time();
        
        match operation {
            GmOperation::SetCooldownEnabled { enabled } => {
                let _ = state.set_cooldown_enabled(&sender, enabled).await;
                let _ = state.save().await;
            }
            GmOperation::Gm { sender: _, recipient, content, inviter } => {
                let content_str = content.as_deref().unwrap_or("GMicrochains");
                if !Self::is_message_content_valid(content_str) {
                    return;
                }
                
                let (in_cooldown, _) = match state.is_in_cooldown(chain_id, &sender, timestamp.micros()).await {
                    Ok(result) => result,
                    Err(_e) => return,
                };
                if in_cooldown {
                    return;
                }
                
                let final_content = if content.is_none() { Some("GMicrochains".to_string()) } else { content.clone() };
                let _ = state.record_gm(chain_id, sender, Some(recipient.clone()), timestamp, final_content.clone(), inviter).await;
                
                self.runtime.emit(
                    StreamName::from("gm_events"),
                    &GmMessage::Gm { sender, recipient: Some(recipient), timestamp, content: final_content },
                );
            }
            GmOperation::ClaimInvitationRewards { sender: _ } => {
                let _ = state.get_user_invitation_rewards(sender).await;
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
                content,
            } => {
                // 对于消息执行，不传递inviter参数
                let _ = state.record_gm(self.runtime.chain_id(), sender, recipient, timestamp, content, None).await;
            }
        }
    }

    async fn process_streams(&mut self, updates: Vec<StreamUpdate>) {
        for update in updates {
            let stream_name_str = update.stream_id.stream_name.to_string();
            
            if stream_name_str == "gm_events" || String::from_utf8_lossy(&update.stream_id.stream_name.0) == "gm_events" {
                for index in update.previous_index..update.next_index {
                    let event_data = self.runtime.read_event(
                        update.chain_id,
                        update.stream_id.stream_name.clone(),
                        index
                    );
                    
                    self.store_gm_event_for_service(event_data).await;
                }
            }
        }
    }

    async fn store(self) {
        let mut state = self.state.lock().await;
        let _ = state.save().await;
    }
}

impl GmContract {
    pub fn is_message_content_valid(content: &str) -> bool {
        if content.len() > 280 {
            return false;
        }
        
        if content.contains("<script") || content.contains("</script>") || 
           content.contains("<iframe") || content.contains("javascript:") {
            return false;
        }
        
        let sensitive_words = vec![
            "spam", "abuse", "hate", "violence", "illegal", "scam", "fraud"
        ];
        
        let content_lower = content.to_lowercase();
        for word in sensitive_words {
            if content_lower.contains(word) {
                return false;
            }
        }
        
        true
    }

    async fn store_gm_event_for_service(&mut self, gm_message: GmMessage) {
        let mut state = self.state.lock().await;
        
        let chain_id = self.runtime.chain_id();
        
        match gm_message {
            GmMessage::Gm { sender: _, recipient: _, timestamp: event_timestamp, content: _ } => {
                let key = (chain_id, event_timestamp.micros());

                let message_json = serde_json::to_string(&gm_message).unwrap_or_default();
                
                let _ = state.stream_events.insert(&key, message_json);
            }
        }
    }
}

impl linera_sdk::abi::WithContractAbi for GmContract {
    type Abi = GmAbi;
}