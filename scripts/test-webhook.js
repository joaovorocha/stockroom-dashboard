require('dotenv').config();
const axios = require('axios');

async function testWebhook() {
  const webhookUrl = `http://localhost:${process.env.PORT || 3000}/api/webhooks/ups`;
  const webhookSecret = process.env.UPS_WEBHOOK_SECRET || 'a-very-secure-random-string';

  // This tracking number must exist in your database for the test to work.
  const testTrackingNumber = '1ZY8V7180326332236';

  const mockUpsPayload = {
    trackingNumber: testTrackingNumber,
    activityStatus: {
      code: 'DP',
      type: 'I',
      description: 'Departed from Facility'
    },
    localActivityDate: '20260115',
    localActivityTime: '032500',
    activityLocation: {
      city: 'San Pablo',
      stateProvince: 'CA',
      country: 'US'
    }
  };

  console.log(`Sending test webhook to: ${webhookUrl}`);
  console.log('Payload:', JSON.stringify(mockUpsPayload, null, 2));

  try {
    const response = await axios.post(webhookUrl, mockUpsPayload, {
      headers: {
        'Authorization': `Bearer ${webhookSecret}`,
        'Content-Type': 'application/json'
      }
    });

    if (response.status === 200) {
      console.log('✅ Test successful: Webhook sent and server responded with 200 OK.');
      console.log('Check your browser. The status for the shipment should have updated in real-time.');
    } else {
      console.error(`❌ Test failed: Server responded with status ${response.status}`);
      console.error('Response data:', response.data);
    }
  } catch (error) {
    console.error('❌ Test failed with an error:');
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', error.response.data);
    } else {
      console.error('Error Message:', error.message);
    }
  }
}

testWebhook();
