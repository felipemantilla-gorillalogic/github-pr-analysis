
# GitHub PR Analysis Script

This script fetches and analyzes pull requests (PRs) from specified GitHub repositories within a defined date range, and calculates waiting times between PR creation, Slack messages, and reviews. It is particularly useful for understanding the review process efficiency in a GitHub repository.

## Features

- Fetches PRs from multiple repositories using the GitHub GraphQL API.
- Filters PRs based on specific criteria (date range, reviews, Slack messages).
- Calculates the waiting time between PR creation, Slack messages, and the second review.
- Outputs detailed information about the most delayed and quickest PRs.

## Requirements

- Node.js (v14 or higher)
- A GitHub token with appropriate permissions to access the repositories.

## Installation

1. Clone the repository:
    ```bash
    git clone https://github.com/felipemantilla0-gorillalogic/github-pr-analysis.git
    cd github-pr-analysis
    ```

2. Install dependencies:
    ```bash
    npm install
    ```

3. Set your GitHub token as an environment variable:
    ```bash
    export GITHUB_TOKEN=your_github_token
    ```

4. Create a `slack_messages.json` file in the root directory of the project. This file should contain the Slack messages in JSON format.

## Usage

1. Modify the `REPO_URLS` array in the script to include the GitHub repositories you want to analyze.

2. Adjust the `PR_COUNT`, `START_DATE`, and `END_DATE` variables to define the number of PRs and the date range for your analysis.

3. Run the script:
    ```bash
    node script.js
    ```

4. The script will output detailed information about PRs that match the criteria, including the average waiting time, most delayed PR, and quickest PR.

## Example Output

```
Fetching 1000 PR details for https://github.com/purepm/backend-monorepo...
Successfully fetched 50 PRs.
Filtered down to 10 PRs matching criteria.

--------------------------------------------------------
BACKEND-MONOREPO
Date Range: 2024-06-01 to 2024-08-06
--------------------------------------------------------
Total PRs in date range: 10
Average Waiting Time:
2 days, 4 hours, 30 minutes, 15 seconds

Most Delayed PR:
PR #123 - Improve authentication flow
URL: https://github.com/purepm/backend-monorepo/pull/123
Created: Mon, Jun 3, 2024, 12:00 PM
Slack Message: Mon, Jun 3, 2024, 12:15 PM
Second Review: Tue, Jun 4, 2024, 10:00 AM
Time Difference: 1 day, 22 hours, 45 minutes, 15 seconds

Quickest PR:
PR #124 - Fix minor bug
URL: https://github.com/purepm/backend-monorepo/pull/124
Created: Wed, Jun 5, 2024, 09:00 AM
Slack Message: Wed, Jun 5, 2024, 09:05 AM
Second Review: Wed, Jun 5, 2024, 09:30 AM
Time Difference: 25 minutes
--------------------------------------------------------
```

## Notes

- Ensure that the `slack_messages.json` file is correctly formatted and contains the necessary Slack message data.
- Modify the filtering criteria in the script to suit your specific needs.

## License

This project is licensed under the MIT License.
