# Release Checklist

## Functional
- [ ] ON/Order Logic verified against 5 test vectors.
- [ ] 1-Player mode fully playable vs AI.
- [ ] Secret input handles duplicates correctly (disables keys).
- [ ] Auto-submit triggers only on full secret.

## UI/UX
- [ ] Responsive on Mobile (320px width test).
- [ ] High contrast colors verified.
- [ ] Animations smooth (60fps).
- [ ] No "stuck" states in gameplay loop.

## Technical
- [ ] Build passes without TS errors.
- [ ] Service Worker caches assets for offline load.
- [ ] No hardcoded secrets in source.
- [ ] PWA Manifest valid (installable).

## Deployment
- [ ] Environment variables configured.
- [ ] DB Migrations applied (if backend connected).
- [ ] Domain SSL active.
