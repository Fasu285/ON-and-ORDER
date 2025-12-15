# Security Policy

## Data Encryption
- **At Rest**: All game secrets (user's chosen numbers) are encrypted using Google Cloud KMS before being stored in Cloud SQL. The database volume itself is also encrypted by default.
- **In Transit**: TLS 1.2+ is enforced for all REST and WebSocket connections.

## Secrets Management
- No plaintext secrets are ever logged. 
- The server computes ON/Order results internally and only broadcasts the result integers, never the opponent's secret.
- Secrets are only decrypted in memory during the `match_end` event to be revealed to players.

## Rate Limiting
- **Guesses**: Limited to 1 guess per 2 seconds per user via Redis-backed token bucket.
- **Connections**: WebSocket connections per IP are limited to prevent exhaustion attacks.

## GDPR & Privacy
- **Right to Erasure**: Users can request account deletion via the `/api/user/delete` endpoint, which cascades deletes to all match history.
- **Data Export**: JSON dump of user history available via `/api/user/export`.
- **Retention**: Match data is retained for 1 year for replay purposes, then anonymized.

## Auditing
- All administrative actions are logged to Cloud Logging.
- Access to KMS keys is audited via Cloud IAM.
