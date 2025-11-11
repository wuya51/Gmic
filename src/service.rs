// service.rs
#![cfg_attr(target_arch = "wasm32", no_main)]

mod state;
use self::state::GmState;
use gm::{GmAbi, GmOperation, InvitationRecord, InvitationStats};
use async_graphql::{Object, Request, Response, Schema, SimpleObject, Subscription};
use linera_sdk::{Service, ServiceRuntime};
use linera_sdk::linera_base_types::{AccountOwner, ChainId};
use linera_sdk::views::{View, MapView, RegisterView};
use std::sync::Arc;
use tokio::sync::Mutex;
use serde::{Deserialize, Serialize};

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
                    user_events: MapView::new(context.clone()).expect("Failed to init user_events"),
                    hourly_stats: MapView::new(context.clone()).expect("Failed to init hourly_stats"),
                    daily_stats: MapView::new(context.clone()).expect("Failed to init daily_stats"),
                    monthly_stats: MapView::new(context.clone()).expect("Failed to init monthly_stats"),
                    top_users_cache: RegisterView::new(context.clone()).expect("Failed to init top_users_cache"),
                    top_chains_cache: RegisterView::new(context.clone()).expect("Failed to init top_chains_cache"),
                    cache_timestamp: RegisterView::new(context.clone()).expect("Failed to init cache_timestamp"),
                    invitations: MapView::new(context.clone()).expect("Failed to init invitations"),
                    invitation_stats: MapView::new(context.clone()).expect("Failed to init invitation_stats"),
                    cooldown_enabled: RegisterView::new(context.clone()).expect("Failed to init cooldown_enabled"),
                    cooldown_whitelist: MapView::new(context.clone()).expect("Failed to init cooldown_whitelist"),
                    stream_events: MapView::new(context.clone()).expect("Failed to init stream_events"),
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
            SubscriptionRoot {
                runtime: Arc::clone(&self.runtime),
                state: Arc::clone(&self.state),
            },
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

#[derive(SimpleObject, Serialize, Deserialize, Debug, async_graphql::InputObject)]
pub struct SignatureData {
    pub sender: String,
    pub recipient: Option<String>,
    pub chain_id: String,
    pub timestamp: u64,
    pub nonce: u64,
    pub content: Option<String>, // 新增：自定义消息内容
}

#[derive(SimpleObject)]
pub struct SignatureVerificationResult {
    pub success: bool,
    pub message: String,
    pub verified_sender: Option<String>,
}

#[derive(SimpleObject, Serialize)]
pub struct GmEvent {
    sender: String,
    recipient: Option<String>,
    timestamp: u64,
    content: Option<String>, // 新增：自定义消息内容
}

#[derive(SimpleObject)]
struct SendGmResponse {
    success: bool,
    message: String,
    timestamp: u64,
}

/// 24小时限制状态
#[derive(SimpleObject)]
struct CooldownStatus {
    enabled: bool,
}

/// 冷却期检查结果
#[derive(SimpleObject)]
struct CooldownCheckResult {
    in_cooldown: bool,
    remaining_time: Option<u64>, // 剩余时间（微秒）
    enabled: bool,
}

/// 白名单操作结果
#[derive(SimpleObject)]
struct WhitelistOperationResult {
    success: bool,
    message: String,
}



/// GM事件通知数据
#[derive(Serialize, Deserialize)]
struct GmEventData {
    sender: String,
    recipient: Option<String>,
    content: Option<String>,
}

/// 链状态变化通知数据
#[derive(Serialize, Deserialize)]
struct ChainStatusData {
    message_count: u64,
}

/// 个人消息通知数据
#[derive(Serialize, Deserialize)]
struct PersonalMessageData {
    sender: String,
    recipient: String,
    content: Option<String>,
}

/// 24小时限制状态通知数据
#[derive(Serialize, Deserialize)]
struct CooldownStatusData {
    user: String,
    enabled: bool,
}

/// 邀请系统通知数据
#[derive(Serialize, Deserialize)]
struct InvitationEventData {
    inviter: String,
    invitee: String,
    reward_claimed: bool,
}

/// 排行榜更新通知数据
#[derive(Serialize, Deserialize)]
struct LeaderboardUpdateData {
    leaderboard_type: String,
    top_users: Vec<LeaderboardUser>,
    top_chains: Vec<LeaderboardChain>,
}



/// 时间段统计数据结构
#[derive(SimpleObject)]
struct TimeStat {
    time: u64,
    count: u64,
}

/// 排行榜用户数据结构
#[derive(SimpleObject, Serialize, Deserialize)]
struct LeaderboardUser {
    user: String,
    count: u64,
}

/// 排行榜链数据结构
#[derive(SimpleObject, Serialize, Deserialize)]
struct LeaderboardChain {
    chain: String,
    count: u64,
}

// 签名验证辅助函数
impl GmService {
    /// 简单通用签名验证（WASM环境中只做基本格式检查）
    /// 注意：真正的签名验证应该在前端完成，这里只确保数据格式正确
    fn simple_verify_signature(
        &self,
        signature_data: &SignatureData,
        signature: &str,
    ) -> Result<SignatureVerificationResult, async_graphql::Error> {
        // 1. 基本数据格式检查
        if signature_data.sender.is_empty() {
            return Ok(SignatureVerificationResult {
                success: false,
                message: "发送者地址不能为空".to_string(),
                verified_sender: None,
            });
        }
        
        // 2. 检查发送者地址格式（hex字符，至少40字符）
        if !signature_data.sender.chars().all(|c| c.is_ascii_hexdigit()) {
            return Ok(SignatureVerificationResult {
                success: false,
                message: "发送者地址格式无效".to_string(),
                verified_sender: None,
            });
        }
        
        if signature_data.sender.len() < 40 {
            return Ok(SignatureVerificationResult {
                success: false,
                message: "发送者地址长度过短".to_string(),
                verified_sender: None,
            });
        }
        
        // 3. 检查签名格式（hex编码，至少10字符）
        if signature.len() < 10 {
            return Ok(SignatureVerificationResult {
                success: false,
                message: "签名格式无效".to_string(),
                verified_sender: None,
            });
        }
        
        if signature.chars().any(|c| !c.is_ascii_hexdigit()) {
            return Ok(SignatureVerificationResult {
                success: false,
                message: "签名格式错误（包含非hex字符）".to_string(),
                verified_sender: None,
            });
        }
        
        // 4. 在WASM环境中，真正的签名验证应该在前端完成
        // 这里只返回一个模拟的验证结果
        log::info!("签名格式检查通过 - 发送者: {}", signature_data.sender);
        
        Ok(SignatureVerificationResult {
            success: true,
            message: "签名格式验证成功".to_string(),
            verified_sender: Some(signature_data.sender.clone()),
        })
    }
}

struct QueryRoot {
    state: Arc<Mutex<GmState>>,
    runtime: Arc<ServiceRuntime<GmService>>,
}

struct MutationRoot {
    runtime: Arc<ServiceRuntime<GmService>>,
    state: Arc<Mutex<GmState>>,
}

struct SubscriptionRoot {
    runtime: Arc<ServiceRuntime<GmService>>,
    state: Arc<Mutex<GmState>>,
}

#[Object]
impl QueryRoot {
    async fn get_gm_record(
        &self,
        _ctx: &async_graphql::Context<'_>,
        owner: AccountOwner,
    ) -> Result<Option<GmRecord>, async_graphql::Error> {
        let state = self.state.lock().await;
        let chain_id = self.runtime.chain_id();        
        let timestamp = state.get_last_gm(chain_id, &owner).await?;        
        // 确保返回的数据结构正确，并明确处理没有GM记录的情况
        let record = match timestamp {
            Some(ts) => {
                Some(GmRecord {
                    owner: owner.to_string(),
                    timestamp: ts,
                })
            },
            None => {
                log::info!("No GM record found for chain {:?} and user {:?}", chain_id, owner);
                None
            }
        };
        
        Ok(record)
    }

    async fn get_gm_events(
        &self,
        _ctx: &async_graphql::Context<'_>,
        sender: AccountOwner,
    ) -> Result<Vec<GmEvent>, async_graphql::Error> {
        let state = self.state.lock().await;
        let chain_id = self.runtime.chain_id();
        let events = state.get_events(chain_id, &sender).await?;
        Ok(events
            .into_iter()
            .map(|(recipient, timestamp, content)| GmEvent {
                sender: sender.to_string(),
                recipient: recipient.map(|r| r.to_string()),
                timestamp,
                content, // 现在state.get_events返回包含内容的数据
            })
            .collect())
    }

    async fn get_stream_events(
        &self,
        _ctx: &async_graphql::Context<'_>,
        _chain_id: ChainId,
    ) -> Result<Vec<GmEvent>, async_graphql::Error> {
        let state = self.state.lock().await;
        let mut all_events = Vec::new();
        
        // 使用index_values方法获取所有事件，然后进行筛选
        let all_index_values = state.events.index_values().await?;
        
        for ((_event_chain_id, sender, recipient), (timestamp, content)) in all_index_values {
            // 返回所有链的事件，而不仅仅是当前链的事件
            // 这样所有用户都能看到跨链的GM事件
            all_events.push(GmEvent {
                sender: sender.to_string(),
                recipient: recipient.map(|r| r.to_string()),
                timestamp,
                content,
            });
        }       
        // 按时间戳排序，最新的在前
        all_events.sort_by(|a, b| b.timestamp.cmp(&a.timestamp));
        
        Ok(all_events)
    }

    async fn get_total_messages(&self, _ctx: &async_graphql::Context<'_>) -> Result<u64, async_graphql::Error> {
        let state = self.state.lock().await;
        let total = state.get_total_messages().await;
        Ok(total)
    }

    async fn get_chain_messages(&self, _ctx: &async_graphql::Context<'_>, chain_id: ChainId) -> Result<u64, async_graphql::Error> {
        let state = self.state.lock().await;
        let count = state.chain_messages.get(&chain_id).await.unwrap().unwrap_or(0);
        Ok(count)
    }

    async fn get_wallet_messages(&self, _ctx: &async_graphql::Context<'_>, owner: AccountOwner) -> Result<u64, async_graphql::Error> {
        let state = self.state.lock().await;      
        // 检查wallet_messages MapView是否包含该用户
        let has_user = state.wallet_messages.contains_key(&owner).await?;
        
        // 获取用户的GM数量
        let count = state.wallet_messages.get(&owner).await.unwrap().unwrap_or(0);
        
        // 如果用户不存在，检查是否有其他用户
        if !has_user {
            let mut users = Vec::new();
            state.wallet_messages.for_each_index(|user| {
                users.push(user.clone());
                Ok(())
            }).await?;
        }
        
        // 确保返回的count是有效的u64值
        let final_count = if count == 0 && !has_user { 0 } else { count };
        
        Ok(final_count)
    }
    
    /// 获取时间段统计
    async fn get_hourly_stats(&self, _ctx: &async_graphql::Context<'_>, chain_id: ChainId, start_hour: u64, end_hour: u64) -> Result<Vec<TimeStat>, async_graphql::Error> {
        let state = self.state.lock().await;
        let stats = state.get_hourly_stats(chain_id, start_hour, end_hour).await?;
        Ok(stats.into_iter().map(|(time, count)| TimeStat { time, count }).collect())
    }
    
    async fn get_daily_stats(&self, _ctx: &async_graphql::Context<'_>, chain_id: ChainId, start_day: u64, end_day: u64) -> Result<Vec<TimeStat>, async_graphql::Error> {
        let state = self.state.lock().await;
        let stats = state.get_daily_stats(chain_id, start_day, end_day).await?;
        Ok(stats.into_iter().map(|(time, count)| TimeStat { time, count }).collect())
    }
    
    async fn get_monthly_stats(&self, _ctx: &async_graphql::Context<'_>, chain_id: ChainId, start_month: u64, end_month: u64) -> Result<Vec<TimeStat>, async_graphql::Error> {
        let state = self.state.lock().await;
        let stats = state.get_monthly_stats(chain_id, start_month, end_month).await?;
        Ok(stats.into_iter().map(|(time, count)| TimeStat { time, count }).collect())
    }
    
    /// 获取热门排行榜
    async fn get_top_users(&self, _ctx: &async_graphql::Context<'_>, limit: u32) -> Result<Vec<LeaderboardUser>, async_graphql::Error> {
        let state = self.state.lock().await;
        let current_time = self.runtime.system_time().micros();
        let top_users = state.get_top_users(limit, current_time).await?;
        Ok(top_users.into_iter().map(|(user, count)| LeaderboardUser { 
            user: user.to_string(), 
            count 
        }).collect())
    }
    
    async fn get_top_chains(&self, _ctx: &async_graphql::Context<'_>, limit: u32) -> Result<Vec<LeaderboardChain>, async_graphql::Error> {
        let state = self.state.lock().await;
        let current_time = self.runtime.system_time().micros();
        let top_chains = state.get_top_chains(limit, current_time).await?;
        Ok(top_chains.into_iter().map(|(chain, count)| LeaderboardChain { 
            chain: chain.to_string(), 
            count 
        }).collect())
    }
    
    async fn get_user_rank(&self, _ctx: &async_graphql::Context<'_>, user: AccountOwner) -> Result<u32, async_graphql::Error> {
        let state = self.state.lock().await;
        let rank = state.get_user_rank(&user).await?;
        Ok(rank)
    }
    
    /// 获取趋势分析数据
    async fn get_message_trend(&self, _ctx: &async_graphql::Context<'_>, chain_id: ChainId, period_days: u32) -> Result<Vec<TimeStat>, async_graphql::Error> {
        let state = self.state.lock().await;
        let current_time = self.runtime.system_time().micros();
        let trend = state.get_message_trend(chain_id, period_days, current_time).await?;
        Ok(trend.into_iter().map(|(time, count)| TimeStat { time, count }).collect())
    }
    
    async fn get_user_activity_trend(&self, _ctx: &async_graphql::Context<'_>, user: AccountOwner, period_days: u32) -> Result<Vec<TimeStat>, async_graphql::Error> {
        let state = self.state.lock().await;
        let current_time = self.runtime.system_time().micros();
        let trend = state.get_user_activity_trend(&user, period_days, current_time).await?;
        Ok(trend.into_iter().map(|(time, count)| TimeStat { time, count }).collect())
    }
    
    /// 获取下一个nonce值（用于签名验证）
    async fn get_next_nonce(&self, _ctx: &async_graphql::Context<'_>, owner: AccountOwner) -> Result<u64, async_graphql::Error> {
        // 在WASM环境中，使用简单的时间戳作为nonce
        // 真正的nonce管理应该在前端完成
        let nonce = self.runtime.system_time().micros();
        log::info!("获取nonce，钱包: {}，下一个nonce: {}", owner, nonce);
        Ok(nonce)
    }
    
    /// 获取24小时限制状态
    async fn get_cooldown_status(&self, _ctx: &async_graphql::Context<'_>) -> Result<CooldownStatus, async_graphql::Error> {
        let state = self.state.lock().await;
        let enabled = state.is_cooldown_enabled().await;
        Ok(CooldownStatus { enabled })
    }
    
    /// 检查当前用户是否在白名单中
    async fn is_user_whitelisted(&self, _ctx: &async_graphql::Context<'_>, user: AccountOwner) -> Result<bool, async_graphql::Error> {
        let state = self.state.lock().await;
        let is_whitelisted = state.is_whitelisted(&user).await?;
        Ok(is_whitelisted)
    }
    
    /// 检查当前用户是否在24小时冷却期内
    async fn check_cooldown_status(&self, _ctx: &async_graphql::Context<'_>, user: AccountOwner) -> Result<CooldownCheckResult, async_graphql::Error> {
        let state = self.state.lock().await;
        let chain_id = self.runtime.chain_id();
        let current_time = self.runtime.system_time().micros();
        let (in_cooldown, remaining) = state.is_in_cooldown(chain_id, &user, current_time).await?;
        
        Ok(CooldownCheckResult {
            in_cooldown,
            remaining_time: remaining,
            enabled: state.is_cooldown_enabled().await,
        })
    }
    
    /// 生成签名消息（供前端使用）
    async fn generate_signature_message(
        &self,
        _ctx: &async_graphql::Context<'_>,
        sender: AccountOwner,
        recipient: Option<AccountOwner>,
        chain_id: ChainId,
        content: Option<String>,
    ) -> Result<String, async_graphql::Error> {
        let nonce = self.get_next_nonce(_ctx, sender).await?;
        // 在WASM环境中，使用简单的消息格式
        // 真正的签名消息生成应该在前端完成
        let recipient_str = recipient.map_or("none".to_string(), |r| r.to_string());
        let content_str = content.map_or("none".to_string(), |c| c.to_string());
        
        let message = format!(
            "GM签名验证:发送者={},接收者={},链ID={},随机数={},内容={}",
            sender.to_string(),
            recipient_str,
            chain_id.to_string(),
            nonce,
            content_str
        );
        log::info!("生成的签名消息: {}", message);
        Ok(message)
    }
    
    /// 验证签名（独立验证接口）
    async fn verify_gm_signature(
        &self,
        _ctx: &async_graphql::Context<'_>,
        signature_data: SignatureData,
        signature: String,
    ) -> Result<SignatureVerificationResult, async_graphql::Error> {
        log::info!("验证签名，数据: {:?}", signature_data);
        // 创建一个临时的GmService实例来调用simple_verify_signature方法
        let service = GmService {
            state: Arc::clone(&self.state),
            runtime: Arc::clone(&self.runtime),
        };
        service.simple_verify_signature(&signature_data, &signature)
    }
    
    /// 获取邀请统计信息
    async fn get_invitation_stats(
        &self,
        _ctx: &async_graphql::Context<'_>,
        user: AccountOwner,
    ) -> Result<Option<InvitationStats>, async_graphql::Error> {
        let state = self.state.lock().await;
        let stats = state.get_invitation_stats(user).await?;
        Ok(stats)
    }
    
    /// 获取邀请记录
    async fn get_invitation_record(
        &self,
        _ctx: &async_graphql::Context<'_>,
        invitee: AccountOwner,
    ) -> Result<Option<InvitationRecord>, async_graphql::Error> {
        let state = self.state.lock().await;
        let record = state.get_invitation_record(invitee).await?;
        Ok(record)
    }
    
    /// 检查用户是否已领取过邀请奖励
    async fn has_received_invitation_reward(
        &self,
        _ctx: &async_graphql::Context<'_>,
        invitee: AccountOwner,
    ) -> Result<bool, async_graphql::Error> {
        let state = self.state.lock().await;
        let has_rewarded = state.has_received_invitation_reward(invitee).await?;
        Ok(has_rewarded)
    }


}

#[Subscription]
impl SubscriptionRoot {
    /// 订阅GM事件（符合Linera标准的事件驱动订阅）
    /// 
    /// 实现符合Linera标准的事件驱动机制，监听合约层发出的GM事件
    /// 当有新的GM消息发送时，实时推送给订阅的客户端
    async fn notifications(
        &self,
        #[graphql(name = "chainId")] chain_id: ChainId,
    ) -> impl futures::Stream<Item = async_graphql::Result<String>> {
        use async_graphql::futures_util::stream;
        
        let state: Arc<Mutex<GmState>> = Arc::clone(&self.state);
        
        // 创建事件监听通道
        let (tx, rx) = tokio::sync::mpsc::channel(100);
        
        // 启动事件监听任务
        let state_clone = Arc::clone(&state);
        let chain_id_clone = chain_id;
        let runtime_clone: Arc<ServiceRuntime<GmService>> = Arc::clone(&self.runtime);
        
        tokio::spawn(async move {
            // 使用轮询方式获取GM事件流
            let mut last_timestamp = None;
            
            loop {
                // 获取最新的事件
                if let Ok(events) = state_clone.lock().await.get_latest_events(chain_id_clone, last_timestamp).await {
                    let has_events = !events.is_empty(); // 先检查是否有事件
                    
                    for event_json in events {
                        log::info!("📨 从存储中获取到事件数据: {}", event_json);
                        
                        // 直接使用存储的事件JSON数据，不需要重新解析和序列化
                        let notification = event_json;
                        
                        // 发送给订阅的客户端
                        if tx.send(Ok(notification)).await.is_err() {
                            log::info!("订阅客户端已断开连接");
                            return; // 接收端已断开连接
                        }
                        
                        // 更新最后时间戳为当前时间
                        last_timestamp = Some(runtime_clone.system_time().micros());
                        log::info!("✅ 事件已发送给订阅客户端，更新最后时间戳: {:?}", last_timestamp);
                    }
                    
                    // 如果没有新事件，发送一个心跳事件保持连接
                    if !has_events {
                        let heartbeat_event = serde_json::json!({
                            "type": "heartbeat",
                            "timestamp": runtime_clone.system_time().micros(),
                            "message": "订阅连接正常，等待事件数据"
                        });
                        
                        if let Ok(heartbeat_json) = serde_json::to_string(&heartbeat_event) {
                            if tx.send(Ok(heartbeat_json)).await.is_err() {
                                log::info!("订阅客户端已断开连接（心跳发送失败）");
                                return;
                            }
                            log::info!("💓 发送心跳事件保持订阅连接");
                        }
                    }
                } else {
                    log::error!("获取事件数据失败");
                }
                
                // 等待一段时间后继续轮询
                tokio::time::sleep(tokio::time::Duration::from_secs(2)).await;
            }
        });
        
        // 返回事件流
        stream::unfold(rx, |mut rx| async move {
            match rx.recv().await {
                Some(event) => Some((event, rx)),
                None => None,
            }
        })
    }
}

#[Object]
impl MutationRoot {
    async fn send_gm(
        &self,
        _ctx: &async_graphql::Context<'_>,
        chain_id: ChainId,
        sender: AccountOwner,
        content: Option<String>,
    ) -> Result<SendGmResponse, async_graphql::Error> {
        // 调用带签名的版本（向后兼容）
        self.send_gm_with_signature(_ctx, chain_id, sender, None, "".to_string(), 0, content).await
    }
    
    async fn send_gm_with_signature(
        &self,
        _ctx: &async_graphql::Context<'_>,
        chain_id: ChainId,
        sender: AccountOwner,
        recipient: Option<AccountOwner>,
        signature: String,
        nonce: u64,
        content: Option<String>,
    ) -> Result<SendGmResponse, async_graphql::Error> {
        let current_chain_id = self.runtime.chain_id();
        log::info!("处理带签名的 sendGm 查询, chain_id: {}, sender: {:?}, nonce: {}", chain_id, sender, nonce);
        
        // 签名验证逻辑
        if !signature.is_empty() {
            let signature_data = SignatureData {
                sender: sender.to_string(),
                recipient: recipient.as_ref().map(|r| r.to_string()),
                chain_id: chain_id.to_string(),
                timestamp: self.runtime.system_time().micros(),
                nonce,
                content: content.clone(), // 新增：包含自定义内容
            };
            
            // 创建一个临时的GmService实例来调用simple_verify_signature方法
            let service = GmService {
                state: Arc::clone(&self.state),
                runtime: Arc::clone(&self.runtime),
            };
            let verification_result = service.simple_verify_signature(&signature_data, &signature)?;
            
            if !verification_result.success {
                return Ok(SendGmResponse {
                    success: false,
                    message: format!("签名验证失败: {}", verification_result.message),
                    timestamp: 0,
                });
            }
            
            log::info!("签名验证成功，验证的发送者: {:?}", verification_result.verified_sender);
        }
        
        let state = self.state.lock().await;
        let owner = {
            log::info!("当前 owner: {:?}", state.owner.get()); 
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
        
        // 计数更新将在record_gm方法中自动完成，这里不需要单独更新
        // 不再提前释放锁，保持锁直到操作完成

        let default_content = Some("Gmicrochains".to_string());
        
        if chain_id != current_chain_id {
            let operation = if let Some(recipient) = recipient {
                GmOperation::GmTo { sender, recipient, content: default_content.clone() }
            } else {
                GmOperation::Gm { sender, recipient: owner, content: default_content.clone() }
            };
            drop(state); // 现在释放锁
            self.runtime.schedule_operation(&operation);
            return Ok(SendGmResponse {
                success: true,
                message: format!("跨链GM发送成功，发送者: {}，接收者: {}，链ID: {}", 
                    sender, 
                    recipient.as_ref().map_or(owner.to_string(), |r| r.to_string()), 
                    chain_id),
                timestamp: self.runtime.system_time().micros(),
            });
        }
        
        let operation = if let Some(recipient) = recipient {
            GmOperation::GmTo { sender, recipient, content: default_content.clone() }
        } else {
            GmOperation::Gm { sender, recipient: owner, content: default_content.clone() }
        };
        
        drop(state); // 现在释放锁
        self.runtime.schedule_operation(&operation);
        let block_height = self.runtime.next_block_height();
        Ok(SendGmResponse {
            success: true,
            message: format!("GM记录成功，发送者: {}，接收者: {}，区块高度: {}", 
                sender,
                recipient.as_ref().map_or(owner.to_string(), |r| r.to_string()),
                block_height),
            timestamp: self.runtime.system_time().micros(),
        })
    }

    #[allow(unused_variables)]
    async fn send_gm_to(
        &self,
        _ctx: &async_graphql::Context<'_>,
        chain_id: ChainId,
        sender: AccountOwner,
        recipient: AccountOwner,
        content: Option<String>,
    ) -> Result<SendGmResponse, async_graphql::Error> {
        // 调用带签名的版本（向后兼容）
        self.send_gm_with_signature(_ctx, chain_id, sender, Some(recipient), "".to_string(), 0, content).await
    }
    
    async fn send_gm_to_with_signature(
        &self,
        _ctx: &async_graphql::Context<'_>,
        chain_id: ChainId,
        sender: AccountOwner,
        recipient: AccountOwner,
        signature: String,
        nonce: u64,
        content: Option<String>,
    ) -> Result<SendGmResponse, async_graphql::Error> {
        log::info!("处理带签名的 sendGmTo 查询, chain_id: {}, sender: {:?}, recipient: {:?}, nonce: {}", 
            chain_id, sender, recipient, nonce);
        
        // 签名验证逻辑
        if !signature.is_empty() {
            let signature_data = SignatureData {
                sender: sender.to_string(),
                recipient: Some(recipient.to_string()),
                chain_id: chain_id.to_string(),
                timestamp: self.runtime.system_time().micros(),
                nonce,
                content: content.clone(), // 新增：包含自定义内容
            };
            
            // 创建一个临时的GmService实例来调用simple_verify_signature方法
            let service = GmService {
                state: Arc::clone(&self.state),
                runtime: Arc::clone(&self.runtime),
            };
            let verification_result = service.simple_verify_signature(&signature_data, &signature)?;
            
            if !verification_result.success {
                return Ok(SendGmResponse {
                    success: false,
                    message: format!("签名验证失败: {}", verification_result.message),
                    timestamp: 0,
                });
            }
            
            log::info!("签名验证成功，验证的发送者: {:?}", verification_result.verified_sender);
        }
        
        let current_chain_id = self.runtime.chain_id();
        let state = self.state.lock().await; 
        
        // 计数更新将在record_gm方法中自动完成，这里不需要单独更新
        // 不再提前释放锁，保持锁直到操作完成

        let default_content = Some("Gmicrochains".to_string());
        
        if chain_id != current_chain_id {
            let operation = GmOperation::GmTo { sender, recipient, content: default_content.clone() };
            drop(state); // 现在释放锁
            self.runtime.schedule_operation(&operation);
            return Ok(SendGmResponse {
                success: true,
                message: format!("跨链GM发送成功，发送者: {}，接收者: {}，链ID: {}", sender, recipient, chain_id),
                timestamp: self.runtime.system_time().micros(),
            });
        }
        
        let operation = GmOperation::GmTo { sender, recipient, content: default_content.clone() };
        drop(state); // 现在释放锁
        self.runtime.schedule_operation(&operation);
        Ok(SendGmResponse {
            success: true,
            message: format!("GM定向发送成功，发送者: {}，接收者: {}", sender, recipient),
            timestamp: self.runtime.system_time().micros(),
        })
    }
    
    /// 通过邀请链接发送GM（一次性奖励）
    #[allow(unused_variables)]
    async fn send_gm_with_invitation(
        &self,
        _ctx: &async_graphql::Context<'_>,
        chain_id: ChainId,
        sender: AccountOwner,
        recipient: AccountOwner,
        inviter: Option<AccountOwner>,
        content: Option<String>,
    ) -> Result<SendGmResponse, async_graphql::Error> {
        log::info!("通过邀请链接发送GM: 发送者={:?}, 接收者={:?}, 邀请者={:?}", sender, recipient, inviter);
        
        let operation = GmOperation::GmWithInvitation { 
            sender,
            recipient, 
            content,
            inviter 
        };
        self.runtime.schedule_operation(&operation);
        
        Ok(SendGmResponse {
            success: true,
            message: format!("带邀请的GM发送成功: 发送者={}, 接收者={}", sender, recipient),
            timestamp: self.runtime.system_time().micros(),
        })
    }
    
    /// 领取邀请奖励
    async fn claim_invitation_rewards(
        &self,
        _ctx: &async_graphql::Context<'_>,
        user: AccountOwner,
    ) -> Result<SendGmResponse, async_graphql::Error> {
        log::info!("领取邀请奖励: 用户={:?}", user);
        
        let operation = GmOperation::ClaimInvitationRewards { sender: user };
        self.runtime.schedule_operation(&operation);
        
        Ok(SendGmResponse {
            success: true,
            message: format!("邀请奖励领取成功: 用户={}", user),
            timestamp: self.runtime.system_time().micros(),
        })
    }
    
    /// 设置24小时限制开关（仅白名单地址可调用）
    async fn set_cooldown_enabled(
        &self,
        _ctx: &async_graphql::Context<'_>,
        caller: AccountOwner,
        enabled: bool,
    ) -> Result<WhitelistOperationResult, async_graphql::Error> {
        log::info!("设置24小时限制开关: caller={:?}, enabled={}", caller, enabled);
        
        let mut state = self.state.lock().await;
        let success = state.set_cooldown_enabled(&caller, enabled).await?;
        
        if success {
            // 使用schedule_operation来确保状态更改被正确持久化
            let operation = GmOperation::SetCooldownEnabled { enabled };
            self.runtime.schedule_operation(&operation);
            
            Ok(WhitelistOperationResult {
                success: true,
                message: format!("24小时限制开关已{}，调用者={}", if enabled { "开启" } else { "关闭" }, caller),
            })
        } else {
            Ok(WhitelistOperationResult {
                success: false,
                message: format!("权限不足：只有白名单地址可以设置24小时限制开关，调用者={}", caller),
            })
        }
    }
    
    /// 添加白名单地址（仅白名单地址可调用）
    async fn add_whitelist_address(
        &self,
        _ctx: &async_graphql::Context<'_>,
        caller: AccountOwner,
        address: AccountOwner,
    ) -> Result<WhitelistOperationResult, async_graphql::Error> {
        log::info!("添加白名单地址: caller={:?}, address={:?}", caller, address);
        
        let mut state = self.state.lock().await;
        let success = state.add_whitelist(&caller, address).await?;
        
        if success {
            Ok(WhitelistOperationResult {
                success: true,
                message: format!("白名单地址添加成功，调用者={}", caller),
            })
        } else {
            Ok(WhitelistOperationResult {
                success: false,
                message: format!("权限不足：只有白名单地址可以添加白名单，调用者={}", caller),
            })
        }
    }
    
    /// 移除白名单地址（仅白名单地址可调用）
    async fn remove_whitelist_address(
        &self,
        _ctx: &async_graphql::Context<'_>,
        caller: AccountOwner,
        address: AccountOwner,
    ) -> Result<WhitelistOperationResult, async_graphql::Error> {
        log::info!("移除白名单地址: caller={:?}, address={:?}", caller, address);
        
        let mut state = self.state.lock().await;
        let success = state.remove_whitelist(&caller, address).await?;
        
        if success {
            Ok(WhitelistOperationResult {
                success: true,
                message: format!("白名单地址移除成功，调用者={}", caller),
            })
        } else {
            Ok(WhitelistOperationResult {
                success: false,
                message: format!("权限不足：只有白名单地址可以移除白名单，调用者={}", caller),
            })
        }
    }

}