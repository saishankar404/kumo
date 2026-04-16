# contributing to kumo

first off, thank you for considering contributing to kumo. people like you make building open source projects actually fun and rewarding.

## how can you help?

if you notice a bug, have an idea for a feature, or want to fix documentation, we are super happy to accept issues and pull requests.

## creating an issue

if you spot something off, open an issue detailing what went wrong. include steps to reproduce it and a visual if it concerns the user interface. if you are proposing a new feature, explain what problem it solves and maybe sketch out a rough idea of how you imagine it working.

## creating a pull request

1. fork the project to your own github account.
2. clone it to your machine and create a new branch. (for example: `git checkout -b fix-search-bar`)
3. write your code. make sure you run `pnpm run verify:prod` to check that builds still pass and nothing is broken.
4. push your branch to your fork.
5. submit a pull request against our main branch.

we'll drop by to review it as soon as we can, leave some feedback, and merge it if it looks good.

## code style

- try to stick to the formatting rules in our setup.
- keep things light and readable. don't write unnecessarily complex code just for the sake of it.
- component files belong in `src/components`, api configurations in `api/`, and utilities in `src/lib/`. 

thanks for being here.
