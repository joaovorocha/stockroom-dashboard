/**
 * UPS API Client
 * 
 * Integrates with UPS REST API for:
 * - Address validation
 * - Shipping label generation (ZPL format for Zebra printers)
 * - Tracking
 * - Rate shopping
 * 
 * API Documentation: https://developer.ups.com/
 * 
 * Developer: Victor Rocha, Stockroom Manager @ Suit Supply
 */

const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');

class UPSClient {
  constructor() {
    this.clientId = process.env.UPS_CLIENT_ID;
    this.clientSecret = process.env.UPS_CLIENT_SECRET;
    this.accountNumber = process.env.UPS_ACCOUNT_NUMBER;
    this.baseURL = process.env.UPS_BASE_URL || 'https://onlinetools.ups.com/api';
    this.authURL = process.env.UPS_AUTH_URL || 'https://onlinetools.ups.com/security/v1/oauth/token';
    
    // Store address (ship from)
    this.storeAddress = {
      name: process.env.STORE_NAME || 'Suit Supply San Francisco',
      attentionName: 'Stockroom',
      addressLine1: process.env.STORE_ADDRESS_LINE1 || '150 Maiden Lane',
      city: process.env.STORE_CITY || 'San Francisco',
      state: process.env.STORE_STATE || 'CA',
      zip: process.env.STORE_ZIP || '94108',
      country: 'US',
      phone: process.env.STORE_PHONE || '4155551234'
    };
    
    this.accessToken = null;
    this.tokenExpiry = null;
    
    if (!this.clientId || !this.clientSecret) {
      console.warn('⚠️  UPS credentials not configured - UPS integration disabled');
    }
  }
  
  isConfigured() {
    return !!(this.clientId && this.clientSecret && this.accountNumber);
  }
  
  // ============================================================================
  // AUTHENTICATION
  // ============================================================================
  
  async authenticate() {
    if (this.accessToken && this.tokenExpiry && Date.now() < this.tokenExpiry) {
      return this.accessToken;
    }
    
    const auth = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');
    
    try {
      const response = await axios.post(
        this.authURL,
        'grant_type=client_credentials',
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Authorization': `Basic ${auth}`
          }
        }
      );
      
      this.accessToken = response.data.access_token;
      this.tokenExpiry = Date.now() + (response.data.expires_in * 1000) - 60000; // 1 min buffer
      
      console.log('[UPS] Authentication successful');
      return this.accessToken;
    } catch (error) {
      console.error('[UPS] Authentication failed:', error.message);
      throw new Error('UPS authentication failed');
    }
  }
  
  async makeRequest(method, endpoint, data = null) {
    await this.authenticate();
    
    // Generate a unique transaction ID for each request
    const transId = require('crypto').randomBytes(16).toString('hex');
    
    const config = {
      method,
      url: `${this.baseURL}${endpoint}`,
      headers: {
        'Authorization': `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
        'transId': transId,
        'transactionSrc': 'testing' // As per UPS docs for dev
      }
    };
    
    if (data) {
      config.data = data;
    }
    
    try {
      const response = await axios(config);
      return response.data;
    } catch (error) {
      console.error(`[UPS] ${method} ${endpoint} failed:`, error.response?.data || error.message);
      throw error;
    }
  }
  
  // ============================================================================
  // ADDRESS VALIDATION
  // ============================================================================
  
  /**
   * Validate shipping address
   * @param {object} address - { addressLine1, addressLine2, city, state, zip, country }
   * @returns {Promise<object>} { valid: boolean, suggestedAddress: object, quality: string }
   */
  async validateAddress(address) {
    const requestData = {
      XAVRequest: {
        AddressKeyFormat: {
          AddressLine: [address.addressLine1, address.addressLine2].filter(Boolean),
          PoliticalDivision2: address.city,
          PoliticalDivision1: address.state,
          PostcodePrimaryLow: address.zip,
          CountryCode: address.country || 'US'
        }
      }
    };
    
    try {
      const response = await this.makeRequest('POST', '/addressvalidation/v1/1', requestData);
      
      const result = response.XAVResponse;
      const validAddress = result.ValidAddressIndicator === 'Y';
      const quality = result.AddressClassification?.Description || 'Unknown';
      
      let suggestedAddress = null;
      if (result.Candidate && result.Candidate.length > 0) {
        const candidate = result.Candidate[0];
        const addr = candidate.AddressKeyFormat;
        suggestedAddress = {
          addressLine1: addr.AddressLine?.[0] || address.addressLine1,
          addressLine2: addr.AddressLine?.[1] || address.addressLine2 || '',
          city: addr.PoliticalDivision2 || address.city,
          state: addr.PoliticalDivision1 || address.state,
          zip: addr.PostcodePrimaryLow || address.zip,
          country: addr.CountryCode || address.country || 'US',
          quality
        };
      }
      
      return {
        valid: validAddress,
        suggestedAddress,
        quality,
        rawResponse: result
      };
    } catch (error) {
      console.error('[UPS] Address validation failed:', error.message);
      return {
        valid: false,
        error: error.message,
        suggestedAddress: null
      };
    }
  }
  
  // ============================================================================
  // SHIPPING LABEL GENERATION
  // ============================================================================
  
  /**
   * Create shipping label (ZPL format for Zebra printers)
   * @param {object} shipment - Shipment data
   * @returns {Promise<object>} { trackingNumber, labelData, filePath }
   */
  async createShippingLabel(shipment) {
    const serviceCode = this.getServiceCode(shipment.service_type || 'Ground');
    
    const requestData = {
      ShipmentRequest: {
        Request: {
          SubVersion: '1801',
          RequestOption: 'nonvalidate'
        },
        Shipment: {
          Description: `Order ${shipment.order_number || 'N/A'}`,
          Shipper: {
            Name: this.storeAddress.name,
            AttentionName: this.storeAddress.attentionName,
            ShipperNumber: this.accountNumber,
            Address: {
              AddressLine: [this.storeAddress.addressLine1],
              City: this.storeAddress.city,
              StateProvinceCode: this.storeAddress.state,
              PostalCode: this.storeAddress.zip,
              CountryCode: this.storeAddress.country
            },
            Phone: {
              Number: this.storeAddress.phone
            }
          },
          ShipTo: {
            Name: shipment.customer_name,
            AttentionName: shipment.customer_name,
            Address: {
              AddressLine: [shipment.address_line1, shipment.address_line2].filter(Boolean),
              City: shipment.address_city,
              StateProvinceCode: shipment.address_state,
              PostalCode: shipment.address_zip,
              CountryCode: shipment.address_country || 'US'
            },
            Phone: {
              Number: shipment.customer_phone || this.storeAddress.phone
            }
          },
          PaymentInformation: {
            ShipmentCharge: {
              Type: '01', // Transportation charges
              BillShipper: {
                AccountNumber: this.accountNumber
              }
            }
          },
          Service: {
            Code: serviceCode,
            Description: shipment.service_type || 'UPS Ground'
          },
          Package: {
            Description: 'Suit Supply Order',
            Packaging: {
              Code: '02', // Customer Supplied Package
              Description: 'Package'
            },
            Dimensions: {
              UnitOfMeasurement: {
                Code: 'IN'
              },
              Length: String(shipment.package_length_in || 16),
              Width: String(shipment.package_width_in || 12),
              Height: String(shipment.package_height_in || 8)
            },
            PackageWeight: {
              UnitOfMeasurement: {
                Code: 'LBS'
              },
              Weight: String(shipment.package_weight_lbs || 5)
            }
          }
        },
        LabelSpecification: {
          LabelImageFormat: {
            Code: 'ZPL', // Zebra Programming Language
            Description: 'ZPL'
          },
          HTTPUserAgent: 'Mozilla/4.5',
          LabelStockSize: {
            Height: '6',
            Width: '4'
          }
        }
      }
    };
    
    try {
      const response = await this.makeRequest('POST', '/ship/v1801/shipments', requestData);
      
      const shipmentResults = response.ShipmentResponse.ShipmentResults;
      const trackingNumber = shipmentResults.PackageResults.TrackingNumber;
      const labelData = shipmentResults.PackageResults.ShippingLabel.GraphicImage; // Base64 ZPL
      
      // Save label to file
      const labelFileName = `${trackingNumber}_${Date.now()}.zpl`;
      const labelDir = path.join(__dirname, '..', 'labels');
      const labelPath = path.join(labelDir, labelFileName);
      
      // Create labels directory if it doesn't exist
      try {
        await fs.mkdir(labelDir, { recursive: true });
      } catch (err) {
        // Directory might already exist
      }
      
      // Decode base64 and save ZPL file
      const zplContent = Buffer.from(labelData, 'base64').toString('utf-8');
      await fs.writeFile(labelPath, zplContent);
      
      console.log(`[UPS] Label created: ${trackingNumber}`);
      
      return {
        trackingNumber,
        labelData: zplContent,
        labelPath: `/labels/${labelFileName}`,
        serviceType: shipment.service_type || 'UPS Ground',
        rawResponse: shipmentResults
      };
    } catch (error) {
      console.error('[UPS] Label creation failed:', error.response?.data || error.message);
      throw new Error(`Failed to create shipping label: ${error.message}`);
    }
  }
  
  /**
   * Get UPS service code from service type name
   * @param {string} serviceType - Service type name
   * @returns {string} UPS service code
   */
  getServiceCode(serviceType) {
    const serviceCodes = {
      'Ground': '03',
      'UPS Ground': '03',
      '3 Day Select': '12',
      '2nd Day Air': '02',
      'Next Day Air': '01',
      'Next Day Air Saver': '13',
      'Next Day Air Early': '14'
    };
    
    return serviceCodes[serviceType] || '03'; // Default to Ground
  }
  
  // ============================================================================
  // HELPERS
  // ============================================================================
  
  /**
   * Map UPS status codes to standardized internal statuses
   * @param {string} upsStatusCode - The status code from the UPS API activity
   * @param {string} upsStatusType - The status type from the UPS API activity
   * @returns {string} Standardized status (e.g., 'In-Transit', 'Delivered')
   */
  mapUPSToInternalStatus(upsStatusCode, upsStatusType) {
    // Delivered statuses
    if (upsStatusCode === '001' || upsStatusType === 'D') return 'Delivered';
    // In-Transit statuses
    if (upsStatusType === 'I') return 'In-Transit';
    // Pickup/Origin statuses often mean it's in transit
    if (['OR', 'DP', 'AR'].includes(upsStatusCode)) return 'In-Transit';
    // Pre-shipment/Label created
    if (upsStatusCode === '003' || upsStatusType === 'M') return 'Label-Created';
    // Exception/Returned
    if (upsStatusType === 'X') return 'Exception';
    if (upsStatusCode === '007') return 'Returned';
    
    return 'Unknown';
  }

  // ============================================================================
  // TRACKING
  // ============================================================================

  /**
   * Subscribe to tracking alerts (webhooks) for a list of tracking numbers.
   * @param {string[]} trackingNumbers - An array of up to 100 tracking numbers.
   * @returns {Promise<object>} The subscription response from UPS.
   */
  async subscribeToTrackingAlerts(trackingNumbers) {
    if (!process.env.UPS_WEBHOOK_URL) {
      console.warn('[UPS] Webhook URL not configured. Skipping subscription.');
      return { success: false, error: 'Webhook URL not configured.' };
    }

    const requestData = {
      locale: 'en_US',
      trackingNumberList: trackingNumbers,
      destination: {
        url: process.env.UPS_WEBHOOK_URL,
        credentialType: 'Bearer',
        credential: process.env.UPS_WEBHOOK_SECRET || '',
      },
    };

    try {
      console.log(`[UPS] Subscribing to alerts for ${trackingNumbers.length} tracking numbers...`);
      // NOTE: The endpoint for subscription might be different.
      // Based on docs, it might be something like '/track/v1/subscription/standard/package'
      // This will need to be verified with the official UPS Track Alert API documentation.
      const response = await this.makeRequest('POST', '/track/v1/subscription/standard/package', requestData);
      console.log('[UPS] Subscription successful:', response);
      return { success: true, response };
    } catch (error) {
      console.error('[UPS] Subscription failed:', error.response?.data || error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get detailed tracking information with full history
   * @param {string} trackingNumber - UPS tracking number
   * @returns {Promise<object>} Detailed tracking information with event history
   */
  async getTrackingDetails(trackingNumber) {
    console.log(`[UPS] Fetching REAL tracking details for: ${trackingNumber}`);
    try {
      const response = await this.makeRequest('GET', `/track/v1/details/${trackingNumber}`);
      const trackResponse = response.trackResponse;

      const shipment = trackResponse.shipment?.[0];

      if (!shipment || !shipment.package || shipment.package.length === 0 || !shipment.package[0].activity) {
        throw new Error('No tracking information available from UPS.');
      }

      const activities = shipment.package[0].activity;
      const latestActivity = activities[0];

      const events = activities.map(act => {
        const address = act.location?.address || {};
        
        // Correctly parse YYYYMMDD and HHMMSS into a valid ISO string
        let event_timestamp = new Date().toISOString();
        if (act.date && act.time) {
          const year = act.date.substring(0, 4);
          const month = act.date.substring(4, 6);
          const day = act.date.substring(6, 8);
          const hours = act.time.substring(0, 2);
          const minutes = act.time.substring(2, 4);
          const seconds = act.time.substring(4, 6);
          event_timestamp = new Date(`${year}-${month}-${day}T${hours}:${minutes}:${seconds}Z`).toISOString();
        }

        return {
          event_timestamp,
          status: this.mapUPSToInternalStatus(act.status?.code, act.status?.type), // Standardized status
          details: act.status?.description || 'No details available', // Full description
          location: {
            city: address.city || '',
            state: address.stateProvince || '',
            zip: address.postalCode || '',
            country: address.countryCode || '',
          },
        };
      });

      let estimatedDelivery = null;
      if (shipment.package[0].deliveryDate && shipment.package[0].deliveryDate.length > 0 && shipment.package[0].deliveryDate[0].date) {
        const delDate = shipment.package[0].deliveryDate[0].date;
        const y = delDate.substring(0, 4);
        const m = delDate.substring(4, 6);
        const d = delDate.substring(6, 8);
        estimatedDelivery = new Date(`${y}-${m}-${d}T12:00:00Z`).toISOString();
      }

      return {
        trackingNumber: trackingNumber,
        latestStatus: this.mapUPSToInternalStatus(latestActivity.status?.code, latestActivity.status?.type),
        latestStatusTimestamp: events[0].event_timestamp,
        estimatedDelivery: estimatedDelivery,
        events: events,
        rawResponse: trackResponse
      };

    } catch (error) {
      console.error(`[UPS] Real tracking failed for ${trackingNumber}:`, error.response?.data || error.message);
      throw new Error(`Failed to get tracking details from UPS: ${error.message}`);
    }
  }
  
  /**
   * Get tracking information
   * @param {string} trackingNumber - UPS tracking number
   * @returns {Promise<object>} Tracking details
   */
  async getTracking(trackingNumber) {
    try {
      const response = await this.makeRequest('GET', `/track/v1/details/${trackingNumber}`);
      
      const trackResponse = response.trackResponse;
      const shipment = trackResponse.shipment?.[0];
      
      if (!shipment) {
        return {
          trackingNumber,
          status: 'Unknown',
          statusDescription: 'No tracking information available',
          rawResponse: trackResponse
        };
      }
      
      const activity = shipment.package?.[0]?.activity?.[0];
      const status = activity?.status;
      
      return {
        trackingNumber,
        status: status?.type || 'Unknown',
        statusDescription: status?.description || 'Unknown',
        statusCode: status?.code || '',
        location: activity?.location?.address || null,
        timestamp: activity?.date ? new Date(`${activity.date}T${activity.time}`) : null,
        deliveryDate: shipment.deliveryDate,
        rawResponse: trackResponse
      };
    } catch (error) {
      console.error('[UPS] Tracking failed:', error.message);
      return {
        trackingNumber,
        status: 'Error',
        error: error.message
      };
    }
  }
  
  // ============================================================================
  // RATE SHOPPING
  // ============================================================================
  
  /**
   * Get shipping rates for address
   * @param {object} address - Destination address
   * @param {object} package - Package details
   * @returns {Promise<Array>} Array of rate options
   */
  async getRates(address, packageDetails = {}) {
    const requestData = {
      RateRequest: {
        Request: {
          SubVersion: '1703'
        },
        Shipment: {
          Shipper: {
            Address: {
              City: this.storeAddress.city,
              StateProvinceCode: this.storeAddress.state,
              PostalCode: this.storeAddress.zip,
              CountryCode: this.storeAddress.country
            }
          },
          ShipTo: {
            Address: {
              City: address.city,
              StateProvinceCode: address.state,
              PostalCode: address.zip,
              CountryCode: address.country || 'US'
            }
          },
          Package: {
            PackagingType: {
              Code: '02'
            },
            Dimensions: {
              UnitOfMeasurement: {
                Code: 'IN'
              },
              Length: String(packageDetails.length || 16),
              Width: String(packageDetails.width || 12),
              Height: String(packageDetails.height || 8)
            },
            PackageWeight: {
              UnitOfMeasurement: {
                Code: 'LBS'
              },
              Weight: String(packageDetails.weight || 5)
            }
          }
        }
      }
    };
    
    try {
      const response = await this.makeRequest('POST', '/rating/v1703/Rate', requestData);
      
      const ratedShipments = response.RateResponse.RatedShipment;
      
      if (!Array.isArray(ratedShipments)) {
        return [];
      }
      
      return ratedShipments.map(shipment => ({
        service: shipment.Service.Code,
        serviceName: this.getServiceName(shipment.Service.Code),
        totalCharges: parseFloat(shipment.TotalCharges.MonetaryValue),
        currency: shipment.TotalCharges.CurrencyCode,
        deliveryDate: shipment.GuaranteedDelivery?.BusinessDaysInTransit
      }));
    } catch (error) {
      console.error('[UPS] Rate shopping failed:', error.message);
      return [];
    }
  }
  
  getServiceName(serviceCode) {
    const serviceNames = {
      '01': 'Next Day Air',
      '02': '2nd Day Air',
      '03': 'Ground',
      '12': '3 Day Select',
      '13': 'Next Day Air Saver',
      '14': 'Next Day Air Early'
    };
    
    return serviceNames[serviceCode] || `Service ${serviceCode}`;
  }
  
  // ============================================================================
  // ZPL LABEL PRINTING
  // ============================================================================
  
  /**
   * Send ZPL label to Zebra printer
   * @param {string} zplContent - ZPL label content
   * @param {string} printerIp - Zebra printer IP address
   * @param {number} printerPort - Zebra printer port (default: 9100)
   * @returns {Promise<boolean>} Success status
   */
  async printLabel(zplContent, printerIp, printerPort = 9100) {
    const net = require('net');
    
    return new Promise((resolve, reject) => {
      const client = new net.Socket();
      
      client.connect(printerPort, printerIp, () => {
        console.log(`[UPS] Connected to Zebra printer at ${printerIp}:${printerPort}`);
        client.write(zplContent);
        client.end();
      });
      
      client.on('close', () => {
        console.log('[UPS] Label sent to printer');
        resolve(true);
      });
      
      client.on('error', (err) => {
        console.error('[UPS] Printer error:', err.message);
        reject(err);
      });
    });
  }
}

module.exports = new UPSClient();
