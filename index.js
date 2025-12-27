const express = require('express');
const axios = require('axios');
require('dotenv').config();

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN || 'arivudhaari_verify_token';
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;

// Webhook verification (Meta requires this)
app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('Webhook verified');
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

// Receive messages
app.post('/webhook', async (req, res) => {
  try {
    const body = req.body;

    if (body.object === 'whatsapp_business_account') {
      const entry = body.entry[0];
      const changes = entry.changes[0];
      const value = changes.value;

      if (value.messages) {
        const message = value.messages[0];
        const from = message.from;
        const messageType = message.type;

        console.log('Message received from:', from);
        console.log('Message type:', messageType);

        // Handle text message
        if (messageType === 'text') {
          const text = message.text.body;
          console.log('Text:', text);
          
          // Send a reply
          await sendMessage(from, 'ನಮಸ್ಕಾರ! ArivuDhaari ಗೆ ಸ್ವಾಗತ. (Hello! Welcome to ArivuDhaari.)');
        }

        // Handle voice message
        if (messageType === 'audio') {
          const audioId = message.audio.id;
          console.log('Voice note received. Audio ID:', audioId);
          
          await sendMessage(from, 'ನಿಮ್ಮ ಧ್ವನಿ ಸಂದೇಶ ಸ್ವೀಕರಿಸಲಾಗಿದೆ. (Your voice message received.)');
        }
      }
    }

    res.sendStatus(200);
  } catch (error) {
    console.error('Error:', error);
    res.sendStatus(500);
  }
});

// Send message function
async function sendMessage(to, text) {
  try {
    await axios.post(
      `https://graph.facebook.com/v22.0/${PHONE_NUMBER_ID}/messages`,
      {
        messaging_product: 'whatsapp',
        to: to,
        type: 'text',
        text: { body: text }
      },
      {
        headers: {
          'Authorization': `Bearer ${WHATSAPP_TOKEN}`,
          'Content-Type': 'application/json'
        }
      }
    );
    console.log('Message sent to:', to);
  } catch (error) {
    console.error('Error sending message:', error.response?.data || error.message);
  }
}

// Health check
app.get('/', (req, res) => {
  res.send('ArivuDhaari is running');
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

