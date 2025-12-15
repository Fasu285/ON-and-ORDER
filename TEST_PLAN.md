# Test Plan

## 1. Unit Tests (Logic)
Located in `utils/gameLogic.ts`.
Run via `npm test` (or in-app Diagnostics).

**Critical Vectors (Must Pass):**
- N=4: Secret 4725, Guess 2475 → ON=4, Order=1
- N=4: Secret 1234, Guess 4321 → ON=4, Order=0
- N=4: Secret 9876, Guess 9876 → ON=4, Order=4
- N=3: Secret 582, Guess 528 → ON=3, Order=1
- N=2: Secret 45, Guess 54 → ON=2, Order=0

**Validation Tests:**
- Input "1123" (Duplicate) → Error
- Input "12" (Length mismatch for N=4) → Error
- Input "abcd" (Non-digit) → Error

## 2. Integration Tests (Frontend + Simulated Backend)
- **Flow**: User starts 1P game → Selects Secret → Moves to Gameplay → Submits Guess → Receives Feedback.
- **State**: Verify history updates with correct badges.
- **Win Condition**: Verify `match_end` state when ON=N, Order=N.

## 3. Accessibility (A11y)
- **Tools**: axe-core, Chrome DevTools Lighthouse.
- **Targets**: 
  - Keypad buttons must have `aria-label`.
  - Input placeholders must announce status.
  - History list must be navigable via keyboard.
  - Contrast ratio > 4.5:1.

## 4. Performance
- **Lighthouse**: Performance score > 90.
- **First Contentful Paint**: < 1.5s on 4G.
- **Interaction to Next Paint**: < 200ms.

## Manual QA Script
1. Open App.
2. Click "Run Diagnostics" on Home. Verify "ALL SYSTEMS GO".
3. Start 1P Match (N=3).
4. Enter Secret "123". Auto-submit check.
5. Guess "123". Verify Instant Win.
6. Restart. Secret "123". Guess "321". Verify ON=3, Order=1.
