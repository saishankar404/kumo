# kumo

welcome to kumo. this is an open source platform built to make academic paper exploration feel natural and tactile. we wanted to build something that moves away from the static, overwhelming lists of traditional search engines and toward a spatial library experience.

## what is it?

kumo acts as a gateway to the world of research. it connects natively with open access sources like arxiv and openalex, presenting papers as interactive stacks and grids. it prioritize motion, typography, and a "physical" feel to help you organize your knowledge vault without the friction.

## features

- browse millions of papers through integrated open access apis.
- spatial dashboard layout with masonry grids and fluid transitions.
- efficient local caching and smart edge filtering for speed.
- minimalist design crafted with satoshi and gt walsheim typography.
- built-in security layers to handle rate limiting and origin protection.

## how ranking works

kumo doesn't just return API results in whatever order they arrive. it runs a multi-signal ranking algorithm called AIVS that normalizes relevance scores across all seven sources, combines them with citation impact, velocity, recency, and venue prestige signals, then applies MMR diversification to prevent result clustering.

the full technical breakdown — including the scoring formula, normalization strategy, design rationale, and known limitations — is documented in **[RANKING.md](RANKING.md)**.

## getting started

you can get kumo running locally in just a few minutes. make sure you have pnpm installed on your machine.

1. clone the repository:
   `git clone https://github.com/saishankar404/kumo-new.git`
2. enter the project directory:
   `cd kumo-new`
3. install the dependencies:
   `pnpm install`
4. set up your environment variables:
   `cp .env.example .env`
5. run the development server:
   `pnpm run dev`

then just open `localhost:5173` in your browser.

## contributing

we love seeing new ideas and bug fixes. if you want to help out, check out our contributing guide. we keep our code style light and readable, and we always appreciate a thoughtful pull request.

## license

this project is licensed under the mit license. check the license file for the full legal text.

enjoy kumo.
