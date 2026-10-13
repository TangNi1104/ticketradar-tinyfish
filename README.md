# TicketRadar

**Follow the artist. Never miss the drop.** TicketRadar is a London-only concert discovery and official-ticket watch experience for artists the user chooses.

TinyFish Agent investigates official artist and venue pages, Ticketmaster, AXS, and DICE to find verified London events, sale dates, presale information, prices, availability, and official purchase links.

For each concert, users choose between two routes:

- **Get Me In:** receive reminders one week, one day, and 30 minutes before tickets go on sale.
- **Take a Chance:** set a maximum budget, ticket quantity, and preferred seating area, then wait for a matching ticket or price drop.
## Product flow 

1. Choose up to eight artists.
2. TinyFish scans the live web for their upcoming London shows.
3. Receive universal alerts for officially published presale information.
4. For each event, choose:
   - **Get me in:** reminders one week, one day, and 30 minutes before the sale.
   - **Take a chance:** set budget, quantity, section, and permitted ticket source.
5. Follow the verified official link to purchase.

Saved artists and watch preferences persist locally in this hackathon MVP. The live event data is never mocked.

## Run locally

1. Get a key at [agent.tinyfish.ai](https://agent.tinyfish.ai/api-keys).
2. Copy `.env.example` to `.env.local` and set `TINYFISH_API_KEY`.
3. Run `npm start` with Node.js 18+.
4. Open [http://localhost:3000](http://localhost:3000).

No package installation is required.
