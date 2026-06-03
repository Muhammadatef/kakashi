# Contributing to Kakashi

Thank you for contributing to Kakashi!

## Development setup

```bash
git clone https://github.com/Muhammadatef/kakashi.git
cd kakashi
npm install
npm test
npm link
```

## Project structure

```
kakashi/
├── bin/kakashi.js          CLI entry point
├── bin/install.js          Multi-agent installer
├── src/engine/
│   ├── patterns.js         Detection regex registry
│   ├── masker.js           Core masking logic
│   └── formats/            File format handlers
├── src/rules/              Agent skill content
├── skills/kakashi/         npx-skills compatible skill
└── tests/                  Test suite
```

## Adding a pattern

Edit `src/engine/patterns.js`:

```javascript
{
  id: 'my_pattern',
  label: 'My Pattern',
  cat: 'pii',  // 'id' | 'pii' | 'cred'
  rx: /\bMY-\d{4}\b/g,
  fakeValues: ['MY-0001'],
  validate: (match) => true,  // optional
}
```

Add test cases in `tests/patterns.test.js` and run `npm test`.

## Pull request guidelines

- Run `npm test` before submitting
- One feature or fix per PR
- Update docs if CLI behavior changes
- No network calls in scan/mask code paths

## Code style

- CommonJS (`require` / `module.exports`)
- Node.js 18+
- No build step, no TypeScript
- Match existing naming conventions

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
