# TicketRadar

**Follow the artist. Never miss the drop.** TicketRadar is a London-only concert discovery and official-ticket watch experience for artists the user chooses.

TinyFish Agent is the live-web engine. It investigates official artist and venue pages plus Ticketmaster, AXS, and DICE, then returns verified London events, sale dates, public presale information, prices, availability, and direct official links.

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

### 1. Download the project

Click the green **Code** button at the top of this GitHub repository, select **Download ZIP**, and unzip the downloaded file.

### 2. Install Node.js

Download and install the **LTS** version of Node.js from [nodejs.org](https://nodejs.org/). TicketRadar requires Node.js 18 or newer.

### 3. Open the project in Terminal

Open the **Terminal** app, type `cd` followed by a space, drag the unzipped TicketRadar folder into the Terminal window, and press **Enter**.

### 4. Add your TinyFish API key

Create a free key at [agent.tinyfish.ai/api-keys](https://agent.tinyfish.ai/api-keys). In Terminal, run:

```bash
cp .env.example .env.local
open -e .env.local
```

TextEdit will open the new `.env.local` file. Replace `your_tinyfish_api_key_here` with your real key, then save the file. It should contain one line:

```text
TINYFISH_API_KEY=your-real-key
```

Never publish or share `.env.local`. It is already excluded from Git by `.gitignore`.

### 5. Start TicketRadar

Return to Terminal and run:

```bash
npm start
```

When Terminal says TicketRadar is ready, open [http://localhost:3000](http://localhost:3000) in your browser.

To stop the website, return to Terminal and press **Control + C**.

No additional npm packages need to be installed.
