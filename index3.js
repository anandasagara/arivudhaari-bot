const express = require('express');
const axios = require('axios');
require('dotenv').config();

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN || 'arivudhaari_verify_token';
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;

// Store student states (in production, use a database)
const students = {};

// Scenarios - Foundation Level
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

// Webhook verification
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

        console.log('Message from:', from, 'Type:', messageType);

        // Initialize student if new
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

        // Get message content
        let messageContent = '';
        if (messageType === 'text') {
          messageContent = message.text.body.toLowerCase().trim();
        }

        // Handle flow based on current step
        await handleStudentFlow(from, student, messageType, messageContent, message);
      }
    }

    res.sendStatus(200);
  } catch (error) {
    console.error('Error:', error);
    res.sendStatus(500);
  }
});

// Main flow handler
async function handleStudentFlow(from, student, messageType, messageContent, message) {
  
  switch (student.step) {
    
    case 'welcome':
      await sendMessage(from, 
        `🙏 ನಮಸ್ಕಾರ! ArivuDhaari ಗೆ ಸ್ವಾಗತ.\n\nWelcome to ArivuDhaari - Employability Assessment.\n\nನಿಮ್ಮ ಹೆಸರು ಹೇಳಿ / Please tell me your name:`
      );
      student.step = 'get_name';
      break;

    case 'get_name':
      if (messageType === 'text' && messageContent.length > 1) {
        student.name = message.text.body;
        await sendMessage(from,
          `ಧನ್ಯವಾದ ${student.name}! 🙏\n\nನಿಮ್ಮ ಕಾಲೇಜು ಹೆಸರು ಹೇಳಿ / Please tell me your college name:`
        );
        student.step = 'get_college';
      } else {
        await sendMessage(from, 'ದಯವಿಟ್ಟು ನಿಮ್ಮ ಹೆಸರು ಟೈಪ್ ಮಾಡಿ / Please type your name:');
      }
      break;

    case 'get_college':
      if (messageType === 'text' && messageContent.length > 1) {
        student.college = message.text.body;
        await sendMessage(from,
          `${student.college} - ಒಳ್ಳೆಯದು!\n\nನೀವು ಯಾವ ವರ್ಷದ ವಿದ್ಯಾರ್ಥಿ? / Which year are you in?\n\n1 - First Year\n2 - Second Year\n3 - Third Year\n4 - Fourth Year\n\nReply with number (1, 2, 3, or 4):`
        );
        student.step = 'get_year';
      } else {
        await sendMessage(from, 'ದಯವಿಟ್ಟು ಕಾಲೇಜು ಹೆಸರು ಟೈಪ್ ಮಾಡಿ / Please type your college name:');
      }
      break;

    case 'get_year':
      if (messageType === 'text' && ['1', '2', '3', '4'].includes(messageContent)) {
        student.year = messageContent;
        await sendMessage(from,
          `✅ ನೋಂದಣಿ ಪೂರ್ಣ! / Registration complete!\n\n` +
          `👤 ${student.name}\n🏫 ${student.college}\n📚 Year ${student.year}\n\n` +
          `ಈಗ Assessment ಪ್ರಾರಂಭಿಸೋಣ.\n\n` +
          `⚠️ ಮೊದಲು: ನೀವು ಶಾಂತವಾದ, ಖಾಸಗಿ ಸ್ಥಳದಲ್ಲಿ ಇದ್ದೀರಾ?\n` +
          `First: Are you in a quiet, private place?\n\n` +
          `Reply: YES or NO`
        );
        student.step = 'privacy_check';
      } else {
        await sendMessage(from, 'ದಯವಿಟ್ಟು 1, 2, 3, ಅಥವಾ 4 ಟೈಪ್ ಮಾಡಿ / Please type 1, 2, 3, or 4:');
      }
      break;

    case 'privacy_check':
      if (messageType === 'text') {
        if (messageContent === 'yes' || messageContent === 'no') {
          await sendMessage(from,
            `🎯 ಅಸೆಸ್‌ಮೆಂಟ್ ಪ್ರಾರಂಭ! / Assessment Starting!\n\n` +
            `📝 9 ಪ್ರಶ್ನೆಗಳು ಇವೆ / There are 9 scenarios\n` +
            `⏱️ ಸಮಯದ ಮಿತಿ ಇಲ್ಲ / No time limit\n` +
            `💪 ತಪ್ಪು ಉತ್ತರ ಇಲ್ಲ / No wrong answers\n\n` +
            `Ready? ಮುಂದುವರಿಸಲು "START" ಎಂದು ಟೈಪ್ ಮಾಡಿ`
          );
          student.step = 'ready_to_start';
        } else {
          await sendMessage(from, 'Please reply YES or NO:');
        }
      }
      break;

    case 'ready_to_start':
      if (messageType === 'text' && messageContent === 'start') {
        await sendScenario(from, student);
      } else {
        await sendMessage(from, 'ಮುಂದುವರಿಸಲು "START" ಎಂದು ಟೈಪ್ ಮಾಡಿ / Type "START" to continue:');
      }
      break;

    case 'waiting_response':
      // Save the response
      const currentScenario = scenarios[student.currentScenario];
      
      const response = {
        scenarioId: currentScenario.id,
        type: messageType,
        timestamp: new Date()
      };

      if (messageType === 'text') {
        response.text = message.text.body;
      } else if (messageType === 'audio') {
        response.audioId = message.audio.id;
        response.audioDuration = message.audio.duration || 'unknown';
      }

      student.responses.push(response);
      console.log('Response saved:', response);

      // Move to next scenario
      student.currentScenario++;

      if (student.currentScenario < scenarios.length) {
        // Send encouragement + next scenario
        await sendMessage(from, `✅ ಉತ್ತರ ಸ್ವೀಕರಿಸಲಾಗಿದೆ! / Response received!\n\n(${student.currentScenario}/${scenarios.length} completed)`);
        
        // Small delay then send next
        
        await sendScenario(from, student);
        
      } else {
        // Assessment complete
        await sendMessage(from,
          `🎉 ಅಭಿನಂದನೆಗಳು ${student.name}!\n\n` +
          `Assessment ಪೂರ್ಣವಾಗಿದೆ! / Assessment Complete!\n\n` +
          `📊 ನಿಮ್ಮ ವರದಿ ಶೀಘ್ರದಲ್ಲೇ ಸಿದ್ಧವಾಗುತ್ತದೆ.\n` +
          `Your report will be ready soon.\n\n` +
          `🙏 ಧನ್ಯವಾದಗಳು! Thank you for participating in ArivuDhaari!`
        );
        student.step = 'completed';
        console.log('Assessment completed for:', student.name);
        console.log('All responses:', student.responses);
      }
      break;

    case 'completed':
      await sendMessage(from, 
        `ನೀವು ಈಗಾಗಲೇ Assessment ಪೂರ್ಣಗೊಳಿಸಿದ್ದೀರಿ.\n` +
        `You have already completed the assessment.\n\n` +
        `ಪ್ರಶ್ನೆಗಳಿದ್ದರೆ ಸಂಪರ್ಕಿಸಿ / For questions, contact your faculty.`
      );
      break;

    default:
      student.step = 'welcome';
      await handleStudentFlow(from, student, messageType, messageContent, message);
  }
}

// Send scenario
async function sendScenario(from, student) {
  const scenario = scenarios[student.currentScenario];
  const num = student.currentScenario + 1;
  
  let modeInstruction = '';
  if (scenario.mode === 'voice') {
    modeInstruction = '🎤 ದಯವಿಟ್ಟು VOICE NOTE ಕಳುಹಿಸಿ / Please send a VOICE NOTE';
  } else {
    modeInstruction = '⌨️ ದಯವಿಟ್ಟು TEXT ನಲ್ಲಿ ಉತ್ತರಿಸಿ / Please reply in TEXT';
  }

  const prompt = scenario.prompt_kn 
    ? `${scenario.prompt_kn}\n\n${scenario.prompt_en}`
    : scenario.prompt_en;

  await sendMessage(from,
    `━━━━━━━━━━━━━━━\n` +
    `📌 ಪ್ರಶ್ನೆ ${num}/9 - ${scenario.component}\n` +
    `━━━━━━━━━━━━━━━\n\n` +
    `${prompt}\n\n` +
    `${modeInstruction}`
  );

  student.step = 'waiting_response';
}

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
  res.send('ArivuDhaari Assessment Bot is running');
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
