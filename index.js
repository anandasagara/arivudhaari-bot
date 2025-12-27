const express = require('express');
const axios = require('axios');
require('dotenv').config();

const app = express();
app.use(express.json());

// Configuration
const PORT = process.env.PORT || 3000;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN || 'arivudhaari_verify_token';
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;

// ---------------------------------------------------------
// DATA STORAGE (In-Memory)
// ---------------------------------------------------------
const students = {}; // Stores student progress
const processedMessages = new Set(); // Stores message IDs to prevent duplicates

// Helper function to create a pause (replaces fragile setTimeout)
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ---------------------------------------------------------
// SCENARIOS CONFIGURATION
// ---------------------------------------------------------
const scenarios = [
  {
    id: 'SC1',
    component: 'Social Confidence',
    mode: 'voice',
    prompt_kn: 'ನಿಮ್ಮ ಊರು ಅಥವಾ ಹಳ್ಳಿಯ ಬಗ್ಗೆ ಹೇಳಿ. ಅದರಲ್ಲಿ ವಿಶೇಷವಾದದ್ದು ಏನು?',
    prompt_en: 'Tell me about your hometown or village. What makes it special? (Reply with a voice note)'
  },
  {
    id: 'SC2',
    component: 'Social Confidence', 
    mode: 'voice',
    prompt_kn: 'ನೀವು ಯಾರನ್ನು ಅಭಿಮಾನಿಸುತ್ತೀರಿ - ಕುಟುಂಬ, ಶಿಕ್ಷಕರು, ಯಾರಾದರೂ? ಏಕೆ?',
    prompt_en: 'Who is someone you admire - family, teacher, anyone? Why? (Reply with a voice note)'
  },
  {
    id: 'SC3',
    component: 'Social Confidence',
    mode: 'text',
    prompt_kn: 'ನಿಮ್ಮ ಆತ್ಮೀಯ ಸ್ನೇಹಿತರಿಗೆ ಒಳ್ಳೆಯದಾದ ಸಂಗತಿಯ ಬಗ್ಗೆ ಸಣ್ಣ ಸಂದೇಶ ಬರೆಯಿರಿ.',
    prompt_en: 'Write a short message to your best friend about something good that happened. (Reply with text)'
  },
  {
    id: 'PC1',
    component: 'Professional Clarity',
    mode: 'voice',
    prompt_kn: 'ಎಂಜಿನಿಯರಿಂಗ್ ಎಂದರೇನು ಎಂದು ನಿಮ್ಮ ಅಜ್ಜಿಗೆ ವಿವರಿಸಿ.',
    prompt_en: 'Explain what engineering means to your grandmother who never went to school. (Reply with a voice note)'
  },
  {
    id: 'PC2',
    component: 'Professional Clarity',
    mode: 'voice',
    prompt_kn: 'ನಿಮ್ಮ ಸ್ನೇಹಿತ ಪರೀಕ್ಷೆಯಲ್ಲಿ ಅನುತ್ತೀರ್ಣರಾಗಿ ಬೇಸರಗೊಂಡಿದ್ದಾರೆ. ಅವರಿಗೆ ಏನು ಹೇಳುತ್ತೀರಿ?',
    prompt_en: 'Your friend failed an exam and is upset. What would you say to help them? (Reply with a voice note)'
  },
  {
    id: 'PC3',
    component: 'Professional Clarity',
    mode: 'text',
    prompt_kn: 'ನಿಮ್ಮ ಕಾಲೇಜಿನಿಂದ ಹತ್ತಿರದ ಬಸ್ ನಿಲ್ದಾಣಕ್ಕೆ ದಾರಿ ತಿಳಿಸಿ.',
    prompt_en: 'Give directions from your college to the nearest bus stand. Be clear. (Reply with text)'
  },
  {
    id: 'EC1',
    component: 'English Communication',
    mode: 'voice',
    prompt_kn: '',
    prompt_en: 'Introduce yourself in English. Just try - there is no wrong answer. (Reply with a voice note in English)'
  },
  {
    id: 'EC2',
    component: 'English Communication',
    mode: 'text',
    prompt_kn: '',
    prompt_en: 'Describe your college in 3-4 English sentences. (Reply in English)'
  },
  {
    id: 'EC3',
    component: 'English Communication',
    mode: 'voice',
    prompt_kn: '',
    prompt_en: 'Now try explaining your hometown in English. (Reply with a voice note in English)'
  }
];

// ---------------------------------------------------------
// WEBHOOK ROUTES
// ---------------------------------------------------------

// Verification Request (GET)
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

// Incoming Messages (POST)
app.post('/webhook', async (req, res) => {
  try {
    const body = req.body;

    if (body.object === 'whatsapp_business_account') {
      const entry = body.entry[0];
      const changes = entry.changes[0];
      const value = changes.value;

      // 1. Ignore Status Updates (Sent/Read/Delivered)
      if (value.statuses) {
        return res.sendStatus(200);
      }

      if (value.messages) {
        const message = value.messages[0];
        const from = message.from;
        const messageType = message.type;
        const messageId = message.id;

        // 2. Deduplication: Ignore if we just processed this ID
        if (processedMessages.has(messageId)) {
            console.log(`Duplicate message ignored: ${messageId}`);
            return res.sendStatus(200);
        }
        processedMessages.add(messageId);
        // Clean up ID after 5 minutes
        setTimeout(() => processedMessages.delete(messageId), 5 * 60 * 1000);

        console.log('Message from:', from, 'Type:', messageType);

        // Initialize student if not exists
        if (!students[from]) {
          students[from] = {
            step: 'welcome',
            name: '',
            college: '',
            year: '',
            currentScenario: 0,
            responses: [],
            startTime: new Date()
          };
        }

        const student = students[from];

        // Extract text content safely
        let messageContent = '';
        if (messageType === 'text') {
          messageContent = message.text.body.toLowerCase().trim();
        }

        // Process the flow
        await handleStudentFlow(from, student, messageType, messageContent, message);
      }
    }

    res.sendStatus(200);
  } catch (error) {
    console.error('Error in webhook:', error);
    res.sendStatus(500);
  }
});

// ---------------------------------------------------------
// CORE LOGIC FLOW
// ---------------------------------------------------------


