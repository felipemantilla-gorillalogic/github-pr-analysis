import axios from 'axios';

const TOKEN = process.env.SLACK_BOT_TOKEN;

async function getAllUserIds() {
  try {
    const response = await axios.get('https://slack.com/api/users.list', {
      headers: {
        'Authorization': `Bearer ${TOKEN}`
      }
    });

    if (response.data.ok) {
      const users = response.data.members;
      console.log('user object', Object.keys(users[0]));

      users.forEach(user => {
        console.log(`User ID: ${user.id}, Name: ${user.name}, Real Name: ${user.real_name} Email: ${user.profile.email}`);
      });
      return users;
    } else {
      console.error(`Error: ${response.data.error}`);
      return null;
    }
  } catch (error) {
    console.error(`HTTP Error: ${error.message}`);
    return null;
  }
}

// Example usage
getAllUserIds();