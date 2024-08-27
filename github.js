import fetch from 'node-fetch';
import { DateTime, Duration } from 'luxon';
import chalk from 'chalk';
import fs from 'fs/promises';

// ========================
// Configuration
// ========================

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const REPO_URLS = [
  'https://github.com/purepm/backend-monorepo',
  // Add more repository URLs as needed
];
const PR_COUNT = 1000;
const START_DATE = DateTime.fromISO('2024-06-01');
const END_DATE = DateTime.fromISO('2024-08-27');

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
  return DateTime.fromISO(date).toLocaleString(DateTime.DATETIME_SHORT);
}

function formatDuration(milliseconds) {
  const duration = Duration.fromMillis(milliseconds);
  return duration.toFormat("d 'days', h 'hours', m 'minutes', s 'seconds'");
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
          reviews(first: 20, states: [APPROVED]) {
            nodes {
              createdAt
              author {
                login
              }
              state
            }
          }
          mergedAt
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
    message.link && message.link.includes(`/pull/${prNumber}`)
  );
}

function calculatePRInfo(pr, slackMessage, owner, repo) {
  const prCreationDate = DateTime.fromISO(pr.createdAt);
  const approvedReviews = pr.reviews.nodes
    .sort((a, b) => DateTime.fromISO(a.createdAt).toMillis() - DateTime.fromISO(b.createdAt).toMillis());

  const slackMessageDate = slackMessage 
    ? DateTime.fromMillis(parseFloat(slackMessage.timestamp) * 1000) 
    : null;

  const secondApprovedReview = approvedReviews[1];
  const secondApprovedReviewDate = secondApprovedReview ? DateTime.fromISO(secondApprovedReview.createdAt) : null;

  let waitTimeMillis = 0;
  if (slackMessageDate && secondApprovedReviewDate) {
    waitTimeMillis = secondApprovedReviewDate.diff(slackMessageDate).as('milliseconds');
  }

  return {
    prNumber: pr.number,
    title: pr.title,
    creationDate: prCreationDate.toISO(),
    slackMessageDate: slackMessageDate ? slackMessageDate.toISO() : 'N/A',
    secondApprovedReviewDate: secondApprovedReviewDate ? secondApprovedReviewDate.toISO() : 'N/A',
    waitTimeMillis: waitTimeMillis,
    owner: owner,
    repo: repo,
    approvedReviews: approvedReviews
  };
}

function filterPRs(prs, slackMessages) {
  console.log(chalk.blue(`Total PRs before filtering: ${prs.length}`));

  const filteredPRs = prs.filter(pr => {
    const prCreationDate = DateTime.fromISO(pr.createdAt);
    const approvedReviews = pr.reviews.nodes;
    const slackMessage = findPRInSlackMessages(pr.number, slackMessages);

    // Filter conditions
    const isInDateRange = prCreationDate >= START_DATE && prCreationDate <= END_DATE;
    const hasTwoOrMoreApprovedReviews = approvedReviews.length >= 2;
    const hasSlackMessage = !!slackMessage;
    const isSecondApprovedReviewAfterSlack = hasSlackMessage && approvedReviews[1] && 
      DateTime.fromISO(approvedReviews[1].createdAt) > DateTime.fromMillis(parseFloat(slackMessage.timestamp) * 1000);

    // Logging for debugging
    if (!isInDateRange) console.log(chalk.yellow(`PR ${pr.number} filtered: Not in date range`));
    if (!hasTwoOrMoreApprovedReviews) console.log(chalk.yellow(`PR ${pr.number} filtered: Less than 2 approved reviews`));
    if (!hasSlackMessage) console.log(chalk.yellow(`PR ${pr.number} filtered: No Slack message`));
    if (!isSecondApprovedReviewAfterSlack) console.log(chalk.yellow(`PR ${pr.number} filtered: Second approved review not after Slack message`));

    return isInDateRange && hasTwoOrMoreApprovedReviews && hasSlackMessage && isSecondApprovedReviewAfterSlack;
  });

  console.log(chalk.green(`Filtered PRs: ${filteredPRs.length}`));
  return filteredPRs;
}

function separatePRs(filteredPRs) {
  const withMoReview = [];
  const withoutMoReview = [];

  filteredPRs.forEach(pr => {
    const hasMoReview = pr.reviews.nodes.some(review => review.author.login === "mopurepm");
    if (hasMoReview) {
      withMoReview.push(pr);
    } else {
      withoutMoReview.push(pr);
    }
  });

  return { withMoReview, withoutMoReview };
}

async function processPRData(prs, owner, repo, slackMessages) {
  const prDetails = [];
  let totalWaitingTimeMillis = 0;
  let mostDelayedPR = null;
  let quickestPR = null;
  let longestWaitTime = 0;
  let shortestWaitTime = Infinity;

  prs.forEach((pr) => {
    const slackMessage = findPRInSlackMessages(pr.number, slackMessages);
    const prInfo = calculatePRInfo(pr, slackMessage, owner, repo);
    prDetails.push(prInfo);

    if (prInfo.waitTimeMillis > 0) {
      totalWaitingTimeMillis += prInfo.waitTimeMillis;

      if (prInfo.waitTimeMillis > longestWaitTime) {
        longestWaitTime = prInfo.waitTimeMillis;
        mostDelayedPR = prInfo;
      }
      if (prInfo.waitTimeMillis < shortestWaitTime) {
        shortestWaitTime = prInfo.waitTimeMillis;
        quickestPR = prInfo;
      }
    }
  });

  return { prDetails, totalWaitingTimeMillis, mostDelayedPR, quickestPR };
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
    console.log(chalk.yellow(`Second Approved Review: ${formatDate(pr.secondApprovedReviewDate)}`));
    console.log(chalk.green(`Time Difference: ${formatDuration(pr.waitTimeMillis)}`));
    console.log(chalk.magenta('Approved Reviews:'));
    pr.approvedReviews.forEach((review, index) => {
      console.log(chalk.magenta(`  ${index + 1}. ${review.author.login} - ${formatDate(review.createdAt)}`));
    });
  }
}

function printResults(repoName, prDetails, totalWaitingTimeMillis, mostDelayedPR, quickestPR, title) {
  const divider = '--------------------------------------------------------';
  console.log(chalk.cyan(divider));
  console.log(chalk.cyan.bold(`${repoName.toUpperCase()} - ${title}`));
  console.log(chalk.cyan(`Date Range: ${START_DATE.toISODate()} to ${END_DATE.toISODate()}`));
  console.log(chalk.cyan(divider));

  if (prDetails.length > 0) {
    const averageWaitingTime = Duration.fromMillis(totalWaitingTimeMillis / prDetails.length);
    console.log(chalk.white.bold(`Total PRs: ${prDetails.length}`));
    console.log(chalk.white.bold('Average Waiting Time:'));
    console.log(chalk.blue(formatDuration(averageWaitingTime.as('milliseconds'))));

    console.log(chalk.white.bold('\nMost Delayed PR:'));
    printPRDetails(mostDelayedPR);

    console.log(chalk.white.bold('\nQuickest PR:'));
    printPRDetails(quickestPR);
  } else {
    console.log(chalk.yellow('No PRs found within the specified criteria.'));
  }

  console.log(chalk.cyan(divider));
}

function printComparison(withMoResults, withoutMoResults) {
  console.log(chalk.magenta.bold('\nCOMPARISON SUMMARY'));
  console.log(chalk.magenta('--------------------------------------------------------'));
  
  const withMoAvg = withMoResults.totalWaitingTimeMillis / withMoResults.prDetails.length;
  const withoutMoAvg = withoutMoResults.totalWaitingTimeMillis / withoutMoResults.prDetails.length;
  
  console.log(chalk.white.bold('PRs with Mo review:'));
  console.log(chalk.blue(`  Count: ${withMoResults.prDetails.length}`));
  console.log(chalk.blue(`  Average waiting time: ${formatDuration(withMoAvg)}`));
  
  console.log(chalk.white.bold('\nPRs without Mo review:'));
  console.log(chalk.blue(`  Count: ${withoutMoResults.prDetails.length}`));
  console.log(chalk.blue(`  Average waiting time: ${formatDuration(withoutMoAvg)}`));
  
  const difference = Math.abs(withMoAvg - withoutMoAvg);
  const fasterCategory = withMoAvg < withoutMoAvg ? "with Mo review" : "without Mo review";
  console.log(chalk.white.bold('\nDifference:'));
  console.log(chalk.green(`PRs ${fasterCategory} are faster by ${formatDuration(difference)}`));
  
  console.log(chalk.magenta('--------------------------------------------------------'));
}

// ========================
// Main Function
// ========================

async function main() {
  if (!GITHUB_TOKEN) {
    console.error(chalk.red('Please set the GITHUB_TOKEN environment variable.'));
    process.exit(1);
  }

  const slackMessages = await readJSONFile('slack_messages.json');

  for (const repoUrl of REPO_URLS) {
    const [owner, repo] = repoUrl.replace('https://github.com/', '').split('/');

    console.log(chalk.magenta(`\nFetching ${PR_COUNT} PR details for ${repoUrl}...`));
    const repoData = await fetchPRDetailsFromAPI(owner, repo, PR_COUNT);

    if (repoData) {
      console.log(chalk.green(`Successfully fetched ${repoData.pullRequests.nodes.length} PRs.`));

      const filteredPRs = filterPRs(repoData.pullRequests.nodes, slackMessages);
      console.log(chalk.green(`Filtered down to ${filteredPRs.length} PRs matching criteria.`));

      const { withMoReview, withoutMoReview } = separatePRs(filteredPRs);

      const withMoResults = await processPRData(withMoReview, owner, repo, slackMessages);
      const withoutMoResults = await processPRData(withoutMoReview, owner, repo, slackMessages);

      printResults(repoData.name, withMoResults.prDetails, withMoResults.totalWaitingTimeMillis, 
                   withMoResults.mostDelayedPR, withMoResults.quickestPR, "With Mo Review");
      
      printResults(repoData.name, withoutMoResults.prDetails, withoutMoResults.totalWaitingTimeMillis, 
                   withoutMoResults.mostDelayedPR, withoutMoResults.quickestPR, "Without Mo Review");

      printComparison(withMoResults, withoutMoResults);
    } else {
      console.log(chalk.red(`Failed to fetch PR details for ${repoUrl}.`));
    }
  }
}

// Run the main function
main().catch(error => {
  console.error(chalk.red('An error occurred:'), error);
  process.exit(1);
});