# Slack Archive Parser

Tool that takes Slack JSON archives and converts them into a web site with channels.
Slack message supported features:
- [x] Single channel
- [x] Multiple channels
- [x] Threads (non-collapsible)
- [x] Emojis
- [x] Links
- [x] User references (partial support)
- [ ] Files (WIP)
- [ ] Rich text formatting
- [ ] Reactions


## Instructions

To run this tool, first clone the repository. Then run

```
npm install
```

For a single channel conversion run:

```
node parseSlackArchive.js input_data/<channel-directory-name>
```

For an archive with multiple channel directories

```
node parseSlackArchive.js input_data/ -a 
```


The output is always written to `output_html`.

