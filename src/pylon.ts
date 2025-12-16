import { config } from "./config";

const PYLON_API_BASE = "https://api.usepylon.com";

export interface PylonIssue {
  id: string;
  number: number;
  title: string;
  state: string;
  created_at: string;
  link?: string;
  first_response_time?: string | null;
  account?: {
    id: string;
    name?: string;
  };
  requester?: {
    email: string;
    id: string;
  };
  slack?: {
    channel_id: string;
    message_ts: string;
    thread_ts?: string;
    workspace_id: string;
  };
}

interface PylonSearchResponse {
  data: PylonIssue[];
  request_id: string;
  pagination?: {
    cursor?: string;
  };
}

const OPEN_STATES = ["new", "waiting_on_you", "waiting_on_customer", "on_hold"];

/**
 * fetches issues from pylon created within the last N days
 */
async function fetchIssues(days: number = 1): Promise<PylonIssue[]> {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startTime = new Date(startOfToday.getTime() - (days - 1) * 24 * 60 * 60 * 1000);
  const endOfDay = new Date(startOfToday.getTime() + 24 * 60 * 60 * 1000);

  const url = new URL(`${PYLON_API_BASE}/issues`);
  url.searchParams.set("start_time", startTime.toISOString());
  url.searchParams.set("end_time", endOfDay.toISOString());

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: {
      Authorization: `Bearer ${config.pylon.apiToken}`,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    const errorBody = await response.text();
    console.error("pylon api error response:", errorBody);
    throw new Error(`pylon api error: ${response.status} ${response.statusText} - ${errorBody}`);
  }

  const data = (await response.json()) as PylonSearchResponse;
  return data.data;
}

/**
 * fetches open issues from pylon created within the last N days
 */
export async function getOpenIssues(days: number = 1): Promise<PylonIssue[]> {
  const issues = await fetchIssues(days);
  return issues.filter((issue) => OPEN_STATES.includes(issue.state));
}

/**
 * fetches issues from the last N days that have not been responded to at all
 * filters for state = "new" AND first_response_time = null
 * (issues with first_response_time set are customer replies to Fern-initiated threads)
 */
export async function getUnrespondedIssues(days: number = 1): Promise<PylonIssue[]> {
  const issues = await fetchIssues(days);
  const newStateIssues = issues.filter((issue) => issue.state === "new");
  const trulyUnresponded = newStateIssues.filter((issue) => issue.first_response_time == null);

  console.log(`\n=== UNRESPONDED ISSUES DEBUG ===`);
  console.log(`Total issues (last ${days} day(s)): ${issues.length}`);
  console.log(`Issues with state "new": ${newStateIssues.length}`);
  console.log(`Truly unresponded (no first_response_time): ${trulyUnresponded.length}`);

  // Log issues that were filtered out (customer replies to Fern threads)
  const filteredOut = newStateIssues.filter((issue) => issue.first_response_time != null);
  if (filteredOut.length > 0) {
    console.log(`\nFiltered out ${filteredOut.length} issue(s) (customer replies to Fern-initiated threads):`);
    for (const issue of filteredOut) {
      console.log(`  - #${issue.number}: ${issue.title || "(no title)"} (first_response_time: ${issue.first_response_time})`);
    }
  }

  console.log(`\nIncluded issues:`);
  for (const issue of trulyUnresponded) {
    console.log(`  - #${issue.number}: ${issue.title || "(no title)"}`);
  }
  console.log(`\n=== END DEBUG ===\n`);

  return trulyUnresponded;
}

