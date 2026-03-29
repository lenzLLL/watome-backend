import fetch from 'node-fetch';

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8080';

// Test webhook accessibility
async function testWebhookAccess() {
  try {
    console.log('Testing webhook accessibility...');
    const response = await fetch(`${BACKEND_URL}/api/webhooks/test`);
    const data = await response.json();
    console.log('Webhook test response:', data);
  } catch (error) {
    console.error('Webhook test failed:', error.message);
  }
}

// Simulate PayUnit webhook call
async function simulateWebhook(transactionId, status = 'success') {
  try {
    console.log(`Simulating webhook for transaction: ${transactionId}`);

    const webhookPayload = {
      transaction_id: transactionId,
      status: status,
      paymentStatus: status,
      amount: 5000,
      currency: 'XAF',
      description: 'Test payment',
      timestamp: new Date().toISOString()
    };

    const response = await fetch(`${BACKEND_URL}/api/webhooks/payunit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(webhookPayload)
    });

    const data = await response.json();
    console.log('Webhook simulation response:', data);
  } catch (error) {
    console.error('Webhook simulation failed:', error.message);
  }
}

// Run tests
async function runTests() {
  await testWebhookAccess();

  // Test with a sample transaction ID (replace with real one from your database)
  const sampleTransactionId = 'TXN_1234567890_1234';
  await simulateWebhook(sampleTransactionId, 'success');
}

runTests().catch(console.error);