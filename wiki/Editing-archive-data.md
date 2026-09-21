# Editing archive data

## Everyday workflow

1. Open **Episodes**, find the programme, and choose **Prefill logger**.
2. On **Log**, check series, episode number, title, presenter, auction house, and auctioneer names.
3. Enter an assigned expert for each team. A new name is created as a person automatically.
4. Choose **Item prices** to record three lots plus an optional bonus, or **Final profit only** when item prices are unavailable.
5. Record purchase price, sale price, top estimate, and the appropriate flags. Save the episode.

The browser keeps an unsaved draft on the device. Saving removes that draft.

## What the editor calculates

For normal item mode, a team result is total sales minus total purchases. A disqualified lot or failed challenge contributes no sale value, while its purchase value remains. The bonus counts only when **Bonus accepted** is checked. Final-profit mode uses the entered final number directly.

The **team Golden Gavel** is preserved once entered. The **expert Golden Gavel** is calculated when an expert is assigned, all three judged lots make a profit, the bonus is accepted, and the bonus makes a profit.

## Database collections

PocketBase data is described by `pb_schema.json`. Import it with PocketBase's Admin UI when setting up a new empty database. Do not change field names casually: the logger and statistics use those names.

| Collection | Purpose |
| --- | --- |
| `episodes` | BBC programme metadata plus links to people and auction house |
| `experts` | A person may be a presenter, expert, auctioneer, or more than one |
| `team_performances` | One Red or Blue team result for an episode |
| `items` | Normalized lot records used for lot and estimate statistics |
| `auction_houses` | Auction-house directory |

## Importing BBC metadata

Run `npm run import:bbc` with `POCKETBASE_URL` set. It adds or refreshes BBC catalogue information but deliberately preserves logged results and existing curated synopses. Read the command's output before using the separately opted-in `import:bbc:nuclear` command.

The import and maintenance scripts require PocketBase superuser credentials for writes. Use environment variables or a secrets manager, never a committed `.env` file.
