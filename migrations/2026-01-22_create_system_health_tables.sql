-- System Health Monitoring Database Schema
-- Created: January 22, 2026
-- Purpose: Track system metrics, user sessions, events, and alerts

-- ============================================================================
-- Table 1: system_metrics
-- Purpose: Store real-time and historical system performance metrics
-- ============================================================================
CREATE TABLE IF NOT EXISTS system_metrics (
    id SERIAL PRIMARY KEY,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- CPU Metrics
    cpu_usage_percent DECIMAL(5,2),
    cpu_cores INTEGER,
    cpu_temperature DECIMAL(5,2),
    cpu_load_1min DECIMAL(10,2),
    cpu_load_5min DECIMAL(10,2),
    cpu_load_15min DECIMAL(10,2),
    
    -- Memory Metrics
    memory_total_mb BIGINT,
    memory_used_mb BIGINT,
    memory_free_mb BIGINT,
    memory_usage_percent DECIMAL(5,2),
    swap_total_mb BIGINT,
    swap_used_mb BIGINT,
    swap_usage_percent DECIMAL(5,2),
    
    -- Disk Metrics
    disk_total_gb DECIMAL(10,2),
    disk_used_gb DECIMAL(10,2),
    disk_free_gb DECIMAL(10,2),
    disk_usage_percent DECIMAL(5,2),
    disk_read_mb_sec DECIMAL(10,2),
    disk_write_mb_sec DECIMAL(10,2),
    
    -- Network Metrics
    network_rx_mb_sec DECIMAL(10,2),
    network_tx_mb_sec DECIMAL(10,2),
    network_connections_active INTEGER,
    
    -- GPU/NPU Metrics (nullable - not all systems have)
    gpu_usage_percent DECIMAL(5,2),
    gpu_memory_used_mb BIGINT,
    gpu_memory_total_mb BIGINT,
    gpu_temperature DECIMAL(5,2),
    
    -- System Info
    active_processes INTEGER,
    active_users INTEGER,
    system_uptime_hours DECIMAL(10,2)
);

-- Indexes for system_metrics
CREATE INDEX IF NOT EXISTS idx_system_metrics_timestamp ON system_metrics(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_system_metrics_cpu_usage ON system_metrics(cpu_usage_percent DESC);
CREATE INDEX IF NOT EXISTS idx_system_metrics_memory_usage ON system_metrics(memory_usage_percent DESC);

-- ============================================================================
-- Table 2: user_sessions_log
-- Purpose: Track user login sessions and activity
-- ============================================================================
CREATE TABLE IF NOT EXISTS user_sessions_log (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES employees(id),
    username VARCHAR(100),
    session_id VARCHAR(255) UNIQUE NOT NULL,
    
    -- Session Details
    login_time TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    logout_time TIMESTAMP WITH TIME ZONE,
    last_activity TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    session_duration_minutes INTEGER,
    
    -- Connection Info
    ip_address VARCHAR(45),
    user_agent TEXT,
    device_type VARCHAR(50),  -- desktop, mobile, tablet
    
    -- Activity Metrics
    pages_visited INTEGER DEFAULT 0,
    actions_performed INTEGER DEFAULT 0,
    
    -- Status
    is_active BOOLEAN DEFAULT true,
    termination_reason VARCHAR(100)  -- logout, timeout, forced
);

-- Indexes for user_sessions_log
CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON user_sessions_log(user_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_active ON user_sessions_log(is_active, last_activity);
CREATE INDEX IF NOT EXISTS idx_user_sessions_login_time ON user_sessions_log(login_time DESC);
CREATE INDEX IF NOT EXISTS idx_user_sessions_session_id ON user_sessions_log(session_id);

-- ============================================================================
-- Table 3: system_events_log
-- Purpose: Log system events, errors, and warnings
-- ============================================================================
CREATE TABLE IF NOT EXISTS system_events_log (
    id SERIAL PRIMARY KEY,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Event Classification
    event_type VARCHAR(50) NOT NULL,  -- startup, shutdown, error, warning, info
    severity VARCHAR(20) NOT NULL,    -- critical, high, medium, low, info
    category VARCHAR(50) NOT NULL,    -- system, user, application, security
    
    -- Event Details
    title VARCHAR(255) NOT NULL,
    description TEXT,
    source VARCHAR(100),  -- service/component that generated event
    
    -- Context
    user_id INTEGER REFERENCES employees(id),
    related_resource VARCHAR(255),  -- file path, service name, etc.
    
    -- Metadata
    metadata JSONB,  -- Additional flexible data
    resolved BOOLEAN DEFAULT false,
    resolved_at TIMESTAMP WITH TIME ZONE,
    resolved_by INTEGER REFERENCES employees(id)
);

-- Indexes for system_events_log
CREATE INDEX IF NOT EXISTS idx_system_events_timestamp ON system_events_log(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_system_events_type ON system_events_log(event_type);
CREATE INDEX IF NOT EXISTS idx_system_events_severity ON system_events_log(severity);
CREATE INDEX IF NOT EXISTS idx_system_events_unresolved ON system_events_log(resolved, severity) WHERE resolved = false;

-- ============================================================================
-- Table 4: system_alerts
-- Purpose: Track system alerts and their lifecycle
-- ============================================================================
CREATE TABLE IF NOT EXISTS system_alerts (
    id SERIAL PRIMARY KEY,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Alert Details
    alert_type VARCHAR(50) NOT NULL,  -- cpu_high, memory_high, disk_full, etc.
    severity VARCHAR(20) NOT NULL,    -- critical, warning, info
    title VARCHAR(255) NOT NULL,
    message TEXT,
    
    -- Threshold Info
    threshold_value DECIMAL(10,2),
    current_value DECIMAL(10,2),
    
    -- Status
    is_active BOOLEAN DEFAULT true,
    acknowledged BOOLEAN DEFAULT false,
    acknowledged_by INTEGER REFERENCES employees(id),
    acknowledged_at TIMESTAMP WITH TIME ZONE,
    
    -- Resolution
    resolved BOOLEAN DEFAULT false,
    resolved_at TIMESTAMP WITH TIME ZONE,
    auto_resolved BOOLEAN DEFAULT false,
    
    -- Metadata
    metadata JSONB
);

-- Indexes for system_alerts
CREATE INDEX IF NOT EXISTS idx_system_alerts_active ON system_alerts(is_active, severity) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_system_alerts_timestamp ON system_alerts(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_system_alerts_type ON system_alerts(alert_type);

-- ============================================================================
-- Table 5: system_hardware_info
-- Purpose: Store hardware inventory and system information
-- ============================================================================
CREATE TABLE IF NOT EXISTS system_hardware_info (
    id SERIAL PRIMARY KEY,
    last_updated TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- System Info
    hostname VARCHAR(255),
    os_type VARCHAR(50),
    os_platform VARCHAR(50),
    os_release VARCHAR(100),
    os_arch VARCHAR(20),
    
    -- CPU Info
    cpu_manufacturer VARCHAR(100),
    cpu_brand VARCHAR(255),
    cpu_cores_physical INTEGER,
    cpu_cores_logical INTEGER,
    cpu_speed_ghz DECIMAL(10,2),
    
    -- Memory Info
    total_memory_gb DECIMAL(10,2),
    memory_type VARCHAR(50),
    
    -- Storage
    storage_devices JSONB,  -- Array of disk info
    
    -- Network
    network_interfaces JSONB,  -- Array of interface info
    
    -- USB/Peripherals
    usb_devices JSONB,  -- Array of connected USB devices
    
    -- Graphics
    graphics_controllers JSONB,  -- GPU/NPU info
    
    -- Full system info snapshot
    full_snapshot JSONB
);

-- ============================================================================
-- Table 6: process_snapshots
-- Purpose: Store periodic snapshots of top processes
-- ============================================================================
CREATE TABLE IF NOT EXISTS process_snapshots (
    id SERIAL PRIMARY KEY,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Top processes by CPU
    top_cpu_processes JSONB,  -- [{pid, name, cpu%, memory%}, ...]
    
    -- Top processes by Memory
    top_memory_processes JSONB,
    
    -- Summary stats
    total_processes INTEGER,
    zombie_processes INTEGER,
    sleeping_processes INTEGER,
    running_processes INTEGER
);

-- Indexes for process_snapshots
CREATE INDEX IF NOT EXISTS idx_process_snapshots_timestamp ON process_snapshots(timestamp DESC);

-- ============================================================================
-- Table 7: monitoring_config
-- Purpose: Store monitoring configuration and thresholds
-- ============================================================================
CREATE TABLE IF NOT EXISTS monitoring_config (
    id SERIAL PRIMARY KEY,
    config_key VARCHAR(100) UNIQUE NOT NULL,
    config_value JSONB NOT NULL,
    description TEXT,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_by INTEGER REFERENCES employees(id)
);

-- Insert default thresholds
INSERT INTO monitoring_config (config_key, config_value, description) VALUES
('cpu_thresholds', '{"warning": 75, "critical": 90, "sustained_seconds": 60}', 'CPU usage alert thresholds'),
('memory_thresholds', '{"warning": 80, "critical": 95, "sustained_seconds": 120}', 'Memory usage alert thresholds'),
('disk_thresholds', '{"warning": 85, "critical": 95}', 'Disk space alert thresholds'),
('network_thresholds', '{"warning_mbps": 800, "critical_mbps": 950}', 'Network bandwidth alert thresholds'),
('gpu_thresholds', '{"warning": 90, "critical": 99, "sustained_seconds": 60}', 'GPU usage alert thresholds'),
('monitoring_intervals', '{"realtime_seconds": 5, "frequent_seconds": 30, "periodic_minutes": 5, "hourly": true}', 'Data collection intervals'),
('data_retention', '{"realtime_hours": 24, "aggregated_days": 90, "archived_days": 365}', 'Data retention policy'),
('alert_settings', '{"email_enabled": false, "email_recipients": [], "websocket_enabled": true, "deduplication_minutes": 15}', 'Alert delivery settings')
ON CONFLICT (config_key) DO NOTHING;

-- ============================================================================
-- Views for easier querying
-- ============================================================================

-- View: Latest system metrics
CREATE OR REPLACE VIEW v_latest_system_metrics AS
SELECT * FROM system_metrics 
ORDER BY timestamp DESC 
LIMIT 1;

-- View: Active user sessions
CREATE OR REPLACE VIEW v_active_user_sessions AS
SELECT 
    s.id,
    s.user_id,
    s.username,
    s.session_id,
    s.login_time,
    s.last_activity,
    EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - s.last_activity)) / 60 AS idle_minutes,
    s.ip_address,
    s.device_type,
    s.pages_visited,
    s.actions_performed
FROM user_sessions_log s
WHERE s.is_active = true
ORDER BY s.last_activity DESC;

-- View: Active alerts
CREATE OR REPLACE VIEW v_active_alerts AS
SELECT 
    id,
    timestamp,
    alert_type,
    severity,
    title,
    message,
    threshold_value,
    current_value,
    acknowledged,
    acknowledged_by,
    acknowledged_at,
    EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - timestamp)) / 60 AS age_minutes
FROM system_alerts
WHERE is_active = true AND resolved = false
ORDER BY 
    CASE severity 
        WHEN 'critical' THEN 1 
        WHEN 'warning' THEN 2 
        ELSE 3 
    END,
    timestamp DESC;

-- View: Recent system events
CREATE OR REPLACE VIEW v_recent_system_events AS
SELECT 
    id,
    timestamp,
    event_type,
    severity,
    category,
    title,
    description,
    source,
    user_id,
    resolved,
    EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - timestamp)) / 60 AS age_minutes
FROM system_events_log
WHERE timestamp > CURRENT_TIMESTAMP - INTERVAL '24 hours'
ORDER BY timestamp DESC;

-- ============================================================================
-- Functions for data management
-- ============================================================================

-- Function: Clean up old metrics data
CREATE OR REPLACE FUNCTION cleanup_old_metrics()
RETURNS void AS $$
BEGIN
    -- Delete metrics older than retention period
    DELETE FROM system_metrics 
    WHERE timestamp < CURRENT_TIMESTAMP - INTERVAL '90 days';
    
    -- Delete old process snapshots
    DELETE FROM process_snapshots 
    WHERE timestamp < CURRENT_TIMESTAMP - INTERVAL '30 days';
    
    RAISE NOTICE 'Cleaned up old metrics data';
END;
$$ LANGUAGE plpgsql;

-- Function: Close inactive sessions
CREATE OR REPLACE FUNCTION close_inactive_sessions()
RETURNS INTEGER AS $$
DECLARE
    closed_count INTEGER;
BEGIN
    UPDATE user_sessions_log
    SET 
        is_active = false,
        logout_time = CURRENT_TIMESTAMP,
        termination_reason = 'timeout',
        session_duration_minutes = EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - login_time)) / 60
    WHERE is_active = true
      AND last_activity < CURRENT_TIMESTAMP - INTERVAL '30 minutes'
      AND logout_time IS NULL;
    
    GET DIAGNOSTICS closed_count = ROW_COUNT;
    
    RETURN closed_count;
END;
$$ LANGUAGE plpgsql;

-- Function: Auto-resolve old alerts
CREATE OR REPLACE FUNCTION auto_resolve_old_alerts()
RETURNS INTEGER AS $$
DECLARE
    resolved_count INTEGER;
BEGIN
    UPDATE system_alerts
    SET 
        is_active = false,
        resolved = true,
        resolved_at = CURRENT_TIMESTAMP,
        auto_resolved = true
    WHERE is_active = true
      AND timestamp < CURRENT_TIMESTAMP - INTERVAL '24 hours';
    
    GET DIAGNOSTICS resolved_count = ROW_COUNT;
    
    RETURN resolved_count;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- Grant permissions (adjust as needed for your user setup)
-- ============================================================================

-- Grant permissions to application user (if you have a specific DB user)
-- GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO your_app_user;
-- GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO your_app_user;
-- GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO your_app_user;

-- ============================================================================
-- Completion message
-- ============================================================================

DO $$
BEGIN
    RAISE NOTICE '====================================================';
    RAISE NOTICE 'System Health Monitoring Schema Created Successfully';
    RAISE NOTICE '====================================================';
    RAISE NOTICE 'Tables created:';
    RAISE NOTICE '  - system_metrics';
    RAISE NOTICE '  - user_sessions_log';
    RAISE NOTICE '  - system_events_log';
    RAISE NOTICE '  - system_alerts';
    RAISE NOTICE '  - system_hardware_info';
    RAISE NOTICE '  - process_snapshots';
    RAISE NOTICE '  - monitoring_config';
    RAISE NOTICE '';
    RAISE NOTICE 'Views created:';
    RAISE NOTICE '  - v_latest_system_metrics';
    RAISE NOTICE '  - v_active_user_sessions';
    RAISE NOTICE '  - v_active_alerts';
    RAISE NOTICE '  - v_recent_system_events';
    RAISE NOTICE '';
    RAISE NOTICE 'Functions created:';
    RAISE NOTICE '  - cleanup_old_metrics()';
    RAISE NOTICE '  - close_inactive_sessions()';
    RAISE NOTICE '  - auto_resolve_old_alerts()';
    RAISE NOTICE '====================================================';
END $$;
