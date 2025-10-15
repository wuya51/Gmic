// state.rs
use linera_sdk::views::{linera_views, MapView, RegisterView, RootView, View, ViewError};
use linera_sdk::ViewStorageContext;
use linera_sdk::linera_base_types::{AccountOwner, ChainId, Timestamp};
// 添加Context trait的导入，解决clone_with_base_key方法不可用的问题
use linera_views::context::Context;

#[derive(RootView)]
#[view(context = ViewStorageContext)]
pub struct GmState {
    pub owner: RegisterView<Option<AccountOwner>>,
    pub last_gm: MapView<(ChainId, AccountOwner), u64>,
    pub total_messages: RegisterView<u64>,
    pub chain_messages: MapView<ChainId, u64>,
    pub wallet_messages: MapView<AccountOwner, u64>,
    pub events: MapView<(ChainId, AccountOwner, Option<AccountOwner>), u64>,
}

#[allow(dead_code)]
impl GmState {

    pub async fn record_gm(
        &mut self,
        chain_id: ChainId,
        sender: AccountOwner,
        recipient: Option<AccountOwner>,
        timestamp: Timestamp,
    ) -> Result<(), ViewError> {
        log::info!("Recording GM for sender: {:?}, chain_id: {:?}", sender, chain_id);

        let current_ts = timestamp.micros();
        if current_ts == 0 {
            log::error!("Invalid timestamp (0)");
            // 修复ViewError::not_found()调用为ViewError::NotFound枚举变体
            return Err(ViewError::NotFound(
                "Invalid timestamp value".to_string()
            ));
        }
        
        self.last_gm.insert(&(chain_id, sender), current_ts)?;
        self.events.insert(&(chain_id, sender, recipient), current_ts)?;

        let chain_count = self.chain_messages.get(&chain_id).await?.unwrap_or(0);
        log::info!("更新前chain_messages: {}", chain_count);
        self.chain_messages.insert(&chain_id, chain_count + 1)?;
        let chain_count_updated = self.chain_messages.get(&chain_id).await?.unwrap_or(0);
        log::info!("更新后chain_messages: {}", chain_count_updated);

        let current = self.wallet_messages.get(&sender).await?.unwrap_or(0);
        log::info!("更新前wallet_messages: {}", current);
        self.wallet_messages.insert(&sender.clone(), current + 1)?;
        let updated = self.wallet_messages.get(&sender).await?.unwrap_or(0);
        log::info!("更新后wallet_messages: {}", updated);

        let total = self.total_messages.get();
        let new_total = total + 1;
        self.total_messages.set(new_total);

        self.save().await?;
        Ok(())
        
    }

    pub async fn load(context: ViewStorageContext) -> Result<Self, ViewError> {
        log::info!("开始加载 GmState 各个字段 调用来源: {:?}", std::panic::Location::caller());
        // 为每个字段创建独立的上下文（避免存储键冲突）
        let owner_context = context.clone_with_base_key(b"gm_owner".to_vec());
        log::info!("owner_context base_key: {:?}", owner_context.base_key());
        let last_gm_context = context.clone_with_base_key(b"gm_last_gm".to_vec());
        let total_messages_context = context.clone_with_base_key(b"gm_total_messages".to_vec());
        let chain_messages_context = context.clone_with_base_key(b"gm_chain_messages".to_vec());
        let wallet_messages_context = context.clone_with_base_key(b"gm_wallet_messages".to_vec());
        let events_context = context.clone_with_base_key(b"gm_events".to_vec());

        // 初始化并记录各字段加载日志
        let owner = RegisterView::load(owner_context).await?;
        log::info!("owner 加载结果: {:?}", owner.get());

        let last_gm = MapView::load(last_gm_context).await?;
        let mut has_last_gm = false;
        last_gm
            .for_each_index(|_| {
                has_last_gm = true;
                Ok(())
            })
            .await?;
        log::info!("last_gm 加载完成，是否为空: {}", !has_last_gm);

        let total_messages = RegisterView::load(total_messages_context).await?;
        log::info!("total_messages 加载完成，当前值: {}", total_messages.get());

        let chain_messages = MapView::load(chain_messages_context).await?;
        let mut has_chain_messages = false;
        chain_messages
            .for_each_index_value(|_, count| {
                has_chain_messages = true;
                log::info!("chain_messages 条目: 计数={}", count);
                Ok(())
            })
            .await?;
        log::info!("chain_messages 加载完成，包含数据: {}", has_chain_messages);

        let wallet_messages = MapView::load(wallet_messages_context).await?;
        let mut has_wallet_messages = false;
        wallet_messages
            .for_each_index_value(|_, count| {
                has_wallet_messages = true;
                log::info!("wallet_messages 条目: 计数={}", count);
                Ok(())
            })
            .await?;
        log::info!("wallet_messages 加载完成，包含数据: {}", has_wallet_messages);

        let events = MapView::load(events_context).await?;
        let mut has_events = false;
        events
            .for_each_index(|_| {
                has_events = true;
                Ok(())
            })
            .await?;
        log::info!("events 加载完成，是否为空: {}", !has_events);

        Ok(Self {
            owner,
            last_gm,
            total_messages,
            chain_messages,
            wallet_messages,
            events,
        })
    }

    pub async fn set_owner(&mut self, owner: AccountOwner) -> Result<(), ViewError> {
        log::info!("设置 owner: {:?}", owner);
        self.owner.set(Some(owner));
        let serialized = serde_json::to_string(&self.owner.get()).unwrap();
        log::info!("序列化 owner: {}", serialized);
        match self.save().await {
            Ok(()) => log::info!("set_owner 中状态保存成功"),
            Err(e) => log::error!("set_owner 中状态保存失败: {}", e),
        }
        let saved_owner = self.owner.get();
        log::info!("Owner 状态保存成功 (保存后: {:?}, 验证: {:?})", 
            self.owner.get(), saved_owner);

        // 重新生成与load方法相同的base_key上下文
        let reloaded_context = self.owner.context().clone_with_base_key(b"gm_owner".to_vec());
        let reloaded_state = GmState::load(reloaded_context).await?;
        log::info!("重新加载后的owner: {:?}", reloaded_state.owner.get()); // 应显示Some(owner)

        Ok(())
    }
    
    pub async fn get_chain_count(&self, chain_id: ChainId) -> Result<u64, ViewError> {
        self.chain_messages
            .get(&chain_id)
            .await
            .map(|opt| opt.unwrap_or(0))
    }

    pub async fn get_wallet_count(&self, owner: &AccountOwner) -> Result<u64, ViewError> {
        self.wallet_messages
            .get(owner)
            .await
            .map(|opt| opt.unwrap_or(0))
    }

    pub async fn get_total_messages(&self) -> u64 {
        *self.total_messages.get()
    }

    pub async fn get_last_gm(
        &self,
        chain_id: ChainId,
        owner: &AccountOwner,
    ) -> Result<Option<u64>, ViewError> {
        self.last_gm.get(&(chain_id, *owner)).await
    }

    pub async fn get_events(
        &self,
        chain_id: ChainId,
        sender: &AccountOwner,
    ) -> Result<Vec<(Option<AccountOwner>, u64)>, ViewError> {
        let mut events = Vec::new();
        self.events
            .for_each_index_value(|(c, s, r), ts| {
                if c == chain_id && s == *sender {
                    events.push((r, *ts));
                }
                Ok(())
            })
            .await?;
        Ok(events)
    }
}

