use linera_sdk::views::{linera_views, MapView, RegisterView, RootView, View, ViewError};
use linera_sdk::ViewStorageContext;
use linera_sdk::linera_base_types::{AccountOwner, ChainId, Timestamp};
use linera_views::context::Context;
use gm::{InvitationRecord, InvitationStats};

#[derive(RootView)]
#[view(context = ViewStorageContext)]
pub struct GmState {
    pub owner: RegisterView<Option<AccountOwner>>,
    pub last_gm: MapView<(ChainId, AccountOwner), u64>,
    pub total_messages: RegisterView<u64>,
    pub chain_messages: MapView<ChainId, u64>,
    pub wallet_messages: MapView<AccountOwner, u64>,
    pub events: MapView<(ChainId, AccountOwner, Option<AccountOwner>), (u64, Option<String>)>,
    pub user_events: MapView<(ChainId, AccountOwner), Vec<(Option<AccountOwner>, u64, Option<String>)>>,

    pub hourly_stats: MapView<(ChainId, u64), u64>,
    pub daily_stats: MapView<(ChainId, u64), u64>,
    pub monthly_stats: MapView<(ChainId, u64), u64>,

    pub top_users_cache: RegisterView<Vec<(AccountOwner, u64)>>,
    pub top_chains_cache: RegisterView<Vec<(ChainId, u64)>>,
    pub cache_timestamp: RegisterView<u64>,

    pub invitations: MapView<AccountOwner, InvitationRecord>,
    pub invitation_stats: MapView<AccountOwner, InvitationStats>,

    pub cooldown_enabled: RegisterView<bool>,
    pub cooldown_whitelist: MapView<AccountOwner, bool>,

    pub stream_events: MapView<(ChainId, u64), String>,
}

#[allow(dead_code)]
impl GmState {
    pub async fn record_gm(
        &mut self,
        chain_id: ChainId,
        sender: AccountOwner,
        recipient: Option<AccountOwner>,
        timestamp: Timestamp,
        content: Option<String>,
    ) -> Result<(), ViewError> {
        let current_ts = timestamp.micros();
        if current_ts == 0 {
            return Err(ViewError::NotFound("Invalid timestamp value".to_string()));
        }

        self.last_gm.insert(&(chain_id, sender.clone()), current_ts)?;
        self.events.insert(&(chain_id, sender.clone(), recipient), (current_ts, content.clone()))?;
        
        let mut user_events = self.user_events.get(&(chain_id, sender.clone())).await?.unwrap_or_default();
        user_events.push((recipient.clone(), current_ts, content.clone()));
        user_events.sort_by(|a, b| b.1.cmp(&a.1));
        self.user_events.insert(&(chain_id, sender.clone()), user_events)?;

        let chain_count = self.chain_messages.get(&chain_id).await?.unwrap_or(0);
        self.chain_messages.insert(&chain_id, chain_count + 1)?;

        let current = self.wallet_messages.get(&sender).await?.unwrap_or(0);
        self.wallet_messages.insert(&sender.clone(), current + 1)?;

        let total = self.total_messages.get();
        let new_total = total + 1;
        self.total_messages.set(new_total);

        self.update_time_statistics(chain_id, current_ts).await?;

        self.save().await?;

        Ok(())
    }

    pub async fn load(context: ViewStorageContext) -> Result<Self, ViewError> {
        let owner_context = context.clone_with_base_key(b"gm_owner".to_vec());
        let last_gm_context = context.clone_with_base_key(b"gm_last_gm".to_vec());
        let total_messages_context = context.clone_with_base_key(b"gm_total_messages".to_vec());
        let chain_messages_context = context.clone_with_base_key(b"gm_chain_messages".to_vec());
        let wallet_messages_context = context.clone_with_base_key(b"gm_wallet_messages".to_vec());
        let events_context = context.clone_with_base_key(b"gm_events".to_vec());
        let user_events_context = context.clone_with_base_key(b"gm_user_events".to_vec());
        let hourly_stats_context = context.clone_with_base_key(b"gm_hourly_stats".to_vec());
        let daily_stats_context = context.clone_with_base_key(b"gm_daily_stats".to_vec());
        let monthly_stats_context = context.clone_with_base_key(b"gm_monthly_stats".to_vec());
        let top_users_cache_context = context.clone_with_base_key(b"gm_top_users_cache".to_vec());
        let top_chains_cache_context = context.clone_with_base_key(b"gm_top_chains_cache".to_vec());
        let cache_timestamp_context = context.clone_with_base_key(b"gm_cache_timestamp".to_vec());
        let owner = RegisterView::load(owner_context).await?;
        let last_gm = MapView::load(last_gm_context).await?;
        let total_messages = RegisterView::load(total_messages_context).await?;
        let chain_messages = MapView::load(chain_messages_context).await?;
        let wallet_messages = MapView::load(wallet_messages_context).await?;
        let events = MapView::load(events_context).await?;
        let user_events = MapView::load(user_events_context).await?;
        let hourly_stats = MapView::load(hourly_stats_context).await?;
        let daily_stats = MapView::load(daily_stats_context).await?;
        let monthly_stats = MapView::load(monthly_stats_context).await?;
        let top_users_cache = RegisterView::load(top_users_cache_context).await?;
        let top_chains_cache = RegisterView::load(top_chains_cache_context).await?;
        let cache_timestamp = RegisterView::load(cache_timestamp_context).await?;

        let invitations_context = context.clone_with_base_key(b"gm_invitations".to_vec());
        let invitations = MapView::load(invitations_context).await?;
        let invitation_stats_context = context.clone_with_base_key(b"gm_invitation_stats".to_vec());
        let invitation_stats = MapView::load(invitation_stats_context).await?;

        let cooldown_enabled_context = context.clone_with_base_key(b"gm_cooldown_enabled".to_vec());
        let cooldown_enabled = RegisterView::load(cooldown_enabled_context).await?;
        let cooldown_whitelist_context = context.clone_with_base_key(b"gm_cooldown_whitelist".to_vec());
        let cooldown_whitelist = MapView::load(cooldown_whitelist_context).await?;

        let stream_events_context = context.clone_with_base_key(b"gm_stream_events".to_vec());
        let stream_events = MapView::load(stream_events_context).await?;

        Ok(Self {
            owner,
            last_gm,
            total_messages,
            chain_messages,
            wallet_messages,
            events,
            user_events,
            hourly_stats,
            daily_stats,
            monthly_stats,
            top_users_cache,
            top_chains_cache,
            cache_timestamp,
            invitations,
            invitation_stats,
            cooldown_enabled,
            cooldown_whitelist,
            stream_events,
        })
    }

    pub async fn set_owner(&mut self, owner: AccountOwner) -> Result<(), ViewError> {
        self.owner.set(Some(owner.clone()));

        self.cooldown_enabled.set(false);

        let default_whitelist_address: AccountOwner = "0xa0916f957038344afff8c117b0a568562f73f0f2"
            .to_lowercase()
            .parse()
            .map_err(|_| ViewError::NotFound("Failed to parse default whitelist address".to_string()))?;

        self.cooldown_whitelist.insert(&default_whitelist_address, true)?;

        let owner_lowercase = owner.to_string().to_lowercase().parse()
            .map_err(|_| ViewError::NotFound("Failed to parse owner address".to_string()))?;
        self.cooldown_whitelist.insert(&owner_lowercase, true)?;

        Ok(())
    }

    pub async fn is_cooldown_enabled(&self) -> bool {
        *self.cooldown_enabled.get()
    }

    pub async fn set_cooldown_enabled(&mut self, caller: &AccountOwner, enabled: bool) -> Result<bool, ViewError> {
        if !self.is_whitelisted(caller).await? {
            return Ok(false);
        }

        self.cooldown_enabled.set(enabled);
        Ok(true)
    }

    pub async fn is_whitelisted(&self, address: &AccountOwner) -> Result<bool, ViewError> {
        let is_whitelisted = self.cooldown_whitelist.get(address).await?.unwrap_or(false);
        Ok(is_whitelisted)
    }

    pub async fn add_whitelist(&mut self, caller: &AccountOwner, address: AccountOwner) -> Result<bool, ViewError> {
        if !self.is_whitelisted(caller).await? {
            return Ok(false);
        }

        self.cooldown_whitelist.insert(&address, true)?;
        Ok(true)
    }

    pub async fn remove_whitelist(&mut self, caller: &AccountOwner, address: AccountOwner) -> Result<bool, ViewError> {
        if !self.is_whitelisted(caller).await? {
            return Ok(false);
        }

        self.cooldown_whitelist.remove(&address)?;
        Ok(true)
    }

    pub async fn is_in_cooldown(
        &self,
        chain_id: ChainId,
        sender: &AccountOwner,
        current_time: u64,
    ) -> Result<(bool, Option<u64>), ViewError> {
        if !self.is_cooldown_enabled().await {
            return Ok((false, None));
        }

        let last_timestamp = self.get_last_gm(chain_id, sender).await?;

        match last_timestamp {
            Some(last_ts) => {
                let current_ts = current_time;
                let cooldown_duration = 24 * 60 * 60 * 1_000_000;

                if current_ts - last_ts < cooldown_duration {
                    let remaining = cooldown_duration - (current_ts - last_ts);
                    Ok((true, Some(remaining)))
                } else {
                    Ok((false, None))
                }
            }
            None => {
                Ok((false, None))
            }
        }
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
    ) -> Result<Vec<(Option<AccountOwner>, u64, Option<String>)>, ViewError> {
        let events = self.user_events.get(&(chain_id, *sender)).await?.unwrap_or_default();
        Ok(events)
    }

    async fn update_time_statistics(&mut self, chain_id: ChainId, timestamp: u64) -> Result<(), ViewError> {
        let hour_key = timestamp / 3600_000_000;
        let day_key = timestamp / 86_400_000_000;
        let month_key = timestamp / 2_592_000_000_000;

        let current_hour_count = self.hourly_stats.get(&(chain_id, hour_key)).await?.unwrap_or(0);
        self.hourly_stats.insert(&(chain_id, hour_key), current_hour_count + 1)?;

        let current_day_count = self.daily_stats.get(&(chain_id, day_key)).await?.unwrap_or(0);
        self.daily_stats.insert(&(chain_id, day_key), current_day_count + 1)?;

        let current_month_count = self.monthly_stats.get(&(chain_id, month_key)).await?.unwrap_or(0);
        self.monthly_stats.insert(&(chain_id, month_key), current_month_count + 1)?;

        Ok(())
    }

    pub async fn get_hourly_stats(&self, chain_id: ChainId, start_hour: u64, end_hour: u64) -> Result<Vec<(u64, u64)>, ViewError> {
        let mut stats = Vec::new();
        for hour in start_hour..=end_hour {
            let count = self.hourly_stats.get(&(chain_id, hour)).await?.unwrap_or(0);
            stats.push((hour, count));
        }
        Ok(stats)
    }

    pub async fn get_daily_stats(&self, chain_id: ChainId, start_day: u64, end_day: u64) -> Result<Vec<(u64, u64)>, ViewError> {
        let mut stats = Vec::new();
        for day in start_day..=end_day {
            let count = self.daily_stats.get(&(chain_id, day)).await?.unwrap_or(0);
            stats.push((day, count));
        }
        Ok(stats)
    }

    pub async fn get_monthly_stats(&self, chain_id: ChainId, start_month: u64, end_month: u64) -> Result<Vec<(u64, u64)>, ViewError> {
        let mut stats = Vec::new();
        for month in start_month..=end_month {
            let count = self.monthly_stats.get(&(chain_id, month)).await?.unwrap_or(0);
            stats.push((month, count));
        }
        Ok(stats)
    }

    pub async fn get_top_users(&self, limit: u32, current_time: u64) -> Result<Vec<(AccountOwner, u64)>, ViewError> {
        let cache_time = *self.cache_timestamp.get();

        if current_time - cache_time < 3_600_000_000 && !self.top_users_cache.get().is_empty() {
            return Ok(self.top_users_cache.get().clone());
        }

        let mut user_counts = Vec::new();

        self.wallet_messages
            .for_each_index_value(|owner, count| {
                user_counts.push((owner.clone(), *count));
                Ok(())
            })
            .await?;

        user_counts.sort_by(|a, b| b.1.cmp(&a.1));

        let top_users: Vec<(AccountOwner, u64)> = user_counts
            .into_iter()
            .take(limit as usize)
            .collect();

        Ok(top_users)
    }

    pub async fn get_top_chains(&self, limit: u32, current_time: u64) -> Result<Vec<(ChainId, u64)>, ViewError> {
        let cache_time = *self.cache_timestamp.get();

        if current_time - cache_time < 3_600_000_000 && !self.top_chains_cache.get().is_empty() {
            return Ok(self.top_chains_cache.get().clone());
        }

        let mut chain_counts = Vec::new();

        self.chain_messages
            .for_each_index_value(|chain_id, count| {
                chain_counts.push((chain_id.clone(), *count));
                Ok(())
            })
            .await?;

        chain_counts.sort_by(|a, b| b.1.cmp(&a.1));

        let top_chains: Vec<(ChainId, u64)> = chain_counts
            .into_iter()
            .take(limit as usize)
            .collect();

        Ok(top_chains)
    }

    pub async fn get_user_rank(&self, user: &AccountOwner) -> Result<u32, ViewError> {
        let mut all_users = Vec::new();
        self.wallet_messages
            .for_each_index_value(|owner, count| {
                all_users.push((owner.clone(), *count));
                Ok(())
            })
            .await?;

        all_users.sort_by(|a, b| b.1.cmp(&a.1));

        for (rank, (owner, _)) in all_users.iter().enumerate() {
            if owner == user {
                return Ok((rank + 1) as u32);
            }
        }

        Ok(0)
    }

    pub async fn get_message_trend(&self, chain_id: ChainId, period_days: u32, current_time: u64) -> Result<Vec<(u64, u64)>, ViewError> {
        let current_time_seconds = current_time / 1_000_000;
        let end_day = current_time_seconds / 86400;
        let start_day = end_day - period_days as u64;

        self.get_daily_stats(chain_id, start_day, end_day).await
    }

    pub async fn handle_gm_with_invitation(
        &mut self,
        sender: AccountOwner,
        inviter: Option<AccountOwner>,
        current_time: Timestamp,
    ) -> Result<u32, ViewError> {
        let inviter = match inviter {
            Some(inviter) => inviter,
            None => return Ok(0),
        };

        if let Some(existing_record) = self.invitations.get(&sender).await? {
            if existing_record.rewarded {
                return Ok(0);
            }
        }

        let invitation = InvitationRecord {
            inviter: inviter.clone(),
            invitee: sender.clone(),
            invited_at: current_time,
            rewarded: true,
            rewarded_at: Some(current_time),
        };

        self.invitations.insert(&sender, invitation)?;

        let mut stats = self.invitation_stats.get(&inviter).await?.unwrap_or(InvitationStats {
            total_invited: 0,
            total_rewards: 0,
            last_reward_time: None,
        });

        let reward = 10;
        stats.total_invited += 1;
        stats.total_rewards += reward;
        stats.last_reward_time = Some(current_time);

        self.invitation_stats.insert(&inviter, stats)?;

        self.save().await?;
        Ok(reward)
    }

    pub async fn claim_invitation_rewards(&mut self, user: AccountOwner) -> Result<u32, ViewError> {
        let stats = match self.invitation_stats.get(&user).await? {
            Some(stats) => stats,
            None => return Err(ViewError::NotFound("No invitation rewards available".to_string())),
        };

        Ok(stats.total_rewards)
    }

    pub async fn get_invitation_stats(&self, user: AccountOwner) -> Result<Option<InvitationStats>, ViewError> {
        self.invitation_stats.get(&user).await
    }

    pub async fn get_invitation_record(&self, invitee: AccountOwner) -> Result<Option<InvitationRecord>, ViewError> {
        self.invitations.get(&invitee).await
    }

    pub async fn has_received_invitation_reward(&self, invitee: AccountOwner) -> Result<bool, ViewError> {
        if let Some(record) = self.invitations.get(&invitee).await? {
            Ok(record.rewarded)
        } else {
            Ok(false)
        }
    }

    pub async fn get_user_activity_trend(
        &self,
        user: &AccountOwner,
        period_days: u32,
        current_time: u64,
    ) -> Result<Vec<(u64, u64)>, ViewError> {
        let current_time_seconds = current_time / 1_000_000;
        let end_day = current_time_seconds / 86400;
        let start_day = end_day - period_days as u64;

        let mut activity = Vec::new();

        for day in start_day..=end_day {
            let mut day_count = 0;

            self.events
                .for_each_index_value(|key, value| {
                    let (_, s, _) = key;
                    let (timestamp, _) = &*value;
                    let event_day = timestamp / 86_400_000_000;
                    if s == *user && event_day == day {
                        day_count += 1;
                    }
                    Ok(())
                })
                .await?;

            activity.push((day, day_count));
        }

        Ok(activity)
    }

    pub async fn add_event(
        &mut self,
        chain_id: ChainId,
        sender: &AccountOwner,
        recipient: Option<AccountOwner>,
        timestamp: u64,
        content: Option<String>,
    ) -> Result<(), ViewError> {
        let event_data = serde_json::json!({
            "sender": sender.to_string(),
            "recipient": recipient.map(|r| r.to_string()),
            "timestamp": timestamp,
            "content": content,
            "chain_id": chain_id.to_string()
        });

        let event_json = event_data.to_string();

        self.stream_events.insert(&(chain_id, timestamp), event_json)?;

        let mut user_events = self.user_events.get(&(chain_id, sender.clone())).await?.unwrap_or_default();
        user_events.push((recipient.clone(), timestamp, content.clone()));
        user_events.sort_by(|a, b| b.1.cmp(&a.1));
        self.user_events.insert(&(chain_id, sender.clone()), user_events)?;

        Ok(())
    }

    pub async fn get_stream_events(
        &self,
        chain_id: ChainId,
        since_timestamp: Option<u64>,
        limit: Option<u32>,
    ) -> Result<Vec<String>, ViewError> {
        let mut events = Vec::new();
        let limit = limit.unwrap_or(100);

        self.stream_events
            .for_each_index_value(|key, value| {
                let (event_chain_id, event_timestamp) = key;

                if event_chain_id == chain_id {
                    if let Some(since) = since_timestamp {
                        if event_timestamp >= since {
                            events.push((event_timestamp, value.clone()));
                        }
                    } else {
                        events.push((event_timestamp, value.clone()));
                    }
                }
                Ok(())
            })
            .await?;

        events.sort_by(|a, b| b.0.cmp(&a.0));

        let result: Vec<String> = events
            .into_iter()
            .take(limit as usize)
            .map(|(_, value)| value.into_owned())
            .collect();

        Ok(result)
    }

    pub async fn get_latest_events(
        &self,
        chain_id: ChainId,
        last_known_timestamp: Option<u64>,
    ) -> Result<Vec<String>, ViewError> {
        self.get_stream_events(chain_id, last_known_timestamp, Some(50)).await
    }

    pub async fn get_total_events_count(&self) -> Result<u64, ViewError> {
        let mut count = 0;

        self.stream_events
            .for_each_index_value(|_, _| {
                count += 1;
                Ok(())
            })
            .await?;

        Ok(count)
    }

    pub async fn cleanup_old_events(&mut self, older_than_timestamp: u64) -> Result<u64, ViewError> {
        let mut removed_count = 0;
        let mut keys_to_remove = Vec::new();

        self.stream_events
            .for_each_index_value(|key, _| {
                let (_, event_timestamp) = key;
                if event_timestamp < older_than_timestamp {
                    keys_to_remove.push(key.clone());
                }
                Ok(())
            })
            .await?;

        for key in keys_to_remove {
            self.stream_events.remove(&key)?;
            removed_count += 1;
        }

        if removed_count > 0 {
            self.save().await?;
            log::info!("Cleaned up {} expired events", removed_count);
        }

        Ok(removed_count)
    }
}