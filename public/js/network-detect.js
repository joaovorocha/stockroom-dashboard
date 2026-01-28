/**
 * Smart Network Detection
 * Auto-redirects to local IP when on same WiFi network
 * Falls back to Tailscale when remote
 * DISABLED - Preventing photo loading issues
 */

(function() {
  'use strict';
  
  // DISABLED: Network redirect feature
  return;
  
  const LOCAL_IP = '10.201.48.17';
  const LOCAL_PORT = '80'; // Apache proxy
  const LOCAL_NETWORK = '10.201.48';
  const TAILSCALE_HOST = 'suitserver.tail39e95f.ts.net';
  const CHECK_TIMEOUT = 2000; // 2 seconds
  
  // Skip if already on local IP or localhost
  if (window.location.hostname === LOCAL_IP || 
      window.location.hostname === 'localhost' ||
      window.location.hostname.startsWith('127.')) {
    return;
  }
  
  // Skip if not on Tailscale domain
  if (window.location.hostname !== TAILSCALE_HOST) {
    return;
  }
  
  /**
   * Check if we can reach local IP
   */
  async function isOnLocalNetwork() {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), CHECK_TIMEOUT);
      
      const testUrl = LOCAL_PORT === '80' 
        ? `http://${LOCAL_IP}/favicon.ico`
        : `http://${LOCAL_IP}:${LOCAL_PORT}/favicon.ico`;
      
      const response = await fetch(testUrl, {
        method: 'HEAD',
        mode: 'no-cors', // Avoid CORS issues
        cache: 'no-cache',
        signal: controller.signal
      });
      
      clearTimeout(timeout);
      return true; // If we get ANY response, we're on local network
    } catch (error) {
      return false; // Can't reach local IP = remote user
    }
  }
  
  /**
   * Redirect to local IP with same path
   */
  function redirectToLocal() {
    const currentPath = window.location.pathname + window.location.search + window.location.hash;
    const localUrl = LOCAL_PORT === '80'
      ? `http://${LOCAL_IP}${currentPath}`
      : `http://${LOCAL_IP}:${LOCAL_PORT}${currentPath}`;
    
    console.log('🚀 Local network detected - redirecting to fast local IP');
    
    // Store preference to avoid loops
    sessionStorage.setItem('network-check-done', 'true');
    
    window.location.replace(localUrl);
  }
  
  /**
   * Main detection logic
   */
  async function checkAndRedirect() {
    // Skip if already checked this session
    if (sessionStorage.getItem('network-check-done')) {
      return;
    }
    
    console.log('🔍 Checking network location...');
    
    const isLocal = await isOnLocalNetwork();
    
    if (isLocal) {
      redirectToLocal();
    } else {
      console.log('🌐 Remote access detected - using Tailscale');
      sessionStorage.setItem('network-check-done', 'true');
    }
  }
  
  // Run check after page loads
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', checkAndRedirect);
  } else {
    checkAndRedirect();
  }
})();
