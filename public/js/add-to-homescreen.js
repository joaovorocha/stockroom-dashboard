/**
 * iOS Add to Home Screen Prompt
 * Shows a helpful balloon/banner prompting users to add the app to their home screen
 */

(function() {
  'use strict';
  
  // Check if already installed or dismissed
  if (window.matchMedia('(display-mode: standalone)').matches || 
      window.navigator.standalone === true) {
    return; // Already installed as PWA
  }
  
  // Check if dismissed recently (7 days)
  const dismissedKey = 'a2hs-dismissed';
  const dismissedTime = localStorage.getItem(dismissedKey);
  if (dismissedTime) {
    const daysSince = (Date.now() - parseInt(dismissedTime)) / (1000 * 60 * 60 * 24);
    if (daysSince < 7) return; // Don't show for 7 days after dismissal
  }
  
  // Detect iOS
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
  const isInStandaloneMode = window.navigator.standalone;
  
  if (!isIOS || isInStandaloneMode) return;
  
  // Show prompt after a short delay
  setTimeout(showPrompt, 2000);
  
  function showPrompt() {
    // Create balloon element
    const balloon = document.createElement('div');
    balloon.id = 'a2hs-balloon';
    balloon.innerHTML = `
      <div class="a2hs-content">
        <div class="a2hs-header">
          <span class="a2hs-icon">📱</span>
          <span class="a2hs-title">Add to Home Screen</span>
          <button class="a2hs-close" aria-label="Close">×</button>
        </div>
        <p class="a2hs-text">
          Install Daily Operations for quick access and a better experience!
        </p>
        <div class="a2hs-instructions">
          <p>Tap <img src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='20' viewBox='0 0 16 20'%3E%3Cpath fill='%23007AFF' d='M8 0L6.6 1.4l5.8 5.8H0v2h12.4l-5.8 5.8L8 16.6l8-8z' transform='rotate(90 8 8)'/%3E%3C/svg%3E" alt="Share" class="a2hs-share-icon"> then "Add to Home Screen"
        </div>
      </div>
      <div class="a2hs-arrow"></div>
    `;
    
    // Add styles
    const style = document.createElement('style');
    style.textContent = `
      #a2hs-balloon {
        position: fixed;
        bottom: 80px;
        left: 50%;
        transform: translateX(-50%);
        background: white;
        border-radius: 12px;
        box-shadow: 0 4px 20px rgba(0,0,0,0.2), 0 0 0 1px rgba(0,0,0,0.05);
        padding: 16px;
        max-width: 340px;
        width: calc(100% - 32px);
        z-index: 100000;
        animation: a2hs-slideUp 0.3s ease-out;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      }
      
      @keyframes a2hs-slideUp {
        from {
          opacity: 0;
          transform: translateX(-50%) translateY(20px);
        }
        to {
          opacity: 1;
          transform: translateX(-50%) translateY(0);
        }
      }
      
      .a2hs-content {
        color: #333;
      }
      
      .a2hs-header {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 8px;
      }
      
      .a2hs-icon {
        font-size: 24px;
      }
      
      .a2hs-title {
        font-weight: 600;
        font-size: 16px;
        flex: 1;
        color: #000;
      }
      
      .a2hs-close {
        background: none;
        border: none;
        font-size: 28px;
        line-height: 1;
        padding: 0;
        cursor: pointer;
        color: #999;
        width: 28px;
        height: 28px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 50%;
      }
      
      .a2hs-close:active {
        background: #f0f0f0;
      }
      
      .a2hs-text {
        margin: 0 0 12px 0;
        font-size: 14px;
        line-height: 1.4;
        color: #666;
      }
      
      .a2hs-instructions {
        background: #f8f9fa;
        padding: 10px 12px;
        border-radius: 8px;
        font-size: 13px;
        display: flex;
        align-items: center;
        gap: 4px;
      }
      
      .a2hs-instructions p {
        margin: 0;
        color: #007AFF;
        font-weight: 500;
        display: flex;
        align-items: center;
        gap: 6px;
      }
      
      .a2hs-share-icon {
        width: 16px;
        height: 20px;
        vertical-align: middle;
        display: inline-block;
      }
      
      .a2hs-arrow {
        position: absolute;
        bottom: -8px;
        left: 50%;
        transform: translateX(-50%);
        width: 0;
        height: 0;
        border-left: 8px solid transparent;
        border-right: 8px solid transparent;
        border-top: 8px solid white;
        filter: drop-shadow(0 2px 4px rgba(0,0,0,0.1));
      }
      
      @media (prefers-color-scheme: dark) {
        #a2hs-balloon {
          background: #2c2c2e;
          box-shadow: 0 4px 20px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.1);
        }
        
        .a2hs-title {
          color: #fff;
        }
        
        .a2hs-text {
          color: #aaa;
        }
        
        .a2hs-close {
          color: #aaa;
        }
        
        .a2hs-close:active {
          background: #3a3a3c;
        }
        
        .a2hs-instructions {
          background: #1c1c1e;
        }
        
        .a2hs-arrow {
          border-top-color: #2c2c2e;
        }
      }
    `;
    
    document.head.appendChild(style);
    document.body.appendChild(balloon);
    
    // Close button handler
    balloon.querySelector('.a2hs-close').addEventListener('click', function() {
      dismissPrompt();
    });
    
    // Auto-dismiss after 15 seconds
    setTimeout(dismissPrompt, 15000);
  }
  
  function dismissPrompt() {
    const balloon = document.getElementById('a2hs-balloon');
    if (balloon) {
      balloon.style.animation = 'a2hs-slideDown 0.3s ease-out forwards';
      const style = document.createElement('style');
      style.textContent = `
        @keyframes a2hs-slideDown {
          to {
            opacity: 0;
            transform: translateX(-50%) translateY(20px);
          }
        }
      `;
      document.head.appendChild(style);
      
      setTimeout(() => {
        balloon.remove();
        style.remove();
      }, 300);
    }
    
    // Remember dismissal
    localStorage.setItem('a2hs-dismissed', Date.now().toString());
  }
})();
