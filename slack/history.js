import axios from 'axios';
import fs from 'fs/promises';

const token = process.env.SLACK_BOT_TOKEN; // Token del bot
const channelId = process.env.SLACK_CHANNEL_ID; // ID del canal

const headers = {
  'Authorization': `Bearer ${token}`
};

async function getAllMessages() {
  let allMessages = [];
  let cursor = null;

  do {
    try {
      const url = `https://slack.com/api/conversations.history?channel=${channelId}&limit=1000${cursor ? `&cursor=${cursor}` : ''}`;
      const response = await axios.get(url, { headers });
      
      if (!response.data.ok) {
        throw new Error(`Slack API error: ${response.data.error}`);
      }

      allMessages = allMessages.concat(response.data.messages || []);
      cursor = response.data.response_metadata?.next_cursor;

    } catch (error) {
      console.error('Error fetching messages:', error);
      break;
    }
  } while (cursor);

  return allMessages;
}

getAllMessages().then(messages => {
  const processedMessages = messages.map(message => {
    const link = message.text.match(/<(https?:\/\/[^>]+)>/)?.[1] || 'No link found';
    const service = message.text.split('<')[0].trim() || 'No service info found';
    const fullDate = new Date(parseFloat(message.ts) * 1000).toLocaleString();

    return {
      text: message.text,
      link: link,
      service: service,
      fullDate: fullDate,
      timestamp: message.ts
    };
  });

  return fs.writeFile('slack_messages.json', JSON.stringify(processedMessages, null, 2));
}).then(() => {
  console.log('Messages have been saved to slack_messages.json');
}).catch(error => {
  console.error('Error processing messages:', error);
});