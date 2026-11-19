<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset=".github/assets/logo-dark.svg">
    <img src=".github/assets/logo-light.svg" alt="SIRENRUN, ride or bust" width="440">
  </picture>
</p>

A getaway-driving game that runs onchain inside a MagicBlock Ephemeral Rollup.

One player drives and tries to stay ahead of the police. Everyone else trades on how long
the run lasts, with three markets per run: survives 30 s, 60 s, 90 s. Press **RIDE** if you
think the driver makes the line, **BUST** if you think the cops get there first.

Markets settle from the game state the moment a line is crossed or the car is caught.
No oracle and no manual resolution.

## How it works

- Solana holds the money: one SPL vault, deposits and withdrawals.
- The game and the markets live in a MagicBlock Ephemeral Rollup. A crank advances the
  physics every 100 ms, VRF seeds each course, and session keys let players steer and trade
  without wallet popups.
- The web client subscribes to the arena account and renders the run. There is no game
  server.

## Docs

| Doc | Covers |
|---|---|
| [docs/architecture.md](docs/architecture.md) | Stack, repo layout, data flow, base layer vs rollup |
| [docs/game-design.md](docs/game-design.md) | Simulation rules, constants, course generation |
| [docs/onchain-program.md](docs/onchain-program.md) | Accounts, instructions, market math, invariants |
| [docs/magicblock.md](docs/magicblock.md) | Delegation, VRF, cranks, session keys, local setup |

## Status

Early development on Solana devnet. Not audited. Test tokens only.

## Links

[github.com/sirenrun](https://github.com/sirenrun) · [@sirenrun on X](https://x.com/sirenrun)

## License

[MIT](LICENSE)
