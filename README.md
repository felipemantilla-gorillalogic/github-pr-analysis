# GitHub PR Analysis

This project analyzes pull requests (PRs) from a specified GitHub repository, comparing PRs reviewed by a specific user (Mo) against those not reviewed by that user. It integrates with Slack to correlate PR creation times with Slack messages.

## Features

- Fetches PR data from GitHub using GraphQL API
- Filters PRs based on date range and review criteria
- Integrates with Slack to correlate PRs with Slack messages
- Compares PRs reviewed by a specific user (Mo) against others
- Calculates and displays average waiting times, most delayed PRs, and quickest PRs

## Prerequisites

- Node.js (version 14 or higher recommended)
- npm (comes with Node.js)
- GitHub Personal Access Token with repo scope
- Slack Bot Token with necessary permissions

## Installation

1. Clone the repository:
   ```
   git clone [repository-url]
   cd github-pr-analysis
   ```

2. Install dependencies:
   ```
   npm install
   ```

3. Create a `.env` file in the project root with the following content:
   ```
   GITHUB_TOKEN=your_github_token
   SLACK_BOT_TOKEN=your_slack_bot_token
   ```

   Replace `your_github_token` and `your_slack_bot_token` with your actual tokens.

## Configuration

Edit the following variables in the script as needed:

- `REPO_URLS`: Add or modify the GitHub repository URLs you want to analyze
- `PR_COUNT`: Set the number of PRs to fetch (default is 1000)
- `START_DATE` and `END_DATE`: Set the date range for PR analysis

## Usage

### Update Slack History

To update the Slack message history:

```
npm run slack:update-history
```

This will create or update a `slack_messages.json` file with recent Slack messages.

### Run PR Analysis

To perform the PR analysis:

```
npm run github:pr-analysis
```

This will fetch PR data from GitHub, correlate it with Slack messages, and display the analysis results.

## Output

The script will output:

1. PR statistics for PRs reviewed by Mo
2. PR statistics for PRs not reviewed by Mo
3. A comparison summary of the two categories

For each category, you'll see:
- Total number of PRs
- Average waiting time
- Details of the most delayed PR
- Details of the quickest PR

## Troubleshooting

- If you encounter authentication errors, ensure your GitHub token and Slack bot token are correct and have the necessary permissions.
- If PRs are not being fetched or filtered as expected, check the `START_DATE` and `END_DATE` in the script.
- For any other issues, check the console output for error messages and ensure all dependencies are correctly installed.

## License

This project is licensed under the ISC License.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.