# LeetSync Extension

LeetSync captures LeetCode submissions in real time and queues them in a GitHub repo.
The weekly action syncs the queue into your solution folders.

## Features

- No polling. Submissions are captured at submit time.
- Minimal permissions: only storage plus leetcode.com and api.github.com.
- Queue-first design with offline retry.
- Config export that matches the action config.

## Quick start

1. Load this folder as an unpacked extension.
2. Open the Options page.
3. Set repo owner, repo name, and a fine-grained GitHub token.
4. Keep the queue branch and path defaults unless you changed them in the action.

## Token scope

Use a fine-grained token scoped to the target repo only:

- Contents: Read and Write

## Notes

- The extension writes JSON files into the queue branch.
- The action reads from that queue and opens a PR.
