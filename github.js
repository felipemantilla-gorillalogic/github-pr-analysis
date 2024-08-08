import fetch from 'node-fetch';
import { DateTime, Duration } from 'luxon';
import chalk from 'chalk';
import fs from 'fs/promises';

// ========================
// Configuration
// ========================

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;

if(!GITHUB_TOKEN) {
  console.error(chalk.red('Please set the GITHUB_TOKEN environment variable.'));
  process.exit(1);
}

const REPO_URLS = [
  'https://github.com/purepm/backend-monorepo',
  // 'https://github.com/purepm/frontend-monorepo',
  // Add more repository URLs here
];
const PR_COUNT = 1000;
const START_DATE = DateTime.fromISO('2024-06-01');
const END_DATE = DateTime.fromISO('2024-08-06');

// ========================
// Utility Functions
// ========================

async function readJSONFile(filename) {
  try {
    const data = await fs.readFile(filename, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error(chalk.red(`Error reading ${filename}:`), error);
    return [];
  }
}

function formatDate(date) {
  return new Date(date).toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    hour12: true
  });
}

function formatDuration(milliseconds) {
  const duration = Duration.fromMillis(milliseconds);
  const days = Math.floor(duration.as('days'));
  const hours = Math.floor(duration.as('hours') % 24);
  const minutes = Math.floor(duration.as('minutes') % 60);
  const seconds = Math.floor(duration.as('seconds') % 60);
  return `${days} days, ${hours} hours, ${minutes} minutes, ${seconds} seconds`;
}

// ========================
// GitHub API Functions
// ========================

function createGraphQLQuery(owner, repo, cursor = null) {
  return `
  {
    repository(owner: "${owner}", name: "${repo}") {
      name
      pullRequests(first: 100, states: MERGED, orderBy: {field: CREATED_AT, direction: DESC}${cursor ? `, after: "${cursor}"` : ''}) {
        nodes {
          title
          createdAt
          number
          reviews(first: 10) {
            nodes {
              createdAt
              author {
                login
              }
              state
            }
          }
          reviewDecision
          latestReviews(first: 10) {
            nodes {
              author {
                login
              }
              state
            }
          }
        }
        pageInfo {
          hasNextPage
          endCursor
        }
      }
    }
  }
  `;
}

async function fetchPRDetailsFromAPI(owner, repo, prCount) {
  const headers = {
    Authorization: `Bearer ${GITHUB_TOKEN}`,
    'Content-Type': 'application/json',
  };

  let allPRs = [];
  let cursor = null;
  let hasNextPage = true;

  while (hasNextPage && allPRs.length < prCount) {
    try {
      const response = await fetch('https://api.github.com/graphql', {
        method: 'POST',
        headers: headers,
        body: JSON.stringify({ query: createGraphQLQuery(owner, repo, cursor) }),
      });

      const data = await response.json();

      if (data.errors) {
        console.error(chalk.red('GraphQL Errors:'), data.errors);
        return null;
      }

      const prs = data.data.repository.pullRequests.nodes;
      allPRs = allPRs.concat(prs);

      hasNextPage = data.data.repository.pullRequests.pageInfo.hasNextPage;
      cursor = data.data.repository.pullRequests.pageInfo.endCursor;
    } catch (error) {
      console.error(chalk.red('Error fetching PR details:'), error);
      return null;
    }
  }

  return {
    name: repo,
    pullRequests: { nodes: allPRs.slice(0, prCount) }
  };
}

// ========================
// PR Processing Functions
// ========================

function findPRInSlackMessages(prNumber, slackMessages) {
  return slackMessages.find(message =>
    message.link.includes(`/pull/${prNumber}`)
  );
}

function calculatePRInfo(pr, prCreationDate, reviews, slackMessage, owner, repo) {
  const sortedReviews = reviews.sort((a, b) =>
    DateTime.fromISO(a.createdAt).toMillis() - DateTime.fromISO(b.createdAt).toMillis()
  );
  const secondReviewDate = DateTime.fromISO(sortedReviews[1].createdAt);
  const slackMessageDate = slackMessage ? DateTime.fromMillis(parseFloat(slackMessage.timestamp) * 1000) : null;

  let timeDifference, waitTimeMillis;
  if (slackMessageDate) {
    timeDifference = secondReviewDate.diff(slackMessageDate);
    waitTimeMillis = timeDifference.as('milliseconds');
  } else {
    timeDifference = secondReviewDate.diff(prCreationDate);
    waitTimeMillis = timeDifference.as('milliseconds');
  }

  return {
    prNumber: pr.number,
    title: pr.title,
    creationDate: prCreationDate.toISO(),
    slackMessageDate: slackMessageDate ? slackMessageDate.toISO() : 'N/A',
    secondReviewDate: secondReviewDate.toISO(),
    timeDifference: timeDifference.toObject(),
    waitTimeMillis: waitTimeMillis,
    owner: owner,
    repo: repo
  };
}

async function processPRData(filteredPRs, owner, repo, slackMessages) {
  const prDetails = [];
  let totalWaitingTimeMillis = 0;
  let mostDelayedPR = null;
  let quickestPR = null;
  let longestWaitTime = 0;
  let shortestWaitTime = Infinity;

  filteredPRs.forEach((pr) => {
    const prCreationDate = DateTime.fromISO(pr.createdAt);
    const reviews = pr.reviews.nodes;
    const slackMessage = findPRInSlackMessages(pr.number, slackMessages);

    const prInfo = calculatePRInfo(pr, prCreationDate, reviews, slackMessage, owner, repo);
    prDetails.push(prInfo);
    totalWaitingTimeMillis += prInfo.waitTimeMillis;

    if (prInfo.waitTimeMillis > longestWaitTime) {
      longestWaitTime = prInfo.waitTimeMillis;
      mostDelayedPR = prInfo;
    }
    if (prInfo.waitTimeMillis < shortestWaitTime) {
      shortestWaitTime = prInfo.waitTimeMillis;
      quickestPR = prInfo;
    }
  });

  return { prDetails, totalWaitingTimeMillis, mostDelayedPR, quickestPR };
}

async function filterPRs(prs, slackMessages) {
  return prs.filter(pr => {
    const prCreationDate = DateTime.fromISO(pr.createdAt);
    
    // Filter PRs that are in the range of the dates
    if (prCreationDate < START_DATE || prCreationDate > END_DATE) {
      return false;
    }

    const reviews = pr.reviews.nodes;
    
    // Filter PRs that have two or more reviews
    if (reviews.length < 2) {
      return false;
    }

    const slackMessage = findPRInSlackMessages(pr.number, slackMessages);

    // Filter PRs that have a slack message
    if (!slackMessage) {
      return false;
    }

    const secondReviewDate = DateTime.fromISO(reviews[1].createdAt);
    const slackMessageDate = DateTime.fromMillis(parseFloat(slackMessage.timestamp) * 1000);

    // Filter PRs where the second review is after the slack message
    if (secondReviewDate < slackMessageDate) {
      return false;
    }

    // // Filter PRs that have a review from "mopurepm"
    const hasMopurepmReview = reviews.some(review => review.author.login === "mopurepm");
    if (!hasMopurepmReview) {
      return false;
    }

    return true;
  });
}

// ========================
// Output Functions
// ========================

function printPRDetails(pr) {
  if (pr) {
    const prUrl = `https://github.com/${pr.owner}/${pr.repo}/pull/${pr.prNumber}`;
    
    console.log(chalk.cyan(`PR #${pr.prNumber} - ${pr.title}`));
    console.log(chalk.yellow(`URL: ${prUrl}`));
    console.log(chalk.yellow(`Created: ${formatDate(pr.creationDate)}`));
    console.log(chalk.yellow(`Slack Message: ${formatDate(pr.slackMessageDate)}`));
    console.log(chalk.yellow(`Second Review: ${formatDate(pr.secondReviewDate)}`));
    console.log(chalk.green(`Time Difference: ${formatDuration(pr.waitTimeMillis)}`));
  }
}

function printResults(repoName, prDetails, totalWaitingTimeMillis, mostDelayedPR, quickestPR) {
  const divider = '--------------------------------------------------------';
  console.log(chalk.cyan(divider));
  console.log(chalk.cyan.bold(`${repoName.toUpperCase()}`));
  console.log(chalk.cyan(`Date Range: ${START_DATE.toISODate()} to ${END_DATE.toISODate()}`));
  console.log(chalk.cyan(divider));

  if (prDetails.length > 0) {
    const averageWaitingTime = Duration.fromMillis(totalWaitingTimeMillis / prDetails.length);
    console.log(chalk.white.bold(`Total PRs in date range: ${prDetails.length}`));
    console.log(chalk.white.bold('Average Waiting Time:'));
    console.log(chalk.blue(formatDuration(averageWaitingTime.as('milliseconds'))));

    console.log(chalk.white.bold('\nMost Delayed PR:'));
    printPRDetails(mostDelayedPR);

    console.log(chalk.white.bold('\nQuickest PR:'));
    printPRDetails(quickestPR);
  } else {
    console.log(chalk.yellow('No PRs found within the specified date range.'));
  }

  console.log(chalk.cyan(divider));
}

// ========================
// Main Function
// ========================

async function main() {
  const slackMessages = await readJSONFile('slack_messages.json');

  for (const repoUrl of REPO_URLS) {
    const [owner, repo] = repoUrl.replace('https://github.com/', '').split('/');

    console.log(chalk.magenta(`\nFetching ${PR_COUNT} PR details for ${repoUrl}...`));
    const repoData = await fetchPRDetailsFromAPI(owner, repo, PR_COUNT);

    if (repoData) {
      console.log(chalk.green(`Successfully fetched ${repoData.pullRequests.nodes.length} PRs.`));
      
      const filteredPRs = await filterPRs(repoData.pullRequests.nodes, slackMessages);
      console.log(chalk.green(`Filtered down to ${filteredPRs.length} PRs matching criteria.`));
      
      const { prDetails, totalWaitingTimeMillis, mostDelayedPR, quickestPR } = await processPRData(filteredPRs, owner, repo, slackMessages);
      printResults(repoData.name, prDetails, totalWaitingTimeMillis, mostDelayedPR, quickestPR);
    } else {
      console.log(chalk.red(`Failed to fetch PR details for ${repoUrl}.`));
    }
  }
}

// Run the main function
main();