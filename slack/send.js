

import axios from 'axios';

const TOKEN = process.env.SLACK_BOT_TOKEN;

async function sendDirectMessage(userId, message) {
  try {
    const response = await axios.post('https://slack.com/api/chat.postMessage', {
      channel: userId,
      text: message
    }, {
      headers: {
        'Authorization': `Bearer ${TOKEN}`,
        'Content-Type': 'application/json'
      }
    });

    if (response.data.ok) {
      console.log('Message sent successfully');
    } else {
      console.error(`Error: ${response.data.error}`);
    }
  } catch (error) {
    console.error(`HTTP Error: ${error.message}`);
  }
}

// Example usage
const userId = 'U057D536TJN';  // Replace with the actual user ID
const message = 'Hello! This is a direct message.';

sendDirectMessage(userId, message);