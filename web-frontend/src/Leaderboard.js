import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useLeaderboardData } from './GMOperations';

const Leaderboard = React.memo(({ currentAccount, isMobile, copyToClipboard }) => {
  const leaderboardData = useLeaderboardData();
  const stableLeaderboardData = useMemo(() => {
    if (!leaderboardData.leaderboardData) return null;
    return JSON.parse(JSON.stringify(leaderboardData.leaderboardData));
  }, [JSON.stringify(leaderboardData.leaderboardData)]);
  const stableInvitationLeaderboardData = useMemo(() => {
    if (!leaderboardData.invitationLeaderboardData) return null;
    return JSON.parse(JSON.stringify(leaderboardData.invitationLeaderboardData));
  }, [JSON.stringify(leaderboardData.invitationLeaderboardData)]);
  const stableRefetchLeaderboard = useCallback(() => {
    leaderboardData.refetchLeaderboard && leaderboardData.refetchLeaderboard();
  }, []);
  
  const stableRefetchInvitationLeaderboard = useCallback(() => {
    leaderboardData.refetchInvitationLeaderboard && leaderboardData.refetchInvitationLeaderboard();
  }, []);

  useEffect(() => {
    if (leaderboardData.refetchLeaderboard) {
      leaderboardData.refetchLeaderboard();
    }
    if (leaderboardData.refetchInvitationLeaderboard) {
      leaderboardData.refetchInvitationLeaderboard();
    }
  }, []);

  const gmLeaderboardItems = useMemo(() => {
    if (!stableLeaderboardData?.getTopUsers || stableLeaderboardData.getTopUsers.length === 0) {
      return null;
    }
    
    return stableLeaderboardData.getTopUsers.map((entry, index) => (
      <tr key={`user-${entry.user}`} data-user={entry.user} className={entry.user === currentAccount ? "current-user" : ""}>
        <td>{index + 1}</td>
        <td>
          <span 
            className="address-simple" 
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              copyToClipboard(entry.user, e);
            }}
          >
            {isMobile ? `${entry.user.slice(0, 6)}...${entry.user.slice(-4)}` : entry.user}
          </span>
        </td>
        <td>{entry.count}</td>
      </tr>
    ));
  }, [stableLeaderboardData?.getTopUsers, currentAccount, isMobile, copyToClipboard]);
  
  const invitationLeaderboardItems = useMemo(() => {
    if (!stableInvitationLeaderboardData?.getTopInvitors || stableInvitationLeaderboardData.getTopInvitors.length === 0) {
      return null;
    }
    
    return stableInvitationLeaderboardData.getTopInvitors.map((entry, index) => (
      <tr key={`invitor-${entry.user}`} data-user={entry.user} className={entry.user === currentAccount ? "current-user" : ""}>
        <td>{index + 1}</td>
        <td>
          <span 
            className="address-simple" 
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              copyToClipboard(entry.user, e);
            }}
          >
            {isMobile ? `${entry.user.slice(0, 6)}...${entry.user.slice(-4)}` : entry.user}
          </span>
        </td>
        <td>{entry.count}</td>
      </tr>
    ));
  }, [stableInvitationLeaderboardData?.getTopInvitors, currentAccount, isMobile, copyToClipboard]);

  return (
    <div className="card leaderboard-card">
      <div className="section-header">
        <h3>Leaderboard</h3>
      </div>
      <div className="leaderboard-content">
          <div className="leaderboard-tabs">
            <div className="stats-header">
              <h4>Top GMicrochains Senders</h4>
              <button 
                className="refresh-btn"
                onClick={stableRefetchLeaderboard}
                title="Refresh leaderboard"
              >
                🔄 Refresh
              </button>
            </div>
            {gmLeaderboardItems ? (
              <div className="leaderboard-list">
                <table className="leaderboard-table">
                  <thead>
                    <tr>
                      <th>Rank</th>
                      <th>User</th>
                      <th>Count</th>
                    </tr>
                  </thead>
                  <tbody>
                    {gmLeaderboardItems}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="no-leaderboard-data">
                <p>No leaderboard data available yet.</p>
              </div>
            )}
          </div>
          
          <div className="leaderboard-tabs invitation-leaderboard-tab">
            <div className="stats-header">
              <h4>Top Invitors</h4>
              <button 
                className="refresh-btn"
                onClick={stableRefetchInvitationLeaderboard}
                title="Refresh invitation leaderboard"
              >
                🔄 Refresh
              </button>
            </div>
            {invitationLeaderboardItems ? (
              <div className="leaderboard-list">
                <table className="leaderboard-table">
                  <thead>
                    <tr>
                      <th>Rank</th>
                      <th>User</th>
                      <th>Points</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invitationLeaderboardItems}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="no-leaderboard-data">
                <p>No invitation leaderboard data available yet.</p>
              </div>
            )}
        </div>
      </div>
    </div>
  );
}, (prevProps, nextProps) => {
  if (prevProps.currentAccount !== nextProps.currentAccount) {
    return false;
  }
  if (prevProps.isMobile !== nextProps.isMobile) {
    return false;
  }
  return true;
});

export default Leaderboard;