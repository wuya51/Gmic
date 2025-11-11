// contract.rs
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
            log::info!("合约已初始化，跳过重复初始化");
            return;
        }
        log::info!("Initializing contract with argument: {:?}", argument);
        match argument.get("owner") {
            Some(owner_value) => {
                match serde_json::from_value::<AccountOwner>(owner_value.clone()) {
                    Ok(owner) => {
                        log::info!("成功解析 owner: {:?}", owner);
                        match state.set_owner(owner).await {
                            Ok(()) => log::info!("set_owner 执行成功"),
                            Err(e) => log::error!("设置 owner 失败: {}", e),
                        }
                    }
                    Err(e) => log::error!("解析 AccountOwner 失败: {}", e),
                }
            }
            None => log::error!("JSON 参数缺少 'owner' 字段"),
        }
        
        // 注册对gm_events流的订阅
        let chain_id = self.runtime.chain_id();
        let application_id = self.runtime.application_id().forget_abi();
        let stream_name = StreamName::from("gm_events");
        
        log::info!("🔍 注册对gm_events流的订阅 - 当前链ID: {:?}, 应用ID: {:?}", chain_id, application_id);
        
        // 关键诊断：检查我们是在哪个链上订阅
        log::info!("⚠️ 诊断信息 - 当前执行上下文:");
        log::info!("  - 链ID: {:?}", chain_id);
        log::info!("  - 应用ID: {:?}", application_id);
        log::info!("  - 流名: {:?}", stream_name);
        
        // 尝试订阅到正确的链（可能是用户链而不是合约链）
        self.runtime.subscribe_to_events(chain_id, application_id, stream_name.clone());
        log::info!("✅ GM事件流订阅注册成功 - 链ID: {:?}, 流名: {:?}", chain_id, stream_name);
        log::info!("⚠️ 重要：如果事件在其他链上发送，此订阅可能无法接收到事件！");
    }

    async fn execute_operation(&mut self, operation: GmOperation) {
        log::info!("Starting execute_operation with operation: {:?}", operation);
        
        // 从操作中获取sender，而不是使用authenticated_signer
        // 这是因为在 Wallet模式下，authenticated_signer返回的是合约地址，而不是发送者地址
        let sender = match &operation {
            GmOperation::SetCooldownEnabled { .. } => {
                // SetCooldownEnabled操作没有sender字段，需要使用authenticated_signer
                match self.runtime.authenticated_signer() {
                    Some(sender) => {
                        log::info!("Using authenticated signer for SetCooldownEnabled: {:?}", sender);
                        sender
                    }
                    None => {
                        log::error!("No authenticated signer for SetCooldownEnabled operation");
                        return;
                    }
                }
            }
            GmOperation::Gm { sender, recipient: _, content: _ } => {
                log::info!("Using sender from Gm operation: {:?}", sender);
                sender.clone()
            }
            GmOperation::GmTo { sender, recipient: _, content: _ } => {
                log::info!("Using sender from GmTo operation: {:?}", sender);
                sender.clone()
            }
            GmOperation::GmWithInvitation { sender, recipient: _, content: _, inviter: _ } => {
                log::info!("Using sender from GmWithInvitation operation: {:?}", sender);
                sender.clone()
            }
            GmOperation::ClaimInvitationRewards { sender } => {
                log::info!("Using sender from ClaimInvitationRewards operation: {:?}", sender);
                sender.clone()
            }
        };
        
        let chain_id = self.runtime.chain_id();
        let mut state = self.state.lock().await;
        let owner = match state.owner.get() {
            Some(owner) => owner.clone(),
            None => {
                log::error!("Owner not set");
                return;
            }
        };
        let timestamp = self.runtime.system_time();
        log::info!("Executing operation: chain_id={:?}, sender={:?}, timestamp={:?}, owner={:?}", chain_id, sender, timestamp, owner);
        
        match operation {
            GmOperation::SetCooldownEnabled { enabled } => {
                log::info!("Setting cooldown enabled to: {}", enabled);
                if let Err(e) = state.set_cooldown_enabled(&sender, enabled).await {
                    log::error!("Failed to set cooldown enabled: {}", e);
                    return;
                }
                // 保存状态更改
                if let Err(e) = state.save().await {
                    log::error!("Failed to save state after setting cooldown enabled: {}", e);
                    return;
                }
                log::info!("✅ Cooldown enabled set to: {}", enabled);
            }
            GmOperation::Gm { sender: _, recipient: _, content: _ } => {
                // 对于其他操作（GM、GmTo等），检查24小时限制
                let (in_cooldown, remaining) = match state.is_in_cooldown(chain_id, &sender, timestamp.micros()).await {
                    Ok(result) => result,
                    Err(e) => {
                        log::error!("检查24小时限制失败: {}", e);
                        return;
                    }
                };
                if in_cooldown {
                    log::error!("用户 {} 在24小时冷却期内，剩余时间: {:?} 微秒 (所有地址都受此限制)", sender, remaining);
                    return;
                }
                
                let default_content = Some("Gmicrochains".to_string());
                log::info!("Recording Gm with default content: {:?}", default_content);
                if let Err(e) = state.record_gm(chain_id, sender, Some(owner.clone()), timestamp, default_content.clone()).await {
                    log::error!("Failed to record Gm: {}", e);
                    return;
                }
                // 普通GM操作不处理邀请奖励（只有通过邀请链接的GM才处理奖励）
                log::info!("Gm recorded, total_messages={}", state.get_total_messages().await);
                let event_message = GmMessage::Gm { sender, recipient: Some(owner), timestamp, content: default_content.clone() };
                log::info!("🚀 准备发送GM事件到gm_events流: {:?}", event_message);
                
                self.runtime.emit(
                    StreamName::from("gm_events"),
                    &event_message,
                );
                
                log::info!("✅ GM事件已发送到gm_events流");
            }
            GmOperation::GmTo { sender: _, recipient, content: _ } => {
                // 对于其他操作（GM、GmTo等），检查24小时限制
                let (in_cooldown, remaining) = match state.is_in_cooldown(chain_id, &sender, timestamp.micros()).await {
                    Ok(result) => result,
                    Err(e) => {
                        log::error!("检查24小时限制失败: {}", e);
                        return;
                    }
                };
                if in_cooldown {
                    log::error!("用户 {} 在24小时冷却期内，剩余时间: {:?} 微秒 (所有地址都受此限制)", sender, remaining);
                    return;
                }
                
                let default_content = Some("Gmicrochains".to_string());
                log::info!("Recording GmTo with default content: {:?}", default_content);
                if let Err(e) = state.record_gm(chain_id, sender, Some(recipient.clone()), timestamp, default_content.clone()).await {
                    log::error!("Failed to record GmTo: {}", e);
                    return;
                }
                log::info!("GmTo recorded, total_messages={}", state.get_total_messages().await);
                self.runtime.emit(
                    StreamName::from("gm_events"),
                    &GmMessage::Gm { sender, recipient: Some(recipient), timestamp, content: default_content },
                );
            }
            GmOperation::GmWithInvitation { sender: _, recipient, content: _, inviter } => {
                // 对于其他操作（GM、GmTo等），检查24小时限制
                let (in_cooldown, remaining) = match state.is_in_cooldown(chain_id, &sender, timestamp.micros()).await {
                    Ok(result) => result,
                    Err(e) => {
                        log::error!("检查24小时限制失败: {}", e);
                        return;
                    }
                };
                if in_cooldown {
                    log::error!("用户 {} 在24小时冷却期内，剩余时间: {:?} 微秒 (所有地址都受此限制)", sender, remaining);
                    return;
                }
                
                let default_content = Some("Gmicrochains".to_string());
                log::info!("Recording GmWithInvitation with default content: {:?}, inviter: {:?}", default_content, inviter);
                if let Err(e) = state.record_gm(chain_id, sender, Some(recipient.clone()), timestamp, default_content.clone()).await {
                    log::error!("Failed to record GmWithInvitation: {}", e);
                    return;
                }
                // 处理邀请奖励（一次性）
                if let Err(e) = state.handle_gm_with_invitation(sender, inviter, timestamp).await {
                    log::error!("Failed to handle invitation rewards: {}", e);
                }
                log::info!("GmWithInvitation recorded, total_messages={}", state.get_total_messages().await);
                self.runtime.emit(
                    StreamName::from("gm_events"),
                    &GmMessage::Gm { sender, recipient: Some(recipient), timestamp, content: default_content },
                );
            }
            GmOperation::ClaimInvitationRewards { sender: _ } => {
                log::info!("Claiming invitation rewards for user: {:?}", sender);
                if let Err(e) = state.claim_invitation_rewards(sender).await {
                    log::error!("Failed to claim invitation rewards: {}", e);
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
                log::info!(
                    "Received Gm message: sender={:?}, recipient={:?}, timestamp={}, default_content={:?}",
                    sender, recipient, timestamp, default_content
                );
                if let Err(e) = state.record_gm(self.runtime.chain_id(), sender, recipient, timestamp, default_content).await {
                    log::error!("Failed to record cross-chain Gm: {}", e);
                }
            }
        }
    }

    /// 处理流事件更新，这是真正的事件驱动订阅机制
    /// 当有新的GM事件发生时，这个方法会被自动调用
    async fn process_streams(&mut self, updates: Vec<StreamUpdate>) {
        log::info!("🎯 process_streams方法被调用! 流更新数量: {}", updates.len());
        log::info!("Processing stream updates: {:?}", updates);
        
        for update in updates {
            log::info!(
                "Stream update received - chain_id: {:?}, stream_id: {:?}, previous_index: {}, next_index: {}",
                update.chain_id, update.stream_id, update.previous_index, update.next_index
            );

            // 处理gm_events流的事件
            let stream_name_str = update.stream_id.stream_name.to_string();
            log::info!("🔍 流名检查 - 原始流名: {}, 解码后: {:?}", stream_name_str, String::from_utf8_lossy(&update.stream_id.stream_name.0));
            
            if stream_name_str == "gm_events" || String::from_utf8_lossy(&update.stream_id.stream_name.0) == "gm_events" {
                log::info!("✅ 匹配到gm_events流，开始处理流更新");
                log::info!("🔍 循环范围: previous_index={}, next_index={}, 范围长度: {}", 
                    update.previous_index, update.next_index, update.next_index - update.previous_index);
                
                // 读取新的事件数据
                for index in update.previous_index..update.next_index {
                    log::info!("🔍 开始读取事件 - 索引: {}", index);
                    
                    let event_data = self.runtime.read_event(
                        update.chain_id,
                        update.stream_id.stream_name.clone(),
                        index
                    );
                    
                    // 解析GM事件 - 添加更详细的日志
                    log::info!("🎯 读取到GM事件数据 - 链ID: {:?}, 流名: {:?}, 索引: {}, 数据: {:?}", 
                        update.chain_id, update.stream_id.stream_name, index, event_data);
                    
                    // 检查事件数据是否有效（GmMessage枚举总是有效的）
                    log::info!("✅ 读取到有效的GM事件数据");
                    
                    // 将事件存储到状态中，供服务层查询
                    self.store_gm_event_for_service(event_data).await;
                }
            }
        }
    }

    async fn store(self) {
        log::info!("Attempting to save GmContract state");
        let mut state = self.state.lock().await;
        match state.save().await {
            Ok(()) => log::info!("State saved successfully"),
            Err(e) => log::error!("Failed to save state: {}", e),
        }
    }
}

impl GmContract {
    /// 将GM事件存储到状态中，供服务层订阅查询
    async fn store_gm_event_for_service(&mut self, gm_message: GmMessage) {
        let mut state = self.state.lock().await;
        
        // 将事件存储到stream_events映射中
        let chain_id = self.runtime.chain_id();
        let timestamp = self.runtime.system_time().micros();
        
        // 使用模式匹配来访问GmMessage枚举的字段
        match gm_message {
            GmMessage::Gm { sender, recipient, timestamp: _event_timestamp, content } => {
                log::info!("🎯 开始存储GM事件到服务层 - 发送者: {:?}, 接收者: {:?}, 内容: {:?}", sender, recipient, content);
                
                if let Err(e) = state.add_event(chain_id, &sender, recipient, timestamp, content).await {
                    log::error!("❌ 存储GM事件到服务层失败: {}", e);
                } else {
                    log::info!("✅ GM事件已存储到服务层订阅: sender={:?}, recipient={:?}, timestamp={}", sender, recipient, timestamp);
                }
            }
        }
    }
}

impl linera_sdk::abi::WithContractAbi for GmContract {
    type Abi = GmAbi;
}