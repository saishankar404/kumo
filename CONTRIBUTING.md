# Contributing to Kumo

First off, thank you for considering contributing to Kumo. People like you make building open source projects actually fun and rewarding.

## How can you help?

If you notice a bug, have an idea for a feature, or want to fix documentation, we are super happy to accept issues and pull requests.

## Creating an issue

If you spot something off, open an issue detailing what went wrong. Include steps to reproduce it and a visual if it concerns the user interface. If you are proposing a new feature, explain what problem it solves and maybe sketch out a rough idea of how you imagine it working.

## Creating a pull request

1. fork the project to your own github account.
2. clone it to your machine and create a new branch. (for example: `git checkout -b fix-search-bar`)
3. write your code. Make sure you run `pnpm run verify:prod` to check that builds still pass and nothing is broken.
4. push your branch to your fork.
5. submit a pull request against our main branch.

We'll drop by to review it as soon as we can, leave some feedback, and merge it if it looks good.

## Code style

- try to stick to the formatting rules in our setup. Standard formatters run through the setup out of the box.
- keep things light and readable. Don't write unnecessarily complex code just for the sake of it.
- component files belong in `src/components`, api configurations in `api/`, and utilities in `src/lib/`. 

That's practically it. Thanks for being here!
