// service.rs
#![cfg_attr(target_arch = "wasm32", no_main)]

mod state;
use self::state::GmState;
use gm::{GmAbi, GmOperation};
use async_graphql::{EmptySubscription, Object, Request, Response, Schema, SimpleObject};
use linera_sdk::{Service, ServiceRuntime};
use linera_sdk::linera_base_types::{AccountOwner, ChainId};
use linera_sdk::views::{View, MapView, RegisterView};
use std::sync::Arc;
use tokio::sync::Mutex;

linera_sdk::service!(GmService);
impl linera_sdk::abi::WithServiceAbi for GmService {
    type Abi = GmAbi;
}

pub struct GmService {
    state: Arc<Mutex<GmState>>,
    runtime: Arc<ServiceRuntime<Self>>,
}

impl Service for GmService {
    type Parameters = ();

    async fn new(runtime: ServiceRuntime<Self>) -> Self {
        let context = runtime.root_view_storage_context();
        let state = match GmState::load(context.clone()).await {
            Ok(state) => state,
            Err(e) => {
                log::error!("Failed to load state, initializing empty state: {}", e);
                GmState {
                    // 修复：使用 context.clone() 复用初始上下文
                    owner: RegisterView::new(context.clone()).expect("Failed to init owner"),
                    last_gm: MapView::new(context.clone()).expect("Failed to init last_gm"),
                    total_messages: RegisterView::new(context.clone()).expect("Failed to init total_messages"),
                    chain_messages: MapView::new(context.clone()).expect("Failed to init chain_messages"),
                    wallet_messages: MapView::new(context.clone()).expect("Failed to init wallet_messages"),
                    events: MapView::new(context.clone()).expect("Failed to init events"),
                }
            }
        };
        Self {
            state: Arc::new(Mutex::new(state)),
            runtime: Arc::new(runtime),
        }
    }

    async fn handle_query(&self, request: Request) -> Response {
        let schema = Schema::build(
            QueryRoot {
                state: Arc::clone(&self.state),
                runtime: Arc::clone(&self.runtime),
            },
            MutationRoot {
                runtime: Arc::clone(&self.runtime),
                state: Arc::clone(&self.state),
            },
            EmptySubscription,
        )
        .finish();
        schema.execute(request).await
    }
}

#[derive(SimpleObject)]
pub struct GmRecord {
    owner: String,
    timestamp: u64,
}

#[derive(SimpleObject)]
pub struct GmEvent {
    sender: String,
    recipient: Option<String>,
    timestamp: u64,
}

#[derive(SimpleObject)]
struct SendGmResponse {
    success: bool,
    message: String,
    timestamp: u64,
}

struct QueryRoot {
    state: Arc<Mutex<GmState>>,
    runtime: Arc<ServiceRuntime<GmService>>,
}

#[Object]
impl QueryRoot {
    async fn get_gm_record(
        &self,
        owner: AccountOwner,
    ) -> Result<Option<GmRecord>, async_graphql::Error> {
        let state = self.state.lock().await;
        let chain_id = self.runtime.chain_id();
        let timestamp = state.get_last_gm(chain_id, &owner).await?;
        Ok(timestamp.map(|ts| GmRecord {
            owner: owner.to_string(),
            timestamp: ts,
        }))
    }

    async fn get_gm_events(
        &self,
        sender: AccountOwner,
    ) -> Result<Vec<GmEvent>, async_graphql::Error> {
        let state = self.state.lock().await;
        let chain_id = self.runtime.chain_id();
        let events = state.get_events(chain_id, &sender).await?;
        Ok(events
            .into_iter()
            .map(|(recipient, timestamp)| GmEvent {
                sender: sender.to_string(),
                recipient: recipient.map(|r| r.to_string()),
                timestamp,
            })
            .collect())
    }

    async fn get_stream_events(
        &self,
        chain_id: ChainId,
        index: u32,
    ) -> Result<Option<GmEvent>, async_graphql::Error> {
        let state = self.state.lock().await;
        let mut all_events = Vec::new();
        state
            .events
            .for_each_index_value(|(event_chain_id, sender, recipient), timestamp| {
                if event_chain_id == chain_id {
                    all_events.push(((sender.clone(), recipient.clone()), timestamp));
                }
                Ok(())
            })
            .await?;
        if index as usize >= all_events.len() {
            return Ok(None);
        }
        let ((sender, recipient), timestamp) = all_events[index as usize].clone();
        Ok(Some(GmEvent {
            sender: sender.to_string(),
            recipient: recipient.map(|r| r.to_string()),
            timestamp: *timestamp,
        }))
    }

    async fn get_total_messages(&self) -> Result<u64, async_graphql::Error> {
        let state = self.state.lock().await;
        log::info!("get_total_messages called");
        let total = state.get_total_messages().await;
        log::info!("Total messages: {}", total);
        Ok(total)
    }

    async fn get_chain_messages(&self, chain_id: ChainId) -> Result<u64, async_graphql::Error> {
        let state = self.state.lock().await;
        log::info!("get_chain_messages called with chain_id: {:?}", chain_id);
        let count = state.chain_messages.get(&chain_id).await.unwrap().unwrap_or(0);
        log::info!("Messages for chain {}: {}", chain_id, count);
        Ok(count)
    }

    async fn get_wallet_messages(&self, owner: AccountOwner) -> Result<u64, async_graphql::Error> {
        let state = self.state.lock().await;
        log::info!("get_wallet_messages called with owner: {:?}", owner);
        let count = state.wallet_messages.get(&owner).await.unwrap().unwrap_or(0);
        log::info!("Messages for wallet {}: {}", owner, count);
        Ok(count)
    }
}

struct MutationRoot {
    runtime: Arc<ServiceRuntime<GmService>>,
    state: Arc<Mutex<GmState>>,
}

#[Object]
impl MutationRoot {
    async fn send_gm(
        &self,
        chain_id: ChainId,
        sender: AccountOwner,
    ) -> Result<SendGmResponse, async_graphql::Error> {
        let current_chain_id = self.runtime.chain_id();
        log::info!("处理 sendGm 查询, chain_id: {}, sender: {:?}", chain_id, sender);
        let state = self.state.lock().await;
        let owner = {
            log::info!("当前 owner: {:?}", state.owner.get()); 
            // 修正：直接匹配 Option<AccountOwner>
            match state.owner.get() {
                Some(owner) => owner.clone(),
                None => {
                    log::error!("Contract owner 未初始化");
                    return Ok(SendGmResponse {
                        success: false,
                        message: "Contract owner not initialized".to_string(),
                        timestamp: 0,
                    });
                }
            }
        };
        // 新增：更新链计数和钱包计数
        state.get_chain_count(chain_id).await?;
        state.get_wallet_count(&sender).await?;
        drop(self.state.clone());  // 提前释放锁

        if chain_id != current_chain_id {
            let operation = GmOperation::Gm { recipient: owner };
            self.runtime.schedule_operation(&operation);
            return Ok(SendGmResponse {
                success: true,
                message: format!("Cross-chain GM sender {} sent to owner {} on chain {}", sender, owner, chain_id),
                timestamp: self.runtime.system_time().micros(),
            });
        }
        let operation = GmOperation::Gm { recipient: owner };
        self.runtime.schedule_operation(&operation);
        let timestamp = self.runtime.system_time();
        Ok(SendGmResponse {
            success: true,
            message: "GM recorded successfully to owner".to_string(),
            timestamp: timestamp.micros(),
        })
    }

    async fn send_gm_to(
        &self,
        chain_id: ChainId,
        sender: AccountOwner,
        recipient: AccountOwner,
    ) -> Result<SendGmResponse, async_graphql::Error> {
        let current_chain_id = self.runtime.chain_id();
        let state = self.state.lock().await; 
        // 获取可变锁
        // 新增：更新链计数和钱包计数（使用recipient作为钱包标识）
        state.get_chain_count(chain_id).await?;
        state.get_wallet_count(&sender).await?;
        drop(state);  // 提前释放锁

        if chain_id != current_chain_id {
            let operation = GmOperation::GmTo { recipient };
            self.runtime.schedule_operation(&operation);
            return Ok(SendGmResponse {
                success: true,
                message: format!("Cross-chain GM sender {} sent to owner {} on chain {}", sender, recipient, chain_id),
                timestamp: self.runtime.system_time().micros(),
            });
        }
        let operation = GmOperation::GmTo { recipient };
        self.runtime.schedule_operation(&operation);
        Ok(SendGmResponse {
            success: true,
            message: format!("GM to {} recorded successfully", recipient),
            timestamp: self.runtime.system_time().micros(),
        })
    }
}
