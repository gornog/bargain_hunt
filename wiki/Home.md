# Bargain Hunt Field Notes

This wiki is the maintainer guide for the Bargain Hunt archive. It explains how to change the site, record data, add charts, and run a private installation without needing an AI tool.

## Start here

1. [Run locally](Local-development) to make a safe working copy.
2. Read [Site map and components](Site-map-and-components) before changing a page.
3. Use [Editing archive data](Editing-archive-data) for episodes, people, and results.
4. Use [Charts and statistics](Charts-and-statistics) before editing the statistics page.
5. Follow [Docker self-hosting](Docker-self-hosting) to deploy or update a server.

## How this wiki reaches GitHub

GitHub stores a repository wiki in a separate Git repository named `<repository>.wiki.git`. These Markdown files live in this project under `wiki/` so they are reviewed and versioned alongside the code. To publish them, clone the GitHub wiki repository, copy these files into its root, commit, and push. GitHub will display `Home.md` as the wiki home page.

```sh
git clone https://github.com/OWNER/REPOSITORY.wiki.git
cp -r wiki/. REPOSITORY.wiki/
cd REPOSITORY.wiki
git add . && git commit -m "Update maintainer wiki" && git push
```

On Windows PowerShell, use `Copy-Item -Recurse -Force ..\bargain_hunt\wiki\* .` instead of `cp -r`.
