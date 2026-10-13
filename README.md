# TicketRadar

**Follow the artist. Never miss the drop.** TicketRadar is a London-only concert discovery and official-ticket watch experience for artists the user chooses.

TinyFish Search first finds the most relevant official ticket pages and shows fast matches in the dashboard within seconds. TinyFish Fetch and TinyFish Agent then continue in the background to verify dynamic or incomplete details. Artists are checked in parallel and recent results are cached for 15 minutes, making repeat scans nearly instant. TicketRadar returns verified London events, sale dates, public presale information, prices, availability, and direct official links.

For each concert, users choose between two routes:

- **Get Me In:** receive reminders one week, one day, and 30 minutes before tickets go on sale.
- **Take a Chance:** set a maximum budget, ticket quantity, and preferred seating area, then wait for a matching ticket or price drop.

## Product flow

1. Create an account or log in with a short username and password. The separate notification email is used only for ticket alerts. A new account copies the artists and watches already saved in the browser.
2. Choose up to eight artists and enter the email address where alerts should be sent.
3. TinyFish Search, Fetch, and Agent scan the live web for their upcoming London shows. Each artist is checked separately, with up to three checks running at once.
4. Receive email alerts for officially published presale information, regardless of the ticket mode selected later.
5. For each event, choose:
   - **Get me in:** reminders one week, one day, and 30 minutes before the sale.
   - **Take a chance:** set budget, quantity, section, and permitted ticket source.
6. When an alert rule is met, TicketRadar emails the user and links directly to the verified official purchase page.

The TicketRadar logo returns to the home/setup screen. The dashboard menu provides three views: **Discover** for all verified events, **My watches** for concerts with a saved ticket strategy, and **Artists** for the user's followed-artist list. On smaller screens, these choices appear in a pull-out menu.

The local prototype includes password-protected accounts. Passwords are salted and hashed, sessions use HTTP-only cookies, and artists, notification email, and watch preferences are stored in the ignored `.data/` directory rather than committed to GitHub. Accounts survive browser-data clearing and work across browsers connected to the same local TicketRadar server, but the local file database is not shared across devices. A public launch should replace it with hosted authentication and a production database.

The live event data is never mocked. The interface captures the complete notification flow, but automatic background monitoring and email delivery require a deployed server, a scheduler, a database, and an email provider such as Resend or SendGrid; the local demo does not send real email while it is closed.

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
