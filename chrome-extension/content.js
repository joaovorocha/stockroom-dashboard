// Content script for UPS pages - extracts shipment data

(function() {
  console.log('SuitSupply Shipment Capture: Content script loaded');

  // Extract shipment data from UPS page
  function extractShipmentData() {
    const data = {
      trackingNumber: '',
      recipientName: '',
      addressLine1: '',
      addressLine2: '',
      city: '',
      state: '',
      zip: '',
      country: '',
      phone: '',
      status: '',
      senderName: '', // Employee name (person creating shipment)
      guaranteeDate: '', // Delivered By date
      serviceType: '', // UPS Ground Service, etc.
      orderNumber: '', // Order number if present
      source: 'ups',
      extractedAt: new Date().toISOString()
    };

    try {
      // Method 1: Try to extract from shipment confirmation page (text-based)
      const pageText = document.body.innerText;

      // Look for "Tracking Number:" followed by the number
      const trackingMatch = pageText.match(/Tracking Number:\s*([A-Z0-9]+)/i);
      if (trackingMatch) {
        data.trackingNumber = trackingMatch[1].trim();
      }

      // Look for delivery guarantee date
      const deliveredByMatch = pageText.match(/Delivered By:\s*([^\n]+)/i);
      if (deliveredByMatch) {
        data.guaranteeDate = deliveredByMatch[1].trim();
        data.status = 'Scheduled: ' + deliveredByMatch[1].trim();
      }

      // Look for service type
      const serviceMatch = pageText.match(/Service:\s*([^\n]+)/i);
      if (serviceMatch) {
        data.serviceType = serviceMatch[1].trim();
      }

      // Look for sender name (person creating shipment)
      const shipFromMatch = pageText.match(/Ship From:\s*([^\n]+)/i);
      if (shipFromMatch) {
        data.senderName = shipFromMatch[1].trim();
      }

      // Alternative: look for "Shipper" or "Sender"
      if (!data.senderName) {
        const shipperMatch = pageText.match(/(?:Shipper|Sender):\s*([^\n]+)/i);
        if (shipperMatch) {
          data.senderName = shipperMatch[1].trim();
        }
      }

      // Look for order number or reference number
      const orderMatch = pageText.match(/(?:Order|Reference|PO)(?:\s+Number)?:\s*([A-Z0-9-]+)/i);
      if (orderMatch) {
        data.orderNumber = orderMatch[1].trim();
      }

      // Method 2: Try multiple selectors for tracking number
      if (!data.trackingNumber) {
        const trackingSelectors = [
          '[data-test="tracking-number"]',
          '.tracking-number',
          'input[name="trackingNumber"]',
          'input[id*="trackingNumber"]',
          '.ups-tracking_number'
        ];

        for (const selector of trackingSelectors) {
          const element = document.querySelector(selector);
          if (element) {
            data.trackingNumber = element.textContent?.trim() || element.value?.trim() || '';
            if (data.trackingNumber) break;
          }
        }
      }

      // Method 3: Extract from URL if present
      if (!data.trackingNumber) {
        const urlParams = new URLSearchParams(window.location.search);
        data.trackingNumber = urlParams.get('trackNums') || urlParams.get('trackingNumber') || '';
      }

      // Extract recipient name (try text-based first, then selectors)
      const shipToMatch = pageText.match(/Ship To:\s*([^\n]+)/i);
      if (shipToMatch) {
        data.recipientName = shipToMatch[1].trim();
      }

      if (!data.recipientName) {
        const nameSelectors = [
          '[data-test="recipient-name"]',
          '.recipient-name',
          '[data-test*="name"]',
          '.delivery-name'
        ];

        for (const selector of nameSelectors) {
          const element = document.querySelector(selector);
          if (element) {
            data.recipientName = element.textContent?.trim() || '';
            if (data.recipientName) break;
          }
        }
      }

      // Extract address (try text-based search for common patterns)
      // Look for patterns like "123 Main St" or "Apt 4B"
      const addressLines = pageText.match(/\d+\s+[A-Za-z\s]+(?:Street|St|Avenue|Ave|Road|Rd|Drive|Dr|Lane|Ln|Boulevard|Blvd|Way|Court|Ct|Place|Pl|Circle|Cir)/i);
      if (addressLines && addressLines[0]) {
        data.addressLine1 = addressLines[0].trim();
      }

      // Try to find city, state, zip pattern
      const cityStateZipMatch = pageText.match(/([A-Za-z\s]+),\s*([A-Z]{2})\s+(\d{5}(-\d{4})?)/);
      if (cityStateZipMatch) {
        data.city = cityStateZipMatch[1].trim();
        data.state = cityStateZipMatch[2];
        data.zip = cityStateZipMatch[3];
      }

      // Try selector-based extraction if text search didn't work
      if (!data.addressLine1) {
        const addressSelectors = [
          '[data-test="delivery-address"]',
          '.delivery-address',
          '[data-test*="address"]',
          '.address-line'
        ];

        for (const selector of addressSelectors) {
          const elements = document.querySelectorAll(selector);
          if (elements.length > 0) {
            const addressLines = Array.from(elements).map(el => el.textContent?.trim()).filter(Boolean);

            if (addressLines.length >= 1) data.addressLine1 = addressLines[0];
            if (addressLines.length >= 2) {
              // Try to parse city, state, zip from last line
              const lastLine = addressLines[addressLines.length - 1];
              const cityStateZipMatch = lastLine.match(/^(.+),\s*([A-Z]{2})\s+(\d{5}(-\d{4})?)$/);

              if (cityStateZipMatch) {
                data.city = cityStateZipMatch[1].trim();
                data.state = cityStateZipMatch[2];
                data.zip = cityStateZipMatch[3];

                // Middle lines are address line 2
                if (addressLines.length >= 3) {
                  data.addressLine2 = addressLines.slice(1, -1).join(', ');
                }
              } else {
                data.addressLine2 = addressLines.slice(1).join(', ');
              }
            }
            break;
          }
        }
      }

      // Extract city, state, zip if not already parsed
      if (!data.city) {
        const cityElement = document.querySelector('[data-test*="city"], .city');
        if (cityElement) data.city = cityElement.textContent?.trim() || '';
      }

      if (!data.state) {
        const stateElement = document.querySelector('[data-test*="state"], .state');
        if (stateElement) data.state = stateElement.textContent?.trim() || '';
      }

      if (!data.zip) {
        const zipElement = document.querySelector('[data-test*="zip"], [data-test*="postal"], .zip, .postal-code');
        if (zipElement) data.zip = zipElement.textContent?.trim() || '';
      }

      // Default to US
      data.country = 'United States';

      // Extract status (already set from "Delivered By" or try element selectors)
      if (!data.status) {
        const statusElement = document.querySelector('[data-test*="status"], .status, .delivery-status');
        if (statusElement) {
          data.status = statusElement.textContent?.trim() || '';
        }
      }

      console.log('Extracted shipment data:', data);

    } catch (error) {
      console.error('Error extracting shipment data:', error);
    }

    return data;
  }

  // Listen for messages from popup
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'extractData') {
      const data = extractShipmentData();
      sendResponse({ success: true, data: data });
    }
    return true; // Keep message channel open for async response
  });

  // Store data in chrome.storage when page loads
  window.addEventListener('load', () => {
    setTimeout(() => {
      const data = extractShipmentData();
      if (data.trackingNumber) {
        chrome.storage.local.set({ lastExtractedData: data }, () => {
          console.log('Shipment data saved to storage');
        });
      }
    }, 2000); // Wait 2 seconds for page to fully load
  });

})();
