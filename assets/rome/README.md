# Shared Rome photos

Freely licensed photos from Wikimedia Commons, shared by all apartment guides.
Each photo has two sizes: `<slug>-sm.webp` (640 px) and `<slug>.webp` (1200 px), cropped 3:2.
`credits.json` lists the title, author, licence and source of each file. Copy the `credit` into the
item's `photo` in an apartment's data.json, like this:

    "photo": {"src": "rome/trevi-fountain", "place": "Fontana di Trevi", "area": false,
              "credit": {"title": "...", "author": "...", "license": "CC0", "licenseUrl": "...", "source": "..."}}

`area: true` means the photo shows the venue's street or square, not the venue itself.
In that case the page shows a "The area" label. The footer lists all credits under "Photo credits".
