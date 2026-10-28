# Local dashboard design

The dashboard uses a white navigation sidebar, slate text (#263445), a pale workspace (#f6f7fb), restrained blue actions (#4165cf), system typography, and left-aligned financial tables. Summary cards show evidence-supported values only. Unknown is not zero. Mobile navigation scrolls horizontally; keyboard focus and reduced-motion preferences are supported.

References queried using the owner's installed local MCP servers:

- Tyler Forge: application-layout three-panel and table-with-filters blocks.
- Magic UI: Blur Fade component discovery; decorative entrance effects were unnecessary for dense billing evidence.
- Uiverse: Buttons category and hover-button listings.

These were design references, not vendored code. HTML/CSS and the native button transitions are original. No runtime library, CDN, provider login or remote asset is required. Reference tools were accessible without additional login.

The financial engine is unchanged in this release. Focused dashboard verification checks navigation, exact cent display, actual finding rows and escaped untrusted text. Completed results are not polled repeatedly; stale responses cannot replace the newly selected result.
