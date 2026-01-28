/**
 * User Session Tracker
 * Tracks active user sessions, logins, logouts, and activity
 */

const { query } = require('../dal/pg');
const logger = require('./logger');

class UserSessionTracker {
  constructor() {
    this.activeSessions = new Map(); // In-memory session tracking
    this.sessionTimeout = 30 * 60 * 1000; // 30 minutes
  }

  /**
   * Track user login
   */
  async trackLogin(userId, username, sessionId, ipAddress, userAgent) {
    try {
      // Determine device type from user agent
      const deviceType = this.detectDeviceType(userAgent);

      // Insert session log
      const result = await query(
        `INSERT INTO user_sessions_log 
        (user_id, username, session_id, ip_address, user_agent, device_type, login_time, last_activity, is_active)
        VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, true)
        RETURNING id`,
        [userId, username, sessionId, ipAddress, userAgent, deviceType]
      );

      // Add to active sessions map
      this.activeSessions.set(sessionId, {
        userId,
        username,
        loginTime: new Date(),
        lastActivity: new Date(),
        ipAddress,
        deviceType
      });

      logger.event('User logged in', {
        userId,
        username,
        sessionId,
        ipAddress,
        deviceType
      });

      return result.rows[0].id;

    } catch (error) {
      logger.error('Error tracking login', { error: error.message, userId, username });
      return null;
    }
  }

  /**
   * Track user logout
   */
  async trackLogout(sessionId, reason = 'logout') {
    try {
      // Update session in database
      await query(
        `UPDATE user_sessions_log 
        SET is_active = false, 
            logout_time = CURRENT_TIMESTAMP,
            termination_reason = $2,
            session_duration_minutes = EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - login_time)) / 60
        WHERE session_id = $1 AND is_active = true`,
        [sessionId, reason]
      );

      // Remove from active sessions
      const session = this.activeSessions.get(sessionId);
      if (session) {
        logger.event('User logged out', {
          userId: session.userId,
          username: session.username,
          sessionId,
          reason
        });
        this.activeSessions.delete(sessionId);
      }

    } catch (error) {
      logger.error('Error tracking logout', { error: error.message, sessionId });
    }
  }

  /**
   * Update session activity
   */
  async updateActivity(sessionId) {
    try {
      // Update in database
      await query(
        `UPDATE user_sessions_log 
        SET last_activity = CURRENT_TIMESTAMP,
            actions_performed = actions_performed + 1
        WHERE session_id = $1 AND is_active = true`,
        [sessionId]
      );

      // Update in memory
      const session = this.activeSessions.get(sessionId);
      if (session) {
        session.lastActivity = new Date();
      }

    } catch (error) {
      logger.error('Error updating activity', { error: error.message, sessionId });
    }
  }

  /**
   * Track page visit
   */
  async trackPageVisit(sessionId, page) {
    try {
      await query(
        `UPDATE user_sessions_log 
        SET last_activity = CURRENT_TIMESTAMP,
            pages_visited = pages_visited + 1
        WHERE session_id = $1 AND is_active = true`,
        [sessionId]
      );

      // Update in memory
      const session = this.activeSessions.get(sessionId);
      if (session) {
        session.lastActivity = new Date();
      }

    } catch (error) {
      logger.error('Error tracking page visit', { error: error.message, sessionId });
    }
  }

  /**
   * Get active sessions count
   */
  getActiveSessionCount() {
    return this.activeSessions.size;
  }

  /**
   * Get active sessions
   */
  getActiveSessions() {
    return Array.from(this.activeSessions.entries()).map(([sessionId, session]) => ({
      sessionId,
      ...session,
      idleMinutes: Math.round((Date.now() - session.lastActivity.getTime()) / 1000 / 60)
    }));
  }

  /**
   * Get active sessions from database
   */
  async getActiveSessionsFromDB() {
    try {
      const result = await query(
        `SELECT * FROM v_active_user_sessions ORDER BY last_activity DESC`
      );
      return result.rows;
    } catch (error) {
      logger.error('Error getting active sessions from DB', { error: error.message });
      return [];
    }
  }

  /**
   * Close inactive sessions
   */
  async closeInactiveSessions() {
    try {
      // Close sessions inactive for more than timeout period
      const result = await query(
        `SELECT close_inactive_sessions() as closed_count`
      );

      const closedCount = result.rows[0].closed_count;

      if (closedCount > 0) {
        logger.info(`Closed ${closedCount} inactive sessions`);
        
        // Also clean up in-memory sessions
        const now = Date.now();
        for (const [sessionId, session] of this.activeSessions.entries()) {
          if (now - session.lastActivity.getTime() > this.sessionTimeout) {
            this.activeSessions.delete(sessionId);
          }
        }
      }

      return closedCount;

    } catch (error) {
      logger.error('Error closing inactive sessions', { error: error.message });
      return 0;
    }
  }

  /**
   * Get session history for user
   */
  async getUserSessionHistory(userId, limit = 50) {
    try {
      const result = await query(
        `SELECT 
          id, login_time, logout_time, last_activity, session_duration_minutes,
          ip_address, device_type, pages_visited, actions_performed,
          is_active, termination_reason
        FROM user_sessions_log
        WHERE user_id = $1
        ORDER BY login_time DESC
        LIMIT $2`,
        [userId, limit]
      );
      return result.rows;
    } catch (error) {
      logger.error('Error getting user session history', { error: error.message, userId });
      return [];
    }
  }

  /**
   * Get session statistics
   */
  async getSessionStatistics(days = 7) {
    try {
      const result = await query(
        `SELECT 
          DATE(login_time) as date,
          COUNT(*) as total_sessions,
          COUNT(DISTINCT user_id) as unique_users,
          AVG(session_duration_minutes) as avg_duration_minutes,
          MAX(session_duration_minutes) as max_duration_minutes
        FROM user_sessions_log
        WHERE login_time >= CURRENT_DATE - INTERVAL '${days} days'
        GROUP BY DATE(login_time)
        ORDER BY date DESC`
      );
      return result.rows;
    } catch (error) {
      logger.error('Error getting session statistics', { error: error.message });
      return [];
    }
  }

  /**
   * Detect device type from user agent
   */
  detectDeviceType(userAgent) {
    if (!userAgent) return 'unknown';
    
    const ua = userAgent.toLowerCase();
    
    if (ua.includes('mobile') || ua.includes('android') || ua.includes('iphone')) {
      return 'mobile';
    } else if (ua.includes('tablet') || ua.includes('ipad')) {
      return 'tablet';
    } else {
      return 'desktop';
    }
  }

  /**
   * Force logout user session
   */
  async forceLogout(sessionId, adminId) {
    try {
      await this.trackLogout(sessionId, 'forced_by_admin');
      
      logger.security('Session forcefully terminated', {
        sessionId,
        adminId,
        reason: 'forced_logout'
      });

    } catch (error) {
      logger.error('Error forcing logout', { error: error.message, sessionId });
    }
  }

  /**
   * Get concurrent sessions for user
   */
  async getConcurrentSessions(userId) {
    try {
      const result = await query(
        `SELECT session_id, login_time, last_activity, ip_address, device_type
        FROM user_sessions_log
        WHERE user_id = $1 AND is_active = true
        ORDER BY last_activity DESC`,
        [userId]
      );
      return result.rows;
    } catch (error) {
      logger.error('Error getting concurrent sessions', { error: error.message, userId });
      return [];
    }
  }
}

module.exports = new UserSessionTracker();
