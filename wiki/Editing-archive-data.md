# Editing archive data

## Everyday workflow

1. Open **Episodes**, find the programme, and choose **Prefill logger**.
2. On **Log**, check series, episode number, title, presenter, auction house, and auctioneer names. When an auction house is selected, matching auctioneers are offered first; the rest of the directory remains available.
3. Enter an assigned expert for each team. A new name is created as a person automatically.
4. Choose **Item prices** to record three lots plus an optional bonus, or **Final profit only** when item prices are unavailable.
5. Record purchase price, sale price, top estimate, and the appropriate flags. Save the episode.

The browser keeps an unsaved draft on the device. Saving removes that draft.

## What the editor calculates

For normal item mode, a team result is total sales minus total purchases. A disqualified lot or failed challenge contributes no sale value, while its purchase value remains. The bonus counts only when **Bonus accepted** is checked. Final-profit mode uses the entered final number directly.

The **team Golden Gavel** is preserved once entered. The **expert Golden Gavel** is calculated when an expert is assigned, all three judged lots make a profit, the bonus is accepted, and the bonus makes a profit.

The normalized `items` collection uses `slot = 1`, `2`, or `3` for team candidate items and `slot = 4` for the expert/bonus item. The bonus acceptance flag remains on the parent `team_performances` record and is read through the `team_performance` relation. Do not add a duplicated `bonus_accepted` field to `items`; that would allow the two records to disagree.

### Compilation and clip-show episodes

Some BBC entries called “Special” are newly filmed location/event episodes and should be logged normally. Others are compilation episodes made from previously broadcast footage. On the logger, tick **Compilation / clip show** when the programme is a recycled compilation. This stores `episodes.is_clipshow = true`, keeps the episode title, date, presenter, synopsis and image, and hides the auction-house, auctioneer and team-result fields. No empty team-performance records are created.

## Database collections

PocketBase data is described by `pb_schema.json`. Import it with PocketBase's Admin UI when setting up a new empty database. Do not change field names casually: the logger and statistics use those names.

| Collection | Purpose |
| --- | --- |
| `episodes` | BBC programme metadata plus links to people and auction house |
| `experts` | A person may be a presenter, expert, auctioneer, or more than one |
| `team_performances` | One Red or Blue team result for an episode |
| `items` | Normalized lot records used for lot and estimate statistics |
| `auction_houses` | Auction-house directory |

Auctioneers are not a separate collection. They are records in `experts` with `is_auctioneer = true`; the same person may also be a presenter or an expert. Do not recreate an `auctioneers` collection when restoring or configuring PocketBase. Local PocketBase exports and backups belong in the ignored `backups/` directory, never in Git.

## Importing BBC metadata

Run `npm run import:bbc` with `POCKETBASE_URL` set. It adds or refreshes BBC catalogue information but deliberately preserves logged results and existing curated synopses. Read the command's output before using the separately opted-in `import:bbc:nuclear` command.

The import and maintenance scripts require PocketBase superuser credentials for writes. Use environment variables or a secrets manager, never a committed `.env` file.

## Refresh upcoming episodes from the site

Open **Episodes**, sign in through **Log** if prompted, then choose the small circular-arrows **Refresh BBC episodes** control. This reads the official BBC upcoming-episodes schedule and only creates missing records or refreshes broadcast times and BBC links for existing matches. It does not run the full historical importer, replace logged episode identity, or download images. The control is deliberately rate-limited; when there is nothing new (or the schedule was checked recently), the page displays the seller-style message: “Absolute death on it, no more episode/I can't refresh now”.

Opening the home page also checks the BBC schedule automatically at most once every 12 hours while the application is running. When BBC One has an episode today or tomorrow, the home page displays compact **Showing today** and **Showing tomorrow** cards. If the episode is already in PocketBase, each card links directly to its logger; otherwise it links to the episode guide.

On **Episodes**, use the **Showing soon** filter to sort records by their BBC broadcast time. Records without a broadcast time stay after dated records.
