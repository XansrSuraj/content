# Future expansion (not implemented)

Everything here is planned, not built. Nothing in this list should be presented as an existing feature.

## Next priorities
1. **Verify live AI quality.** With a real key, run the Caption Studio scenarios (budget phone example, every follow-up chip, Hindi Devanagari, the `final_only` output mode) and tune the prompts. Then build a small eval set from real anonymised examples, with creator consent.
2. **Verify the YouTube connector** with a real key, and add the YouTube branding/attribution assets required by the API policy.
3. **Account hygiene:** email verification, password reset, and optional magic-link or OAuth sign-in.
4. **Assisted curation:** have AI draft summaries and angles for admin review of raw observations, with a human approving every one before publish.
5. **Full UI translation:** finish the Hinglish/English dictionary for every string, and add a Devanagari UI option.

## Additional languages and niches
- Tamil, Telugu, Bengali, Marathi and Kannada caption workflows (language options + prompt tuning + review by native speakers).
- Deeper sample content and tuned guidance for the "early" categories (gaming, sports, beauty, music, art).

## Approved platform integrations
- Instagram Graph API hashtag search (needs Meta App Review). It would only show "observed in top media for #tag", never counts.
- Licensed social-listening or trend data providers, with display and derived-metric rights confirmed in the contract.
- Google Trends API, if access is granted. It would be labeled as search interest, not social popularity.

## Permitted creator analytics
- OAuth connections to a creator's own YouTube Analytics or Instagram Insights, used only for that creator, with revocation and deletion flows. Platform metrics would be kept separate from manual entries, with no cross-creator pooling.

## Team workflows
- Shared workspaces for creator teams and agencies, with roles and per-workspace ownership.

## Paid subscriptions
- Plans tied to AI quotas (usage records already exist). Needs a billing provider and explicit authorization.

## Licensed audio discovery
- Trending sounds only from a licensed provider with display rights.

## Meaningful alerts
- Opt-in alerts when a *comparable* observation shows a curated opportunity in your niche rising. These would be rate-limited and never framed as "go viral now".
