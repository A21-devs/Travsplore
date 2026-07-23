# Travsplore

A little desktop app for planning trips. You tell it your budget, who's coming and what you're into, and it uses AI to suggest destinations and places to stay. From there you can dig into a spot, build out a full plan, and line up options side by side.

It's an Electron app, so it runs as a normal window on Windows or Mac. Your data and API keys stay on your machine.

## How to use it

- **Travel** — fill in the budget, party size and what you're after, then let it find destinations and stays. Save the ones you like.
- **Explore** — open a saved place to pull up pros, ideas and useful links.
- **Plan** — start a plan, add an itinerary and packing list, and save the whole thing as a PDF.
- **Compare** — throw a few hotels, rooms or airlines into a table and see them next to each other.
- **Configure** — add your API key (OpenAI, Anthropic or Gemini), pick a model, set places you'd rather avoid, and back up your data.

You need your own API key from one of the providers for the AI parts to work. Add it in Configure (or in the welcome popup the first time you open the app).

## Features

- Works with OpenAI, Anthropic or Gemini — your pick
- Destination and stay suggestions that respect a budget and party size
- Places-to-avoid list that quietly filters every suggestion
- Full trip planner with itinerary, packing list and PDF export
- Side-by-side comparison tables
- Light and dark themes
- Everything saved locally, plus export/import to move it between computers

## Running it

```
npm install
npm start
```

To build an installer use `npm run dist`.

Claude was used a bit for the boilerplate and setup, but the app is mine.
