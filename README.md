# gawain-ebay-plugin

eBay plugin for the [Gawain AI](https://gawain.nogeass.com) video generation API.

Converts eBay inventory items into Gawain video generation jobs, polls for completion, and provides helpers for uploading finished videos back to eBay via the Sell Static Content API.

## Quick Start

```bash
# Install dependencies
npm install

# Copy environment file
cp .env.example .env
# Edit .env with your Gawain API base URL

# Run demo with sample listing
npm run demo -- --product ./samples/listing.sample.json

# Start HTTP wrapper server (port 3457)
npm run serve
```

## Features

- **Conversion API** — Pure function to convert eBay inventory items to Gawain job input
- **Gawain Client** — HTTP client with retry logic for the Gawain video generation API
- **eBay Video Upload** — Helpers for the eBay Sell Static Content API (create, upload, status)
- **Anonymous Previews** — Generate free preview videos without an API key
- **Commercial Upgrade** — Seamless upgrade path via Kinosuke

## Conversion API

```typescript
import { toGawainJobInput, validateEbayItem } from 'gawain-ebay-plugin';

const listing = { sku: 'ABC-123', product: { title: 'My Product', imageUrls: ['...'] } };

if (validateEbayItem(listing)) {
  const jobInput = toGawainJobInput(listing);
  console.log(jobInput);
}
```

## eBay OAuth (Sandbox)

Authenticate with eBay to get a user access token. Required for Sell API calls.

### Setup

1. Register an app at [eBay Developer Portal](https://developer.ebay.com/)
2. Set your "Auth'n'Auth" redirect URL (RuName) to `http://localhost:3457/oauth/ebay/callback`
3. Copy credentials to `.env`:

```bash
cp .env.example .env
# Edit .env:
#   EBAY_ENV=sandbox
#   EBAY_CLIENT_ID=your_sandbox_client_id
#   EBAY_CLIENT_SECRET=your_sandbox_client_secret
#   EBAY_REDIRECT_URI=http://localhost:3457/oauth/ebay/callback
```

### CLI Flow (recommended)

```bash
npm run ebay:auth
```

This will:
1. Display the eBay consent URL
2. Start a local callback server
3. Wait for you to authorize in the browser
4. Exchange the code for tokens
5. Save tokens to `.ebay_tokens.json`
6. Test the Sell Inventory API

### HTTP Flow (alternative)

```bash
# Start the server
npm run serve

# Open in browser
open http://localhost:3457/oauth/ebay/login
# -> Redirects to eBay -> Callback saves tokens automatically
```

### Using the token programmatically

```typescript
import { getValidAccessToken, loadEbayOAuthConfig } from 'gawain-ebay-plugin';

const config = loadEbayOAuthConfig();
const token = await getValidAccessToken(config); // auto-refreshes if expired
```

## eBay Video Upload

```typescript
import { createVideoResource, uploadVideoContent, getVideoStatus } from 'gawain-ebay-plugin';

// 1. Create video resource
const { videoId } = await createVideoResource({
  accessToken: 'your_ebay_token',
  title: 'Product Demo Video',
});

// 2. Upload video content (supports chunked upload for files > 25MB)
await uploadVideoContent({
  accessToken: 'your_ebay_token',
  videoId,
  videoBuffer: myVideoArrayBuffer,
});

// 3. Check review status (typically 48 hours)
const status = await getVideoStatus({
  accessToken: 'your_ebay_token',
  videoId,
});
console.log(status.status); // 'UPLOADED' | 'PROCESSING' | 'LIVE' | 'BLOCKED'
```

## HTTP Wrapper

```bash
# Convert eBay listing to Gawain format (stateless)
curl -X POST http://localhost:3457/convert \
  -H 'Content-Type: application/json' \
  -d '{"product": {"sku": "ABC", "product": {"title": "Test", "imageUrls": ["https://..."]}}}'

# Create preview job
curl -X POST http://localhost:3457/demo/create-preview \
  -H 'Content-Type: application/json' \
  -d '{"installId": "my-id", "product": {"sku": "ABC", "product": {"title": "Test", "imageUrls": ["https://..."]}}}'
```

## eBay Video Specifications

| Spec | Requirement |
|------|-------------|
| Format | MP4 / MOV |
| Max Size | 150 MB |
| Max Resolution | 1080p |
| Videos per Listing | 1 (gallery position 2) |
| Review Time | ~48 hours (up to 7 business days at peak) |
| External Links | Not supported (direct upload only) |

## Project Structure

```
src/
  gawain/          # Gawain API client (shared with Shopify plugin)
  platform/ebay/   # eBay-specific conversion, fetching, video upload, OAuth
  install/         # Anonymous install_id management
  util/            # Retry logic, environment config
  auth-cli.ts      # eBay OAuth CLI (npm run ebay:auth)
  demo.ts          # CLI demo
  server.ts        # HTTP wrapper (port 3457)
  index.ts         # Public API exports
```

## Development

```bash
npm run build       # Compile TypeScript
npm run typecheck   # Type check without emit
npm run lint        # ESLint
npm run format      # Prettier
npm test            # Run tests
```

## License

MIT
