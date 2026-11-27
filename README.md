# @Hector387420489/dsh-session-reaper

Delete one Session's persisted log from the Session list, without touching the filesystem by hand.

- **Where it appears**: right-click a Session row → **Delete session…**
- **What happens**: a confirmation dialog lists the Session title; confirming removes its log directory under the DSH home and the row leaves the list immediately
- **Refused**: a Session that still has work in flight, a Session with no persisted log, or a directory layout this plugin does not recognize
- **Not covered**: batch deletion, a trash bin, projection-cache cleanup

Design notes live in [docs/DETAIL.md](docs/DETAIL.md).
