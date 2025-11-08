```rust
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
            Ok(state) => {
                state
            }
            Err(e) => {
                GmState {
                    owner: RegisterView::new(context.clone()).expect("Failed to create owner register"),
                    last_gm: MapView::new(context.clone()).expect("Failed to create last_gm map"),
                    total_messages: RegisterView::new(context.clone()).expect("Failed to create total_messages register"),
                    chain_messages: MapView::new(context.clone()).expect("Failed to create chain_messages map"),
                    wallet_messages: MapView::new(context.clone()).expect("Failed to create wallet_messages map"),
                    events: MapView::new(context.clone()).expect("Failed to create events map"),
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
        match argument.get("owner") {
            Some(owner_value) => {
                match serde_json::from_value::<AccountOwner>(owner_value.clone()) {
                    Ok(owner) => {
                        match state.set_owner(owner).await {
                            Ok(()) => {}
                            Err(e) => {
                                return;
                            }
                        }
                    }
                    Err(e) => {}
                }
            }
            None => {}
        }
       
        let chain_id = self.runtime.chain_id();
        let application_id = self.runtime.application_id().forget_abi();
        let stream_name = StreamName::from("gm_events");
       
        self.runtime.subscribe_to_events(chain_id, application_id, stream_name.clone());
    }
    async fn execute_operation(&mut self, operation: GmOperation) {
        let sender = match &operation {
            GmOperation::SetCooldownEnabled { .. } => {
                match self.runtime.authenticated_signer() {
                    Some(sender) => {
                        sender
                    }
                    None => {
                        return;
                    }
                }
            }
            GmOperation::Gm { sender, recipient: _, content: _ } => {
                sender.clone()
            }
            GmOperation::GmTo { sender, recipient: _, content: _ } => {
                sender.clone()
            }
            GmOperation::GmWithInvitation { sender, recipient: _, content: _, inviter: _ } => {
                sender.clone()
            }
            GmOperation::ClaimInvitationRewards { sender } => {
                sender.clone()
            }
        };
       
        let chain_id = self.runtime.chain_id();
        let mut state = self.state.lock().await;
        let owner = match state.owner.get() {
            Some(owner) => owner.clone(),
            None => {
                return;
            }
        };
        let timestamp = self.runtime.system_time();
       
        match operation {
            GmOperation::SetCooldownEnabled { enabled } => {
                if let Err(e) = state.set_cooldown_enabled(&sender, enabled).await {
                    return;
                }
                if let Err(e) = state.save().await {
                    return;
                }
            }
            GmOperation::Gm { sender: _, recipient: _, content: _ } => {
                let (in_cooldown, remaining) = match state.is_in_cooldown(chain_id, &sender, timestamp.micros()).await {
                    Ok(result) => result,
                    Err(e) => {
                        return;
                    }
                };
                if in_cooldown {
                    return;
                }
               
                let default_content = Some("Gmicrochains".to_string());
                if let Err(e) = state.record_gm(chain_id, sender, Some(owner.clone()), timestamp, default_content.clone()).await {
                    return;
                }
                let event_message = GmMessage::Gm { sender, recipient: Some(owner), timestamp, content: default_content.clone() };
               
                self.runtime.emit(
                    StreamName::from("gm_events"),
                    &event_message,
                );
            }
            GmOperation::GmTo { sender: _, recipient, content: _ } => {
                let (in_cooldown, remaining) = match state.is_in_cooldown(chain_id, &sender, timestamp.micros()).await {
                    Ok(result) => result,
                    Err(e) => {
                        return;
                    }
                };
                if in_cooldown {
                    return;
                }
               
                let default_content = Some("Gmicrochains".to_string());
                if let Err(e) = state.record_gm(chain_id, sender, Some(recipient.clone()), timestamp, default_content.clone()).await {
                    return;
                }
                self.runtime.emit(
                    StreamName::from("gm_events"),
                    &GmMessage::Gm { sender, recipient: Some(recipient), timestamp, content: default_content },
                );
            }
            GmOperation::GmWithInvitation { sender: _, recipient, content: _, inviter } => {
                let (in_cooldown, remaining) = match state.is_in_cooldown(chain_id, &sender, timestamp.micros()).await {
                    Ok(result) => result,
                    Err(e) => {
                        return;
                    }
                };
                if in_cooldown {
                    return;
                }
               
                let default_content = Some("Gmicrochains".to_string());
                if let Err(e) = state.record_gm(chain_id, sender, Some(recipient.clone()), timestamp, default_content.clone()).await {
                    return;
                }
                if let Err(e) = state.handle_gm_with_invitation(sender, inviter, timestamp).await {
                }
                self.runtime.emit(
                    StreamName::from("gm_events"),
                    &GmMessage::Gm { sender, recipient: Some(recipient), timestamp, content: default_content },
                );
            }
            GmOperation::ClaimInvitationRewards { sender: _ } => {
                if let Err(e) = state.claim_invitation_rewards(sender).await {
                }
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
                content: _,
            } => {
                let default_content = Some("Gmicrochains".to_string());
                if let Err(e) = state.record_gm(self.runtime.chain_id(), sender, recipient, timestamp, default_content).await {
                }
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
        match state.save().await {
            Ok(()) => {}
            Err(e) => {}
        }
    }
}
impl GmContract {
    async fn store_gm_event_for_service(&mut self, gm_message: GmMessage) {
        let mut state = self.state.lock().await;
       
        let chain_id = self.runtime.chain_id();
        let timestamp = self.runtime.system_time().micros();
       
        match gm_message {
            GmMessage::Gm { sender, recipient, timestamp: _event_timestamp, content } => {
               
                if let Err(e) = state.add_event(chain_id, &sender, recipient, timestamp, content).await {
                }
            }
        }
    }
}
impl linera_sdk::abi::WithContractAbi for GmContract {
    type Abi = GmAbi;
}
```
