# Slack Archive Parser

Tool that takes Slack JSON archives and converts them into a web site with channels.
Slack message supported features:
- [x] Single channel
- [x] Multiple channels
- [x] Threads (non-collapsible)
- [x] Emojis
- [x] Links
- [x] User references (partial support)
- [x] Files: Images (jpg, jpeg, png, gif, webp) & videos (mp4, mov, mkv, webm, avi)
- [x] Files: js, json, diff, csv, txt, pdf, xlsx, pptx, sd
- [ ] Rich text formatting
- [ ] Reactions
- [x] permalink to messages


## Instructions

To run this tool, first clone the repository.
```
git clone https://github.com/gutierrezj/slack-archive-parser.git
```

Then run

```
cd slack-archive-parser
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

